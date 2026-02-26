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

from .data_sources._clients import (
    cartel_edge_upsert,
    cartel_edges_query,
    cartel_edges_query_all,
    event_query,
    get_rpc_client,
    operator_mapping_query_all,
    sol_flows_query_by_from,
)
from .models import CartelCommunity, CartelEdge, CartelReport

logger = logging.getLogger(__name__)

_MIN_TOKENS_FOR_CARTEL_SCAN = 2
_TIMING_SYNC_WINDOW_SECONDS = 1800   # 30 minutes
_PHASH_HAMMING_THRESHOLD = 8         # out of 64 bits → ≥ 87.5% similarity
_MIN_TRANSFER_SOL = 0.1              # minimum SOL transfer to count as signal
_COMMUNITY_TIMEOUT = 15.0


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
    the 3 financial graph signals (funding_link, shared_lp, sniper_ring).
    """
    from .cartel_financial_service import build_financial_edges

    results = await asyncio.gather(
        _signal_timing_sync(deployer),
        _signal_phash_cluster(deployer),
        _signal_sol_transfer(deployer),
        _signal_cross_holdings(deployer),
        build_financial_edges(deployer),
        return_exceptions=True,
    )
    total = sum(r for r in results if isinstance(r, int))
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

        # Other signals per deployer; batches of 10 to bound concurrency
        for i in range(0, len(eligible), 10):
            batch = eligible[i:i + 10]
            results = await asyncio.gather(
                *[build_cartel_edges_for_deployer(d) for d in batch],
                return_exceptions=True,
            )
            total += sum(r for r in results if isinstance(r, int))

        logger.info("Cartel sweep complete: %d edges processed", total)
        return total
    except Exception:
        logger.exception("run_cartel_sweep failed")
        return 0


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

            try:
                my_ts = datetime.fromisoformat(str(ts_raw).replace("Z", "+00:00"))
                if my_ts.tzinfo is None:
                    my_ts = my_ts.replace(tzinfo=timezone.utc)
            except Exception:
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
                try:
                    other_ts = datetime.fromisoformat(
                        str(other.get("created_at", "")).replace("Z", "+00:00")
                    )
                    if other_ts.tzinfo is None:
                        other_ts = other_ts.replace(tzinfo=timezone.utc)
                    delta_min = abs((my_ts - other_ts).total_seconds()) / 60.0
                    strength = max(0.1, 1.0 - delta_min / 30.0)
                except Exception:
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
            "event_type = 'token_created' AND deployer = ? AND extra_json IS NOT NULL",
            params=(deployer,),
            columns="mint, extra_json",
            limit=100,
        )
        my_phashes: list[tuple[str, int]] = []
        for row in my_rows:
            try:
                ej = json.loads(row.get("extra_json") or "{}")
                phash_hex = ej.get("phash", "")
                if phash_hex:
                    my_phashes.append((row["mint"], int(phash_hex, 16)))
            except Exception:
                pass

        if not my_phashes:
            return 0

        all_rows = await event_query(
            "event_type = 'token_created' AND deployer != ? AND extra_json IS NOT NULL",
            params=(deployer,),
            columns="deployer, mint, extra_json",
            limit=5000,
        )

        for other_row in all_rows:
            try:
                ej = json.loads(other_row.get("extra_json") or "{}")
                other_phash_hex = ej.get("phash", "")
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
    if mints:
        rug_ph = ",".join("?" for _ in mints)
        rugged_rows = await event_query(
            f"event_type = 'token_rugged' AND mint IN ({rug_ph})",
            params=tuple(mints),
            columns="mint, mcap_usd",
            limit=2000,
        )
        total_rugs = len(rugged_rows)
        estimated_extracted = sum(
            (r.get("mcap_usd") or 0.0) * 0.15
            for r in rugged_rows
        )

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
        try:
            ts_str = str(ts_rows[0]["created_at"]).replace("Z", "+00:00")
            active_since = datetime.fromisoformat(ts_str)
            if active_since.tzinfo is None:
                active_since = active_since.replace(tzinfo=timezone.utc)
        except Exception:
            pass

    # Filter edges to only those within this community
    community_set = set(community_wallets)
    community_edge_rows = [
        r for r in edges_rows
        if r["wallet_a"] in community_set and r["wallet_b"] in community_set
    ]

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

    community = CartelCommunity(
        community_id=community_id,
        wallets=community_wallets,
        total_tokens_launched=len(created_rows),
        total_rugs=total_rugs,
        estimated_extracted_usd=round(estimated_extracted, 2),
        active_since=active_since,
        strongest_signal=strongest_signal,
        edges=edge_list,
        confidence=confidence,
    )
    return CartelReport(mint=mint, deployer_community=community)
