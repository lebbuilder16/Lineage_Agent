"""
Cartel Graph — detect coordinated operator networks on Solana.

Uses 8 independent on-chain coordination signals to build a weighted graph,
then runs Louvain community detection (python-louvain / networkx) to find
cartel clusters.

Signals:
  1. dna_match     — shared metadata DNA fingerprint (service + description)
  2. sol_transfer  — wallet A sent SOL directly to a known deployer wallet B
  3. timing_sync   — same-narrative launches within 30 minutes of each other
  4. phash_cluster — near-identical token logos (pHash hamming ≤ 8 / 64 bits)
  5. cross_holding — deployer B holds tokens created by deployer A

Financial graph signals (cartel_financial_service):
  6. funding_link  — pre-deploy SOL funding between deployers (72 h window)
  7. shared_lp     — same wallet bootstrapped liquidity for different deployers
  8. sniper_ring   — coordinated early buying across different deployers

The cartel sweep runs hourly via the FastAPI lifespan. Per-lineage lookup
reads pre-computed edges from cartel_edges table and runs community detection.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
from collections import defaultdict
from datetime import datetime, timezone
from typing import Literal, Optional

from .constants import estimate_extraction_rate
from .data_sources._clients import (
    cartel_edge_upsert,
    cartel_edges_query,
    cartel_edges_query_all,
    community_lookup_upsert,
    event_query,
    get_rpc_client,
    operator_mapping_query_all,
    sol_flows_query_by_from,
)
from .models import CartelCommunity, CartelEdge, CartelReport, EvidenceLevel, RugMechanism
from .rug_detector import normalize_legacy_rug_events
from .utils import parse_datetime

logger = logging.getLogger(__name__)

_MIN_TOKENS_FOR_CARTEL_SCAN = 2
_SWEEP_SEM = asyncio.Semaphore(8)  # bound concurrent RPC calls during sweep
_TIMING_SYNC_WINDOW_SECONDS = 1800   # 30 minutes
_PHASH_HAMMING_THRESHOLD = 8         # out of 64 bits → ≥ 87.5% similarity
_MIN_TRANSFER_SOL = 0.1              # minimum SOL transfer to count as signal
_COMMUNITY_TIMEOUT = 15.0
_CONFIRMED_EVIDENCE_LEVELS = {EvidenceLevel.MODERATE.value, EvidenceLevel.STRONG.value}
_EXTRACTION_COMPATIBLE_MECHANISMS = {
    RugMechanism.DEX_LIQUIDITY_RUG.value,
    RugMechanism.PRE_DEX_EXTRACTION_RUG.value,
}


def _is_confirmed_cartel_rug(row: dict) -> bool:
    mechanism = (row.get("rug_mechanism") or "").strip()
    evidence_level = (row.get("evidence_level") or "").strip()
    if not mechanism:
        return True
    if mechanism not in _EXTRACTION_COMPATIBLE_MECHANISMS:
        return False
    if not evidence_level:
        return True
    return evidence_level in _CONFIRMED_EVIDENCE_LEVELS


# ── Public API ────────────────────────────────────────────────────────────────

async def compute_cartel_report(mint: str, deployer: str) -> Optional[CartelReport]:
    """Build a CartelReport for a token's deployer.

    Reads pre-computed cartel edges and runs community detection.
    Edge building is done separately by the background sweep.
    """
    if not deployer:
        return None
    try:
        return await asyncio.wait_for(
            _build_report(mint, deployer),
            timeout=_COMMUNITY_TIMEOUT,
        )
    except asyncio.TimeoutError:
        logger.warning("compute_cartel_report timed out for %s", deployer)
        return None
    except Exception:
        logger.exception("compute_cartel_report failed for %s", deployer)
        return None


async def build_cartel_edges_for_deployer(deployer: str) -> int:
    """Build all coordination signal edges for a single deployer.

    Returns number of new/updated edges.
    Runs the 5 original metadata/timing signals PLUS
    the financial graph signals (funding_link, shared_lp, sniper_ring,
    factory_cluster, common_funder) PLUS 4 forensic proof signals
    (profit_convergence, capital_recycling, temporal_fingerprint,
    compute_budget_fp).
    """
    from .cartel_financial_service import build_financial_edges

    # Phase 1: Original signals + financial (parallel)
    results = await asyncio.gather(
        _signal_timing_sync(deployer),
        _signal_phash_cluster(deployer),
        _signal_sol_transfer(deployer),
        _signal_cross_holdings(deployer),
        build_financial_edges(deployer),
        return_exceptions=True,
    )
    total = sum(r for r in results if isinstance(r, int))

    # Phase 2: Forensic proofs (cross-community + genesis tracing)
    from .cartel_financial_service import signal_common_funder

    forensic_results = await asyncio.gather(
        asyncio.wait_for(_signal_profit_convergence(deployer), timeout=30),
        asyncio.wait_for(_signal_temporal_fingerprint(deployer), timeout=30),
        asyncio.wait_for(_signal_compute_budget_fingerprint(deployer), timeout=60),
        asyncio.wait_for(signal_common_funder(deployer), timeout=120),
        return_exceptions=True,
    )
    total += sum(r for r in forensic_results if isinstance(r, int))

    # Phase 3: Capital recycling (depends on common_funder from phase 1 + profit_convergence)
    try:
        total += await _signal_capital_recycling(deployer)
    except Exception:
        logger.warning("_signal_capital_recycling failed for %s", deployer)

    return total


async def run_cartel_sweep() -> int:
    """Sweep all eligible deployers and build cartel edges.

    Called by the background scheduler every hour.
    Returns total edges discovered/updated.
    """
    try:
        rows = await event_query(
            "event_type = 'token_created'",
            columns="deployer",
            limit=10000,
        )
        from collections import Counter
        counts = Counter(r["deployer"] for r in rows if r.get("deployer"))
        eligible = [d for d, c in counts.items() if c >= _MIN_TOKENS_FOR_CARTEL_SCAN]
        logger.info("Cartel sweep: %d eligible deployers", len(eligible))

        total = 0

        # Signal 1 (DNA match) is global — run once across all fingerprints
        dna_count = await _signal_dna_match_all()
        total += dna_count

        # Other signals per deployer; semaphore limits to 8 concurrent RPC calls
        async def _sem_build(deployer: str) -> int:
            async with _SWEEP_SEM:
                return await build_cartel_edges_for_deployer(deployer)

        for i in range(0, len(eligible), 10):
            batch = eligible[i:i + 10]
            results = await asyncio.gather(
                *[_sem_build(d) for d in batch],
                return_exceptions=True,
            )
            total += sum(r for r in results if isinstance(r, int))

        logger.info("Cartel sweep complete: %d edges processed", total)

        # Populate community_lookup table for O(1) API lookups
        await _populate_community_lookup()

        # Detect cross-deployer narrative waves
        try:
            from .memory_service import detect_narrative_clusters
            clusters = await detect_narrative_clusters()
            if clusters:
                logger.info("Narrative clustering: %d thematic waves detected", len(clusters))
        except Exception as nc_exc:
            logger.debug("Narrative clustering skipped: %s", nc_exc)

        # Re-generate calibration rules from accumulated feedback
        try:
            from .memory_service import generate_calibration_rules
            rules = await generate_calibration_rules()
            if rules:
                logger.info("Calibration: %d rule(s) regenerated", rules)
        except Exception as cr_exc:
            logger.debug("Calibration regeneration skipped: %s", cr_exc)

        return total
    except Exception:
        logger.exception("run_cartel_sweep failed")
        return 0


async def _populate_community_lookup() -> None:
    """Build community_id → sample_wallet index after sweep.

    Runs Louvain community detection on the full edge graph and stores
    one representative wallet per community for O(1) API lookups.
    """
    try:
        all_edges = await cartel_edges_query_all()
        if not all_edges:
            return

        try:
            import networkx as nx
            import community as community_louvain
        except ImportError:
            return

        G: nx.Graph = nx.Graph()
        for row in all_edges:
            w_a = row["wallet_a"]
            w_b = row["wallet_b"]
            strength = float(row.get("signal_strength", 0.5))
            if G.has_edge(w_a, w_b):
                G[w_a][w_b]["weight"] = max(G[w_a][w_b]["weight"], strength)
            else:
                G.add_edge(w_a, w_b, weight=strength)

        try:
            partition = community_louvain.best_partition(G, weight="weight")
        except Exception:
            partition = {}
            for component in nx.connected_components(G):
                cid = abs(hash(frozenset(component))) % 100_000
                for node in component:
                    partition[node] = cid

        # Group wallets by community
        from collections import defaultdict
        by_community: dict[int, list[str]] = defaultdict(list)
        for wallet, cid in partition.items():
            by_community[cid].append(wallet)

        import hashlib
        for _cid, wallets in by_community.items():
            if len(wallets) < 2:
                continue
            community_id = hashlib.sha256(
                ":".join(sorted(wallets)).encode()
            ).hexdigest()[:12]
            await community_lookup_upsert(community_id, wallets[0])

        logger.info("community_lookup: indexed %d communities", len(by_community))
    except Exception:
        logger.exception("_populate_community_lookup failed")


# ── Signal detectors ─────────────────────────────────────────────────────────

async def _signal_dna_match_all() -> int:
    """Signal 1: DNA match — wallets sharing the same metadata fingerprint.

    Reads from operator_mappings table. All wallets sharing a fingerprint
    are linked with signal_strength = 0.95 (highest reliability signal).
    """
    count = 0
    try:
        all_mappings = await operator_mapping_query_all()
        by_fp: dict[str, list[str]] = defaultdict(list)
        for row in all_mappings:
            by_fp[row["fingerprint"]].append(row["wallet"])

        for fp, wallets in by_fp.items():
            if len(wallets) < 2:
                continue
            ws = sorted(wallets)
            for i in range(len(ws)):
                for j in range(i + 1, len(ws)):
                    await cartel_edge_upsert(
                        ws[i], ws[j],
                        "dna_match", 0.95,
                        {"fingerprint": fp},
                    )
                    count += 1
    except Exception:
        logger.exception("_signal_dna_match_all failed")
    return count


async def _signal_timing_sync(deployer: str) -> int:
    """Signal 3: Timing sync — same-narrative launches within 30 minutes."""
    count = 0
    try:
        my_rows = await event_query(
            "event_type = 'token_created' AND deployer = ?",
            params=(deployer,),
            columns="mint, narrative, created_at",
            limit=500,
        )
        if not my_rows:
            return 0

        for my_row in my_rows:
            narrative = my_row.get("narrative") or "other"
            ts_raw = my_row.get("created_at")
            if not ts_raw:
                continue

            my_ts = parse_datetime(ts_raw)
            if my_ts is None:
                continue

            ts_min = datetime.fromtimestamp(
                my_ts.timestamp() - _TIMING_SYNC_WINDOW_SECONDS, tz=timezone.utc
            ).isoformat()
            ts_max = datetime.fromtimestamp(
                my_ts.timestamp() + _TIMING_SYNC_WINDOW_SECONDS, tz=timezone.utc
            ).isoformat()

            nearby = await event_query(
                "event_type = 'token_created' AND narrative = ? AND deployer != ? "
                "AND created_at >= ? AND created_at <= ?",
                params=(narrative, deployer, ts_min, ts_max),
                columns="deployer, created_at",
                limit=20,
            )

            for other in nearby:
                other_deployer = other.get("deployer", "")
                if not other_deployer:
                    continue
                other_ts = parse_datetime(other.get("created_at"))
                if other_ts is not None:
                    delta_min = abs((my_ts - other_ts).total_seconds()) / 60.0
                    strength = max(0.1, 1.0 - delta_min / 30.0)
                else:
                    strength = 0.5

                await cartel_edge_upsert(
                    deployer, other_deployer,
                    "timing_sync", strength,
                    {
                        "narrative": narrative,
                        "my_ts": my_ts.isoformat(),
                        "other_ts": str(other.get("created_at", "")),
                    },
                )
                count += 1
    except Exception:
        logger.exception("_signal_timing_sync failed for %s", deployer)
    return count


async def _signal_phash_cluster(deployer: str) -> int:
    """Signal 4: pHash cluster — near-identical logos across different operators."""
    count = 0
    try:
        my_rows = await event_query(
            "event_type = 'token_created' AND deployer = ? AND phash IS NOT NULL",
            params=(deployer,),
            columns="mint, phash",
            limit=100,
        )
        my_phashes: list[tuple[str, int]] = []
        for row in my_rows:
            try:
                phash_hex = row.get("phash", "")
                if phash_hex:
                    my_phashes.append((row["mint"], int(phash_hex, 16)))
            except Exception:
                pass

        if not my_phashes:
            return 0

        # Query optimized: use indexed phash column instead of scanning extra_json.
        # Reduced limit from 5000 to 2000 to bound scan time.
        all_rows = await event_query(
            "event_type = 'token_created' AND deployer != ? AND phash IS NOT NULL",
            params=(deployer,),
            columns="deployer, mint, phash",
            limit=2000,
        )

        for other_row in all_rows:
            try:
                other_phash_hex = other_row.get("phash", "")
                if not other_phash_hex:
                    continue
                other_ph_int = int(other_phash_hex, 16)

                for my_mint, my_ph in my_phashes:
                    hamming = bin(my_ph ^ other_ph_int).count("1")
                    if hamming <= _PHASH_HAMMING_THRESHOLD:
                        strength = max(0.5, 1.0 - hamming / 64.0)
                        other_deployer = other_row.get("deployer", "")
                        if other_deployer:
                            await cartel_edge_upsert(
                                deployer, other_deployer,
                                "phash_cluster", strength,
                                {
                                    "hamming_distance": hamming,
                                    "my_mint": my_mint,
                                    "other_mint": other_row["mint"],
                                },
                            )
                            count += 1
            except Exception:
                pass
    except Exception:
        logger.exception("_signal_phash_cluster failed for %s", deployer)
    return count


async def _signal_sol_transfer(deployer: str) -> int:
    """Signal 2: SOL transfer — deployer sent SOL to another known deployer."""
    count = 0
    try:
        flows = await sol_flows_query_by_from(deployer)
        if not flows:
            return 0

        deployer_rows = await event_query(
            "event_type = 'token_created'",
            columns="deployer",
            limit=10000,
        )
        known_deployers = {r["deployer"] for r in deployer_rows if r.get("deployer")}
        known_deployers.discard(deployer)

        for flow in flows:
            to_addr = flow.get("to_address", "")
            if to_addr in known_deployers:
                amount_sol = flow.get("amount_lamports", 0) / 1_000_000_000.0
                if amount_sol >= _MIN_TRANSFER_SOL:
                    strength = min(1.0, amount_sol / 10.0)
                    await cartel_edge_upsert(
                        deployer, to_addr,
                        "sol_transfer", strength,
                        {
                            "amount_sol": round(amount_sol, 4),
                            "signature": flow.get("signature", ""),
                            "hop": flow.get("hop", 0),
                        },
                    )
                    count += 1
    except Exception:
        logger.exception("_signal_sol_transfer failed for %s", deployer)
    return count


async def _signal_cross_holdings(deployer: str) -> int:
    """Signal 5: Cross-holdings — deployer B holds a token created by deployer A."""
    count = 0
    try:
        # Cost control: only for deployers with ≥ 3 tokens in DB
        my_count_rows = await event_query(
            "event_type = 'token_created' AND deployer = ?",
            params=(deployer,),
            columns="mint",
            limit=3,
        )
        if len(my_count_rows) < 3:
            return 0

        rpc = get_rpc_client()
        holdings = await rpc.get_deployer_token_holdings(deployer)
        if not holdings:
            return 0

        mints_ph = ",".join("?" for _ in holdings)
        creator_rows = await event_query(
            f"event_type = 'token_created' AND mint IN ({mints_ph}) AND deployer != ?",
            params=tuple(holdings) + (deployer,),
            columns="mint, deployer",
            limit=100,
        )

        for row in creator_rows:
            other_deployer = row.get("deployer", "")
            if other_deployer:
                await cartel_edge_upsert(
                    deployer, other_deployer,
                    "cross_holding", 0.70,
                    {"held_mint": row["mint"]},
                )
                count += 1
    except Exception:
        logger.exception("_signal_cross_holdings failed for %s", deployer)
    return count


# ── Forensic proof signals (post-financial, cross-community) ─────────────────


async def _signal_profit_convergence(deployer: str) -> int:
    """Proof 2: Detect when profits from different deployers converge to the
    same terminal wallet (CEX, consolidation wallet, or bridge).

    Uses pre-cached sol_flows data — zero RPC cost.
    """
    count = 0
    try:
        edges = await cartel_edges_query(deployer)
        peer_wallets: set[str] = {deployer}
        for e in edges:
            peer_wallets.add(e["wallet_a"])
            peer_wallets.add(e["wallet_b"])
        if len(peer_wallets) < 2:
            return 0

        # For each deployer, collect terminal wallets from sol_flows
        deployer_terminals: dict[str, set[str]] = {}  # deployer → terminal addrs
        for w in peer_wallets:
            flows = await sol_flows_query_by_from(w)
            if not flows:
                continue
            # Terminal = to_addresses that never appear as from_addresses
            senders = {f["from_address"] for f in flows}
            terminals = {f["to_address"] for f in flows if f["to_address"] not in senders}
            if terminals:
                deployer_terminals[w] = terminals

        if len(deployer_terminals) < 2:
            return 0

        # Find terminal wallets receiving from ≥ 2 deployers
        terminal_to_deployers: dict[str, set[str]] = defaultdict(set)
        for d, terms in deployer_terminals.items():
            for t in terms:
                terminal_to_deployers[t].add(d)

        from .wallet_labels import classify_address

        for terminal, deployers_set in terminal_to_deployers.items():
            if len(deployers_set) < 2:
                continue
            wallet_info = classify_address(terminal)
            entity_type = wallet_info.entity_type or "unknown"
            strength = round(min(1.0, 0.80 + 0.05 * len(deployers_set)), 4)
            deployers_list = sorted(deployers_set)
            for i, wa in enumerate(deployers_list):
                for wb in deployers_list[i + 1:]:
                    await cartel_edge_upsert(
                        wa, wb, "profit_convergence", strength,
                        {
                            "terminal_wallet": terminal,
                            "entity_type": entity_type,
                            "deployer_count": len(deployers_set),
                        },
                    )
                    count += 1
    except Exception:
        logger.exception("_signal_profit_convergence failed for %s", deployer)
    return count


async def _signal_capital_recycling(deployer: str) -> int:
    """Proof 3: Detect closed financial loops where the same wallet both funds
    deployers (genesis funder) AND receives extraction proceeds.

    Must run AFTER signal_common_funder (proof 1) and _signal_profit_convergence (proof 2).
    """
    count = 0
    try:
        edges = await cartel_edges_query(deployer)
        peer_wallets: set[str] = {deployer}
        for e in edges:
            peer_wallets.add(e["wallet_a"])
            peer_wallets.add(e["wallet_b"])

        # Collect genesis funders from cached extra_json
        genesis_funders: dict[str, str] = {}  # deployer → funder_wallet
        for w in peer_wallets:
            rows = await event_query(
                "event_type = 'token_created' AND deployer = ? AND extra_json LIKE '%genesis_funder%'",
                params=(w,),
                columns="extra_json",
                limit=1,
            )
            if rows:
                try:
                    ej = json.loads(rows[0].get("extra_json") or "{}")
                    if isinstance(ej, str):
                        ej = json.loads(ej)
                    gf = ej.get("genesis_funder", {})
                    if gf.get("funder"):
                        genesis_funders[w] = gf["funder"]
                except Exception:
                    pass

        if not genesis_funders:
            return 0

        # Collect terminal wallets from sol_flows
        terminal_receivers: set[str] = set()
        for w in peer_wallets:
            flows = await sol_flows_query_by_from(w)
            if not flows:
                continue
            senders = {f["from_address"] for f in flows}
            for f in flows:
                if f["to_address"] not in senders:
                    terminal_receivers.add(f["to_address"])

        # Find recycling wallets: appear as both funder AND terminal receiver
        funder_set = set(genesis_funders.values())
        recycling_wallets = funder_set & terminal_receivers

        if not recycling_wallets:
            return 0

        for recycling_wallet in recycling_wallets:
            funded_deployers = [d for d, f in genesis_funders.items() if f == recycling_wallet]
            # Find which deployers send profits to this wallet
            received_from: list[str] = []
            for w in peer_wallets:
                flows = await sol_flows_query_by_from(w)
                for f in (flows or []):
                    if f["to_address"] == recycling_wallet:
                        received_from.append(w)
                        break

            if len(funded_deployers) < 1 or len(received_from) < 1:
                continue

            all_involved = sorted(set(funded_deployers) | set(received_from))
            for i, wa in enumerate(all_involved):
                for wb in all_involved[i + 1:]:
                    await cartel_edge_upsert(
                        wa, wb, "capital_recycling", 0.98,
                        {
                            "recycling_wallet": recycling_wallet,
                            "funded_deployers": funded_deployers[:10],
                            "received_from_deployers": received_from[:10],
                        },
                    )
                    count += 1
    except Exception:
        logger.exception("_signal_capital_recycling failed for %s", deployer)
    return count


async def _signal_temporal_fingerprint(deployer: str) -> int:
    """Proof 6: Detect deployers with matching activity time-of-day patterns.

    Uses Jensen-Shannon divergence on 24-hour activity histograms.
    Matching distributions strongly suggest the same human operator.
    """
    import math

    count = 0
    try:
        edges = await cartel_edges_query(deployer)
        peer_wallets: set[str] = {deployer}
        for e in edges:
            peer_wallets.add(e["wallet_a"])
            peer_wallets.add(e["wallet_b"])

        # Build 24-bin activity heatmap per deployer
        deployer_heatmaps: dict[str, list[float]] = {}
        for w in peer_wallets:
            rows = await event_query(
                "event_type = 'token_created' AND deployer = ?",
                params=(w,),
                columns="created_at",
                limit=200,
            )
            if len(rows) < 3:  # need ≥ 3 tokens for meaningful distribution
                continue
            bins = [0.0] * 24
            for r in rows:
                ca = r.get("created_at", "")
                if not ca:
                    continue
                try:
                    dt = parse_datetime(ca)
                    if dt:
                        bins[dt.hour] += 1.0
                except Exception:
                    pass
            total = sum(bins)
            if total < 3:
                continue
            deployer_heatmaps[w] = [b / total for b in bins]

        if len(deployer_heatmaps) < 2:
            return 0

        def _jsd(p: list[float], q: list[float]) -> float:
            """Jensen-Shannon divergence (0 = identical, 1 = maximally different)."""
            eps = 1e-10
            m = [(pi + qi) / 2 for pi, qi in zip(p, q)]
            kl_pm = sum(
                pi * math.log((pi + eps) / (mi + eps))
                for pi, mi in zip(p, m) if pi > 0
            )
            kl_qm = sum(
                qi * math.log((qi + eps) / (mi + eps))
                for qi, mi in zip(q, m) if qi > 0
            )
            return 0.5 * kl_pm + 0.5 * kl_qm

        def _peak_hours(heatmap: list[float]) -> str:
            """Return top 3 active hours as string."""
            indexed = sorted(enumerate(heatmap), key=lambda x: -x[1])
            return ",".join(f"{h}h" for h, _ in indexed[:3])

        wallets = sorted(deployer_heatmaps.keys())
        seen: set[str] = set()
        for i, wa in enumerate(wallets):
            for wb in wallets[i + 1:]:
                edge_key = f"{wa}:{wb}"
                if edge_key in seen:
                    continue
                seen.add(edge_key)
                jsd = _jsd(deployer_heatmaps[wa], deployer_heatmaps[wb])
                if jsd >= 0.10:
                    continue
                strength = round(max(0.60, 1.0 - jsd * 10), 4)
                await cartel_edge_upsert(
                    wa, wb, "temporal_fingerprint", strength,
                    {
                        "jsd_score": round(jsd, 4),
                        "deployer_a_peak_hours": _peak_hours(deployer_heatmaps[wa]),
                        "deployer_b_peak_hours": _peak_hours(deployer_heatmaps[wb]),
                        "tokens_compared_a": int(sum(deployer_heatmaps[wa]) * sum(1 for x in deployer_heatmaps[wa] if x > 0)),
                        "tokens_compared_b": int(sum(deployer_heatmaps[wb]) * sum(1 for x in deployer_heatmaps[wb] if x > 0)),
                    },
                )
                count += 1
    except Exception:
        logger.exception("_signal_temporal_fingerprint failed for %s", deployer)
    return count


async def _signal_compute_budget_fingerprint(deployer: str) -> int:
    """Proof 7: Detect deployers using the same deployment script by comparing
    ComputeBudget parameters (unitLimit, unitPrice) and program invocation order.
    """
    count = 0
    try:
        edges = await cartel_edges_query(deployer)
        peer_wallets: set[str] = {deployer}
        for e in edges:
            peer_wallets.add(e["wallet_a"])
            peer_wallets.add(e["wallet_b"])

        rpc = get_rpc_client()

        # Build fingerprint per deployer
        deployer_fps: dict[str, dict] = {}  # wallet → fingerprint dict

        for w in peer_wallets:
            # Check cached fingerprint in extra_json
            rows = await event_query(
                "event_type = 'token_created' AND deployer = ? AND extra_json LIKE '%compute_fp%'",
                params=(w,),
                columns="extra_json",
                limit=1,
            )
            if rows:
                try:
                    ej = json.loads(rows[0].get("extra_json") or "{}")
                    if isinstance(ej, str):
                        ej = json.loads(ej)
                    cfp = ej.get("compute_fp")
                    if cfp:
                        deployer_fps[w] = cfp
                        continue
                except Exception:
                    pass

            # Fetch creation TX and parse ComputeBudget
            events = await event_query(
                "event_type = 'token_created' AND deployer = ?",
                params=(w,),
                columns="mint",
                limit=5,
            )
            unit_limits: list[int] = []
            unit_prices: list[int] = []
            program_ids_set: list[str] = []

            for ev in events[:3]:  # sample up to 3 tokens per deployer
                mint = ev.get("mint", "")
                if not mint:
                    continue
                try:
                    from .cartel_financial_service import _get_earliest_signatures, _parse_transaction

                    sigs = await _get_earliest_signatures(rpc, mint, count=1, max_pages=2)
                    if not sigs:
                        continue
                    sig = sigs[0].get("signature", "")
                    if not sig:
                        continue
                    # Full TX with jsonParsed for ComputeBudget
                    tx_raw = await rpc._call(
                        "getTransaction",
                        [sig, {"encoding": "jsonParsed", "maxSupportedTransactionVersion": 0}],
                    )
                    if not tx_raw or not isinstance(tx_raw, dict):
                        continue
                    instructions = (
                        tx_raw.get("transaction", {}).get("message", {}).get("instructions", [])
                    )
                    prog_order: list[str] = []
                    for ix in instructions:
                        prog_id = ix.get("programId", "")
                        prog_order.append(prog_id)
                        if prog_id == "ComputeBudget111111111111111111111111111111":
                            parsed = ix.get("parsed", {})
                            if isinstance(parsed, dict):
                                ptype = parsed.get("type", "")
                                info = parsed.get("info", {})
                                if ptype == "setComputeUnitLimit":
                                    unit_limits.append(info.get("units", 0))
                                elif ptype == "setComputeUnitPrice":
                                    unit_prices.append(info.get("microLamportsPerComputeUnit", 0))
                    if prog_order:
                        program_ids_set = prog_order
                except Exception:
                    continue

            if not unit_prices and not program_ids_set:
                continue

            # Compute fingerprint
            prog_hash = hashlib.sha256(
                ",".join(program_ids_set).encode()
            ).hexdigest()[:8] if program_ids_set else ""
            fp = {
                "unit_limit": int(sorted(unit_limits)[len(unit_limits) // 2]) if unit_limits else 0,
                "unit_price": int(sorted(unit_prices)[len(unit_prices) // 2]) if unit_prices else 0,
                "instruction_count": len(program_ids_set),
                "program_hash": prog_hash,
            }
            deployer_fps[w] = fp

            # Cache fingerprint
            try:
                ev_rows = await event_query(
                    "event_type = 'token_created' AND deployer = ?",
                    params=(w,),
                    columns="extra_json, mint",
                    limit=1,
                )
                if ev_rows:
                    ej = json.loads(ev_rows[0].get("extra_json") or "{}")
                    if isinstance(ej, str):
                        ej = json.loads(ej)
                    ej["compute_fp"] = fp
                    from .data_sources._clients import event_update
                    await event_update(
                        "event_type = 'token_created' AND mint = ?",
                        (ev_rows[0]["mint"],),
                        extra_json=json.dumps(ej),
                    )
            except Exception:
                pass

        if len(deployer_fps) < 2:
            return 0

        # Compare fingerprints between all pairs
        wallets = sorted(deployer_fps.keys())
        seen: set[str] = set()
        for i, wa in enumerate(wallets):
            fp_a = deployer_fps[wa]
            for wb in wallets[i + 1:]:
                edge_key = f"{wa}:{wb}"
                if edge_key in seen:
                    continue
                seen.add(edge_key)
                fp_b = deployer_fps[wb]

                match_fields: list[str] = []
                if fp_a.get("unit_price") and fp_a["unit_price"] == fp_b.get("unit_price"):
                    match_fields.append("unit_price")
                if fp_a.get("program_hash") and fp_a["program_hash"] == fp_b.get("program_hash"):
                    match_fields.append("program_hash")
                if fp_a.get("unit_limit") and fp_a["unit_limit"] == fp_b.get("unit_limit"):
                    match_fields.append("unit_limit")
                if fp_a.get("instruction_count") and fp_a["instruction_count"] == fp_b.get("instruction_count"):
                    match_fields.append("instruction_count")

                if len(match_fields) < 2:
                    continue

                strength = round(min(1.0, 0.55 + 0.10 * len(match_fields)), 4)
                await cartel_edge_upsert(
                    wa, wb, "compute_budget_fp", strength,
                    {
                        "unit_limit": fp_a.get("unit_limit", 0),
                        "unit_price": fp_a.get("unit_price", 0),
                        "instruction_count": fp_a.get("instruction_count", 0),
                        "program_hash": fp_a.get("program_hash", ""),
                        "match_fields": ",".join(match_fields),
                    },
                )
                count += 1
    except Exception:
        logger.exception("_signal_compute_budget_fingerprint failed for %s", deployer)
    return count


# ── Community detection ───────────────────────────────────────────────────────

async def _build_report(mint: str, deployer: str) -> Optional[CartelReport]:
    """Run Louvain community detection on cartel edges for a deployer."""
    edges_rows = await cartel_edges_query(deployer)
    if not edges_rows:
        return CartelReport(mint=mint, deployer_community=None)

    try:
        import networkx as nx
        import community as community_louvain  # python-louvain
    except ImportError:
        logger.warning("networkx / python-louvain not installed — cartel graph disabled")
        return None

    # Build networkx graph from edge rows
    G: nx.Graph = nx.Graph()
    for row in edges_rows:
        w_a = row["wallet_a"]
        w_b = row["wallet_b"]
        strength = float(row.get("signal_strength", 0.5))
        if G.has_edge(w_a, w_b):
            G[w_a][w_b]["weight"] = max(G[w_a][w_b]["weight"], strength)
        else:
            G.add_edge(w_a, w_b, weight=strength)

    # ── Transitive expansion: fetch edges for all peers to include
    # inter-peer edges (e.g. profit_convergence between two peers).
    peer_wallets = set(G.nodes) - {deployer}
    expanded_rows: list[dict] = []
    for pw in peer_wallets:
        try:
            pw_edges = await cartel_edges_query(pw)
            expanded_rows.extend(pw_edges)
        except Exception:
            pass

    for row in expanded_rows:
        w_a = row["wallet_a"]
        w_b = row["wallet_b"]
        # Only add edges where BOTH wallets are already in the graph
        if w_a in G.nodes and w_b in G.nodes:
            strength = float(row.get("signal_strength", 0.5))
            if G.has_edge(w_a, w_b):
                G[w_a][w_b]["weight"] = max(G[w_a][w_b]["weight"], strength)
            else:
                G.add_edge(w_a, w_b, weight=strength)

    if deployer not in G.nodes:
        return CartelReport(mint=mint, deployer_community=None)

    # Louvain community detection (falls back to connected components on failure)
    try:
        partition: dict[str, int] = community_louvain.best_partition(G, weight="weight")
    except Exception:
        partition = {}
        for component in nx.connected_components(G):
            cid = abs(hash(frozenset(component))) % 100_000
            for node in component:
                partition[node] = cid

    deployer_cid = partition.get(deployer)
    if deployer_cid is None:
        return CartelReport(mint=mint, deployer_community=None)

    community_wallets = [w for w, c in partition.items() if c == deployer_cid]
    if len(community_wallets) < 2:
        return CartelReport(mint=mint, deployer_community=None)

    # Stable community_id from sorted wallet set
    community_id = hashlib.sha256(":".join(sorted(community_wallets)).encode()).hexdigest()[:12]

    # Aggregate stats across community wallets
    ph = ",".join("?" for _ in community_wallets)
    created_rows = await event_query(
        f"event_type = 'token_created' AND deployer IN ({ph})",
        params=tuple(community_wallets),
        columns="mint, mcap_usd",
        limit=2000,
    )
    mints = [r["mint"] for r in created_rows if r.get("mint")]

    total_rugs = 0
    estimated_extracted = 0.0
    total_sol_extracted = 0.0
    if mints:
        await normalize_legacy_rug_events(mints=mints)
        rug_ph = ",".join("?" for _ in mints)
        rugged_rows = await event_query(
            f"event_type = 'token_rugged' AND mint IN ({rug_ph})",
            params=tuple(mints),
            columns="mint, mcap_usd, rug_mechanism, evidence_level",
            limit=2000,
        )
        confirmed_rugged_rows = [row for row in rugged_rows if _is_confirmed_cartel_rug(row)]
        total_rugs = len(confirmed_rugged_rows)
        estimated_extracted = sum(
            (r.get("mcap_usd") or 0.0) * estimate_extraction_rate(r.get("mcap_usd"))
            for r in confirmed_rugged_rows
        )

        # Compute SOL extracted by ALL cartel wallets on THIS token (not all tokens)
        # This is fast: check token sell activity of each cartel wallet on the scanned mint
        try:
            from .data_sources._clients import get_rpc_client
            rpc = get_rpc_client()
            _sem = asyncio.Semaphore(6)

            async def _check_wallet_sell(wallet: str) -> float:
                """Check if a cartel wallet sold the scanned token. Returns SOL received."""
                async with _sem:
                    try:
                        # Use Helius Enhanced Transactions for fast pre-parsed data
                        txs = await asyncio.wait_for(
                            rpc.get_enhanced_transactions(wallet, limit=30),
                            timeout=8.0,
                        )
                        sol_received = 0.0
                        for tx in txs:
                            # Look for token transfers OUT (sell) of the scanned mint
                            for tt in tx.get("tokenTransfers", []):
                                if tt.get("mint") == mint and tt.get("fromUserAccount") == wallet:
                                    # This wallet sold the scanned token
                                    pass
                            # Look for SOL received in same tx (sell proceeds)
                            for nt in tx.get("nativeTransfers", []):
                                if nt.get("toUserAccount") == wallet and nt.get("amount", 0) > 0:
                                    # Check if this tx also has a token transfer out for our mint
                                    has_sell = any(
                                        tt.get("mint") == mint and tt.get("fromUserAccount") == wallet
                                        for tt in tx.get("tokenTransfers", [])
                                    )
                                    if has_sell:
                                        sol_received += nt["amount"] / 1e9
                        return sol_received
                    except Exception:
                        return 0.0

            # Check all cartel wallets (excluding deployer — already counted in sol_flow)
            other_wallets = [w for w in community_wallets if w != deployer][:15]
            results = await asyncio.gather(*[_check_wallet_sell(w) for w in other_wallets])
            cartel_sol_from_token = sum(results)
            total_sol_extracted += cartel_sol_from_token
            if cartel_sol_from_token > 0:
                logger.info("[cartel] %d cartel wallets extracted %.2f SOL from %s",
                            sum(1 for r in results if r > 0), cartel_sol_from_token, mint[:12])
        except Exception as exc:
            logger.debug("[cartel] cartel wallet sell check failed: %s", exc)

    # Earliest activity
    ts_rows = await event_query(
        f"event_type = 'token_created' AND deployer IN ({ph})",
        params=tuple(community_wallets),
        columns="created_at",
        order_by="created_at ASC",
        limit=1,
    )
    active_since: Optional[datetime] = None
    if ts_rows and ts_rows[0].get("created_at"):
        active_since = parse_datetime(ts_rows[0]["created_at"])

    # Filter edges to only those within this community (include expanded peer edges)
    community_set = set(community_wallets)
    all_edge_rows = edges_rows + expanded_rows
    # Deduplicate by (wallet_a, wallet_b, signal_type)
    seen_edge_keys: set[str] = set()
    community_edge_rows: list[dict] = []
    for r in all_edge_rows:
        if r["wallet_a"] in community_set and r["wallet_b"] in community_set:
            ek = f"{r['wallet_a']}:{r['wallet_b']}:{r['signal_type']}"
            if ek not in seen_edge_keys:
                seen_edge_keys.add(ek)
                community_edge_rows.append(r)

    strongest_signal = "dna_match"
    if community_edge_rows:
        best = max(community_edge_rows, key=lambda r: r.get("signal_strength", 0))
        strongest_signal = best.get("signal_type", "dna_match")

    edge_list: list[CartelEdge] = []
    for row in community_edge_rows:
        try:
            ev = json.loads(row.get("evidence_json") or "{}")
            # Defensive: handle double-encoded JSON strings
            if isinstance(ev, str):
                ev = json.loads(ev)
        except Exception:
            ev = {}
        edge_list.append(CartelEdge(
            wallet_a=row["wallet_a"],
            wallet_b=row["wallet_b"],
            signal_type=row["signal_type"],
            signal_strength=float(row.get("signal_strength", 0.5)),
            evidence=ev,
        ))

    # Confidence based on signal diversity and community size
    signal_types = {e.signal_type for e in edge_list}
    if len(signal_types) >= 2 and len(community_wallets) >= 3:
        confidence: Literal["high", "medium", "low"] = "high"
    elif len(signal_types) >= 2 or len(community_wallets) >= 2:
        confidence = "medium"
    else:
        confidence = "low"

    # Generate human-readable narrative
    n_wallets = len(community_wallets)
    n_tokens = len(created_rows)
    sol_display = f"{total_sol_extracted:.1f} SOL" if total_sol_extracted > 0 else ""
    usd_display = f"~${estimated_extracted:,.0f}" if estimated_extracted > 0 else ""

    narrative_parts = [
        f"This deployer is part of a coordinated network of {n_wallets} wallets",
        f"that launched {n_tokens} tokens",
    ]
    if strongest_signal == "shared_lp":
        # Count distinct LP wallets
        lp_wallets = set()
        for e in edge_list:
            lp = (e.evidence or {}).get("lp_wallet", "")
            if lp:
                lp_wallets.add(lp)
        narrative_parts.append(
            f"linked by {len(lp_wallets)} shared liquidity provider wallet{'s' if len(lp_wallets) > 1 else ''}"
        )
    elif strongest_signal:
        narrative_parts.append(f"linked by {strongest_signal.replace('_', ' ')}")

    if total_sol_extracted > 0:
        narrative_parts.append(
            f"— {total_sol_extracted:.1f} SOL extracted from this token by the network"
        )
    elif estimated_extracted > 0:
        narrative_parts.append(f"— ~${estimated_extracted:,.0f} estimated extraction")

    if total_rugs > 0:
        narrative_parts.append(f"with {total_rugs} confirmed rug{'s' if total_rugs > 1 else ''}")

    narrative = " ".join(narrative_parts) + "."

    community = CartelCommunity(
        community_id=community_id,
        wallets=community_wallets,
        total_tokens_launched=len(created_rows),
        total_rugs=total_rugs,
        estimated_extracted_usd=round(estimated_extracted, 2),
        total_sol_extracted=round(total_sol_extracted, 2),
        narrative=narrative,
        active_since=active_since,
        strongest_signal=strongest_signal,
        edges=edge_list,
        confidence=confidence,
    )
    return CartelReport(mint=mint, deployer_community=community)
