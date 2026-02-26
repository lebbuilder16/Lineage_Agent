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
from .models import SolFlowEdge, SolFlowReport
from .wallet_labels import classify_address

logger = logging.getLogger(__name__)

# Wrapped SOL mint for Jupiter price lookup
_WSOL_MINT = "So11111111111111111111111111111111111111112"

# ── Skip lists ────────────────────────────────────────────────────────────────
# Infrastructure, DEX programs, system accounts — not useful in a follow-the-money graph
_SKIP_ADDRESSES: frozenset[str] = frozenset({
    "11111111111111111111111111111111",                    # System Program
    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",      # Token Program
    "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe8bv",      # ATA Program
    "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",      # Metaplex
    "TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM",      # PumpFun authority
    "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBymtzbm",    # PumpFun program
    "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",    # Jito tip account
    "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1",    # Raydium authority
    "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",    # Raydium AMM V4
    "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",    # Jupiter v6
    "srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX",     # Serum DEX
    "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc",     # Orca Whirlpool
    "So11111111111111111111111111111111111111112",        # Wrapped SOL mint
    "Vote111111111111111111111111111111111111111",        # Vote Program
    "Stake11111111111111111111111111111111111111",        # Stake Program
    "SysvarC1ock11111111111111111111111111111111",        # Sysvar Clock
    "SysvarRent111111111111111111111111111111111",        # Sysvar Rent
    "ComputeBudget111111111111111111111111111111",        # Compute Budget
    "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",     # Memo Program
})

# Known CEX hot wallets — reaching these means funds may be cashed out
_CEX_ADDRESSES: frozenset[str] = frozenset({
    "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi",    # Binance hot
    "AC5RDfQFmDS1deWZos921JfqscXdByf8BKHs5ACWjtW2",   # Coinbase
    "H8sMJSCQxfKiFTCfDR3DUMLPwcRbM61LGFJ8N4dK3WjS",  # OKX
    "2AQdpHJ2JpcEgPiATUXjQxA8QmafFegfQwSLWSprPicm",   # Bybit
    "BmFdpraQhkiDQE6SnfG5omcA1VwzqfXrwtNYBwWTymy6",  # Kraken
})

_MIN_TRANSFER_LAMPORTS = 100_000_000   # 0.1 SOL minimum
_MAX_HOPS = int(os.getenv("SOL_TRACE_MAX_HOPS", "3"))
_MAX_TXN_PER_WALLET = 50
_TRACE_TIMEOUT = 20.0
_HOP_SEM_CONCURRENCY = 3


# ── Public API ────────────────────────────────────────────────────────────────

async def trace_sol_flow(
    mint: str,
    deployer: str,
    *,
    max_hops: int = _MAX_HOPS,
    max_txn_per_wallet: int = _MAX_TXN_PER_WALLET,
) -> Optional[SolFlowReport]:
    """Trace SOL flows from a deployer wallet after a rug (BFS, max 3 hops).

    Results are persisted to the sol_flows table so subsequent calls read
    from DB instead of re-running RPC scans.

    Args:
        mint:               Rugged token's mint address (for DB grouping).
        deployer:           Initial wallet to start tracing from.
        max_hops:           BFS depth (default 3).
        max_txn_per_wallet: Transaction limit per wallet per hop (default 50).

    Returns:
        SolFlowReport if any flows found, else None.
    """
    try:
        return await asyncio.wait_for(
            _run_trace(mint, deployer, max_hops=max_hops, max_txn_per_wallet=max_txn_per_wallet),
            timeout=_TRACE_TIMEOUT,
        )
    except asyncio.TimeoutError:
        logger.warning("trace_sol_flow timed out — mint=%s deployer=%s", mint, deployer)
        return None
    except Exception:
        logger.exception("trace_sol_flow failed for mint=%s", mint)
        return None


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
) -> Optional[SolFlowReport]:
    rpc = get_rpc_client()
    sem = asyncio.Semaphore(_HOP_SEM_CONCURRENCY)
    all_flows: list[dict] = []
    frontier: set[str] = {deployer}
    visited: set[str] = {deployer}

    for hop in range(max_hops):
        if not frontier:
            break

        tasks = [
            _trace_wallet(rpc, sem, wallet, mint, hop, max_txn_per_wallet)
            for wallet in frontier
        ]
        hop_results = await asyncio.gather(*tasks, return_exceptions=True)

        new_frontier: set[str] = set()
        hop_flows: list[dict] = []
        for result in hop_results:
            if isinstance(result, Exception):
                continue
            for flow in result:
                hop_flows.append(flow)
                to_addr = flow["to_address"]
                if to_addr not in visited and to_addr not in _SKIP_ADDRESSES:
                    new_frontier.add(to_addr)

        all_flows.extend(hop_flows)

        # Persist hop flows incrementally
        if hop_flows:
            await sol_flow_insert_batch(hop_flows)

        visited.update(new_frontier)
        frontier = new_frontier

    if not all_flows:
        return None

    # Detect cross-chain exits (best-effort — never raises)
    try:
        exits = await detect_bridge_exits(all_flows)
    except Exception:
        exits = []

    # Fetch current SOL price for USD conversion (best-effort)
    sol_price: Optional[float] = None
    try:
        jup = get_jup_client()
        sol_price = await jup.get_price(_WSOL_MINT)
    except Exception:
        logger.debug("SOL price fetch failed — USD value will be None")

    return _flows_to_report(mint, deployer, all_flows, cross_chain_exits=exits, sol_price_usd=sol_price)


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
    """Extract SOL transfer flows from a jsonParsed transaction dict."""
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

        pre_balances: list[int] = meta.get("preBalances") or []
        post_balances: list[int] = meta.get("postBalances") or []
        block_time = tx.get("blockTime")
        slot = tx.get("slot")

        if not account_keys or len(pre_balances) != len(account_keys):
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


# ── Report construction ───────────────────────────────────────────────────────

def _flows_to_report(
    mint: str,
    deployer: str,
    flows: list[dict],
    cross_chain_exits: Optional[list[CrossChainExit]] = None,
    sol_price_usd: Optional[float] = None,
) -> SolFlowReport:
    """Convert raw flow dicts to a SolFlowReport model."""
    edges: list[SolFlowEdge] = []
    for f in flows:
        bt = f.get("block_time")
        block_dt = datetime.fromtimestamp(bt, tz=timezone.utc) if bt else None

        from_info = classify_address(f["from_address"])
        to_info   = classify_address(f["to_address"])

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

    known_cex = any(e.to_address in _CEX_ADDRESSES for e in edges)
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
