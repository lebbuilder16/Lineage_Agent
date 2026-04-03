"""
Server-side OpenClaw cron lifecycle management.

Creates, updates, and deletes crons in ``user_crons`` when watches are
added/removed and when users login.  The mobile no longer creates crons —
it only reads them via ``cron.list``.

The existing ``_cron_sweep_loop`` in ``openclaw_gateway.py`` fires these
crons and routes them to ``run_single_rescan`` or ``generate_briefing``.
"""

from __future__ import annotations

import json
import logging
import time
import uuid

logger = logging.getLogger(__name__)

# ── Naming conventions (must match openclaw_gateway._execute_cron_job) ────

_WATCH_CRON_PREFIX = "lineage:watchlist"
_BRIEFING_CRON_NAME = "lineage:briefing"

# ── Briefing prompt text (matches mobile createBriefingCron payload) ──────

_BRIEFING_TEXT = (
    "IMPORTANT: Always respond in English regardless of user language.\n"
    "Generate the daily Lineage security briefing.\n"
    "Use the Lineage skill to:\n"
    "1. Check global stats (tokens scanned, rugs, rug rate)\n"
    "2. Summarize high-risk alerts from the last 24h\n"
    "3. Review each watchlisted token and deployer for new risks\n"
    "4. Identify trending threats or new cartel activity\n"
    "Format as a concise markdown briefing with sections."
)

# ── Default sweep interval ────────────────────────────────────────────────

_DEFAULT_SWEEP_SECONDS = 2700  # 45 min


# ── Helpers ───────────────────────────────────────────────────────────────


def seconds_to_cron_expr(seconds: int) -> str:
    """Convert a sweep interval in seconds to a 5-field cron expression.

    Rounds to the nearest clean minute or hour interval.
    """
    minutes = max(1, seconds // 60)

    if minutes < 60:
        # Minute-level: pick the closest factor of 60
        clean = [1, 2, 3, 4, 5, 6, 10, 12, 15, 20, 30, 45]
        m = min(clean, key=lambda c: abs(c - minutes))
        return f"*/{m} * * * *"

    hours = minutes // 60
    clean_h = [1, 2, 3, 4, 6, 8, 12]
    h = min(clean_h, key=lambda c: abs(c - hours))
    return f"0 */{h} * * *"


def _cron_id() -> str:
    return f"cron-{uuid.uuid4().hex[:12]}"


async def _upsert_cron(
    cache, user_id: int, name: str, schedule: dict, text: str, enabled: bool = True,
) -> str:
    """Insert or replace a cron by (user_id, name). Returns the new cron ID."""
    cron_id = _cron_id()
    schedule_json = json.dumps(schedule)
    payload_json = json.dumps({"type": "agentTurn", "message": text})
    delivery_json = json.dumps({"mode": "announce"})
    enabled_int = 1 if enabled else 0

    db = await cache._get_conn()
    await db.execute(
        "DELETE FROM user_crons WHERE user_id = ? AND name = ?",
        (user_id, name),
    )
    await db.execute(
        "INSERT INTO user_crons (id, user_id, name, schedule, payload, delivery, enabled, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (cron_id, user_id, name, schedule_json, payload_json, delivery_json, enabled_int, time.time()),
    )
    await db.commit()
    return cron_id


# ── Public API ────────────────────────────────────────────────────────────


async def _get_sweep_interval(cache, user_id: int) -> int:
    """Read sweep_interval from agent_prefs (seconds). Default 2700."""
    try:
        db = await cache._get_conn()
        cursor = await db.execute(
            "SELECT sweep_interval FROM agent_prefs WHERE user_id = ?", (user_id,),
        )
        row = await cursor.fetchone()
        if row and row[0]:
            return int(row[0])
    except Exception:
        pass
    return _DEFAULT_SWEEP_SECONDS


async def ensure_watch_cron(cache, user_id: int, watch: dict, plan: str = "free", sweep_interval_s: int | None = None) -> str:
    """Create or update the cron for a single watch. Returns the cron ID."""
    if sweep_interval_s is None:
        # Plan dictates interval: Elite=15min, others=30min
        if plan == "elite":
            sweep_interval_s = 900   # 15 min
        else:
            sweep_interval_s = 1800  # 30 min

    watch_id = watch["id"]
    value = watch.get("value", "")
    sub_type = watch.get("sub_type", "mint")
    label = value[:12]

    name = f"{_WATCH_CRON_PREFIX}:{watch_id}"
    cron_expr = seconds_to_cron_expr(sweep_interval_s)

    if sub_type == "mint":
        text = f"Re-scan Lineage token {value} ({label}). Use the Lineage skill to fetch updated risk data. If risk score > 70, send an alert."
    else:
        text = f"Re-scan Lineage deployer {value} ({label}). Check for new tokens launched and rug activity. Alert if new rugs detected."

    cron_id = await _upsert_cron(
        cache, user_id, name,
        schedule={"kind": "cron", "at": cron_expr},
        text=text,
    )
    logger.info("[cron-mgr] watch cron created: user=%s watch=%s schedule=%s", user_id, watch_id, cron_expr)
    return cron_id


async def remove_watch_cron(cache, user_id: int, watch_id: int) -> bool:
    """Delete the cron associated with a watch. Returns True if deleted."""
    name = f"{_WATCH_CRON_PREFIX}:{watch_id}"
    db = await cache._get_conn()
    cursor = await db.execute(
        "DELETE FROM user_crons WHERE user_id = ? AND name = ?",
        (user_id, name),
    )
    await db.commit()
    deleted = cursor.rowcount > 0
    if deleted:
        logger.info("[cron-mgr] watch cron removed: user=%s watch=%s", user_id, watch_id)
    return deleted


async def ensure_briefing_cron(cache, user_id: int, hour: int = 8, plan: str = "free") -> str | None:
    """Create or update the daily briefing cron. Returns cron ID or None if plan disallows."""
    from .subscription_tiers import get_limits
    limits = get_limits(plan)
    if limits.max_briefings <= 0:
        return None

    cron_id = await _upsert_cron(
        cache, user_id, _BRIEFING_CRON_NAME,
        schedule={"kind": "cron", "at": f"0 {hour} * * *"},
        text=_BRIEFING_TEXT,
    )
    logger.info("[cron-mgr] briefing cron created: user=%s hour=%s", user_id, hour)
    return cron_id


async def remove_briefing_cron(cache, user_id: int) -> bool:
    """Delete the briefing cron for a user."""
    db = await cache._get_conn()
    cursor = await db.execute(
        "DELETE FROM user_crons WHERE user_id = ? AND name = ?",
        (user_id, _BRIEFING_CRON_NAME),
    )
    await db.commit()
    deleted = cursor.rowcount > 0
    if deleted:
        logger.info("[cron-mgr] briefing cron removed: user=%s", user_id)
    return deleted


async def sync_all_user_crons(cache, user_id: int, plan: str = "free") -> int:
    """Ensure every watch has a cron and briefing is set up. Returns crons synced."""
    db = await cache._get_conn()

    # 1. Fetch all user watches
    cursor = await db.execute(
        "SELECT id, sub_type, value FROM user_watches WHERE user_id = ?",
        (user_id,),
    )
    watches = [{"id": r[0], "sub_type": r[1], "value": r[2]} for r in await cursor.fetchall()]

    # 2. Fetch existing watch crons
    cursor = await db.execute(
        "SELECT name FROM user_crons WHERE user_id = ? AND name LIKE ?",
        (user_id, f"{_WATCH_CRON_PREFIX}:%"),
    )
    existing_cron_names = {r[0] for r in await cursor.fetchall()}

    synced = 0

    # 4. Add missing watch crons
    watch_names = set()
    for w in watches:
        cron_name = f"{_WATCH_CRON_PREFIX}:{w['id']}"
        watch_names.add(cron_name)
        if cron_name not in existing_cron_names:
            await ensure_watch_cron(cache, user_id, w, plan=plan)
            synced += 1

    # 5. Remove orphaned crons (watch deleted but cron still exists)
    orphans = existing_cron_names - watch_names
    for orphan_name in orphans:
        await db.execute(
            "DELETE FROM user_crons WHERE user_id = ? AND name = ?",
            (user_id, orphan_name),
        )
        synced += 1
    if orphans:
        await db.commit()
        logger.info("[cron-mgr] removed %d orphan crons for user=%s", len(orphans), user_id)

    # 6. Briefing cron
    from .subscription_tiers import get_limits
    limits = get_limits(plan)

    if limits.max_briefings > 0:
        # Read briefing prefs
        cursor = await db.execute(
            "SELECT daily_briefing, briefing_hour FROM agent_prefs WHERE user_id = ?",
            (user_id,),
        )
        row = await cursor.fetchone()
        daily_briefing = bool(row[0]) if row else True
        briefing_hour = row[1] if row else 8

        if daily_briefing:
            # Check if briefing cron already exists with correct schedule
            cursor = await db.execute(
                "SELECT schedule FROM user_crons WHERE user_id = ? AND name = ?",
                (user_id, _BRIEFING_CRON_NAME),
            )
            existing_briefing = await cursor.fetchone()
            expected_schedule = json.dumps({"kind": "cron", "at": f"0 {briefing_hour} * * *"})
            if not existing_briefing or existing_briefing[0] != expected_schedule:
                await ensure_briefing_cron(cache, user_id, briefing_hour, plan)
                synced += 1
        else:
            await remove_briefing_cron(cache, user_id)
    else:
        await remove_briefing_cron(cache, user_id)

    if synced > 0:
        logger.info("[cron-mgr] synced %d crons for user=%s", synced, user_id)
    return synced
