"""
Phase 4 — Liquidity Architecture Forensics.

Analyses how liquidity is distributed across DEX pools for a token.
Detects fragmentation, unusually low volume vs liquidity (artificial LP),
and multi-pool migration patterns.

All signal computed from data already fetched by get_token_pairs() — zero
additional network calls.
"""

from __future__ import annotations

import logging
from typing import Any

from .models import LiquidityArchReport

logger = logging.getLogger(__name__)

# Thresholds
_FRAGMENTATION_POOL_THRESHOLD = 3      # ≥3 pools → notable fragmentation
_SUSPICIOUS_LIQ_VOL_RATIO = 50.0      # liq/vol > 50 → very low organic trading
_CRITICAL_LIQ_VOL_RATIO = 200.0       # liq/vol > 200 → near-zero trading activity
_MIN_TOTAL_LIQ = 100.0                # below this there's nothing meaningful to analyse


def analyze_liquidity_architecture(pairs: list[dict[str, Any]]) -> LiquidityArchReport:
    """Compute the LiquidityArchReport from raw DexScreener pair data.

    Parameters
    ----------
    pairs:
        Raw list of pair dicts returned by DexScreenerClient.get_token_pairs().

    Returns
    -------
    LiquidityArchReport
    """
    solana_pairs = [p for p in pairs if (p.get("chainId") or "").lower() == "solana"]
    if not solana_pairs:
        return LiquidityArchReport(
            total_liquidity_usd=0.0,
            pool_count=0,
            pools={},
            concentration_hhi=1.0,
            liq_to_volume_ratio=None,
            authenticity_score=0.5,
            flags=["NO_SOLANA_PAIRS"],
        )

    # Aggregate per DEX
    by_dex: dict[str, float] = {}
    total_vol_24h = 0.0

    for p in solana_pairs:
        dex = p.get("dexId") or "unknown"
        liq = _safe_float((p.get("liquidity") or {}).get("usd"))
        vol = _safe_float((p.get("volume") or {}).get("h24"))
        by_dex[dex] = by_dex.get(dex, 0.0) + (liq or 0.0)
        total_vol_24h += vol or 0.0

    total_liq = sum(by_dex.values())
    pool_count = len(by_dex)
    flags: list[str] = []

    # ── Concentration: Herfindahl–Hirschman Index ──────────────────────────
    # HHI = Σ(share²)  → 1.0 = perfect concentration (1 pool), 0.0 = perfectly spread
    if total_liq > 0:
        shares = [liq / total_liq for liq in by_dex.values()]
        hhi = sum(s * s for s in shares)
    else:
        hhi = 1.0

    if pool_count >= _FRAGMENTATION_POOL_THRESHOLD and hhi < 0.5:
        flags.append("FRAGMENTED_LIQUIDITY")

    # ── Liquidity-to-volume ratio ──────────────────────────────────────────
    liq_vol_ratio: float | None = None
    if total_vol_24h > 0 and total_liq > 0:
        liq_vol_ratio = round(total_liq / total_vol_24h, 1)
        if liq_vol_ratio > _CRITICAL_LIQ_VOL_RATIO:
            flags.append("CRITICAL_LOW_VOLUME")
        elif liq_vol_ratio > _SUSPICIOUS_LIQ_VOL_RATIO:
            flags.append("LOW_VOLUME_HIGH_LIQ")
    elif total_liq > _MIN_TOTAL_LIQ and total_vol_24h == 0.0:
        flags.append("ZERO_VOLUME_WITH_LIQUIDITY")

    # ── Single-provider heuristic ──────────────────────────────────────────
    # If all liquidity is on one DEX and volume is zero → likely deployer-only LP
    if pool_count == 1 and "ZERO_VOLUME_WITH_LIQUIDITY" in flags:
        flags.append("POSSIBLE_DEPLOYER_LP_ONLY")

    # ── Authenticity score ─────────────────────────────────────────────────
    authenticity_score = _compute_authenticity(hhi, liq_vol_ratio, pool_count, flags)

    return LiquidityArchReport(
        total_liquidity_usd=round(total_liq, 2),
        pool_count=pool_count,
        pools={k: round(v, 2) for k, v in by_dex.items()},
        concentration_hhi=round(hhi, 3),
        liq_to_volume_ratio=liq_vol_ratio,
        authenticity_score=round(authenticity_score, 3),
        flags=flags,
    )


def _compute_authenticity(
    hhi: float,
    liq_vol_ratio: float | None,
    pool_count: int,
    flags: list[str],
) -> float:
    """Compute a [0, 1] score where 1.0 = healthy / authentic liquidity."""
    score = 1.0

    # Heavily penalise zero-volume flags
    if "CRITICAL_LOW_VOLUME" in flags:
        score -= 0.45
    elif "ZERO_VOLUME_WITH_LIQUIDITY" in flags or "POSSIBLE_DEPLOYER_LP_ONLY" in flags:
        score -= 0.35
    elif "LOW_VOLUME_HIGH_LIQ" in flags:
        score -= 0.20

    # Penalise fragmentation
    if "FRAGMENTED_LIQUIDITY" in flags:
        score -= 0.15

    # Extra penalty for extreme liq/vol ratio
    if liq_vol_ratio is not None and liq_vol_ratio > 500:
        score -= 0.15

    return max(0.0, min(1.0, score))


def _safe_float(val: Any) -> float | None:
    if val is None:
        return None
    try:
        return float(val)
    except (TypeError, ValueError):
        return None
