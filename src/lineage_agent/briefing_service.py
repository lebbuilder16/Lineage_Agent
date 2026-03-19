"""Briefing service — generates daily briefings for users with active watchlists."""
from __future__ import annotations

import asyncio
import datetime
import logging
import time

logger = logging.getLogger(__name__)

BRIEFING_HOUR_UTC = 8  # Generate briefings at 08:00 UTC


async def generate_briefing(user_id: int, cache) -> str | None:
    """Generate a daily briefing for a user based on their watchlist.

    Returns markdown string or None if no watchlist.
    """
    try:
        db = await cache._get_conn()
        cursor = await db.execute(
            "SELECT value FROM user_watches WHERE user_id = ? AND sub_type = 'mint'",
            (user_id,)
        )
        watches = await cursor.fetchall()
        if not watches:
            return None

        mints = [w[0] for w in watches]

        # Gather lineage data for watched tokens
        from .lineage_core import detect_lineage, get_cached_lineage_report
        from .chat_service import build_rich_context

        summaries = []
        for mint in mints[:20]:  # Cap at 20 to limit cost
            try:
                lin = await get_cached_lineage_report(mint)
                if lin is None:
                    lin = await asyncio.wait_for(detect_lineage(mint), timeout=15.0)
                if lin:
                    ctx = build_rich_context(lin)
                    summaries.append(f"### {mint[:8]}...\n{ctx[:500]}")
            except Exception:
                summaries.append(f"### {mint[:8]}...\nScan failed")

        if not summaries:
            return None

        # Generate briefing with Claude
        from .ai_analyst import _get_client

        prompt = (
            "You are a Solana security analyst generating a daily briefing.\n"
            "Summarize the risk status of these watched tokens in a concise, "
            "actionable morning briefing. Use bullet points. Highlight any risk "
            "escalations or notable changes. Keep it under 500 words.\n\n"
            "Language: English\n\n"
            + "\n\n".join(summaries)
        )

        client = _get_client()
        response = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=800,
            messages=[{"role": "user", "content": prompt}],
        )

        return response.content[0].text
    except Exception as exc:
        logger.warning("generate_briefing failed for user %s: %s", user_id, exc)
        return None


async def store_briefing(cache, user_id: int, content: str) -> None:
    """Store a generated briefing in the database."""
    db = await cache._get_conn()
    await db.execute(
        "INSERT INTO briefings (user_id, content, created_at) VALUES (?, ?, ?)",
        (user_id, content, time.time())
    )
    await db.commit()


async def get_latest_briefing(cache, user_id: int) -> dict | None:
    """Get the most recent briefing for a user."""
    db = await cache._get_conn()
    cursor = await db.execute(
        "SELECT id, content, created_at FROM briefings WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
        (user_id,)
    )
    row = await cursor.fetchone()
    if not row:
        return None
    return {"id": row[0], "content": row[1], "created_at": row[2]}


async def get_briefing_history(cache, user_id: int, limit: int = 7) -> list[dict]:
    """Get recent briefings for a user."""
    db = await cache._get_conn()
    cursor = await db.execute(
        "SELECT id, content, created_at FROM briefings WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
        (user_id, min(limit, 30))
    )
    rows = await cursor.fetchall()
    return [{"id": r[0], "content": r[1], "created_at": r[2]} for r in rows]


async def schedule_briefing_sweep(cache) -> None:
    """Background task that generates daily briefings at BRIEFING_HOUR_UTC.

    Runs forever — call as asyncio.create_task() on startup.
    """
    logger.info("[briefing] sweep task started (hour=%d UTC)", BRIEFING_HOUR_UTC)
    while True:
        try:
            now = datetime.datetime.now(datetime.timezone.utc)
            # Calculate next run time
            next_run = now.replace(hour=BRIEFING_HOUR_UTC, minute=0, second=0, microsecond=0)
            if now >= next_run:
                next_run += datetime.timedelta(days=1)

            wait_secs = (next_run - now).total_seconds()
            logger.info("[briefing] next sweep at %s (in %.0f seconds)", next_run.isoformat(), wait_secs)
            await asyncio.sleep(wait_secs)

            # Run the sweep
            logger.info("[briefing] starting sweep")
            db = await cache._get_conn()
            cursor = await db.execute(
                "SELECT DISTINCT u.id FROM users u "
                "INNER JOIN user_watches uw ON u.id = uw.user_id "
                "WHERE uw.sub_type = 'mint'"
            )
            users = await cursor.fetchall()

            generated = 0
            for (uid,) in users:
                content = await generate_briefing(uid, cache)
                if content:
                    await store_briefing(cache, uid, content)
                    generated += 1
                # Small delay between users to avoid rate limits
                await asyncio.sleep(2)

            logger.info("[briefing] sweep complete: %d briefings generated for %d users", generated, len(users))
        except asyncio.CancelledError:
            logger.info("[briefing] sweep task cancelled")
            break
        except Exception:
            logger.exception("[briefing] sweep failed, retrying in 1h")
            await asyncio.sleep(3600)
