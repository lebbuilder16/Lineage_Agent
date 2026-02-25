"""
Phase 6 — Narrative Timing Index.

Positions a token within the lifecycle of its narrative category
(e.g. "pepe", "ai", "trump") using historical data accumulated across
all previous lineage analyses.

Uses slugging window analysis to find peak periods and where the current
token sits relative to the narrative's full lifecycle.

Requires ≥10 tokens in the same narrative category to produce a forecast.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Optional

from .data_sources._clients import event_query
from .factory_service import classify_narrative
from .models import NarrativeTimingReport, TokenMetadata

logger = logging.getLogger(__name__)

_MIN_SAMPLE = 10
_LOOKBACK_DAYS = 90        # only consider events from past 90 days
_PEAK_WINDOW_DAYS = 7      # sliding window size for peak detection


async def compute_narrative_timing(
    token: TokenMetadata,
) -> Optional[NarrativeTimingReport]:
    """Return a NarrativeTimingReport for the given token.

    Returns None only on hard errors; returns a report with
    status="insufficient_data" when sample is too small.
    """
    narrative = classify_narrative(token.name, token.symbol)

    cutoff = time.time() - _LOOKBACK_DAYS * 86400
    rows = await event_query(
        where="narrative = ? AND event_type = 'token_created' AND recorded_at > ? AND created_at IS NOT NULL ORDER BY created_at",
        params=(narrative, cutoff),
        columns="created_at, mcap_usd",
    )

    if len(rows) < _MIN_SAMPLE:
        return NarrativeTimingReport(
            narrative=narrative,
            sample_size=len(rows),
            status="insufficient_data",
            interpretation=f"Only {len(rows)} tokens on record for '{narrative}' — need {_MIN_SAMPLE}",
        )

    # Parse timestamps
    timestamps: list[datetime] = []
    for row in rows:
        dt = _parse_dt(row.get("created_at"))
        if dt:
            timestamps.append(dt)
    timestamps.sort()
    total = len(timestamps)

    # ── Find peak: 7-day sliding window with highest count ────────────────
    peak_date, peak_count = _find_peak(timestamps)

    now = datetime.now(tz=timezone.utc)
    days_since_peak = max(0, (now - peak_date).days) if peak_date else None

    # ── Momentum: tokens launched in past 7d vs peak window ───────────────
    recent_count = _count_in_window(timestamps, now - timedelta(days=_PEAK_WINDOW_DAYS), now)
    momentum = (recent_count / peak_count) if peak_count > 0 else 0.0

    # ── Cycle percentile: where is this token in the sequence? ────────────
    token_created = token.created_at
    if token_created is None:
        token_created = now
    if token_created.tzinfo is None:
        token_created = token_created.replace(tzinfo=timezone.utc)

    tokens_before = sum(1 for t in timestamps if t < token_created)
    cycle_percentile = tokens_before / total if total > 0 else 0.5

    # ── Status ────────────────────────────────────────────────────────────
    if cycle_percentile < 0.20:
        status = "early"
    elif cycle_percentile < 0.50:
        status = "rising"
    elif cycle_percentile < 0.75:
        status = "peak"
    else:
        status = "late"

    interpretation = (
        f"Token #{tokens_before + 1} of {total} in the '{narrative}' narrative "
        f"({int(cycle_percentile * 100)}th percentile). "
        f"Momentum: {int(momentum * 100)}% of peak."
    )

    return NarrativeTimingReport(
        narrative=narrative,
        sample_size=total,
        status=status,  # type: ignore[arg-type]
        cycle_percentile=round(cycle_percentile, 3),
        momentum_score=round(min(momentum, 1.0), 3),
        days_since_peak=days_since_peak,
        peak_date=peak_date,
        interpretation=interpretation,
    )


def _find_peak(timestamps: list[datetime]) -> tuple[Optional[datetime], int]:
    """Return (peak_window_start, count) using a sliding 7-day window."""
    if not timestamps:
        return None, 0

    best_start: Optional[datetime] = None
    best_count = 0

    for t in timestamps:
        window_end = t + timedelta(days=_PEAK_WINDOW_DAYS)
        count = _count_in_window(timestamps, t, window_end)
        if count > best_count:
            best_count = count
            best_start = t

    if best_start:
        # Return midpoint of the best window
        peak_mid = best_start + timedelta(days=_PEAK_WINDOW_DAYS // 2)
        return peak_mid, best_count
    return None, 0


def _count_in_window(
    timestamps: list[datetime],
    start: datetime,
    end: datetime,
) -> int:
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    return sum(1 for t in timestamps if start <= t < end)


def _parse_dt(value: str | datetime | None) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value
    try:
        dt = datetime.fromisoformat(str(value))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (ValueError, TypeError):
        return None
