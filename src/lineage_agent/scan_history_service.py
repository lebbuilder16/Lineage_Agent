"""
scan_history_service.py — Per-user token scan history and evolution tracking.

Stores a compact snapshot on every authenticated /lineage call,
then computes a ScanDelta between the two most recent snapshots so the
frontend can show how a token's risk profile has evolved.

Retention rules:
- Free plan : keep the 3 most recent snapshots per (user_id, mint)
- Pro plan  : keep 90 days of snapshots per (user_id, mint)

The delta_narrative() call (LLM) is intentionally deferred to the
API layer and triggered only when the user requests share content —
never on every scan.
"""

from __future__ import annotations

import json
import logging
import time
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from .models import LineageResult, ScanDelta, ScanSnapshot

logger = logging.getLogger(__name__)

_FREE_MAX_SCANS = 3
_PRO_RETENTION_DAYS = 90


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _extract_risk_score(result: "LineageResult") -> int:
    """Compute a heuristic risk score 0-100 from a LineageResult."""
    try:
        from .ai_analyst import _heuristic_score  # local import — avoids circular dep
        return _heuristic_score(result, getattr(result, "bundle_report", None), None)
    except Exception:
        return 0


def _extract_flags(result: "LineageResult") -> list[str]:
    """Extract active signal flag strings from a LineageResult."""
    flags: list[str] = []

    bundle = result.bundle_report
    if bundle:
        v = bundle.overall_verdict
        if v == "confirmed_team_extraction":
            flags.append("BUNDLE_CONFIRMED")
        elif v == "suspected_team_extraction":
            flags.append("BUNDLE_SUSPECTED")
        elif v == "coordinated_dump_unknown_team":
            flags.append("COORDINATED_DUMP")

    insider = result.insider_sell
    if insider:
        if insider.verdict == "insider_dump":
            flags.append("INSIDER_DUMP")
        elif insider.verdict == "suspicious":
            flags.append("INSIDER_SUSPICIOUS")

    if result.zombie_alert:
        flags.append("ZOMBIE_ALERT")

    dc = result.death_clock
    if dc:
        if dc.risk_level == "critical":
            flags.append("DEATH_CLOCK_CRITICAL")
        elif dc.risk_level == "high":
            flags.append("DEATH_CLOCK_HIGH")

    fr = result.factory_rhythm
    if fr and fr.is_factory:
        flags.append("FACTORY_DETECTED")

    cr = result.cartel_report
    if cr and cr.deployer_community:
        flags.append("CARTEL_LINKED")

    oi = result.operator_impact
    if oi and getattr(oi, "confirmed_rug_rate_pct", oi.rug_rate_pct) >= 50:
        flags.append("SERIAL_RUGGER")

    return flags


def _build_snapshot_dict(result: "LineageResult") -> dict:
    """Build the compact dict stored as snapshot_json."""
    risk_score = _extract_risk_score(result)
    flags = _extract_flags(result)

    qt = result.query_token or result.root
    token_name = (qt.name or "") if qt else ""
    token_symbol = (qt.symbol or "") if qt else ""

    dp = result.deployer_profile
    rug_count = dp.rug_count if dp else 0

    dc = result.death_clock
    bundle = result.bundle_report
    insider = result.insider_sell

    return {
        "risk_score": risk_score,
        "flags": flags,
        "family_size": result.family_size,
        "rug_count": rug_count,
        "death_clock_risk": dc.risk_level if dc else "",
        "bundle_verdict": bundle.overall_verdict if bundle else "",
        "insider_verdict": insider.verdict if insider else "",
        "zombie_detected": result.zombie_alert is not None,
        "token_name": token_name,
        "token_symbol": token_symbol,
    }


async def _enforce_retention(db, user_id: int, mint: str, plan: str) -> None:
    """Prune rows beyond the plan's retention limit."""
    if plan == "pro":
        cutoff = time.time() - (_PRO_RETENTION_DAYS * 86400)
        await db.execute(
            "DELETE FROM scan_history WHERE user_id=? AND mint=? AND scanned_at < ?",
            (user_id, mint, cutoff),
        )
    else:
        # Free plan: keep only the 3 most recent rows
        await db.execute(
            """
            DELETE FROM scan_history
            WHERE user_id=? AND mint=? AND id NOT IN (
                SELECT id FROM scan_history
                WHERE user_id=? AND mint=?
                ORDER BY scanned_at DESC
                LIMIT ?
            )
            """,
            (user_id, mint, user_id, mint, _FREE_MAX_SCANS),
        )
    await db.commit()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def save_snapshot(
    cache,
    user_id: int,
    mint: str,
    result: "LineageResult",
    plan: str = "free",
) -> "Optional[ScanSnapshot]":
    """
    Persist a scan snapshot for (user_id, mint) and enforce plan retention.

    Returns the saved ScanSnapshot (with scan_number) or None on error.
    This function is designed to be called fire-and-forget via asyncio.create_task.
    """
    from .models import ScanSnapshot  # local import — models imported at runtime

    try:
        snap_dict = _build_snapshot_dict(result)
        db = await cache._get_conn()
        now = time.time()

        await db.execute(
            """
            INSERT INTO scan_history
                (user_id, mint, scanned_at, risk_score, flags_json,
                 family_size, rug_count, snapshot_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id, mint, now,
                snap_dict["risk_score"],
                json.dumps(snap_dict["flags"]),
                snap_dict["family_size"],
                snap_dict["rug_count"],
                json.dumps(snap_dict),
            ),
        )
        await db.commit()

        # Enforce plan retention after insert
        await _enforce_retention(db, user_id, mint, plan)

        # Determine scan_number (position in ordered history)
        cursor = await db.execute(
            "SELECT id FROM scan_history WHERE user_id=? AND mint=? "
            "ORDER BY scanned_at ASC",
            (user_id, mint),
        )
        rows = await cursor.fetchall()
        scan_number = len(rows)
        last_id = rows[-1][0] if rows else 0

        return ScanSnapshot(
            snapshot_id=last_id,
            user_id=user_id,
            mint=mint,
            scanned_at=datetime.fromtimestamp(now, tz=timezone.utc),
            scan_number=scan_number,
            **snap_dict,
        )

    except Exception:
        logger.warning(
            "save_snapshot failed for user=%s mint=%s",
            user_id, mint[:8], exc_info=True,
        )
        return None


async def get_snapshots(
    cache,
    user_id: int,
    mint: str,
    plan: str = "free",
) -> "list[ScanSnapshot]":
    """
    Return scan history for (user_id, mint), oldest first.

    Free plan: at most 3 snapshots.
    Pro plan : up to 90 days of snapshots.
    """
    from .models import ScanSnapshot

    try:
        db = await cache._get_conn()
        limit = _FREE_MAX_SCANS if plan != "pro" else 10_000

        cursor = await db.execute(
            "SELECT id, scanned_at, snapshot_json FROM scan_history "
            "WHERE user_id=? AND mint=? ORDER BY scanned_at ASC LIMIT ?",
            (user_id, mint, limit),
        )
        rows = await cursor.fetchall()

        snapshots: list[ScanSnapshot] = []
        for i, (row_id, scanned_at, snap_json) in enumerate(rows, start=1):
            d = json.loads(snap_json)
            snapshots.append(
                ScanSnapshot(
                    snapshot_id=row_id,
                    user_id=user_id,
                    mint=mint,
                    scanned_at=datetime.fromtimestamp(scanned_at, tz=timezone.utc),
                    scan_number=i,
                    **d,
                )
            )
        return snapshots

    except Exception:
        logger.warning(
            "get_snapshots failed for user=%s mint=%s",
            user_id, mint[:8], exc_info=True,
        )
        return []


def compute_delta(snap_a: "ScanSnapshot", snap_b: "ScanSnapshot") -> "ScanDelta":
    """
    Compute the evolution delta from snap_a (older) to snap_b (newer).

    Pure function — no I/O, safe to call synchronously.
    """
    from .models import ScanDelta

    risk_delta = snap_b.risk_score - snap_a.risk_score
    new_flags = [f for f in snap_b.flags if f not in snap_a.flags]
    resolved_flags = [f for f in snap_a.flags if f not in snap_b.flags]
    family_delta = snap_b.family_size - snap_a.family_size
    rug_delta = snap_b.rug_count - snap_a.rug_count
    confirmed_rug_delta = getattr(snap_b, "confirmed_rug_count", 0) - getattr(snap_a, "confirmed_rug_count", 0)

    # Critical flags that always escalate the trend
    _critical = {"BUNDLE_CONFIRMED", "INSIDER_DUMP", "DEATH_CLOCK_CRITICAL", "ZOMBIE_ALERT"}
    has_new_critical = bool(set(new_flags) & _critical)

    if risk_delta > 5 or has_new_critical:
        trend: str = "worsening"
    elif risk_delta < -5 or (resolved_flags and not new_flags):
        trend = "improving"
    else:
        trend = "stable"

    return ScanDelta(
        mint=snap_b.mint,
        current_scan=snap_b,
        previous_scan=snap_a,
        scan_number=snap_b.scan_number,
        risk_score_delta=risk_delta,
        new_flags=new_flags,
        resolved_flags=resolved_flags,
        family_size_delta=family_delta,
        rug_count_delta=rug_delta,
        confirmed_rug_count_delta=confirmed_rug_delta,
        trend=trend,
    )
