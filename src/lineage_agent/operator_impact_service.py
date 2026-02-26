"""
Operator Impact Report — cross-wallet damage ledger for a DNA fingerprint operator.

Given an OperatorFingerprint (shared metadata DNA across multiple deployer wallets),
this service aggregates:
  - Total tokens launched across all linked wallets
  - Total rug confirmations and estimated extracted USD (15% of rugged mcap)
  - Narrative progression timeline (ordered by first appearance)
  - Peak concurrent token count (sliding 24h window)
  - Campaign activity status (any wallet active in last 6 hours)
"""

from __future__ import annotations

import asyncio
import bisect
import logging
from datetime import datetime, timezone
from typing import Literal, Optional

from .data_sources._clients import event_query
from .deployer_service import compute_deployer_profile
from .models import DeployerProfile, OperatorImpactReport

logger = logging.getLogger(__name__)

_EXTRACTION_RATE = 0.15   # Conservative: 15% of rugged mcap
_CAMPAIGN_ACTIVE_SECONDS = 21_600   # 6 hours
_PROFILE_GATHER_TIMEOUT = 15.0


async def compute_operator_impact(
    fingerprint: str,
    linked_wallets: list[str],
) -> Optional[OperatorImpactReport]:
    """Build a cross-wallet damage ledger for an operator fingerprint.

    Args:
        fingerprint:    The 16-char hex DNA fingerprint.
        linked_wallets: All deployer wallets sharing this fingerprint.

    Returns:
        OperatorImpactReport, or None if no data found.
    """
    if not linked_wallets:
        return None
    try:
        return await asyncio.wait_for(
            _build_impact(fingerprint, linked_wallets),
            timeout=20.0,
        )
    except asyncio.TimeoutError:
        logger.warning("compute_operator_impact timed out for fingerprint %s", fingerprint)
        return None
    except Exception:
        logger.exception("compute_operator_impact failed for fingerprint %s", fingerprint)
        return None


async def _build_impact(
    fingerprint: str,
    linked_wallets: list[str],
) -> Optional[OperatorImpactReport]:
    # ── 1. Parallel: deployer profiles for all linked wallets ──────────────
    profile_coros = [compute_deployer_profile(w) for w in linked_wallets]
    profile_results = await asyncio.gather(*profile_coros, return_exceptions=True)
    valid_profiles: list[DeployerProfile] = [
        p for p in profile_results
        if isinstance(p, DeployerProfile)
    ]

    # ── 2. All token_created events across linked wallets ─────────────────
    placeholders = ",".join("?" for _ in linked_wallets)
    created_rows = await event_query(
        f"event_type = 'token_created' AND deployer IN ({placeholders})",
        params=tuple(linked_wallets),
        columns="mint, deployer, name, symbol, narrative, mcap_usd, created_at, recorded_at",
        limit=2000,
        order_by="created_at ASC",
    )

    # ── 3. All token_rugged events for those mints ─────────────────────────
    mints = [r["mint"] for r in created_rows if r.get("mint")]
    rugged_rows: list[dict] = []
    if mints:
        rug_ph = ",".join("?" for _ in mints)
        rugged_rows = await event_query(
            f"event_type = 'token_rugged' AND mint IN ({rug_ph})",
            params=tuple(mints),
            columns="mint, mcap_usd",
            limit=2000,
        )

    rugged_mints = {r["mint"] for r in rugged_rows}
    total_tokens_launched = len(created_rows)
    total_rug_count = len(rugged_mints)
    rug_rate_pct = (
        total_rug_count / total_tokens_launched * 100.0
        if total_tokens_launched > 0 else 0.0
    )

    # ── 4. Estimated extraction: 15% of rugged-time mcap ──────────────────
    estimated_extracted_usd = sum(
        (r.get("mcap_usd") or 0.0) * _EXTRACTION_RATE
        for r in rugged_rows
        if r.get("mcap_usd")
    )

    # ── 5. Active tokens (launched but not rugged) ─────────────────────────
    active_tokens = [
        r["mint"] for r in created_rows
        if r.get("mint") and r["mint"] not in rugged_mints
    ]

    # ── 6. Narrative sequence (ordered by first appearance) ───────────────
    seen_narratives: list[str] = []
    seen_set: set[str] = set()
    for r in created_rows:
        n = r.get("narrative") or "other"
        if n not in seen_set:
            seen_narratives.append(n)
            seen_set.add(n)

    # ── 7. First / last activity timestamps ───────────────────────────────
    timestamps: list[datetime] = []
    for r in created_rows:
        ts_raw = r.get("created_at")
        if ts_raw:
            try:
                ts = datetime.fromisoformat(str(ts_raw).replace("Z", "+00:00"))
                if ts.tzinfo is None:
                    ts = ts.replace(tzinfo=timezone.utc)
                timestamps.append(ts)
            except Exception:
                pass
    first_activity = min(timestamps) if timestamps else None
    last_activity = max(timestamps) if timestamps else None

    # ── 8. Is campaign active? (any token_created in last 6h) ─────────────
    now_epoch = datetime.now(tz=timezone.utc).timestamp()
    recent_rows = await event_query(
        f"event_type = 'token_created' AND deployer IN ({placeholders}) AND recorded_at > ?",
        params=tuple(linked_wallets) + (now_epoch - _CAMPAIGN_ACTIVE_SECONDS,),
        columns="mint",
        limit=1,
    )
    is_campaign_active = len(recent_rows) > 0

    # ── 9. Peak concurrent tokens (sliding 24h window) ─────────────────────
    ts_sorted = sorted(t.timestamp() for t in timestamps)
    peak_concurrent = 0
    for i, start_ts in enumerate(ts_sorted):
        window_end = start_ts + 86_400
        end_idx = bisect.bisect_right(ts_sorted, window_end)
        peak_concurrent = max(peak_concurrent, end_idx - i)

    # ── 10. Confidence ─────────────────────────────────────────────────────
    if len(valid_profiles) >= 3 and total_tokens_launched >= 5:
        confidence: Literal["high", "medium", "low"] = "high"
    elif len(valid_profiles) >= 2 or total_tokens_launched >= 3:
        confidence = "medium"
    else:
        confidence = "low"

    return OperatorImpactReport(
        fingerprint=fingerprint,
        linked_wallets=linked_wallets,
        total_tokens_launched=total_tokens_launched,
        total_rug_count=total_rug_count,
        rug_rate_pct=round(rug_rate_pct, 2),
        estimated_extracted_usd=round(estimated_extracted_usd, 2),
        active_tokens=active_tokens,
        narrative_sequence=seen_narratives,
        is_campaign_active=is_campaign_active,
        peak_concurrent_tokens=peak_concurrent,
        first_activity=first_activity,
        last_activity=last_activity,
        wallet_profiles=valid_profiles,
        confidence=confidence,
    )
