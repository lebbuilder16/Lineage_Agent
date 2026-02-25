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
from datetime import datetime, timedelta, timezone
from typing import Optional

from .data_sources._clients import event_query
from .models import DeathClockForecast

logger = logging.getLogger(__name__)

_MIN_SAMPLES = 2          # minimum rug events to compute forecast
_MAX_STDEV_RATIO = 2.0    # cap stdev at 2× median to avoid absurd windows


async def compute_death_clock(
    deployer: str,
    token_created_at: Optional[datetime],
) -> Optional[DeathClockForecast]:
    """Compute a rug timing forecast for a token based on deployer history.

    Parameters
    ----------
    deployer:
        The deployer wallet address.
    token_created_at:
        On-chain creation timestamp of the token being analysed.

    Returns
    -------
    DeathClockForecast or None if insufficient data.
    """
    if not deployer or not token_created_at:
        return None

    # Fetch historical rug events for this deployer
    rows = await event_query(
        where="deployer = ? AND event_type = 'token_rugged' AND rugged_at IS NOT NULL AND created_at IS NOT NULL",
        params=(deployer,),
        columns="created_at, rugged_at",
    )

    if len(rows) < _MIN_SAMPLES:
        return DeathClockForecast(
            deployer=deployer,
            historical_rug_count=len(rows),
            median_rug_hours=0.0,
            stdev_rug_hours=0.0,
            elapsed_hours=_elapsed_hours(token_created_at),
            risk_level="insufficient_data",
            confidence_note=f"Only {len(rows)} rug event(s) on record — need at least {_MIN_SAMPLES}",
        )

    # Parse durations
    durations_h: list[float] = []
    for row in rows:
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

    median_h = statistics.median(durations_h)
    stdev_h = (
        statistics.stdev(durations_h)
        if len(durations_h) >= 3
        else median_h * 0.30
    )
    # Cap stdev to avoid absurd windows
    stdev_h = min(stdev_h, median_h * _MAX_STDEV_RATIO)

    elapsed_h = _elapsed_hours(token_created_at)
    ratio = elapsed_h / median_h if median_h > 0 else 0.0

    if ratio < 0.5:
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

    return DeathClockForecast(
        deployer=deployer,
        historical_rug_count=len(durations_h),
        median_rug_hours=round(median_h, 2),
        stdev_rug_hours=round(stdev_h, 2),
        elapsed_hours=round(elapsed_h, 2),
        risk_level=risk_level,  # type: ignore[arg-type]
        predicted_window_start=window_start,
        predicted_window_end=window_end,
        confidence_note=f"Based on {len(durations_h)} confirmed rug(s)",
    )


def _elapsed_hours(created_at: datetime) -> float:
    now = datetime.now(tz=timezone.utc)
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    return max(0.0, (now - created_at).total_seconds() / 3600.0)


def _parse_dt(value: str | datetime | None) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    try:
        dt = datetime.fromisoformat(str(value))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (ValueError, TypeError):
        return None
