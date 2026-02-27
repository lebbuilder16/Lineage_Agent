"""
Forensic Bundle Tracker — Pre + Post Sell Behavior Analysis.

On Solana, coordinated launches (Jito bundles) place 3–20 wallets in the same
block as pool creation. The key challenge: bundle wallets are **not** necessarily
team wallets — they might be genuine snipers who happened to be fast.

This service implements a **proof-first** forensic pipeline:

  Phase 1 — Detect bundle buyers (slots 0–4 after pool creation)
  Phase 2 — Pre-sell behavior: wallet age, funding source, pre-launch activity
  Phase 3 — Post-sell behavior: trace SOL destinations AFTER token sell (≤2 hops)
  Phase 4 — Cross-wallet coordination: common funder, sell timing, common sink
  Phase 5 — Verdict: attributed to team ONLY when on-chain link is verified

The result is persisted so subsequent scans read from cache.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Optional

from .data_sources.solana_rpc import SolanaRpcClient
from .data_sources._clients import get_rpc_client, bundle_report_insert, bundle_report_query
from .constants import SKIP_PROGRAMS
from .models import (
    BundleWalletVerdict,
    FundDestination,
    PreSellBehavior,
    PostSellBehavior,
    BundleWalletAnalysis,
    BundleExtractionReport,
)

logger = logging.getLogger(__name__)

# ── Tuning constants ──────────────────────────────────────────────────────────
_BUNDLE_SLOT_WINDOW           = 20     # slots after pool creation counted as "bundle" (~8s)
                                        # Jito bundles land in slot 0 but coordinated wallets
                                        # without Jito may arrive in slots 5–15.
_PRE_FUND_WINDOW_H            = 72     # hours before launch to look for funding
_DORMANCY_THRESHOLD_DAYS      = 30     # wallet "dormant" if inactive for this many days
_PRE_LAUNCH_ACTIVITY_WINDOW_H = 72    # hours before launch for activity scan
_MIN_PREFUND_LAMPORTS         = 10_000_000   # 0.01 SOL minimum funding to count
_MIN_POSTSELL_LAMPORTS        = 50_000_000   # 0.05 SOL minimum outflow to trace
_COORDINATED_SELL_SLOT_WINDOW = 200     # slots: if ≥2 wallets sell within this → coordinated
                                        # PumpFun bundle sellers typically dump within minutes,
                                        # not in the same slot.  200 slots ≈ 80 seconds.
_COMMON_SINK_MIN_COUNT        = 2      # ≥N bundle wallets → same destination = common sink
_MAX_BUNDLE_WALLETS           = 10     # cap to avoid timeouts on very wide bundles
_MAX_POSTSELL_HOPS            = 2      # BFS hops for post-sell outflow tracing
_ANALYSIS_TIMEOUT_S           = 55     # hard timeout for the full analysis
_TRACE_SIGS_PER_WALLET        = 100    # signatures to fetch per wallet for post-sell scan
_SOL_DECIMALS                 = 1_000_000_000

_SKIP_PROGRAMS = SKIP_PROGRAMS

# PumpFun program ID — used for bonding curve PDA derivation
_PUMP_PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBymtzbm"
# Maximum pages to paginate when hunting for creation slot (1000 sigs/page)
_MAX_PAGINATION_PAGES = 30
# Concurrency throttle — max parallel RPC calls from the bundle tracker.
# Prevents Helius rate-limit storms that trip the shared circuit breaker.
_RPC_CONCURRENCY = 8


# ─────────────────────────────────────────────────────────────────────────────
# Pure-Python PDA derivation (no solders / base58 dependency)
# ─────────────────────────────────────────────────────────────────────────────

_ED25519_P = 2**255 - 19
_ED25519_D = (-121665 * pow(121666, _ED25519_P - 2, _ED25519_P)) % _ED25519_P
_B58_ALPHA = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
_B58_MAP   = {c: i for i, c in enumerate(_B58_ALPHA)}


def _is_on_ed25519_curve(b: bytes) -> bool:
    """Return True if *b* (32 bytes, little-endian) is a valid Ed25519 point.
    PDAs must be *off* curve, so callers invert this check."""
    try:
        y_int = int.from_bytes(b, "little")
        sign  = y_int >> 255
        y     = y_int & ((1 << 255) - 1)
        y2    = (y * y) % _ED25519_P
        u     = (y2 - 1) % _ED25519_P
        v     = (_ED25519_D * y2 + 1) % _ED25519_P
        x2    = (u * pow(v, _ED25519_P - 2, _ED25519_P)) % _ED25519_P
        if x2 == 0:
            return sign == 0
        x = pow(x2, (_ED25519_P + 3) // 8, _ED25519_P)
        if (x * x) % _ED25519_P != x2:
            x = (x * pow(2, (_ED25519_P - 1) // 4, _ED25519_P)) % _ED25519_P
        if (x * x) % _ED25519_P != x2:
            return False
        return True
    except Exception:
        return False


def _b58decode_32(s: str) -> bytes:
    """Decode a 32-byte Solana pubkey from base58."""
    n = 0
    for c in s:
        n = n * 58 + _B58_MAP[c]
    return n.to_bytes(32, "big")


def _b58encode(b: bytes) -> str:
    """Encode bytes to base58 (Solana-style)."""
    n = int.from_bytes(b, "big")
    out: list[str] = []
    while n:
        n, r = divmod(n, 58)
        out.append(_B58_ALPHA[r])
    for byte in b:
        if byte == 0:
            out.append(_B58_ALPHA[0])
        else:
            break
    return "".join(reversed(out))


def _find_pda(seeds: list[bytes], program_id: str) -> Optional[str]:
    """Derive a Program Derived Address (PDA) in pure Python."""
    try:
        prog = _b58decode_32(program_id)
        for nonce in range(255, -1, -1):
            candidate = hashlib.sha256(
                b"".join(seeds) + bytes([nonce]) + prog + b"ProgramDerivedAddress"
            ).digest()
            if not _is_on_ed25519_curve(candidate):
                return _b58encode(candidate)
    except Exception as exc:
        logger.debug("[bundle] PDA derivation failed: %s", exc)
    return None


def _pump_bonding_curve(mint: str) -> Optional[str]:
    """Return the PumpFun bonding curve PDA for *mint*, or None on failure."""
    try:
        return _find_pda([b"bonding-curve", _b58decode_32(mint)], _PUMP_PROGRAM)
    except Exception:
        return None


# ─────────────────────────────────────────────────────────────────────────────
# Public entry-point
# ─────────────────────────────────────────────────────────────────────────────

async def analyze_bundle(
    mint: str,
    deployer: str,
    sol_price_usd: Optional[float] = None,
    *,
    force_refresh: bool = False,
) -> Optional[BundleExtractionReport]:
    """Forensic bundle analysis for *mint*.

    Phases: buyer detection → pre-sell behavior → post-sell tracing →
    cross-wallet coordination → verdict.

    Results are persisted to the ``bundle_reports`` table (24h TTL).
    Returns ``None`` on RPC failure or no bundle activity.
    """
    # ── 0. Cache check ────────────────────────────────────────────────────
    if not force_refresh:
        try:
            cached_json = await bundle_report_query(mint)
            if cached_json:
                data = json.loads(cached_json)
                return BundleExtractionReport(**data)
        except Exception:
            logger.debug("[bundle] cache read failed for %s", mint[:8])

    rpc = get_rpc_client()
    try:
        report = await asyncio.wait_for(
            _run_forensic(mint, deployer, sol_price_usd, rpc),
            timeout=_ANALYSIS_TIMEOUT_S,
        )
    except asyncio.TimeoutError:
        logger.warning("[bundle] forensic analysis timed out for %s", mint[:8])
        return None
    except Exception as exc:
        logger.warning("[bundle] forensic analysis failed for %s: %s", mint[:8], exc)
        return None

    if report is not None:
        try:
            report_data = report.model_dump(mode="json")
            await bundle_report_insert(mint, deployer, json.dumps(report_data, default=str))
        except Exception:
            logger.debug("[bundle] cache write failed for %s", mint[:8])

    return report


# ─────────────────────────────────────────────────────────────────────────────
# Phase 1 — Detect bundle buyers
# ─────────────────────────────────────────────────────────────────────────────

async def _run_forensic(
    mint: str,
    deployer: str,
    sol_price_usd: Optional[float],
    rpc: SolanaRpcClient,
) -> Optional[BundleExtractionReport]:

    # ── Step 0: Anchor the true creation slot ────────────────────────────
    # Uses SolanaRpcClient.get_oldest_signature() which correctly paginates
    # getSignaturesForAddress backward (newest→oldest) to find the very first
    # transaction for this mint.
    #
    # For PumpFun tokens, use the bonding curve PDA first — it has far fewer
    # transactions than the mint itself (which accumulates trades), so
    # pagination is dramatically faster (often 1 page vs 10+).
    #
    # circuit_protect=False — the bundle tracker is an intensive analysis tool;
    # its RPC failures must NOT trip the shared circuit breaker that guards the
    # main API endpoints.
    curve = _pump_bonding_curve(mint)
    oldest_sig = None
    if curve:
        oldest_sig = await rpc.get_oldest_signature(curve, circuit_protect=False)
    if oldest_sig is None:
        oldest_sig = await rpc.get_oldest_signature(mint, circuit_protect=False)
    if oldest_sig is None:
        logger.debug("[bundle] no signatures found for %s", mint[:8])
        return None

    creation_slot = oldest_sig.get("slot")
    creation_time = oldest_sig.get("blockTime")
    if creation_slot is None:
        logger.debug("[bundle] oldest sig has no slot for %s", mint[:8])
        return None

    logger.debug("[bundle] creation anchor slot=%d for %s", creation_slot, mint[:8])

    launch_dt = (
        datetime.fromtimestamp(creation_time, tz=timezone.utc)
        if creation_time
        else datetime.now(tz=timezone.utc)
    )

    # ── Step 1: Collect bundle-window signatures ──────────────────────────
    # Paginate from newest → oldest, stopping once we've covered the window.
    # For PumpFun we paginate the bonding curve (fewer txs than the mint).
    bundle_sigs = await _find_bundle_sigs_paginated(rpc, mint, creation_slot)
    if not bundle_sigs:
        return None

    sem = asyncio.Semaphore(_RPC_CONCURRENCY)

    async def _throttled_fetch(sig: str) -> Optional[dict]:
        async with sem:
            return await _fetch_tx(rpc, sig)

    tx_results = await asyncio.gather(
        *[_throttled_fetch(sig) for sig in bundle_sigs],
        return_exceptions=True,
    )

    # ── Step 1c: Extract buyer wallets ───────────────────────────────────
    buyer_wallets: dict[str, float] = {}  # wallet → SOL spent
    for tx in tx_results:
        if not tx or isinstance(tx, Exception):
            continue
        _extract_buyers(tx, deployer, buyer_wallets)

    if not buyer_wallets:
        return None

    # Cap to top-N by SOL spent
    top_buyers = sorted(buyer_wallets.items(), key=lambda x: x[1], reverse=True)
    top_buyers = top_buyers[:_MAX_BUNDLE_WALLETS]
    wallets = [w for w, _ in top_buyers]

    logger.info("[bundle] phase1 detected %d bundle buyers for %s", len(wallets), mint[:8])

    # ─────────────────────────────────────────────────────────────────────
    # Phase 2 — Pre-sell behavior (per wallet, parallel)
    # ─────────────────────────────────────────────────────────────────────
    async def _throttled_pre_sell(w: str) -> PreSellBehavior:
        async with sem:
            return await _analyze_pre_sell(rpc, w, deployer, launch_dt)

    pre_sell_tasks = [_throttled_pre_sell(w) for w in wallets]
    pre_sell_results: list[PreSellBehavior] = [
        r if not isinstance(r, Exception) else PreSellBehavior()
        for r in await asyncio.gather(*pre_sell_tasks, return_exceptions=True)
    ]

    # ─────────────────────────────────────────────────────────────────────
    # Phase 3 — Post-sell behavior (per wallet, parallel)
    # ─────────────────────────────────────────────────────────────────────
    # Seed deployer-linked set with deployer + any confirmed pre-fund sources
    deployer_linked: set[str] = {deployer}
    for ps in pre_sell_results:
        if ps.prefund_source_is_deployer and ps.prefund_source:
            deployer_linked.add(ps.prefund_source)

    async def _throttled_post_sell(w: str) -> PostSellBehavior:
        async with sem:
            return await _analyze_post_sell(rpc, w, mint, deployer, deployer_linked, launch_dt, creation_slot)

    post_sell_tasks = [_throttled_post_sell(w) for w in wallets]
    post_sell_results: list[PostSellBehavior] = [
        r if not isinstance(r, Exception) else PostSellBehavior()
        for r in await asyncio.gather(*post_sell_tasks, return_exceptions=True)
    ]

    # ─────────────────────────────────────────────────────────────────────
    # Phase 4 — Cross-wallet coordination
    # ─────────────────────────────────────────────────────────────────────
    common_prefund_source = _detect_common_prefund_source(pre_sell_results)
    coordinated_sell = _detect_coordinated_sell(post_sell_results)
    common_sinks = _detect_common_sinks(post_sell_results)

    # Back-fill cross-wallet flags
    for ps in post_sell_results:
        for dest in ps.fund_destinations:
            if dest.destination in common_sinks:
                dest.seen_in_other_bundles = True
        if any(d.seen_in_other_bundles for d in ps.fund_destinations):
            ps.common_destination_with_other_bundles = True

    if common_prefund_source:
        for pre in pre_sell_results:
            if pre.prefund_source == common_prefund_source:
                pre.prefund_source_is_known_funder = True

    # ─────────────────────────────────────────────────────────────────────
    # Phase 5 — Per-wallet verdict + aggregation
    # ─────────────────────────────────────────────────────────────────────
    # Determine which sell_slots participated in coordinated sell timing
    coord_sell_slots = _coordinated_sell_slots(post_sell_results)
    num_bundle = len(wallets)

    wallet_analyses: list[BundleWalletAnalysis] = []
    for (wallet, sol_spent), pre, post in zip(top_buyers, pre_sell_results, post_sell_results):
        is_coord = (
            post.sell_detected
            and post.sell_slot is not None
            and post.sell_slot in coord_sell_slots
        )
        flags, verdict = _compute_wallet_verdict(
            pre, post,
            is_coordinated_sell_participant=is_coord,
            num_bundle_wallets=num_bundle,
        )
        wallet_analyses.append(BundleWalletAnalysis(
            wallet=wallet,
            sol_spent=round(sol_spent, 4),
            pre_sell=pre,
            post_sell=post,
            red_flags=flags,
            verdict=verdict,
        ))

    confirmed    = [a.wallet for a in wallet_analyses if a.verdict == BundleWalletVerdict.CONFIRMED_TEAM]
    suspected    = [a.wallet for a in wallet_analyses if a.verdict == BundleWalletVerdict.SUSPECTED_TEAM]
    dumps        = [a.wallet for a in wallet_analyses if a.verdict == BundleWalletVerdict.COORDINATED_DUMP]
    early_buyers = [a.wallet for a in wallet_analyses if a.verdict == BundleWalletVerdict.EARLY_BUYER]

    overall_verdict, evidence_chain = _compute_overall_verdict(
        wallet_analyses, confirmed, suspected, dumps, common_sinks, coordinated_sell
    )

    total_sol_spent = sum(a.sol_spent for a in wallet_analyses)
    # Only count SOL flows confirmed returning to deployer-linked addresses
    total_extracted = sum(
        dest.lamports / _SOL_DECIMALS
        for a in wallet_analyses
        for dest in a.post_sell.fund_destinations
        if dest.link_to_deployer
    )
    total_usd = (
        round(total_extracted * sol_price_usd, 2)
        if sol_price_usd and sol_price_usd > 0 and total_extracted > 0
        else None
    )

    return BundleExtractionReport(
        mint=mint,
        deployer=deployer,
        launch_slot=creation_slot,
        bundle_wallets=wallet_analyses,
        confirmed_team_wallets=confirmed,
        suspected_team_wallets=suspected,
        coordinated_dump_wallets=dumps,
        early_buyer_wallets=early_buyers,
        total_sol_spent_by_bundle=round(total_sol_spent, 4),
        total_sol_extracted_confirmed=round(total_extracted, 4),
        total_usd_extracted=total_usd,
        common_prefund_source=common_prefund_source,
        common_sink_wallets=list(common_sinks),
        coordinated_sell_detected=coordinated_sell,
        overall_verdict=overall_verdict,
        evidence_chain=evidence_chain,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Bundle-window signature collection
# ─────────────────────────────────────────────────────────────────────────────


async def _find_bundle_sigs_paginated(
    rpc: "SolanaRpcClient",
    mint: str,
    creation_slot: int,
) -> list[str]:
    """Return signatures inside [creation_slot, creation_slot+WINDOW].

    For PumpFun tokens we paginate the bonding curve (much fewer txs than
    the mint itself once trading begins).  Falls back to the mint address.
    For both addresses we paginate newest→oldest and stop as soon as the
    current batch spans past ``creation_slot``.
    """
    # Try bonding curve first (PumpFun optimisation)
    curve = _pump_bonding_curve(mint)
    addresses = [curve, mint] if curve else [mint]

    for address in addresses:
        if not address:
            continue
        result = await _collect_window_sigs(rpc, address, creation_slot)
        if result:
            logger.debug(
                "[bundle] found %d window sigs on %s for %s",
                len(result), "curve" if address == curve else "mint", mint[:8],
            )
            return result

    return []


async def _collect_window_sigs(
    rpc: "SolanaRpcClient",
    address: str,
    creation_slot: int,
) -> list[str]:
    """Paginate *address* (newest→oldest) and collect sigs in the bundle window.

    Accumulates matching sigs across page boundaries so that a window spanning
    two batches is handled correctly.
    """
    window_end = creation_slot + _BUNDLE_SLOT_WINDOW
    before: Optional[str] = None
    found: list[str] = []  # accumulate across pages

    for _ in range(_MAX_PAGINATION_PAGES):
        params: dict = {"limit": 1000, "commitment": "finalized"}
        if before:
            params["before"] = before
        batch = await rpc._call("getSignaturesForAddress", [address, params], circuit_protect=False)
        if not batch or not isinstance(batch, list):
            break

        valid = [
            s for s in batch
            if not s.get("err") and s.get("signature") and s.get("slot") is not None
        ]
        if not valid:
            if len(batch) < 1000:
                break
            before = batch[-1].get("signature") or ""
            if not before:
                break
            continue

        # Collect any sigs in the window from this batch
        for s in valid:
            if creation_slot <= s["slot"] <= window_end:
                found.append(s["signature"])

        min_slot = min(s["slot"] for s in valid)

        # We've reached or passed the creation slot — done
        if min_slot <= creation_slot:
            return found

        if len(batch) < 1000:
            # Reached the beginning of history
            return found

        before = valid[-1]["signature"]

    return found


# ─────────────────────────────────────────────────────────────────────────────
# Phase 2 helpers — Pre-sell behavior
# ─────────────────────────────────────────────────────────────────────────────

async def _analyze_pre_sell(
    rpc: SolanaRpcClient,
    wallet: str,
    deployer: str,
    launch_dt: datetime,
) -> PreSellBehavior:
    """Analyse a bundle wallet's history BEFORE the token launch."""
    pre = PreSellBehavior()
    try:
        sigs = await rpc._call(
            "getSignaturesForAddress",
            [wallet, {"limit": 100, "commitment": "finalized"}],
            circuit_protect=False,
        )
        if not sigs or not isinstance(sigs, list):
            return pre

        # Wallet age
        all_times = [s.get("blockTime") for s in sigs if s.get("blockTime")]
        if all_times:
            first_ts = min(all_times)
            pre.wallet_age_days = (
                datetime.now(tz=timezone.utc).timestamp() - first_ts
            ) / 86_400
            last_pre_launch = max(
                (s.get("blockTime", 0) for s in sigs
                 if s.get("blockTime", 0) < launch_dt.timestamp()),
                default=None,
            )
            if last_pre_launch:
                days_since_last = (launch_dt.timestamp() - last_pre_launch) / 86_400
                pre.is_dormant = days_since_last > _DORMANCY_THRESHOLD_DAYS

        launch_ts    = launch_dt.timestamp()
        window_start = launch_dt - timedelta(hours=_PRE_FUND_WINDOW_H)
        window_ts    = window_start.timestamp()

        # Pre-launch signatures
        pre_launch_sigs = [
            s for s in sigs
            if window_ts <= s.get("blockTime", 0) < launch_ts and not s.get("err")
        ]
        pre.pre_launch_tx_count = len(pre_launch_sigs)

        if pre_launch_sigs:
            txs = await asyncio.gather(
                *[_fetch_tx(rpc, s["signature"]) for s in pre_launch_sigs[:15]],
                return_exceptions=True,
            )
            unique_tokens: set[str] = set()
            for tx in txs:
                if not tx or isinstance(tx, Exception):
                    continue
                # Funding detection: incoming SOL
                if not pre.prefund_source:
                    funder, sol = _find_incoming_sol_transfer(tx, wallet)
                    if funder and sol * _SOL_DECIMALS >= _MIN_PREFUND_LAMPORTS:
                        pre.prefund_source = funder
                        pre.prefund_sol    = round(sol, 4)
                        bt = tx.get("blockTime")
                        if bt:
                            pre.prefund_hours_before_launch = round(
                                (launch_ts - bt) / 3600, 2
                            )
                        pre.prefund_source_is_deployer = (funder == deployer)
                # Count unique token interactions
                for tb in (tx.get("meta") or {}).get("preTokenBalances", []):
                    m = tb.get("mint", "")
                    if m:
                        unique_tokens.add(m)
            pre.pre_launch_unique_tokens = len(unique_tokens)

    except Exception as exc:
        logger.debug("[bundle] pre-sell analysis failed for %s: %s", wallet[:8], exc)

    return pre


def _find_incoming_sol_transfer(tx: dict, recipient: str) -> tuple[Optional[str], float]:
    """Return (sender, sol_amount) for the largest incoming SOL transfer to recipient."""
    try:
        raw_keys = tx.get("transaction", {}).get("message", {}).get("accountKeys", [])
        keys     = [(k.get("pubkey", "") if isinstance(k, dict) else str(k)) for k in raw_keys]
        pre      = tx.get("meta", {}).get("preBalances",  [])
        post     = tx.get("meta", {}).get("postBalances", [])

        if recipient not in keys:
            return None, 0.0
        rec_idx   = keys.index(recipient)
        rec_delta = (post[rec_idx] - pre[rec_idx]) / _SOL_DECIMALS if rec_idx < len(post) else 0.0
        if rec_delta * _SOL_DECIMALS < _MIN_PREFUND_LAMPORTS:
            return None, 0.0

        best_sender, best_delta = None, 0.0
        for i, k in enumerate(keys):
            if k == recipient or k in _SKIP_PROGRAMS or i >= len(post):
                continue
            d = (pre[i] - post[i]) / _SOL_DECIMALS  # positive = they lost SOL
            if d > best_delta:
                best_delta = d
                best_sender = k
        return best_sender, rec_delta
    except Exception:
        return None, 0.0


# ─────────────────────────────────────────────────────────────────────────────
# Phase 3 helpers — Post-sell behavior
# ─────────────────────────────────────────────────────────────────────────────

async def _analyze_post_sell(
    rpc: SolanaRpcClient,
    wallet: str,
    target_mint: str,
    deployer: str,
    deployer_linked: set[str],
    launch_dt: datetime,
    launch_slot: int,
) -> PostSellBehavior:
    """Trace SOL flows from a bundle wallet AFTER it sells its token position."""
    post = PostSellBehavior()
    try:
        launch_ts = launch_dt.timestamp()
        sigs = await rpc._call(
            "getSignaturesForAddress",
            [wallet, {"limit": _TRACE_SIGS_PER_WALLET, "commitment": "finalized"}],
            circuit_protect=False,
        )
        if not sigs or not isinstance(sigs, list):
            return post

        post_launch = [
            s for s in sigs
            if s.get("blockTime", 0) >= launch_ts and not s.get("err")
        ]
        if not post_launch:
            return post

        txs = await asyncio.gather(
            *[_fetch_tx(rpc, s["signature"]) for s in post_launch[:30]],
            return_exceptions=True,
        )

        # Find the sell transaction (token balance → 0)
        sell_tx = None
        sell_slot: Optional[int] = None
        sell_sig:  Optional[str] = None
        sol_received = 0.0

        for s, tx in zip(post_launch[:30], txs):
            if not tx or isinstance(tx, Exception):
                continue
            if _is_full_sell(tx, wallet, target_mint):
                sell_tx      = tx
                sell_slot    = s.get("slot")
                sell_sig     = s.get("signature")
                sol_received = _compute_sol_received(tx, wallet)
                break

        if sell_tx is None:
            return post  # no sell detected — do NOT trace outflows

        post.sell_detected          = True
        post.sell_slot              = sell_slot
        post.sell_tx_signature      = sell_sig
        post.sol_received_from_sell = round(sol_received, 4)

        # Trace ONLY post-sell outflows
        post_sell_sigs = [
            s for s in post_launch
            if s.get("slot", 0) >= (sell_slot or 0) and s.get("signature") != sell_sig
        ]
        if not post_sell_sigs:
            return post

        post_sell_txs = await asyncio.gather(
            *[_fetch_tx(rpc, s["signature"]) for s in post_sell_sigs[:20]],
            return_exceptions=True,
        )

        # Hop-0: direct SOL transfers from wallet after sell
        destinations: dict[str, int] = {}
        for tx in post_sell_txs:
            if not tx or isinstance(tx, Exception):
                continue
            for dest, lamps in _extract_sol_outflows(tx, wallet, _MIN_POSTSELL_LAMPORTS).items():
                destinations[dest] = destinations.get(dest, 0) + lamps

        fund_dests: list[FundDestination] = []
        for dest, lamps in sorted(destinations.items(), key=lambda x: -x[1])[:10]:
            linked = dest in deployer_linked
            fund_dests.append(FundDestination(
                destination=dest,
                lamports=lamps,
                hop=0,
                link_to_deployer=linked,
            ))
            if linked:
                if dest == deployer:
                    post.direct_transfer_to_deployer = True
                else:
                    post.transfer_to_deployer_linked_wallet = True

        # Hop-1 trace for non-direct destinations
        if _MAX_POSTSELL_HOPS >= 2:
            non_direct = [fd for fd in fund_dests if not fd.link_to_deployer][:5]
            if non_direct:
                hop1_tasks = [
                    _trace_hop1(rpc, fd.destination, deployer_linked, launch_ts)
                    for fd in non_direct
                ]
                for hop1_list in await asyncio.gather(*hop1_tasks, return_exceptions=True):
                    if isinstance(hop1_list, Exception):
                        continue
                    for fd1 in hop1_list:
                        fund_dests.append(fd1)
                        if fd1.link_to_deployer:
                            post.indirect_via_intermediary = True

        post.fund_destinations = fund_dests

    except Exception as exc:
        logger.debug("[bundle] post-sell analysis failed for %s: %s", wallet[:8], exc)

    return post


def _is_full_sell(tx: dict, wallet: str, target_mint: str = "") -> bool:
    """Return True if *wallet* fully exits the *target_mint* position in this tx.

    When *target_mint* is provided (recommended), only that mint is checked.
    When empty, falls back to checking ALL token positions (legacy behavior).

    For PumpFun tokens the ``owner`` field is often missing from token balances
    (the bonding curve is the owner).  In that case we fall back to checking
    all entries that match the target mint regardless of owner.
    """
    try:
        meta      = tx.get("meta") or {}
        pre_toks  = meta.get("preTokenBalances",  [])
        post_toks = meta.get("postTokenBalances", [])

        # Build pre-balances for this wallet (optionally filtered to target_mint)
        wallet_pre: dict[str, float] = {}
        for tb in pre_toks:
            mint = tb.get("mint", "")
            if not mint:
                continue
            if target_mint and mint != target_mint:
                continue
            owner = tb.get("owner") or ""
            # Accept if owner matches OR owner is missing (PumpFun edge case)
            if owner and owner != wallet:
                continue
            amount = float((tb.get("uiTokenAmount") or {}).get("uiAmount") or 0)
            if amount > 0:
                wallet_pre[mint] = amount

        if not wallet_pre:
            return False

        wallet_post: dict[str, float] = {}
        for tb in post_toks:
            mint = tb.get("mint", "")
            if not mint:
                continue
            if target_mint and mint != target_mint:
                continue
            owner = tb.get("owner") or ""
            if owner and owner != wallet:
                continue
            amount = float((tb.get("uiTokenAmount") or {}).get("uiAmount") or 0)
            wallet_post[mint] = amount

        return all(wallet_post.get(m, 0.0) <= 1.0 for m in wallet_pre)
    except Exception:
        return False


def _compute_sol_received(tx: dict, wallet: str) -> float:
    """Return SOL gained by *wallet* in this transaction."""
    try:
        raw_keys = tx.get("transaction", {}).get("message", {}).get("accountKeys", [])
        keys     = [(k.get("pubkey", "") if isinstance(k, dict) else str(k)) for k in raw_keys]
        pre      = tx.get("meta", {}).get("preBalances",  [])
        post     = tx.get("meta", {}).get("postBalances", [])
        if wallet not in keys:
            return 0.0
        i = keys.index(wallet)
        if i >= len(post):
            return 0.0
        return max((post[i] - pre[i]) / _SOL_DECIMALS, 0.0)
    except Exception:
        return 0.0


def _extract_sol_outflows(
    tx: dict,
    sender: str,
    min_lamports: int = 0,
) -> dict[str, int]:
    """Return {destination: lamports} for SOL sent FROM *sender* in this tx."""
    result: dict[str, int] = {}
    try:
        raw_keys = tx.get("transaction", {}).get("message", {}).get("accountKeys", [])
        keys     = [(k.get("pubkey", "") if isinstance(k, dict) else str(k)) for k in raw_keys]
        pre      = tx.get("meta", {}).get("preBalances",  [])
        post     = tx.get("meta", {}).get("postBalances", [])

        if sender not in keys:
            return result
        s_idx = keys.index(sender)
        if s_idx >= len(pre) or (pre[s_idx] - post[s_idx]) <= 0:
            return result

        for i, k in enumerate(keys):
            if k == sender or k in _SKIP_PROGRAMS or i >= len(post):
                continue
            gained = post[i] - pre[i]
            if gained >= min_lamports:
                result[k] = gained
    except Exception:
        pass
    return result


async def _trace_hop1(
    rpc: SolanaRpcClient,
    wallet: str,
    deployer_linked: set[str],
    since_ts: float,
) -> list[FundDestination]:
    """Trace hop-1 outflows from a wallet (intermediate hop)."""
    out: list[FundDestination] = []
    try:
        sigs = await rpc._call(
            "getSignaturesForAddress",
            [wallet, {"limit": 30, "commitment": "finalized"}],
            circuit_protect=False,
        )
        if not sigs or not isinstance(sigs, list):
            return out
        recent = [s for s in sigs if s.get("blockTime", 0) >= since_ts and not s.get("err")]
        if not recent:
            return out
        txs = await asyncio.gather(
            *[_fetch_tx(rpc, s["signature"]) for s in recent[:10]],
            return_exceptions=True,
        )
        for tx in txs:
            if not tx or isinstance(tx, Exception):
                continue
            for dest, lamps in _extract_sol_outflows(tx, wallet, _MIN_POSTSELL_LAMPORTS).items():
                out.append(FundDestination(
                    destination=dest,
                    lamports=lamps,
                    hop=1,
                    link_to_deployer=(dest in deployer_linked),
                ))
    except Exception as exc:
        logger.debug("[bundle] hop1 trace failed for %s: %s", wallet[:8], exc)
    return out


# ─────────────────────────────────────────────────────────────────────────────
# Phase 4 helpers — Cross-wallet coordination
# ─────────────────────────────────────────────────────────────────────────────

def _detect_common_prefund_source(
    pre_sell_results: list[PreSellBehavior],
) -> Optional[str]:
    """Return an address that funded ≥2 bundle wallets, or None."""
    counter: Counter[str] = Counter(
        pre.prefund_source
        for pre in pre_sell_results
        if pre.prefund_source
    )
    most_common = counter.most_common(1)
    if most_common and most_common[0][1] >= 2:
        return most_common[0][0]
    return None


def _detect_coordinated_sell(post_sell_results: list[PostSellBehavior]) -> bool:
    """Return True if ≥2 wallets sold within _COORDINATED_SELL_SLOT_WINDOW of each other."""
    sell_slots = sorted(
        ps.sell_slot
        for ps in post_sell_results
        if ps.sell_detected and ps.sell_slot is not None
    )
    if len(sell_slots) < 2:
        return False
    for i in range(len(sell_slots) - 1):
        if sell_slots[i + 1] - sell_slots[i] <= _COORDINATED_SELL_SLOT_WINDOW:
            return True
    return False


def _coordinated_sell_slots(post_sell_results: list[PostSellBehavior]) -> set[int]:
    """Return sell_slots that are within _COORDINATED_SELL_SLOT_WINDOW of another sell."""
    sell_slots = sorted(
        ps.sell_slot
        for ps in post_sell_results
        if ps.sell_detected and ps.sell_slot is not None
    )
    coordinated: set[int] = set()
    for i, s in enumerate(sell_slots):
        for j, t in enumerate(sell_slots):
            if i != j and abs(s - t) <= _COORDINATED_SELL_SLOT_WINDOW:
                coordinated.add(s)
                break
    return coordinated


def _detect_common_sinks(post_sell_results: list[PostSellBehavior]) -> set[str]:
    """Return destination addresses receiving funds from ≥_COMMON_SINK_MIN_COUNT bundle wallets."""
    sink_counter: Counter[str] = Counter()
    for ps in post_sell_results:
        seen: set[str] = set()
        for fd in ps.fund_destinations:
            if fd.destination not in seen:
                sink_counter[fd.destination] += 1
                seen.add(fd.destination)
    return {
        addr for addr, count in sink_counter.items()
        if count >= _COMMON_SINK_MIN_COUNT and addr not in _SKIP_PROGRAMS
    }


# ─────────────────────────────────────────────────────────────────────────────
# Phase 5 helpers — Verdict computation
# ─────────────────────────────────────────────────────────────────────────────

def _compute_wallet_verdict(
    pre: PreSellBehavior,
    post: PostSellBehavior,
    *,
    is_coordinated_sell_participant: bool = False,
    num_bundle_wallets: int = 0,
) -> tuple[list[str], BundleWalletVerdict]:
    """Score-based per-wallet verdict. Returns (red_flags, verdict)."""
    flags: list[str] = []

    # ── Hard evidence → CONFIRMED_TEAM ───────────────────────────────────
    if post.direct_transfer_to_deployer:
        flags.append("DIRECT_TRANSFER_TO_DEPLOYER")
        return flags, BundleWalletVerdict.CONFIRMED_TEAM

    if pre.prefund_source_is_deployer and post.transfer_to_deployer_linked_wallet:
        flags.append("DEPLOYER_FUNDED_AND_RETURNED_TO_DEPLOYER_LINKED")
        return flags, BundleWalletVerdict.CONFIRMED_TEAM

    # ── Soft signals ─────────────────────────────────────────────────────
    if pre.prefund_source_is_deployer:
        flags.append("PREFUNDED_BY_DEPLOYER")
    if post.transfer_to_deployer_linked_wallet:
        flags.append("TRANSFERRED_TO_DEPLOYER_LINKED_WALLET")
    if post.indirect_via_intermediary:
        flags.append("INDIRECT_LINK_TO_DEPLOYER")
    if pre.prefund_source_is_known_funder:
        flags.append("FUNDED_BY_COMMON_BUNDLE_FUNDER")
    if pre.is_dormant:
        flags.append("DORMANT_BEFORE_LAUNCH")
    if post.common_destination_with_other_bundles:
        flags.append("COMMON_SINK_WITH_OTHER_BUNDLE_WALLETS")
    if pre.same_deployer_prior_launches > 0:
        flags.append(f"REPEAT_BUNDLER_SAME_DEPLOYER ({pre.same_deployer_prior_launches}x)")
    if pre.prior_bundle_count > 2:
        flags.append(f"PROFESSIONAL_BUNDLER ({pre.prior_bundle_count} bundles)")

    # ── Bundle-specific signals ──────────────────────────────────────────
    # A wallet that *sold* from a multi-wallet bundle is inherently suspect.
    if post.sell_detected and num_bundle_wallets >= 3:
        flags.append("BUNDLE_SELL_DETECTED")
    if is_coordinated_sell_participant:
        flags.append("COORDINATED_SELL_TIMING")

    # ── SUSPECTED_TEAM ────────────────────────────────────────────────────
    if post.transfer_to_deployer_linked_wallet:
        return flags, BundleWalletVerdict.SUSPECTED_TEAM
    if post.indirect_via_intermediary and len(flags) >= 2:
        return flags, BundleWalletVerdict.SUSPECTED_TEAM
    if pre.prefund_source_is_deployer and len(flags) >= 2:
        return flags, BundleWalletVerdict.SUSPECTED_TEAM

    # ── COORDINATED_DUMP ─────────────────────────────────────────────────
    # Sold from bundle AND timed with other sellers → definitive coordination.
    if "BUNDLE_SELL_DETECTED" in flags and "COORDINATED_SELL_TIMING" in flags:
        return flags, BundleWalletVerdict.COORDINATED_DUMP
    if len(flags) >= 3:
        return flags, BundleWalletVerdict.COORDINATED_DUMP
    if pre.prefund_source_is_known_funder and post.common_destination_with_other_bundles:
        return flags, BundleWalletVerdict.COORDINATED_DUMP
    if pre.is_dormant and post.common_destination_with_other_bundles:
        return flags, BundleWalletVerdict.COORDINATED_DUMP

    return flags, BundleWalletVerdict.EARLY_BUYER


def _compute_overall_verdict(
    analyses: list[BundleWalletAnalysis],
    confirmed: list[str],
    suspected: list[str],
    dumps: list[str],
    common_sinks: set[str],
    coordinated_sell: bool,
) -> tuple[str, list[str]]:
    """Global extraction verdict and evidence chain."""
    evidence: list[str] = []

    if confirmed:
        evidence.append(f"{len(confirmed)} wallet(s) with direct on-chain deployer link")
    if suspected:
        evidence.append(f"{len(suspected)} wallet(s) with indirect deployer link")
    if common_sinks:
        evidence.append(f"{len(common_sinks)} common sink wallet(s) across bundle")
    if coordinated_sell:
        evidence.append("Coordinated sell within 5-slot window detected")

    sold_count = sum(1 for a in analyses if a.post_sell.sell_detected)
    if sold_count:
        evidence.append(f"{sold_count}/{len(analyses)} wallets fully exited position")

    # Thresholds
    if len(confirmed) >= 2 or (len(confirmed) >= 1 and len(suspected) >= 1):
        return "confirmed_team_extraction", evidence
    if len(suspected) >= 2 or len(confirmed) >= 1:
        return "suspected_team_extraction", evidence
    if len(dumps) >= 3 and common_sinks:
        return "suspected_team_extraction", evidence
    if len(dumps) >= 3 or (len(dumps) >= 2 and coordinated_sell):
        return "coordinated_dump_unknown_team", evidence

    # ── Bulk-exit heuristic (no per-wallet COORDINATED_DUMP needed) ──────
    # When post-sell fund-tracing finds no outflows (typical for PumpFun
    # wallets that haven't moved SOL yet), per-wallet verdicts stay at
    # EARLY_BUYER.  However, a large bundle where multiple wallets fully
    # sold is a coordinated dump regardless of fund destination evidence.
    total = len(analyses)
    if total >= 3 and sold_count >= 2:
        return "coordinated_dump_unknown_team", evidence
    if coordinated_sell and sold_count >= 2:
        return "coordinated_dump_unknown_team", evidence

    return "early_buyers_no_link_proven", evidence


# ─────────────────────────────────────────────────────────────────────────────
# Low-level helpers
# ─────────────────────────────────────────────────────────────────────────────

async def _fetch_tx(rpc: SolanaRpcClient, sig: str) -> Optional[dict]:
    return await rpc._call(
        "getTransaction",
        [sig, {"encoding": "jsonParsed", "maxSupportedTransactionVersion": 0}],
        circuit_protect=False,
    )


def _extract_buyers(
    tx: dict,
    deployer: str,
    buyer_wallets: dict[str, float],
) -> None:
    """Parse a transaction and add non-deployer signers who spent SOL."""
    try:
        msg       = tx.get("transaction", {}).get("message", {})
        acct_keys = msg.get("accountKeys", [])
        pre_bals  = tx.get("meta", {}).get("preBalances",  [])
        post_bals = tx.get("meta", {}).get("postBalances", [])

        for i, key in enumerate(acct_keys):
            addr      = key.get("pubkey", "") if isinstance(key, dict) else str(key)
            is_signer = key.get("signer", False) if isinstance(key, dict) else (i == 0)
            if not addr or not is_signer:
                continue
            if addr == deployer or addr in _SKIP_PROGRAMS:
                continue
            if i >= len(pre_bals) or i >= len(post_bals):
                continue
            sol_delta = (post_bals[i] - pre_bals[i]) / _SOL_DECIMALS
            if sol_delta < -0.001:
                buyer_wallets[addr] = buyer_wallets.get(addr, 0.0) + abs(sol_delta)
    except Exception as exc:
        logger.debug("[bundle] _extract_buyers failed: %s", exc)

