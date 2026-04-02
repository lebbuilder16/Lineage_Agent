"""Daily usage counter service for the tier system.

Tracks per-user daily usage counters (scans, chat messages, etc.) stored in SQLite.
"""

import datetime
import time


async def increment_usage(cache, user_id: int, counter_key: str) -> int:
    """Increment today's counter for user_id/counter_key, return new count."""
    conn = await cache._get_conn()
    date_key = datetime.date.today().isoformat()
    now = time.time()

    await conn.execute(
        """INSERT INTO usage_counters (user_id, counter_key, date_key, count, updated_at)
           VALUES (?, ?, ?, 1, ?)
           ON CONFLICT(user_id, counter_key, date_key)
           DO UPDATE SET count = count + 1, updated_at = ?""",
        (user_id, counter_key, date_key, now, now),
    )
    await conn.commit()

    cursor = await conn.execute(
        "SELECT count FROM usage_counters WHERE user_id = ? AND counter_key = ? AND date_key = ?",
        (user_id, counter_key, date_key),
    )
    row = await cursor.fetchone()
    return row[0]


async def get_usage(cache, user_id: int, counter_key: str) -> int:
    """Return today's count for counter_key. Returns 0 if no entry."""
    conn = await cache._get_read_conn() if hasattr(cache, '_get_read_conn') else await cache._get_conn()
    date_key = datetime.date.today().isoformat()

    cursor = await conn.execute(
        "SELECT count FROM usage_counters WHERE user_id = ? AND counter_key = ? AND date_key = ?",
        (user_id, counter_key, date_key),
    )
    row = await cursor.fetchone()
    return row[0] if row else 0


async def check_limit(cache, user_id: int, counter_key: str, limit: int) -> bool:
    """Return True if under limit. -1 means unlimited (always True)."""
    if limit == -1:
        return True
    current = await get_usage(cache, user_id, counter_key)
    return current < limit
