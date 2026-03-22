"""
Insider Sell / Silent Drain Detection — Initiative 4.

Identifies tokens where the deployer (or linked wallets) drain value
by selling their token allocation rather than pulling LP.  This pattern
looks "clean" on a rug-detector that only checks authority revocation,
but the chart shows progressive sell pressure and the deployer's wallet
eventually reaches zero balance.

Detection uses two orthogonal data sources:

1. **DexScreener pair data** (already fetched — zero extra network calls):
   - ``txns.h1/h6/h24.sells`` / ``.buys``  → sell pressure ratios
   - ``priceChange.h1/h6/h24``              → price trend
   - ``volume.h1/h24``                      → sell burst detection

2. **On-chain balance snapshot** (1 RPC call per wallet, ≤4 wallets):
   - ``getTokenAccountsByOwner(wallet, {mint})`` → current token balance
   - Balance == 0  ⟹  wallet fully exited the position ("exited")

Verdict thresholds
------------------
* ``insider_dump``  — deployer exited AND (sell_pressure_24h ≥ 0.65 OR
                      price_change_24h ≤ -50 %)
* ``suspicious``    — sell_pressure_24h ≥ 0.55 OR price_change_24h ≤ -30 %
                      OR volume_spike_ratio ≥ 3
* ``clean``         — none of the above
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Literal, Optional

from .constants import BONDING_CURVE_LAUNCHPAD_PLATFORMS
from .models import InsiderSellEvent, InsiderSellReport
from .models import DataApplicability, EvidenceLevel, LifecycleStage, MarketSurface
from .data_sources.solana_rpc import SolanaRpcClient

logger = logging.getLogger(__name__)

# ── Thresholds ────────────────────────────────────────────────────────────
_SELL_PRESSURE_SUSPICIOUS = 0.55   # >55 % of txns are sells
_SELL_PRESSURE_ELEVATED   = 0.65   # >65 %
_PRICE_CRASH_SUSPICIOUS   = -30.0  # % — notable price fall
_PRICE_CRASH_SEVERE       = -50.0  # % — severe price fall
_VOLUME_SPIKE_THRESHOLD   = 3.0    # 1 h vol > 3× avg hourly vol


# ── Public entry point ────────────────────────────────────────────────────

async def analyze_insider_sell(
    mint: str,
    deployer: str,
    linked_wallets: list[str],
    pairs: list[dict[str, Any]],
    rpc: SolanaRpcClient,
    launch_platform: Optional[str] = None,
    lifecycle_stage: LifecycleStage = LifecycleStage.UNKNOWN,
    market_surface: MarketSurface = MarketSurface.NO_MARKET_OBSERVED,
    reason_codes: Optional[list[str]] = None,
    evidence_level: EvidenceLevel = EvidenceLevel.WEAK,
) -> InsiderSellReport:
    """Compute an :class:`InsiderSellReport` for *mint*.

    Parameters
    ----------
    mint:
        The token mint address being analysed.
    deployer:
        Address of the token deployer.
    linked_wallets:
        Other wallets linked to the deployer (from OperatorFingerprint).
        Only the first 3 are checked on-chain to stay within RPC budget.
    pairs:
        Raw DexScreener pair dicts (already fetched by ``detect_lineage``).
    rpc:
        Live :class:`SolanaRpcClient` instance.
    """
    report = InsiderSellReport(
        mint=mint,
        launch_platform=launch_platform,
        lifecycle_stage=lifecycle_stage,
        market_surface=market_surface,
        reason_codes=list(reason_codes or []),
        evidence_level=evidence_level,
    )

    inferred_market_surface = market_surface
    allow_pair_inference = (
        not launch_platform
        and lifecycle_stage == LifecycleStage.UNKNOWN
        and inferred_market_surface == MarketSurface.NO_MARKET_OBSERVED
    )
    if (
        allow_pair_inference
        and inferred_market_surface == MarketSurface.NO_MARKET_OBSERVED
        and any((p.get("chainId") or "").lower() == "solana" for p in pairs)
    ):
        inferred_market_surface = MarketSurface.DEX_POOL_OBSERVED
        report.market_surface = inferred_market_surface
        if report.lifecycle_stage == LifecycleStage.UNKNOWN:
            report.lifecycle_stage = LifecycleStage.DEX_LISTED

    # ── Step 1: Market signals from DexScreener ───────────────────────────
    _fill_market_signals(
        report,
        pairs,
        market_surface=inferred_market_surface,
        infer_from_pairs=allow_pair_inference,
    )

    # ── Step 1b: On-chain activity fallback when DexScreener has no txns ─
    _has_market_signals = (
        report.sell_pressure_1h is not None
        or report.sell_pressure_6h is not None
        or report.sell_pressure_24h is not None
    )
    if not _has_market_signals and report.applicability != DataApplicability.NOT_APPLICABLE:
        await _fill_onchain_activity(report, mint, rpc)

    # ── Step 2: On-chain balance snapshots ───────────────────────────────
    # Check deployer + up to 3 linked wallets; fire in parallel.
    wallets_to_check: list[tuple[str, str]] = []   # (wallet, role)
    if deployer:
        wallets_to_check.append((deployer, "deployer"))
    for lw in (linked_wallets or [])[:3]:
        if lw and lw != deployer:
            wallets_to_check.append((lw, "linked"))

    if wallets_to_check:
        balance_tasks = [
            _fetch_balance(
                rpc,
                wallet,
                mint,
                role,
                launch_platform=launch_platform,
                lifecycle_stage=lifecycle_stage,
            )
            for wallet, role in wallets_to_check
        ]
        events: list[InsiderSellEvent] = list(await asyncio.gather(*balance_tasks))  # type: ignore[arg-type]
        report.wallet_events = [e for e in events if e is not None]

        # Deployer exit flag
        deployer_event = next(
            (e for e in report.wallet_events if e.role == "deployer"), None
        )
        if deployer_event is not None:
            report.deployer_exited = deployer_event.exited

    # ── Step 3: Build flags ───────────────────────────────────────────────
    _apply_flags(report)

    # ── Step 4: Risk score and verdict ───────────────────────────────────
    report.risk_score = _compute_risk_score(report)
    report.verdict = _compute_verdict(report)

    # ── Step 5: Explicit data coverage — never silent about what's missing
    _has_dex_signals = (
        report.sell_pressure_1h is not None
        or report.sell_pressure_6h is not None
        or report.sell_pressure_24h is not None
    )
    _has_onchain = (
        report.onchain_tx_count_1h is not None
        or report.deployer_exited is not None
    )
    if _has_dex_signals and _has_onchain:
        report.data_coverage = "full"
    elif _has_dex_signals:
        report.data_coverage = "partial"
        report.data_coverage_note = "DexScreener market data available but on-chain balance check failed"
    elif _has_onchain:
        report.data_coverage = "onchain_only"
        report.data_coverage_note = (
            "DexScreener txn data not yet available (token may be too young). "
            "Deployer balance checked on-chain."
        )
    else:
        report.data_coverage = "none"
        if report.applicability == DataApplicability.NOT_APPLICABLE:
            report.data_coverage_note = "Token not on DEX — insider sell analysis not applicable"
        else:
            report.data_coverage_note = "No market or on-chain data could be retrieved"

    return report


# ── Internal helpers ──────────────────────────────────────────────────────

def _fill_market_signals(
    report: InsiderSellReport,
    pairs: list[dict[str, Any]],
    *,
    market_surface: MarketSurface = MarketSurface.NO_MARKET_OBSERVED,
    infer_from_pairs: bool = True,
) -> None:
    """Aggregate txns, priceChange, and volume across all Solana pairs."""
    solana = [p for p in pairs if (p.get("chainId") or "").lower() == "solana"]
    if market_surface == MarketSurface.NO_MARKET_OBSERVED and solana and infer_from_pairs:
        market_surface = MarketSurface.DEX_POOL_OBSERVED

    if market_surface != MarketSurface.DEX_POOL_OBSERVED:
        report.applicability = DataApplicability.NOT_APPLICABLE
        if "market_signals_not_applicable_for_non_dex_surface" not in report.reason_codes:
            report.reason_codes.append("market_signals_not_applicable_for_non_dex_surface")
        return

    if not solana:
        report.applicability = DataApplicability.UNAVAILABLE
        return

    report.applicability = DataApplicability.OBSERVED

    # Filter out bonding curve pairs — their sell pressure is the curve mechanism,
    # not real insider selling. Only aggregate from real DEX pairs (Raydium, Orca, etc.)
    real_dex_pairs = [
        p for p in solana
        if (p.get("dexId") or "").lower() not in BONDING_CURVE_LAUNCHPAD_PLATFORMS
    ]
    # If ALL pairs are bonding curve, use them anyway (no DEX data available)
    pairs_to_analyze = real_dex_pairs if real_dex_pairs else solana

    # Aggregate txn counts across real DEX pools only
    buys_1h = sells_1h = buys_6h = sells_6h = buys_24h = sells_24h = 0
    vol_1h = vol_24h = 0.0
    price_1h = price_6h = price_24h = None

    for p in pairs_to_analyze:
        txns = p.get("txns") or {}
        h1   = txns.get("h1")  or {}
        h6   = txns.get("h6")  or {}
        h24  = txns.get("h24") or {}
        buys_1h   += _int(h1.get("buys"))
        sells_1h  += _int(h1.get("sells"))
        buys_6h   += _int(h6.get("buys"))
        sells_6h  += _int(h6.get("sells"))
        buys_24h  += _int(h24.get("buys"))
        sells_24h += _int(h24.get("sells"))

        vol = p.get("volume") or {}
        vol_1h  += _float(vol.get("h1"))
        vol_24h += _float(vol.get("h24"))

        # Price change: take the best-liquidity pair's values (first pass only)
        pc = p.get("priceChange") or {}
        if price_24h is None:
            price_1h  = _opt_float(pc.get("h1"))
            price_6h  = _opt_float(pc.get("h6"))
            price_24h = _opt_float(pc.get("h24"))

    # Sell pressure ratios
    if buys_1h + sells_1h > 0:
        report.sell_pressure_1h = round(sells_1h / (buys_1h + sells_1h), 3)
    if buys_6h + sells_6h > 0:
        report.sell_pressure_6h = round(sells_6h / (buys_6h + sells_6h), 3)
    if buys_24h + sells_24h > 0:
        report.sell_pressure_24h = round(sells_24h / (buys_24h + sells_24h), 3)

    report.price_change_1h  = price_1h
    report.price_change_6h  = price_6h
    report.price_change_24h = price_24h

    # Volume spike: 1 h vs average hourly (24 h / 24)
    if vol_24h > 0 and vol_1h > 0:
        avg_hourly = vol_24h / 24.0
        if avg_hourly > 0:
            report.volume_spike_ratio = round(vol_1h / avg_hourly, 2)


async def _fetch_balance(
    rpc: SolanaRpcClient,
    wallet: str,
    mint: str,
    role: str,
    *,
    launch_platform: Optional[str] = None,
    lifecycle_stage: LifecycleStage = LifecycleStage.UNKNOWN,
) -> Optional[InsiderSellEvent]:
    """Return an :class:`InsiderSellEvent` for a single wallet, or None on error."""
    try:
        _balance_timeout = 8.0 if role == "deployer" else 5.0
        balance = await asyncio.wait_for(
            rpc.get_wallet_token_balance(wallet, mint),
            timeout=_balance_timeout,
        )
        is_launchpad = (launch_platform or "") in BONDING_CURVE_LAUNCHPAD_PLATFORMS
        # For launchpad tokens (PumpFun, Moonshot, Raydium Launchpad, etc.),
        # the deployer often never receives tokens — the protocol distributes
        # them directly to buyers. A zero balance is expected behavior, not
        # evidence of exit, regardless of lifecycle stage.
        zero_balance_expected = (
            role == "deployer"
            and is_launchpad
            and balance == 0.0
        )

        context: Optional[str] = None
        if zero_balance_expected:
            # Check if deployer ever held tokens by looking at recent TX
            had_tokens = await _deployer_ever_held_tokens(rpc, wallet, mint)
            if had_tokens:
                # Deployer DID hold tokens and now has 0 — genuine exit
                zero_balance_expected = False
                try:
                    context = await asyncio.wait_for(
                        _build_exit_context(rpc, wallet, mint),
                        timeout=10.0,
                    )
                    logger.info("[insider] exit context for %s: %s", wallet[:8], context)
                except Exception as ctx_exc:
                    logger.warning("[insider] exit context failed for %s: %s", wallet[:8], ctx_exc)
                    context = "Deployer sold tokens — exit details unavailable."
            else:
                # CRITICAL: this string must match the check in _apply_flags() line 582
                context = "zero_balance_expected_by_protocol"
        elif balance == 0.0 and role == "deployer":
            # Non-launchpad deployer exited — try to quantify the exit
            try:
                context = await asyncio.wait_for(
                    _build_exit_context(rpc, wallet, mint),
                    timeout=10.0,
                )
                logger.info("[insider] exit context for %s: %s", wallet[:8], context)
            except Exception as ctx_exc:
                logger.warning("[insider] exit context failed for %s: %s", wallet[:8], ctx_exc)
                context = "Deployer wallet has 0 balance — exit analysis timed out."

        return InsiderSellEvent(
            wallet=wallet,
            role=role,  # type: ignore[arg-type]
            balance_now=balance,
            exited=(balance == 0.0 and not zero_balance_expected),
            balance_context=context,
        )
    except Exception as exc:
        logger.debug("get_wallet_token_balance failed for %s: %s", wallet[:8], exc)
        return None


async def _deployer_ever_held_tokens(
    rpc: SolanaRpcClient,
    wallet: str,
    mint: str,
) -> bool:
    """Check if the deployer ever had a non-zero balance of this token.

    Scans recent TX preTokenBalances for any entry where owner=wallet
    and mint=mint with a positive balance. Returns True if found.
    """
    try:
        sigs = await asyncio.wait_for(
            rpc.get_recent_signatures(wallet, limit=20),
            timeout=5.0,
        )
        for sig_info in sigs[:10]:
            sig = sig_info.get("signature", "")
            if not sig:
                continue
            try:
                tx = await asyncio.wait_for(
                    rpc._call(
                        "getTransaction",
                        [sig, {"encoding": "jsonParsed", "maxSupportedTransactionVersion": 0}],
                    ),
                    timeout=3.0,
                )
                if not tx or not isinstance(tx, dict):
                    continue
                meta = tx.get("meta", {})
                for b in meta.get("preTokenBalances", []) + meta.get("postTokenBalances", []):
                    if (
                        b.get("mint") == mint
                        and b.get("owner") == wallet
                        and float((b.get("uiTokenAmount") or {}).get("uiAmount", 0) or 0) > 0
                    ):
                        return True
            except Exception:
                continue
        return False
    except Exception:
        return False


async def _build_exit_context(
    rpc: SolanaRpcClient,
    wallet: str,
    mint: str,
) -> Optional[str]:
    """Analyse recent transactions to quantify how much the deployer sold.

    Returns a human-readable summary like:
      "Sold ~5.2M tokens in 3 transactions over 2h. Estimated exit: ~12.4 SOL."
    """
    import json as _json

    try:
        sigs = await asyncio.wait_for(
            rpc.get_recent_signatures(wallet, limit=50),
            timeout=5.0,
        )
        if not sigs:
            return "Deployer wallet has 0 balance — exit details unavailable."

        # Parse up to 5 recent transactions to find token sells
        sell_txs = 0
        total_token_amount = 0.0
        total_sol_received = 0.0
        earliest_ts = None
        latest_ts = None

        for sig_info in sigs[:10]:
            sig = sig_info.get("signature", "")
            block_time = sig_info.get("blockTime")
            if not sig:
                continue
            try:
                tx = await asyncio.wait_for(
                    rpc._call(
                        "getTransaction",
                        [sig, {"encoding": "jsonParsed", "maxSupportedTransactionVersion": 0}],
                    ),
                    timeout=3.0,
                )
                if not tx or not isinstance(tx, dict):
                    continue

                # Check pre/post token balances for this mint
                meta = tx.get("meta", {})
                pre_balances = meta.get("preTokenBalances", [])
                post_balances = meta.get("postTokenBalances", [])

                # Find deployer's token balance change
                deployer_pre = 0.0
                deployer_post = 0.0
                for b in pre_balances:
                    if b.get("mint") == mint and b.get("owner") == wallet:
                        deployer_pre = float(b.get("uiTokenAmount", {}).get("uiAmount", 0) or 0)
                for b in post_balances:
                    if b.get("mint") == mint and b.get("owner") == wallet:
                        deployer_post = float(b.get("uiTokenAmount", {}).get("uiAmount", 0) or 0)

                token_delta = deployer_pre - deployer_post
                if token_delta > 0:
                    # This was a sell (deployer reduced token balance)
                    sell_txs += 1
                    total_token_amount += token_delta

                    # Check SOL balance change (pre/post lamports)
                    account_keys = (
                        tx.get("transaction", {}).get("message", {}).get("accountKeys", [])
                    )
                    deployer_idx = None
                    for i, key in enumerate(account_keys):
                        addr = key.get("pubkey", "") if isinstance(key, dict) else key
                        if addr == wallet:
                            deployer_idx = i
                            break

                    if deployer_idx is not None:
                        pre_sol = (meta.get("preBalances") or [])[deployer_idx] if deployer_idx < len(meta.get("preBalances", [])) else 0
                        post_sol = (meta.get("postBalances") or [])[deployer_idx] if deployer_idx < len(meta.get("postBalances", [])) else 0
                        sol_delta = (post_sol - pre_sol) / 1e9  # lamports → SOL
                        if sol_delta > 0:
                            total_sol_received += sol_delta

                    if block_time:
                        if earliest_ts is None or block_time < earliest_ts:
                            earliest_ts = block_time
                        if latest_ts is None or block_time > latest_ts:
                            latest_ts = block_time

            except Exception:
                continue

        if sell_txs == 0:
            return "Deployer wallet has 0 balance — no sell transactions found in recent history."

        # Format amounts
        if total_token_amount >= 1_000_000:
            token_str = f"{total_token_amount / 1_000_000:.1f}M"
        elif total_token_amount >= 1_000:
            token_str = f"{total_token_amount / 1_000:.1f}K"
        else:
            token_str = f"{total_token_amount:.0f}"

        duration_str = ""
        if earliest_ts and latest_ts and latest_ts > earliest_ts:
            hours = (latest_ts - earliest_ts) / 3600
            if hours >= 1:
                duration_str = f" over {hours:.0f}h"
            else:
                duration_str = f" over {hours * 60:.0f}min"

        sol_str = ""
        if total_sol_received > 0.01:
            sol_str = f" Estimated exit: ~{total_sol_received:.2f} SOL."

        return (
            f"Sold ~{token_str} tokens in {sell_txs} transaction(s){duration_str}.{sol_str}"
        )

    except Exception as exc:
        logger.debug("_build_exit_context failed for %s: %s", wallet[:8], exc)
        return "Deployer wallet has 0 balance — exit analysis failed."


async def _fill_onchain_activity(
    report: InsiderSellReport,
    mint: str,
    rpc: SolanaRpcClient,
) -> None:
    """Fallback: count recent on-chain txs when DexScreener txns are unavailable.

    Uses ``getSignaturesForAddress`` on the mint to measure activity in
    1 h / 6 h / 24 h windows.  This is NOT buy/sell classification — it's a
    raw activity count — but it's far more useful than "non disponible".
    """
    try:
        sigs = await asyncio.wait_for(
            rpc.get_recent_signatures(mint, limit=200),
            timeout=5.0,
        )
        if not sigs:
            return

        now = time.time()
        count_1h = count_6h = count_24h = 0
        for sig in sigs:
            block_time = sig.get("blockTime")
            if not block_time:
                continue
            age_s = now - block_time
            if age_s <= 3600:
                count_1h += 1
            if age_s <= 21600:
                count_6h += 1
            if age_s <= 86400:
                count_24h += 1

        report.onchain_tx_count_1h = count_1h
        report.onchain_tx_count_6h = count_6h
        report.onchain_tx_count_24h = count_24h
        if "onchain_activity_fallback" not in report.reason_codes:
            report.reason_codes.append("onchain_activity_fallback")
        logger.info(
            "[insider_sell] on-chain fallback for %s: 1h=%d 6h=%d 24h=%d",
            mint[:8], count_1h, count_6h, count_24h,
        )
    except Exception:
        logger.debug("on-chain activity probe failed for %s", mint[:8], exc_info=True)


def _apply_flags(report: InsiderSellReport) -> None:
    """Populate ``report.flags`` based on thresholds."""
    flags: list[str] = []

    if report.lifecycle_stage == LifecycleStage.LAUNCHPAD_CURVE_ONLY:
        flags.append("PRE_DEX_LAUNCHPAD")

    # Sell pressure
    sp24 = report.sell_pressure_24h
    sp6  = report.sell_pressure_6h
    if sp24 is not None and sp24 >= _SELL_PRESSURE_ELEVATED:
        flags.append("ELEVATED_SELL_PRESSURE")
    elif (sp24 is not None and sp24 >= _SELL_PRESSURE_SUSPICIOUS) or (
        sp6 is not None and sp6 >= _SELL_PRESSURE_ELEVATED
    ):
        flags.append("HIGH_SELL_PRESSURE")

    # Price crash
    pc24 = report.price_change_24h
    if pc24 is not None and pc24 <= _PRICE_CRASH_SEVERE:
        flags.append("PRICE_CRASH")
    elif pc24 is not None and pc24 <= _PRICE_CRASH_SUSPICIOUS:
        flags.append("PRICE_DECLINING")

    # Volume burst
    if report.volume_spike_ratio is not None and report.volume_spike_ratio >= _VOLUME_SPIKE_THRESHOLD:
        flags.append("SELL_BURST")

    # On-chain confirmation
    deployer_expected_zero = any(
        e.role == "deployer" and e.balance_context == "zero_balance_expected_by_protocol"
        for e in report.wallet_events
    )
    if report.deployer_exited is True and not deployer_expected_zero:
        flags.append("DEPLOYER_EXITED")

    # The most serious combined flag
    deployer_exited = report.deployer_exited is True
    sell_pressure_high = "ELEVATED_SELL_PRESSURE" in flags or "HIGH_SELL_PRESSURE" in flags
    price_crashed = "PRICE_CRASH" in flags

    if deployer_exited and (sell_pressure_high or price_crashed):
        flags.append("INSIDER_DUMP_CONFIRMED")

    report.flags = flags


def _compute_risk_score(report: InsiderSellReport) -> float:
    score = 0.0

    if report.applicability == DataApplicability.NOT_APPLICABLE:
        return 0.0

    # Sell pressure (up to 0.35)
    sp24 = report.sell_pressure_24h or 0.0
    if sp24 >= _SELL_PRESSURE_ELEVATED:
        score += 0.35
    elif sp24 >= _SELL_PRESSURE_SUSPICIOUS:
        score += 0.20
    elif sp24 >= 0.50:
        score += 0.10

    # Price drop (up to 0.30)
    pc24 = report.price_change_24h or 0.0
    if pc24 <= _PRICE_CRASH_SEVERE:
        score += 0.30
    elif pc24 <= _PRICE_CRASH_SUSPICIOUS:
        score += 0.18

    # Volume spike (up to 0.15)
    vsr = report.volume_spike_ratio or 0.0
    if vsr >= _VOLUME_SPIKE_THRESHOLD:
        score += min(0.15, 0.05 * vsr)

    # On-chain deployer exit (up to 0.20)
    if report.deployer_exited is True:
        score += 0.20
    elif report.deployer_exited is False:
        # Deployer still holding — reduce suspicion slightly
        score = max(0.0, score - 0.10)

    return round(min(1.0, score), 3)


def _compute_verdict(report: InsiderSellReport) -> Literal["clean", "suspicious", "insider_dump"]:
    if report.lifecycle_stage in (
        LifecycleStage.LAUNCHPAD_CURVE_ONLY,
        LifecycleStage.MIGRATION_PENDING,
    ):
        return "clean"
    if "INSIDER_DUMP_CONFIRMED" in report.flags:
        return "insider_dump"
    if report.risk_score >= 0.45 or (
        "ELEVATED_SELL_PRESSURE" in report.flags
        or "PRICE_CRASH" in report.flags
        or "DEPLOYER_EXITED" in report.flags
    ):
        return "suspicious"
    return "clean"


# ── Tiny type-coercion helpers ────────────────────────────────────────────

def _int(v: Any) -> int:
    try:
        return int(v) if v is not None else 0
    except (TypeError, ValueError):
        return 0


def _float(v: Any) -> float:
    try:
        return float(v) if v is not None else 0.0
    except (TypeError, ValueError):
        return 0.0


def _opt_float(v: Any) -> Optional[float]:
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None
