"""
Follow The SOL — on-chain capital flow tracer.

After a rug is confirmed, traces where the deployer's SOL went by parsing
on-chain transactions. Uses BFS across up to 3 hops (configurable), reading
preBalances/postBalances from getTransaction with jsonParsed encoding.

Results are persisted to the sol_flows table and retrieved on subsequent
lineage page loads — no extra RPC calls after the first trace.
"""

from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timezone
from typing import Optional

from .data_sources._clients import (
    get_jup_client,
    get_rpc_client,
    sol_flow_insert_batch,
    sol_flows_query,
)
from .bridge_tracker import CrossChainExit, detect_bridge_exits
from .constants import MIN_TRANSFER_LAMPORTS, SKIP_PROGRAMS
from .models import SolFlowEdge, SolFlowReport
from .wallet_labels import classify_address, enrich_wallet_labels

logger = logging.getLogger(__name__)

# Wrapped SOL mint for Jupiter price lookup
_WSOL_MINT = "So11111111111111111111111111111111111111112"

# ── Skip lists ────────────────────────────────────────────────────────────────
# Infrastructure, DEX programs, system accounts — not useful in a follow-the-money graph.
# Now imported from constants.py (SKIP_PROGRAMS) as the single source of truth.
_SKIP_ADDRESSES = SKIP_PROGRAMS

_MIN_TRANSFER_LAMPORTS = MIN_TRANSFER_LAMPORTS
_MAX_HOPS = int(os.getenv("SOL_TRACE_MAX_HOPS", "3"))
_MAX_TXN_PER_WALLET = 50
_MAX_TXN_HOP1_PLUS = 20          # Fewer txs per wallet for hops > 0
_MAX_FRONTIER_PER_HOP = 8        # Cap BFS frontier to avoid explosion
_TRACE_TIMEOUT = 45.0
_HOP_SEM_CONCURRENCY = 5


# ── Public API ────────────────────────────────────────────────────────────────

async def trace_sol_flow(
    mint: str,
    deployer: str,
    *,
    max_hops: int = _MAX_HOPS,
    max_txn_per_wallet: int = _MAX_TXN_PER_WALLET,
    extra_seed_wallets: Optional[list[str]] = None,
) -> Optional[SolFlowReport]:
    """Trace SOL flows from a deployer wallet after a rug (BFS, max 3 hops).

    Results are persisted to the sol_flows table so subsequent calls read
    from DB instead of re-running RPC scans.  On timeout, returns whatever
    partial results were collected (flows are persisted per-hop anyway).

    Args:
        mint:                Rugged token's mint address (for DB grouping).
        deployer:            Initial wallet to start tracing from.
        max_hops:            BFS depth (default 3).
        max_txn_per_wallet:  Transaction limit per wallet per hop (default 50).
        extra_seed_wallets:  Additional wallets to start tracing from at hop=0.
                             Used for PumpFun / Jito bundle patterns where the
                             actual SOL extraction happens via bundle wallets
                             rather than directly through the deployer.

    Returns:
        SolFlowReport if any flows found, else None.
    """
    # Shared accumulator — _run_trace appends flows here so we can return
    # partial results on timeout (flows are already persisted per-hop).
    collected_flows: list[dict] = []
    try:
        return await asyncio.wait_for(
            _run_trace(
                mint, deployer,
                max_hops=max_hops,
                max_txn_per_wallet=max_txn_per_wallet,
                extra_seed_wallets=extra_seed_wallets or [],
                _collected=collected_flows,
            ),
            timeout=_TRACE_TIMEOUT,
        )
    except asyncio.TimeoutError:
        logger.warning(
            "trace_sol_flow timed out — mint=%s deployer=%s partial_flows=%d",
            mint, deployer, len(collected_flows),
        )
        # Return partial results instead of None
        if collected_flows:
            try:
                exits = await detect_bridge_exits(collected_flows)
            except Exception:
                exits = []
            sol_price: Optional[float] = None
            try:
                jup = get_jup_client()
                sol_price = await jup.get_price(_WSOL_MINT)
            except Exception:
                pass
            rpc = get_rpc_client()
            dyn = await _enrich_partial(collected_flows, rpc)
            return _flows_to_report(
                mint, deployer, collected_flows,
                cross_chain_exits=exits, sol_price_usd=sol_price,
                dynamic_labels=dyn,
            )
        return None
    except Exception:
        logger.exception("trace_sol_flow failed for mint=%s", mint)
        if collected_flows:
            return _flows_to_report(mint, deployer, collected_flows)
        return None


async def _enrich_partial(flows: list[dict], rpc) -> dict:
    """Best-effort dynamic enrichment for partial (timeout) flows."""
    try:
        all_dest = list({f["to_address"] for f in flows})
        return await enrich_wallet_labels(all_dest, rpc)
    except Exception:
        return {}


async def get_sol_flow_report(mint: str) -> Optional[SolFlowReport]:
    """Return a pre-computed SolFlowReport from DB if available."""
    try:
        rows = await sol_flows_query(mint)
        if not rows:
            return None
        return _rows_to_report(mint, rows)
    except Exception:
        logger.exception("get_sol_flow_report failed for %s", mint)
        return None


# ── Internal: BFS trace ───────────────────────────────────────────────────────

async def _run_trace(
    mint: str,
    deployer: str,
    *,
    max_hops: int,
    max_txn_per_wallet: int,
    extra_seed_wallets: list[str],
    _collected: list[dict],
) -> Optional[SolFlowReport]:
    rpc = get_rpc_client()
    sem = asyncio.Semaphore(_HOP_SEM_CONCURRENCY)
    # Include bundle wallets (or any extra seeds) as additional hop-0 starting
    # points.  On PumpFun / Jito patterns the actual SOL extraction is done by
    # bundle wallets, not the deployer — so tracing only the deployer misses
    # the bulk of the capital flow.
    seed_set = {deployer} | {w for w in extra_seed_wallets if w and w != deployer}
    frontier: set[str] = set(seed_set)
    visited: set[str] = set(seed_set)
    logger.info(
        "[sol-trace] _run_trace start: mint=%s deployer=%s seeds=%d frontier=%s",
        mint[:8], deployer[:8], len(seed_set), [s[:8] for s in seed_set],
    )

    for hop in range(max_hops):
        if not frontier:
            break

        # For hops > 0, use fewer txns per wallet to stay within timeout
        txn_limit = max_txn_per_wallet if hop == 0 else min(max_txn_per_wallet, _MAX_TXN_HOP1_PLUS)

        tasks = [
            _trace_wallet(rpc, sem, wallet, mint, hop, txn_limit)
            for wallet in frontier
        ]
        hop_results = await asyncio.gather(*tasks, return_exceptions=True)

        new_frontier: set[str] = set()
        hop_flows: list[dict] = []
        # Track flow amounts per destination for frontier prioritisation
        dest_amounts: dict[str, int] = {}
        for result in hop_results:
            if isinstance(result, Exception):
                logger.debug("[sol-trace] hop %d exception: %s", hop, result)
                continue
            for flow in result:
                hop_flows.append(flow)
                to_addr = flow["to_address"]
                if to_addr not in visited and to_addr not in _SKIP_ADDRESSES:
                    new_frontier.add(to_addr)
                    dest_amounts[to_addr] = dest_amounts.get(to_addr, 0) + flow.get("amount_lamports", 0)

        logger.info(
            "[sol-trace] hop %d: %d wallets traced, %d flows found, %d new frontier",
            hop, len(frontier), len(hop_flows), len(new_frontier),
        )
        _collected.extend(hop_flows)

        # Persist hop flows incrementally
        if hop_flows:
            await sol_flow_insert_batch(hop_flows)

        # Cap frontier to top N destinations by amount to prevent explosion
        if len(new_frontier) > _MAX_FRONTIER_PER_HOP:
            sorted_dests = sorted(new_frontier, key=lambda a: dest_amounts.get(a, 0), reverse=True)
            new_frontier = set(sorted_dests[:_MAX_FRONTIER_PER_HOP])
            logger.info(
                "[sol-trace] hop %d frontier capped %d -> %d (top by amount)",
                hop, len(dest_amounts), _MAX_FRONTIER_PER_HOP,
            )

        visited.update(new_frontier)
        frontier = new_frontier

    if not _collected:
        return None

    # Detect cross-chain exits (best-effort — never raises)
    try:
        exits = await detect_bridge_exits(_collected)
    except Exception:
        exits = []

    # Fetch current SOL price for USD conversion (best-effort)
    sol_price: Optional[float] = None
    try:
        jup = get_jup_client()
        sol_price = await jup.get_price(_WSOL_MINT)
    except Exception:
        logger.debug("SOL price fetch failed — USD value will be None")

    # Dynamic enrichment: label unknown terminal wallets via getMultipleAccounts
    all_dest = list({f["to_address"] for f in _collected})
    try:
        dynamic_labels = await enrich_wallet_labels(all_dest, rpc)
        enriched_count = len(dynamic_labels)
        if enriched_count:
            logger.info("[sol-trace] dynamic enrichment: %d new labels", enriched_count)
    except Exception:
        dynamic_labels = {}

    return _flows_to_report(
        mint, deployer, _collected,
        cross_chain_exits=exits,
        sol_price_usd=sol_price,
        dynamic_labels=dynamic_labels,
    )


async def _trace_wallet(
    rpc,
    sem: asyncio.Semaphore,
    wallet: str,
    mint: str,
    hop: int,
    max_txn: int,
) -> list[dict]:
    """Fetch recent transaction signatures for a wallet and parse SOL flows."""
    async with sem:
        flows: list[dict] = []
        try:
            sigs_raw = await rpc._call(
                "getSignaturesForAddress",
                [wallet, {"limit": max_txn, "commitment": "finalized"}],
            )
            if not sigs_raw or not isinstance(sigs_raw, list):
                return []

            for sig_info in sigs_raw[:max_txn]:
                sig = sig_info.get("signature")
                if not sig:
                    continue

                tx_raw = await rpc._call(
                    "getTransaction",
                    [sig, {"encoding": "jsonParsed", "maxSupportedTransactionVersion": 0}],
                )
                if not tx_raw or not isinstance(tx_raw, dict):
                    continue

                parsed = _parse_sol_flows(tx_raw, wallet, mint, hop, sig)
                flows.extend(parsed)

        except Exception as exc:
            logger.debug("_trace_wallet failed for %s hop=%d: %s", wallet, hop, exc)
        return flows


def _parse_sol_flows(
    tx: dict,
    source_wallet: str,
    mint: str,
    hop: int,
    signature: str,
) -> list[dict]:
    """Extract SOL transfer flows from a jsonParsed transaction dict.

    Primary: parse ``meta.innerInstructions`` for system-program transfer
    instructions to capture individual SOL movements precisely.
    Fallback: use ``preBalances/postBalances`` delta when inner instructions
    are unavailable or empty.
    """
    flows: list[dict] = []
    try:
        meta = tx.get("meta") or {}
        transaction = tx.get("transaction") or {}
        message = transaction.get("message") or {}
        account_keys_raw = message.get("accountKeys") or []

        # accountKeys can be list[str] (legacy) or list[{pubkey, ...}] (jsonParsed)
        account_keys: list[str] = []
        for k in account_keys_raw:
            if isinstance(k, str):
                account_keys.append(k)
            elif isinstance(k, dict):
                account_keys.append(k.get("pubkey", ""))

        block_time = tx.get("blockTime")
        slot = tx.get("slot")

        if not account_keys:
            return []

        # ── Primary: innerInstructions-based parsing ──────────────────
        # Parse system-program transfer instructions for precise SOL flows.
        # This solves the balance-delta Problem 1 from AUDIT_REPORT:
        # a wallet that receives 10 SOL and sends 3 SOL in the same tx
        # now shows BOTH movements instead of just the +7 SOL net delta.
        inner_flows = _parse_inner_instructions(
            meta, source_wallet, mint, hop, signature, block_time, slot,
        )
        if inner_flows:
            return inner_flows

        # ── Fallback: balance-delta attribution (pre/post balances) ──
        pre_balances: list[int] = meta.get("preBalances") or []
        post_balances: list[int] = meta.get("postBalances") or []

        if len(pre_balances) != len(account_keys):
            return []

        try:
            src_idx = account_keys.index(source_wallet)
        except ValueError:
            return []

        if src_idx >= len(pre_balances) or src_idx >= len(post_balances):
            return []

        # Source must have net-lost SOL (sent something)
        src_delta = post_balances[src_idx] - pre_balances[src_idx]
        if src_delta >= 0:
            return []

        for i, (pre, post) in enumerate(zip(pre_balances, post_balances)):
            delta = post - pre
            if delta >= _MIN_TRANSFER_LAMPORTS and i != src_idx:
                to_addr = account_keys[i] if i < len(account_keys) else ""
                if to_addr and to_addr not in _SKIP_ADDRESSES:
                    flows.append({
                        "mint": mint,
                        "from_address": source_wallet,
                        "to_address": to_addr,
                        "amount_lamports": delta,
                        "signature": signature,
                        "slot": slot,
                        "block_time": block_time,
                        "hop": hop,
                    })
    except Exception as exc:
        logger.debug("_parse_sol_flows error: %s", exc)
    return flows


def _parse_inner_instructions(
    meta: dict,
    source_wallet: str,
    mint: str,
    hop: int,
    signature: str,
    block_time: object,
    slot: object,
) -> list[dict]:
    """Extract SOL transfers from meta.innerInstructions.

    Looks for system-program transfer instructions (``programId ==
    11111111...``) in the jsonParsed inner instructions. Returns a
    list of flow dicts where ``from_address`` matches *source_wallet*.

    Returns an empty list when no system-program transfers are found
    (caller should fall back to balance-delta).
    """
    inner_instructions = meta.get("innerInstructions") or []
    if not inner_instructions:
        return []

    flows: list[dict] = []
    system_program = "11111111111111111111111111111111"

    for group in inner_instructions:
        instructions = group.get("instructions") or []
        for ix in instructions:
            # Only system-program transfers
            program_id = ix.get("programId") or ix.get("program", "")
            if program_id != system_program:
                continue

            parsed = ix.get("parsed")
            if not isinstance(parsed, dict):
                continue

            if parsed.get("type") != "transfer":
                continue

            info = parsed.get("info") or {}
            src = info.get("source", "")
            dst = info.get("destination", "")
            lamports = info.get("lamports", 0)

            # Only outflows from the source wallet we're tracking
            if src != source_wallet:
                continue

            if lamports < _MIN_TRANSFER_LAMPORTS:
                continue

            if dst and dst not in _SKIP_ADDRESSES:
                flows.append({
                    "mint": mint,
                    "from_address": source_wallet,
                    "to_address": dst,
                    "amount_lamports": lamports,
                    "signature": signature,
                    "slot": slot,
                    "block_time": block_time,
                    "hop": hop,
                })

    return flows


# ── Report construction ───────────────────────────────────────────────────────

def _flows_to_report(
    mint: str,
    deployer: str,
    flows: list[dict],
    cross_chain_exits: Optional[list[CrossChainExit]] = None,
    sol_price_usd: Optional[float] = None,
    dynamic_labels: Optional[dict] = None,
) -> SolFlowReport:
    """Convert raw flow dicts to a SolFlowReport model."""
    _dyn = dynamic_labels or {}
    edges: list[SolFlowEdge] = []
    for f in flows:
        bt = f.get("block_time")
        block_dt = datetime.fromtimestamp(bt, tz=timezone.utc) if bt else None

        from_info = _dyn.get(f["from_address"]) or classify_address(f["from_address"])
        to_info   = _dyn.get(f["to_address"])   or classify_address(f["to_address"])

        edges.append(SolFlowEdge(
            from_address=f["from_address"],
            to_address=f["to_address"],
            amount_sol=round(f.get("amount_lamports", 0) / 1_000_000_000.0, 6),
            hop=f.get("hop", 0),
            signature=f.get("signature", ""),
            block_time=block_dt,
            from_label=from_info.label,
            to_label=to_info.label,
            entity_type=to_info.entity_type,
        ))

    # Total extracted = direct outflows from the deployer (hop 0)
    total_sol = sum(e.amount_sol for e in edges if e.hop == 0)

    # Compute USD value if SOL price is available
    total_usd: Optional[float] = None
    if sol_price_usd and total_sol > 0:
        total_usd = round(total_sol * sol_price_usd, 2)

    # Terminal wallets = recipients that never appear as senders
    senders = {e.from_address for e in edges}
    terminal_wallets = list({e.to_address for e in edges if e.to_address not in senders})

    known_cex = any(
        classify_address(e.to_address).entity_type == "cex"
        for e in edges
    )
    max_hop = max((e.hop for e in edges), default=0)

    # Rug timestamp = earliest hop-0 extraction moment
    hop0_times = [e.block_time for e in edges if e.hop == 0 and e.block_time is not None]
    rug_ts: Optional[datetime] = min(hop0_times) if hop0_times else None

    return SolFlowReport(
        mint=mint,
        deployer=deployer,
        total_extracted_sol=round(total_sol, 4),
        total_extracted_usd=total_usd,
        flows=edges,
        terminal_wallets=terminal_wallets,
        known_cex_detected=known_cex,
        hop_count=max_hop + 1,
        analysis_timestamp=datetime.now(tz=timezone.utc),
        rug_timestamp=rug_ts,
        cross_chain_exits=cross_chain_exits or [],
    )


def _rows_to_report(mint: str, rows: list[dict]) -> SolFlowReport:
    """Reconstruct SolFlowReport from database rows."""
    # Determine deployer = hop-0 sender
    deployer = ""
    for r in rows:
        if r.get("hop", 1) == 0:
            deployer = r.get("from_address", "")
            break
    if not deployer and rows:
        deployer = rows[0].get("from_address", "")

    flows: list[dict] = [
        {
            "mint": r.get("mint", mint),
            "from_address": r.get("from_address", ""),
            "to_address": r.get("to_address", ""),
            "amount_lamports": r.get("amount_lamports", 0),
            "signature": r.get("signature", ""),
            "slot": r.get("slot"),
            "block_time": r.get("block_time"),
            "hop": r.get("hop", 0),
        }
        for r in rows
    ]
    return _flows_to_report(mint, deployer, flows)
