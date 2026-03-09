"""
Phase 2 — Death Clock: Deployer Rug Timing Forecast.

Uses historical rug events recorded in ``intelligence_events`` for a
deployer to forecast the statistical window when the current token may
be rugged.

Reads from the ``intelligence_events`` table (written by lineage_detector
at analysis time). Requires at least 2 confirmed rug events for the same
deployer to produce a meaningful forecast.
"""

from __future__ import annotations

import logging
import statistics
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Optional

from .data_sources._clients import event_query
from .models import (
    DeathClockForecast,
    EvidenceLevel,
    MarketSignals,
    MarketSurface,
    RugMechanism,
    TokenMetadata,
)
from .rug_detector import normalize_legacy_rug_events
from .utils import parse_datetime as _parse_dt

logger = logging.getLogger(__name__)

_MIN_SAMPLES = 1          # minimum rug events to compute forecast (1 = single-sample mode)
_MAX_STDEV_RATIO = 2.0    # cap stdev at 2× median to avoid absurd windows
_PREDICTIVE_RUG_MECHANISMS = {
    RugMechanism.DEX_LIQUIDITY_RUG.value,
    RugMechanism.PRE_DEX_EXTRACTION_RUG.value,
}
_CONFIRMED_EVIDENCE_LEVELS = {
    EvidenceLevel.MODERATE.value,
    EvidenceLevel.STRONG.value,
}


def _is_confirmed_predictive_rug(row: dict) -> bool:
    mechanism = (row.get("rug_mechanism") or "").strip()
    evidence_level = (row.get("evidence_level") or "").strip()
    if not mechanism:
        return True
    if mechanism not in _PREDICTIVE_RUG_MECHANISMS:
        return False
    if not evidence_level:
        return True
    return evidence_level in _CONFIRMED_EVIDENCE_LEVELS


async def compute_death_clock(
    deployer: str,
    token_created_at: Optional[datetime],
    token_metadata: Optional[TokenMetadata] = None,
) -> Optional[DeathClockForecast]:
    """Compute a rug timing forecast for a token based on deployer history.

    Parameters
    ----------
    deployer:
        The deployer wallet address.
    token_created_at:
        On-chain creation timestamp of the token being analysed.
    token_metadata:
        Optional current market data.  When provided, live market signals
        (low liquidity, sell pressure, price crash) can escalate the
        timing-based ``risk_level`` by one step.

    Returns
    -------
    DeathClockForecast or None if insufficient data.
    """
    if not deployer or not token_created_at:
        return None

    await normalize_legacy_rug_events(deployer=deployer)

    # Fetch historical rug events for this deployer
    rows = await event_query(
        where="deployer = ? AND event_type = 'token_rugged' AND rugged_at IS NOT NULL AND created_at IS NOT NULL",
        params=(deployer,),
        columns="mint, created_at, rugged_at, rug_mechanism, evidence_level",
    )

    total_negative_outcomes = len(rows)
    confirmed_rows = [row for row in rows if _is_confirmed_predictive_rug(row)]
    basis_breakdown = Counter(
        (row.get("rug_mechanism") or RugMechanism.UNKNOWN.value) for row in confirmed_rows
    )

    if len(confirmed_rows) < _MIN_SAMPLES:
        # Zero rug events — no forecast possible at all
        return DeathClockForecast(
            deployer=deployer,
            historical_rug_count=0,
            median_rug_hours=0.0,
            stdev_rug_hours=0.0,
            elapsed_hours=_elapsed_hours(token_created_at),
            risk_level="insufficient_data",
            confidence_note="No prior rug events on record for this deployer",
            sample_count=0,
            confidence_level="low",
            total_negative_outcome_count=total_negative_outcomes,
            basis_breakdown=dict(basis_breakdown),
        )

    # Parse durations
    durations_h: list[float] = []
    for row in confirmed_rows:
        try:
            created = _parse_dt(row["created_at"])
            rugged = _parse_dt(row["rugged_at"])
            if created and rugged and rugged > created:
                hours = (rugged - created).total_seconds() / 3600.0
                durations_h.append(hours)
        except Exception:
            continue

    if len(durations_h) < _MIN_SAMPLES:
        return None

    single_sample = len(durations_h) == 1
    median_h = statistics.median(durations_h)

    if single_sample:
        # Single rug in history: use a ±50% band to communicate low confidence
        stdev_h = median_h * 0.5
    else:
        stdev_h = (
            statistics.stdev(durations_h)
            if len(durations_h) >= 3
            else median_h * 0.30
        )
        # Cap stdev to avoid absurd windows
        stdev_h = min(stdev_h, median_h * _MAX_STDEV_RATIO)

    elapsed_h = _elapsed_hours(token_created_at)
    ratio = elapsed_h / median_h if median_h > 0 else 0.0

    if single_sample:
        # Single-sample mode: always show as "first_rug" regardless of elapsed ratio
        risk_level = "first_rug"
    elif ratio < 0.5:
        risk_level = "low"
    elif ratio < 0.8:
        risk_level = "medium"
    elif ratio < 1.0:
        risk_level = "high"
    else:
        risk_level = "critical"

    # Compute absolute predicted window
    window_start = token_created_at + timedelta(hours=max(0.0, median_h - stdev_h))
    window_end = token_created_at + timedelta(hours=median_h + stdev_h)

    # Ensure timezone-aware
    if token_created_at.tzinfo is None:
        token_created_at = token_created_at.replace(tzinfo=timezone.utc)
        window_start = window_start.replace(tzinfo=timezone.utc)
        window_end = window_end.replace(tzinfo=timezone.utc)

    # Compute confidence level based on sample count
    if len(durations_h) >= 5:
        _confidence_level = "high"
    elif len(durations_h) >= 2:
        _confidence_level = "medium"
    else:
        _confidence_level = "low"

    return DeathClockForecast(
        deployer=deployer,
        historical_rug_count=len(durations_h),
        median_rug_hours=round(median_h, 2),
        stdev_rug_hours=round(stdev_h, 2),
        elapsed_hours=round(elapsed_h, 2),
        risk_level=risk_level,  # type: ignore[arg-type]
        predicted_window_start=window_start,
        predicted_window_end=window_end,
        sample_count=len(durations_h),
        confidence_level=_confidence_level,  # type: ignore[arg-type]
        total_negative_outcome_count=total_negative_outcomes,
        basis_breakdown=dict(basis_breakdown),
        confidence_note=(
            "Single prior rug — estimate based on 1 data point (\u00b150% window)"
            if single_sample
            else f"Based on {len(durations_h)} confirmed rug(s)"
        ),
        market_signals=_compute_market_signals(token_metadata, risk_level),
    )


def _elapsed_hours(created_at: datetime) -> float:
    now = datetime.now(tz=timezone.utc)
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    return max(0.0, (now - created_at).total_seconds() / 3600.0)


# ---------------------------------------------------------------------------
# Market signal helpers
# ---------------------------------------------------------------------------

# Risk escalation order (each step escalates by one level)
_RISK_ESCALATION: dict[str, str] = {
    "low": "medium",
    "medium": "high",
    "high": "critical",
    "critical": "critical",   # already at max
    "first_rug": "first_rug",  # single-sample mode — don't escalate
    "insufficient_data": "insufficient_data",
}

# Thresholds that trigger a risk boost
_LOW_LIQ_USD = 500.0          # below this liquidity → suspicious
_LOW_LIQ_MCAP_RATIO = 0.005   # liquidity < 0.5 % of mcap → typical pre-rug setup


def _compute_market_signals(
    metadata: Optional[TokenMetadata],
    timing_risk: str,
) -> Optional[MarketSignals]:
    """Derive :class:`MarketSignals` from token metadata fields.

    No extra RPC or HTTP calls are made — only uses the already-fetched
    ``TokenMetadata`` fields (``liquidity_usd``, ``market_cap_usd``).

    Returns ``None`` when no metadata is provided.

    Parameters
    ----------
    metadata:
        Enriched token metadata (may have ``None`` fields).
    timing_risk:
        The timing-based risk level *before* market adjustment.

    Returns
    -------
    MarketSignals with ``adjusted_risk_boost`` reflecting how many steps
    the market data would escalate the timing risk, or ``None`` when
    ``metadata is None``.
    """
    if metadata is None:
        return None

    if metadata.market_surface != MarketSurface.DEX_POOL_OBSERVED:
        return None

    liq = metadata.liquidity_usd
    mcap = metadata.market_cap_usd

    boost = 0.0

    # Signal 1 — dangerously low absolute liquidity
    if liq is not None and liq < _LOW_LIQ_USD:
        boost += 1.0
        logger.debug(
            "[death_clock] market signal: liq=%.2f < %.0f → boost +1",
            liq, _LOW_LIQ_USD,
        )

    # Signal 2 — liquidity / mcap ratio indicates pre-rug LP drain
    liq_mcap_ratio: Optional[float] = None
    if liq is not None and mcap is not None and mcap > 0:
        liq_mcap_ratio = liq / mcap
        if liq_mcap_ratio < _LOW_LIQ_MCAP_RATIO:
            boost += 1.0
            logger.debug(
                "[death_clock] market signal: liq/mcap=%.4f < %.3f → boost +1",
                liq_mcap_ratio, _LOW_LIQ_MCAP_RATIO,
            )

    # Cap boost at 3 (matches model Field constraint)
    boost = min(3.0, boost)

    return MarketSignals(
        liquidity_usd=liq,
        market_cap_usd=mcap,
        liq_to_mcap_ratio=round(liq_mcap_ratio, 6) if liq_mcap_ratio is not None else None,
        adjusted_risk_boost=boost,
    )


# _parse_dt is now imported from .utils (unified parse_datetime)
