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
from typing import Any, Optional

from .models import InsiderSellEvent, InsiderSellReport
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
    report = InsiderSellReport(mint=mint)

    # ── Step 1: Market signals from DexScreener ───────────────────────────
    _fill_market_signals(report, pairs)

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
            _fetch_balance(rpc, wallet, mint, role)
            for wallet, role in wallets_to_check
        ]
        events: list[InsiderSellEvent] = await asyncio.gather(*balance_tasks)
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

    return report


# ── Internal helpers ──────────────────────────────────────────────────────

def _fill_market_signals(
    report: InsiderSellReport,
    pairs: list[dict[str, Any]],
) -> None:
    """Aggregate txns, priceChange, and volume across all Solana pairs."""
    solana = [p for p in pairs if (p.get("chainId") or "").lower() == "solana"]
    if not solana:
        return

    # Aggregate txn counts across all pools
    buys_1h = sells_1h = buys_6h = sells_6h = buys_24h = sells_24h = 0
    vol_1h = vol_24h = 0.0
    price_1h = price_6h = price_24h = None

    for p in solana:
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
) -> Optional[InsiderSellEvent]:
    """Return an :class:`InsiderSellEvent` for a single wallet, or None on error."""
    try:
        balance = await asyncio.wait_for(
            rpc.get_wallet_token_balance(wallet, mint),
            timeout=5.0,
        )
        return InsiderSellEvent(
            wallet=wallet,
            role=role,  # type: ignore[arg-type]
            balance_now=balance,
            exited=(balance == 0.0),
        )
    except Exception as exc:
        logger.debug("get_wallet_token_balance failed for %s: %s", wallet[:8], exc)
        return None


def _apply_flags(report: InsiderSellReport) -> None:
    """Populate ``report.flags`` based on thresholds."""
    flags: list[str] = []

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
    if report.deployer_exited is True:
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


def _compute_verdict(report: InsiderSellReport) -> str:
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
