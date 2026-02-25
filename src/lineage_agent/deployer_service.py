"""
Deployer Intelligence Service.

Analyses the historical behaviour of a deployer wallet by querying
``intelligence_events`` and produces a ``DeployerProfile`` summarising:

- Total tokens launched
- Rug count and rug rate
- Average token lifespan
- Preferred narrative category
- First/last activity timestamps

The profile is cached in-process for ``_CACHE_TTL_SECONDS`` to avoid
hammering SQLite with duplicate queries.
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections import Counter
from datetime import datetime, timezone
from typing import Optional

from .data_sources._clients import event_query
from .models import DeployerProfile, DeployerTokenSummary

logger = logging.getLogger(__name__)

_CACHE_TTL_SECONDS = 600  # 10 minutes
_MIN_TOKENS_FOR_HIGH_CONFIDENCE = 5
_MIN_TOKENS_FOR_MEDIUM_CONFIDENCE = 2

# Simple in-process TTL cache: {address: (expires_at, DeployerProfile)}
_profile_cache: dict[str, tuple[float, Optional[DeployerProfile]]] = {}
_cache_lock: Optional[asyncio.Lock] = None


def _get_lock() -> asyncio.Lock:
    global _cache_lock
    if _cache_lock is None:
        _cache_lock = asyncio.Lock()
    return _cache_lock


def _parse_dt(value: object) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            dt = datetime.fromisoformat(value)
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except ValueError:
            return None
    return None


async def compute_deployer_profile(deployer: str) -> Optional[DeployerProfile]:
    """Return a ``DeployerProfile`` for *deployer*, or ``None`` if no data.

    Uses a 10-minute in-process cache keyed by deployer address.
    """
    if not deployer:
        return None

    lock = _get_lock()
    async with lock:
        cached = _profile_cache.get(deployer)
        if cached is not None and time.monotonic() < cached[0]:
            return cached[1]

    try:
        profile = await _build_profile(deployer)
    except Exception as exc:
        logger.debug("compute_deployer_profile failed for %s: %s", deployer, exc)
        profile = None

    async with lock:
        _profile_cache[deployer] = (time.monotonic() + _CACHE_TTL_SECONDS, profile)

    return profile


async def _build_profile(deployer: str) -> Optional[DeployerProfile]:
    """Internal: query intelligence_events and build the profile."""
    # Fetch all creation events for this deployer
    created_rows = await event_query(
        where="event_type = 'token_created' AND deployer = ?",
        params=(deployer,),
        columns="mint, name, symbol, narrative, mcap_usd, created_at, recorded_at",
        limit=500,
    )
    if not created_rows:
        return None

    # Fetch rug events for these mints
    mints = [r["mint"] for r in created_rows if r.get("mint")]
    if not mints:
        return None

    # SQLite IN clause — build parameterised query
    placeholders = ",".join("?" * len(mints))
    rugged_rows = await event_query(
        where=f"event_type = 'token_rugged' AND mint IN ({placeholders})",
        params=tuple(mints),
        columns="mint, rugged_at",
        limit=500,
    )
    rugged_map: dict[str, Optional[datetime]] = {
        r["mint"]: _parse_dt(r.get("rugged_at")) for r in rugged_rows
    }

    # Build individual token summaries
    summaries: list[DeployerTokenSummary] = []
    narrative_counter: Counter[str] = Counter()
    creation_times: list[datetime] = []

    for row in created_rows:
        mint = row.get("mint", "")
        rugged_at = rugged_map.get(mint)
        narrative = row.get("narrative") or ""
        if narrative:
            narrative_counter[narrative] += 1
        created_at = _parse_dt(row.get("created_at") or row.get("recorded_at"))
        if created_at:
            creation_times.append(created_at)
        summaries.append(DeployerTokenSummary(
            mint=mint,
            name=row.get("name") or "",
            symbol=row.get("symbol") or "",
            created_at=created_at,
            rugged_at=rugged_at,
            mcap_usd=row.get("mcap_usd"),
            narrative=narrative,
        ))

    total = len(summaries)
    rug_count = len(rugged_map)

    # Average lifespan of rugged tokens (hours → days)
    lifespans: list[float] = []
    for s in summaries:
        if s.rugged_at and s.created_at:
            delta = (s.rugged_at - s.created_at).total_seconds()
            if delta > 0:
                lifespans.append(delta / 86_400)  # days
    avg_lifespan = sum(lifespans) / len(lifespans) if lifespans else None

    # Active = launched but not yet rugged
    active_tokens = total - rug_count

    preferred_narrative = narrative_counter.most_common(1)[0][0] if narrative_counter else ""

    first_seen = min(creation_times) if creation_times else None
    last_seen = max(creation_times) if creation_times else None

    if total >= _MIN_TOKENS_FOR_HIGH_CONFIDENCE:
        confidence = "high"
    elif total >= _MIN_TOKENS_FOR_MEDIUM_CONFIDENCE:
        confidence = "medium"
    else:
        confidence = "low"

    return DeployerProfile(
        address=deployer,
        total_tokens_launched=total,
        rug_count=rug_count,
        rug_rate_pct=round(rug_count / total * 100, 1) if total else 0.0,
        avg_lifespan_days=round(avg_lifespan, 2) if avg_lifespan is not None else None,
        active_tokens=max(0, active_tokens),
        preferred_narrative=preferred_narrative,
        first_seen=first_seen,
        last_seen=last_seen,
        tokens=summaries,
        confidence=confidence,
    )
