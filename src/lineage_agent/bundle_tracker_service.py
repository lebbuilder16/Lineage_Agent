"""
Bundle Wallet Tracker — Follow the early buyers.

On Solana, coordinated launches use Jito bundles: 3–20 wallets buy in the
SAME block as pool creation (atomic, can't be front-run by the public). These
wallets collectively accumulate 20–60% of the token supply before any retail
buyer can act, then sell into public demand.

This service:
1. Detects bundle wallets (buyers in first ``_BUNDLE_SLOT_WINDOW`` slots)
2. Checks whether the deployer pre-funded those wallets (SOL sent ≤72 h before launch)
3. Traces post-sell SOL flows to confirm extraction back to deployer
4. Computes total SOL/USD extracted on-chain

The result is persisted so subsequent scans read from cache.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from .data_sources.solana_rpc import SolanaRpcClient
from .data_sources._clients import get_rpc_client
from .models import BundleWallet, BundleReport

logger = logging.getLogger(__name__)

# ── Tuning constants ──────────────────────────────────────────────────────────
_BUNDLE_SLOT_WINDOW   = 4      # slots after pool creation counted as "bundle"
_MAX_LAUNCH_SIGS      = 50     # signatures to fetch around pool creation
_PRE_FUND_WINDOW_H    = 72     # hours before launch to look for deployer→wallet SOL
_PRE_FUND_MIN_SOL     = 0.05   # minimum SOL transfer to count as funding
_SOL_DECIMALS         = 1_000_000_000  # lamports per SOL
_MAX_BUNDLE_WALLETS   = 20     # cap to avoid DoS on very wide bundles
_TRACE_SIGS_PER_WALLET = 100   # how many post-launch sigs to scan per wallet

# Known program / system addresses we skip when identifying buyer wallets
_SKIP_PROGRAMS: frozenset[str] = frozenset({
    "11111111111111111111111111111111",
    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe8bv",
    "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",   # Raydium V4
    "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1",   # Raydium authority
    "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc",    # Orca
    "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",   # Jupiter
    "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBymtzbm",   # PumpFun
    "TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM",    # PumpFun authority
    "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo",   # Meteora DLMM
    "Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EkAW7vAo",  # Meteora pools
    "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",    # Metaplex
    "ComputeBudget111111111111111111111111111111",       # Compute budget
    "SysvarRent111111111111111111111111111111111",
    "SysvarC1ock11111111111111111111111111111111",
})


# ─────────────────────────────────────────────────────────────────────────────
# Public entry-point
# ─────────────────────────────────────────────────────────────────────────────

async def analyze_bundle(
    mint: str,
    deployer: str,
    sol_price_usd: Optional[float] = None,
) -> Optional[BundleReport]:
    """Detect bundle wallets for *mint* and return a :class:`BundleReport`.

    Returns ``None`` on RPC failure or when no bundle activity is detected.
    """
    rpc = get_rpc_client()
    try:
        return await asyncio.wait_for(
            _run(mint, deployer, sol_price_usd, rpc),
            timeout=25.0,
        )
    except asyncio.TimeoutError:
        logger.warning("[bundle] analysis timed out for %s", mint[:8])
        return None
    except Exception as exc:
        logger.warning("[bundle] analysis failed for %s: %s", mint[:8], exc)
        return None


# ─────────────────────────────────────────────────────────────────────────────
# Internal implementation
# ─────────────────────────────────────────────────────────────────────────────

async def _run(
    mint: str,
    deployer: str,
    sol_price_usd: Optional[float],
    rpc: SolanaRpcClient,
) -> Optional[BundleReport]:

    # ── Step 1: get the first N signatures for the mint ──────────────────
    sigs = await rpc._call(
        "getSignaturesForAddress",
        [mint, {"limit": _MAX_LAUNCH_SIGS, "commitment": "finalized"}],
    )
    if not sigs or not isinstance(sigs, list):
        return None

    # Oldest-first: the last item is the mint creation
    sigs = list(reversed(sigs))
    if not sigs:
        return None

    creation_slot: Optional[int] = sigs[0].get("slot")
    if creation_slot is None:
        return None
    creation_time: Optional[int] = sigs[0].get("blockTime")

    # ── Step 2: fetch txs in the bundle window (creation_slot … +window) ─
    bundle_sigs = [
        s["signature"] for s in sigs
        if s.get("slot", creation_slot + 999) <= creation_slot + _BUNDLE_SLOT_WINDOW
        and not s.get("err")
        and s.get("signature")
    ]

    if not bundle_sigs:
        return None

    # Fetch all bundle transactions in parallel
    tx_results = await asyncio.gather(
        *[_fetch_tx(rpc, sig) for sig in bundle_sigs],
        return_exceptions=True,
    )

    # ── Step 3: extract buyer wallets from bundle transactions ──────────
    # A "buyer" is a signer that is NOT the deployer, NOT a program, and
    # whose SOL balance DECREASED (they spent SOL to buy tokens).
    buyer_wallets: dict[str, float] = {}  # wallet → SOL spent

    for tx in tx_results:
        if not tx or isinstance(tx, Exception):
            continue
        _extract_buyers(tx, deployer, buyer_wallets)

    if not buyer_wallets:
        return None

    # Cap to top _MAX_BUNDLE_WALLETS by SOL spent
    top_buyers = sorted(buyer_wallets.items(), key=lambda x: x[1], reverse=True)
    top_buyers = top_buyers[:_MAX_BUNDLE_WALLETS]

    # ── Step 4: check which bundle wallets were funded by the deployer ───
    launch_dt = (
        datetime.fromtimestamp(creation_time, tz=timezone.utc)
        if creation_time else datetime.now(tz=timezone.utc)
    )
    fund_window_start = launch_dt - timedelta(hours=_PRE_FUND_WINDOW_H)

    funded_tasks = [
        _check_deployer_funded(rpc, wallet, deployer, fund_window_start)
        for wallet, _ in top_buyers
    ]
    funded_results = await asyncio.gather(*funded_tasks, return_exceptions=True)

    # ── Step 5: check current token balance (did they exit?) ─────────────
    balance_tasks = [
        rpc.get_wallet_token_balance(wallet, mint)
        for wallet, _ in top_buyers
    ]
    balance_results = await asyncio.gather(*balance_tasks, return_exceptions=True)

    # ── Step 6: estimate SOL returned to deployer per wallet ─────────────
    sol_return_tasks = [
        _estimate_sol_returned_to_deployer(rpc, wallet, deployer, launch_dt)
        for wallet, _ in top_buyers
    ]
    sol_return_results = await asyncio.gather(*sol_return_tasks, return_exceptions=True)

    # ── Step 7: assemble BundleWallet objects ───────────────────────────
    bundle_wallets: list[BundleWallet] = []
    total_sol_spent = 0.0
    total_sol_returned = 0.0
    confirmed_linked = 0

    for i, (wallet, sol_spent) in enumerate(top_buyers):
        funded_by_deployer = (
            funded_results[i]
            if not isinstance(funded_results[i], Exception)
            else False
        )
        current_balance = (
            float(balance_results[i])
            if not isinstance(balance_results[i], Exception)
            else None
        )
        sol_returned = (
            float(sol_return_results[i])
            if not isinstance(sol_return_results[i], Exception)
            else 0.0
        )
        exited = (current_balance is not None and current_balance < 1.0)

        if funded_by_deployer or sol_returned > 0.1:
            confirmed_linked += 1

        total_sol_spent += sol_spent
        total_sol_returned += (sol_returned or 0.0)

        bundle_wallets.append(BundleWallet(
            address=wallet,
            sol_spent=round(sol_spent, 4),
            funded_by_deployer=bool(funded_by_deployer),
            sol_returned_to_deployer=round(sol_returned, 4),
            exited=exited,
            current_token_balance=current_balance,
        ))

    if not bundle_wallets:
        return None

    # ── Step 8: assess verdict ───────────────────────────────────────────
    linked_ratio = confirmed_linked / len(bundle_wallets)
    if linked_ratio >= 0.5 or (confirmed_linked >= 2 and total_sol_returned > 1.0):
        verdict = "confirmed_bundle"
    elif confirmed_linked >= 1 or total_sol_spent > 5.0:
        verdict = "suspected_bundle"
    else:
        verdict = "clean"

    total_sol_extracted = total_sol_returned
    total_usd_extracted = (
        round(total_sol_extracted * sol_price_usd, 2)
        if sol_price_usd and sol_price_usd > 0
        else None
    )

    return BundleReport(
        mint=mint,
        deployer=deployer,
        bundle_wallets=bundle_wallets,
        total_sol_spent_by_bundle=round(total_sol_spent, 4),
        total_sol_returned_to_deployer=round(total_sol_extracted, 4),
        total_usd_extracted=total_usd_extracted,
        confirmed_linked_wallets=confirmed_linked,
        verdict=verdict,
        launch_slot=creation_slot,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

async def _fetch_tx(rpc: SolanaRpcClient, sig: str) -> Optional[dict]:
    return await rpc._call(
        "getTransaction",
        [sig, {"encoding": "jsonParsed", "maxSupportedTransactionVersion": 0}],
    )


def _extract_buyers(
    tx: dict,
    deployer: str,
    buyer_wallets: dict[str, float],
) -> None:
    """Parse a transaction and add non-deployer signers who spent SOL."""
    try:
        message = tx.get("transaction", {}).get("message", {})
        account_keys = message.get("accountKeys", [])
        pre_bals = tx.get("meta", {}).get("preBalances", [])
        post_bals = tx.get("meta", {}).get("postBalances", [])

        for i, key in enumerate(account_keys):
            addr = key.get("pubkey", "") if isinstance(key, dict) else str(key)
            is_signer = key.get("signer", False) if isinstance(key, dict) else (i == 0)

            if not addr or not is_signer:
                continue
            if addr == deployer or addr in _SKIP_PROGRAMS:
                continue
            if i >= len(pre_bals) or i >= len(post_bals):
                continue

            sol_delta = (post_bals[i] - pre_bals[i]) / _SOL_DECIMALS
            # Buyer: SOL balance decreased (they paid SOL to buy tokens)
            if sol_delta < -0.001:
                spent = abs(sol_delta)
                buyer_wallets[addr] = buyer_wallets.get(addr, 0.0) + spent

    except Exception as exc:
        logger.debug("[bundle] _extract_buyers failed: %s", exc)


async def _check_deployer_funded(
    rpc: SolanaRpcClient,
    wallet: str,
    deployer: str,
    fund_window_start: datetime,
) -> bool:
    """Return True if deployer sent SOL to *wallet* within the funding window."""
    try:
        sigs = await rpc._call(
            "getSignaturesForAddress",
            [wallet, {"limit": 50, "commitment": "finalized"}],
        )
        if not sigs or not isinstance(sigs, list):
            return False

        # Filter sigs that fall within our funding window
        window_ts = fund_window_start.timestamp()
        relevant = [
            s["signature"] for s in sigs
            if s.get("blockTime", 0) >= window_ts and not s.get("err")
        ]
        if not relevant:
            return False

        # Fetch those txs and look for SOL transfer FROM deployer
        txs = await asyncio.gather(
            *[_fetch_tx(rpc, sig) for sig in relevant[:10]],
            return_exceptions=True,
        )
        for tx in txs:
            if not tx or isinstance(tx, Exception):
                continue
            if _tx_has_sol_transfer_from_deployer(tx, deployer, wallet):
                return True
        return False
    except Exception as exc:
        logger.debug("[bundle] _check_deployer_funded failed: %s", exc)
        return False


def _tx_has_sol_transfer_from_deployer(
    tx: dict,
    deployer: str,
    recipient: str,
) -> bool:
    """Return True if this tx contains a SOL transfer from deployer → recipient."""
    try:
        message = tx.get("transaction", {}).get("message", {})
        account_keys_raw = message.get("accountKeys", [])
        account_keys = [
            (k.get("pubkey", "") if isinstance(k, dict) else str(k))
            for k in account_keys_raw
        ]
        pre_bals  = tx.get("meta", {}).get("preBalances",  [])
        post_bals = tx.get("meta", {}).get("postBalances", [])

        if deployer not in account_keys or recipient not in account_keys:
            return False

        dep_idx = account_keys.index(deployer)
        rec_idx = account_keys.index(recipient)

        if dep_idx >= len(pre_bals) or rec_idx >= len(post_bals):
            return False

        dep_delta = (post_bals[dep_idx] - pre_bals[dep_idx]) / _SOL_DECIMALS
        rec_delta = (post_bals[rec_idx] - pre_bals[rec_idx]) / _SOL_DECIMALS

        # Deployer lost SOL, recipient gained SOL, above minimum threshold
        return dep_delta < -_PRE_FUND_MIN_SOL and rec_delta > _PRE_FUND_MIN_SOL
    except Exception:
        return False


async def _estimate_sol_returned_to_deployer(
    rpc: SolanaRpcClient,
    wallet: str,
    deployer: str,
    launch_dt: datetime,
) -> float:
    """Sum SOL sent FROM *wallet* TO *deployer* after launch."""
    try:
        launch_ts = launch_dt.timestamp()
        sigs = await rpc._call(
            "getSignaturesForAddress",
            [wallet, {"limit": _TRACE_SIGS_PER_WALLET, "commitment": "finalized"}],
        )
        if not sigs or not isinstance(sigs, list):
            return 0.0

        post_launch = [
            s["signature"] for s in sigs
            if s.get("blockTime", 0) >= launch_ts and not s.get("err")
        ]
        if not post_launch:
            return 0.0

        txs = await asyncio.gather(
            *[_fetch_tx(rpc, sig) for sig in post_launch[:20]],
            return_exceptions=True,
        )

        total = 0.0
        for tx in txs:
            if not tx or isinstance(tx, Exception):
                continue
            # Check SOL flow from wallet → deployer
            if _tx_has_sol_transfer_from_deployer(tx, wallet, deployer):
                message = tx.get("transaction", {}).get("message", {})
                account_keys_raw = message.get("accountKeys", [])
                account_keys = [
                    (k.get("pubkey", "") if isinstance(k, dict) else str(k))
                    for k in account_keys_raw
                ]
                post_bals = tx.get("meta", {}).get("postBalances", [])
                pre_bals  = tx.get("meta", {}).get("preBalances",  [])
                if deployer in account_keys:
                    dep_idx = account_keys.index(deployer)
                    if dep_idx < len(post_bals):
                        delta = (post_bals[dep_idx] - pre_bals[dep_idx]) / _SOL_DECIMALS
                        if delta > 0:
                            total += delta
        return total
    except Exception as exc:
        logger.debug("[bundle] _estimate_sol_returned failed: %s", exc)
        return 0.0
