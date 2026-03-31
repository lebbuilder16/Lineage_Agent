"""
Sniper Ring Tracker — detects coordinated early buyers post-migration.

Complements the bundle tracker (slots 0-20 after creation) by scanning
the first buyers AFTER Raydium migration.  Checks whether snipers are
linked to the deployer via:
  - Direct funding (deployer → sniper pre-buy)
  - Shared funder (factory → deployer + sniper)
  - SOL return (sniper → deployer post-sell)
  - Repeat sniping (same wallet in other deployer tokens)

Uses Helius Enhanced Transactions for fast, low-RPC-call analysis.
"""

from __future__ import annotations

import asyncio
import logging
from collections import Counter
from datetime import datetime, timezone
from typing import Optional

from .constants import SKIP_PROGRAMS
from .data_sources.solana_rpc import SolanaRpcClient
from .data_sources._clients import get_rpc_client
from .models import SniperWallet, SniperRingReport

logger = logging.getLogger(__name__)

# ── Tuning ───────────────────────────────────────────────────────────────────
_SNIPER_WINDOW_SLOTS = 50         # Slots after pool creation to scan for snipers
_MAX_SNIPERS = 10                 # Cap on sniper wallets to analyze (was 20 — reduced to limit HTTP/2 stream pressure)
_MIN_BUY_LAMPORTS = 10_000_000    # 0.01 SOL minimum to count as a buy
_MIN_FUND_LAMPORTS = 10_000_000   # 0.01 SOL minimum to count as funding
_MAX_ENHANCED_TXS = 100           # Helius Enhanced limit per call
_RPC_CONCURRENCY = 3              # Max parallel Helius calls — low to avoid saturating HTTP/2 stream pool (200 max shared across all modules)
_SKIP = SKIP_PROGRAMS


# ── Public API ───────────────────────────────────────────────────────────────

async def analyze_sniper_ring(
    mint: str,
    deployer: str,
    *,
    creation_slot: Optional[int] = None,
    created_at: Optional[datetime] = None,
    pairs: Optional[list] = None,
) -> Optional[SniperRingReport]:
    """Detect and analyze early snipers on a token.

    Scans the first buyers within _SNIPER_WINDOW_SLOTS of pool creation
    using Helius Enhanced Transactions, then checks for deployer links.

    Returns None if Helius is not available or no snipers found.
    """
    rpc = get_rpc_client()
    if not rpc.helius_api_key:
        return None  # Requires Helius Enhanced for efficiency

    try:
        return await asyncio.wait_for(
            _run_analysis(rpc, mint, deployer, creation_slot, created_at, pairs),
            timeout=15.0,
        )
    except asyncio.TimeoutError:
        logger.warning("[sniper] analysis timed out for %s", mint[:12])
        return None
    except Exception as exc:
        logger.warning("[sniper] analysis failed for %s: %s", mint[:12], exc)
        return None


# ── Internal ─────────────────────────────────────────────────────────────────

async def _run_analysis(
    rpc: SolanaRpcClient,
    mint: str,
    deployer: str,
    creation_slot: Optional[int],
    created_at: Optional[datetime],
    pairs: Optional[list],
) -> Optional[SniperRingReport]:

    # Step 1: Get early buyers via Enhanced Transactions on the mint
    enhanced_txs = await rpc.get_enhanced_transactions(mint, limit=_MAX_ENHANCED_TXS)
    if not enhanced_txs:
        return None

    # Determine creation timestamp for time-window filtering
    creation_ts = created_at.timestamp() if created_at else None

    # Step 2: Extract sniper wallets (first buyers of this token)
    sniper_buys: dict[str, dict] = {}  # wallet → {sol, tokens, slot, sig}

    for etx in enhanced_txs:
        etx_slot = etx.get("slot", 0)
        etx_ts = etx.get("timestamp", 0)

        # Only look at early transactions (within window of creation)
        if creation_slot and etx_slot:
            if etx_slot - creation_slot > _SNIPER_WINDOW_SLOTS:
                continue
        elif creation_ts and etx_ts:
            # Fallback: time-based window (~20 seconds)
            if etx_ts - creation_ts > 20:
                continue

        # Extract token buyers from tokenTransfers
        for tt in etx.get("tokenTransfers", []):
            if tt.get("mint") != mint:
                continue
            buyer = tt.get("toUserAccount", "")
            amount = tt.get("tokenAmount", 0) or 0
            if not buyer or buyer == deployer or buyer in _SKIP or amount <= 0:
                continue

            # Calculate SOL cost from nativeTransfers
            sol_spent = 0.0
            for nt in etx.get("nativeTransfers", []):
                if nt.get("fromUserAccount") == buyer:
                    sol_spent += (nt.get("amount", 0) or 0) / 1e9

            if buyer not in sniper_buys:
                sniper_buys[buyer] = {
                    "tokens": 0.0,
                    "sol": 0.0,
                    "slot": etx_slot,
                    "sig": etx.get("signature", ""),
                }
            sniper_buys[buyer]["tokens"] += float(amount)
            sniper_buys[buyer]["sol"] += sol_spent

    if not sniper_buys:
        return SniperRingReport(mint=mint, deployer=deployer, verdict="no_snipers")

    # Cap to top snipers by SOL spent
    sorted_snipers = sorted(sniper_buys.items(), key=lambda x: x[1]["sol"], reverse=True)
    sorted_snipers = sorted_snipers[:_MAX_SNIPERS]

    # Step 3: Analyze each sniper — check funding source + sell behavior
    sniper_wallets: list[SniperWallet] = []
    deployer_funded = 0
    funder_counter: Counter[str] = Counter()
    sol_returned = 0.0
    evidence: list[str] = []

    sem = asyncio.Semaphore(_RPC_CONCURRENCY)

    async def _analyze_one(wallet: str, buy_data: dict) -> SniperWallet:
        nonlocal deployer_funded, sol_returned
        async with sem:
            flags: list[str] = []
            funder = None
            funder_is_deployer = False
            sold = False
            profit_sol = None
            wallet_age_h = None

            # Fetch wallet's recent transactions via Enhanced API
            try:
                w_txs = await rpc.get_enhanced_transactions(wallet, limit=20)
            except Exception:
                w_txs = []

            if w_txs:
                # Wallet age: oldest TX timestamp
                all_ts = [t.get("timestamp", 0) for t in w_txs if t.get("timestamp")]
                if all_ts:
                    oldest = min(all_ts)
                    buy_ts = buy_data.get("slot", 0)  # approximate
                    if creation_ts:
                        wallet_age_h = max(0, (creation_ts - oldest) / 3600)
                    if wallet_age_h is not None and wallet_age_h < 1:
                        flags.append("FRESH_WALLET")

                # Check funding source (incoming SOL before the buy)
                buy_slot = buy_data.get("slot", 0)
                for wtx in w_txs:
                    wtx_slot = wtx.get("slot", 0)
                    if buy_slot and wtx_slot >= buy_slot:
                        continue  # Only look at pre-buy TXs
                    for nt in wtx.get("nativeTransfers", []):
                        to_addr = nt.get("toUserAccount", "")
                        from_addr = nt.get("fromUserAccount", "")
                        amount = nt.get("amount", 0) or 0
                        if to_addr == wallet and amount >= _MIN_FUND_LAMPORTS and from_addr not in _SKIP:
                            funder = from_addr
                            if from_addr == deployer:
                                funder_is_deployer = True
                                deployer_funded += 1
                                flags.append("FUNDED_BY_DEPLOYER")
                            break
                    if funder:
                        break

                if funder:
                    funder_counter[funder] += 1

                # Check if sniper sold and where SOL went
                for wtx in w_txs:
                    wtx_slot = wtx.get("slot", 0)
                    if buy_slot and wtx_slot <= buy_slot:
                        continue  # Only post-buy TXs

                    # Check for token sell (outgoing tokenTransfer of this mint)
                    for tt in wtx.get("tokenTransfers", []):
                        if tt.get("mint") == mint and tt.get("fromUserAccount") == wallet:
                            sold = True
                            break

                    # Check for SOL sent back to deployer
                    if sold:
                        for nt in wtx.get("nativeTransfers", []):
                            if (
                                nt.get("fromUserAccount") == wallet
                                and nt.get("toUserAccount") == deployer
                                and (nt.get("amount", 0) or 0) >= _MIN_FUND_LAMPORTS
                            ):
                                ret = (nt.get("amount", 0) or 0) / 1e9
                                sol_returned += ret
                                flags.append("SOL_RETURNED_TO_DEPLOYER")
                                break

                # Estimate profit
                if sold:
                    # Sum all SOL received in post-buy TXs
                    sol_received = 0.0
                    for wtx in w_txs:
                        if buy_slot and (wtx.get("slot", 0) or 0) <= buy_slot:
                            continue
                        for nt in wtx.get("nativeTransfers", []):
                            if nt.get("toUserAccount") == wallet:
                                sol_received += (nt.get("amount", 0) or 0) / 1e9
                    profit_sol = round(sol_received - buy_data["sol"], 4)

            entry_delta = None
            if creation_slot and buy_data.get("slot"):
                entry_delta = buy_data["slot"] - creation_slot

            return SniperWallet(
                wallet=wallet,
                entry_slot=buy_data.get("slot"),
                entry_delta_slots=entry_delta,
                tokens_bought=buy_data["tokens"],
                cost_basis_sol=round(buy_data["sol"], 4),
                sold=sold,
                profit_sol=profit_sol,
                funder=funder,
                funder_is_deployer=funder_is_deployer,
                funder_is_shared=False,  # set below
                wallet_age_hours=round(wallet_age_h, 1) if wallet_age_h is not None else None,
                flags=flags,
            )

    # Run all analyses in parallel
    tasks = [_analyze_one(w, d) for w, d in sorted_snipers]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    for r in results:
        if isinstance(r, SniperWallet):
            sniper_wallets.append(r)

    if not sniper_wallets:
        return SniperRingReport(mint=mint, deployer=deployer, verdict="no_snipers")

    # Step 4: Detect shared funder pattern
    shared_funder = None
    shared_funder_count = 0
    most_common = funder_counter.most_common(1)
    if most_common and most_common[0][1] >= 2:
        shared_funder = most_common[0][0]
        shared_funder_count = most_common[0][1]
        for sw in sniper_wallets:
            if sw.funder == shared_funder:
                sw.funder_is_shared = True
                if "SHARED_FUNDER" not in sw.flags:
                    sw.flags.append("SHARED_FUNDER")
        evidence.append(
            f"Shared funder {shared_funder[:12]}… funded {shared_funder_count} snipers"
        )
        if shared_funder == deployer:
            evidence.append("Shared funder IS the deployer — orchestrated snipe ring")

    # Step 5: Build evidence chain
    if deployer_funded > 0:
        evidence.append(f"Deployer directly funded {deployer_funded} sniper(s)")
    if sol_returned > 0:
        evidence.append(f"{sol_returned:.4f} SOL returned from snipers to deployer")

    fresh = sum(1 for s in sniper_wallets if "FRESH_WALLET" in s.flags)
    if fresh >= 2:
        evidence.append(f"{fresh} snipers used fresh wallets (<1h old)")

    returned = sum(1 for s in sniper_wallets if "SOL_RETURNED_TO_DEPLOYER" in s.flags)
    if returned > 0:
        evidence.append(f"{returned} sniper(s) sent SOL back to deployer after selling")

    # Step 6: Compute verdict
    risk = 0.0
    if deployer_funded > 0:
        risk += 0.4 + 0.1 * min(deployer_funded, 5)
    if shared_funder_count >= 2:
        risk += 0.2
        if shared_funder == deployer:
            risk += 0.2
    if sol_returned > 0:
        risk += 0.3
    if fresh >= 3:
        risk += 0.1

    risk = min(risk, 1.0)

    if risk >= 0.5:
        verdict = "deployer_linked_ring"
    elif risk >= 0.2:
        verdict = "suspicious_ring"
    elif sniper_wallets:
        verdict = "organic"
    else:
        verdict = "no_snipers"

    return SniperRingReport(
        mint=mint,
        deployer=deployer,
        snipers=sniper_wallets,
        ring_size=len(sniper_wallets),
        deployer_funded_count=deployer_funded,
        shared_funder_count=shared_funder_count,
        shared_funder=shared_funder,
        sol_returned_to_deployer=round(sol_returned, 4),
        repeat_sniper_count=0,  # TODO: cross-token analysis
        risk_score=round(risk, 2),
        verdict=verdict,
        evidence=evidence,
    )
