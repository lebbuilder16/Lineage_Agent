"""Briefing service — generates daily briefings for users with active watchlists.

Key improvements over v1:
- Respects each user's configured briefing_hour (not hardcoded 8 UTC)
- Includes delta "since last briefing" (new rugs, score changes, deployer exits)
- Enriched context from forensic signals (insider sell, market anomalies)
- Push notification in English
"""
from __future__ import annotations

import asyncio
import datetime
import json
import logging
import time
from typing import Any, Optional

logger = logging.getLogger(__name__)

_DEFAULT_BRIEFING_HOUR = 8  # Fallback if user has no preference
_SWEEP_CHECK_INTERVAL = 300  # Check every 5 minutes which users are due


# ── Public API ────────────────────────────────────────────────────────────────


async def generate_briefing(user_id: int, cache) -> str | None:
    """Generate a daily briefing for a user based on their watchlist.

    Includes delta events since the last briefing (rugs, score changes,
    deployer exits) and enriched forensic context.

    Returns markdown string or None if no watchlist.
    """
    try:
        db = await cache._get_conn()

        # Fetch watched mints
        cursor = await db.execute(
            "SELECT value FROM user_watches WHERE user_id = ? AND sub_type IN ('mint', 'token')",
            (user_id,),
        )
        watches = await cursor.fetchall()
        if not watches:
            return None

        mints = [w[0] for w in watches]

        # Get last briefing timestamp for delta computation
        last_briefing_ts = 0.0
        cursor = await db.execute(
            "SELECT created_at FROM briefings WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
            (user_id,),
        )
        row = await cursor.fetchone()
        if row:
            last_briefing_ts = row[0]

        # Gather token summaries + delta events
        summaries = []
        delta_events: list[str] = []

        for mint in mints[:20]:
            summary = await _build_token_summary(mint, last_briefing_ts, cache)
            if summary["text"]:
                summaries.append(summary["text"])
            delta_events.extend(summary.get("delta", []))

        if not summaries and not delta_events:
            return None

        # Build prompt with delta context
        delta_section = ""
        if delta_events:
            delta_section = (
                "\n## EVENTS SINCE LAST BRIEFING\n"
                + "\n".join(f"- {e}" for e in delta_events[:15])
                + "\n\n"
            )

        from .ai_analyst import _get_client

        prompt = (
            "You are a Solana security analyst generating a daily briefing.\n"
            "Summarize the risk status of these watched tokens in a concise, "
            "actionable morning briefing. Use bullet points.\n\n"
            "IMPORTANT: Start with the most critical changes first. "
            "If there are events since the last briefing, lead with those.\n"
            "Keep it under 500 words. Be direct — no filler.\n\n"
            "Language: English\n\n"
            + delta_section
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
        (user_id, content, time.time()),
    )
    await db.commit()


async def get_latest_briefing(cache, user_id: int) -> dict | None:
    """Get the most recent briefing for a user."""
    db = await cache._get_conn()
    cursor = await db.execute(
        "SELECT id, content, created_at FROM briefings WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
        (user_id,),
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
        (user_id, min(limit, 30)),
    )
    rows = await cursor.fetchall()
    return [{"id": r[0], "content": r[1], "created_at": r[2]} for r in rows]


# ── Background sweep ─────────────────────────────────────────────────────────


async def schedule_briefing_sweep(cache) -> None:
    """Background task that generates briefings respecting each user's hour.

    Checks every 5 minutes which users are due for a briefing based on
    their configured briefing_hour in agent_prefs.
    Runs forever — call as asyncio.create_task() on startup.
    """
    logger.info("[briefing] sweep task started (check every %ds)", _SWEEP_CHECK_INTERVAL)

    # Track which users got a briefing today (reset at midnight UTC)
    _generated_today: set[int] = set()
    _last_reset_day: int = -1

    while True:
        try:
            now = datetime.datetime.now(datetime.timezone.utc)

            # Reset daily tracker at midnight
            if now.day != _last_reset_day:
                _generated_today.clear()
                _last_reset_day = now.day

            current_hour = now.hour
            db = await cache._get_conn()

            # Find users who are due: have watchlist + briefing_hour matches current hour
            # Left join agent_prefs to get configured hour (default to _DEFAULT_BRIEFING_HOUR)
            cursor = await db.execute(
                """SELECT DISTINCT u.id, COALESCE(ap.briefing_hour, ?) as bh
                   FROM users u
                   INNER JOIN user_watches uw ON u.id = uw.user_id
                   LEFT JOIN agent_prefs ap ON u.id = ap.user_id
                   WHERE uw.sub_type IN ('mint', 'token')
                     AND COALESCE(ap.daily_briefing, 1) = 1""",
                (_DEFAULT_BRIEFING_HOUR,),
            )
            users = await cursor.fetchall()

            due_users = [
                uid for uid, bh in users
                if int(bh) == current_hour and uid not in _generated_today
            ]

            if due_users:
                logger.info("[briefing] %d user(s) due at hour %d UTC", len(due_users), current_hour)

            generated = 0
            for uid in due_users:
                content = await generate_briefing(uid, cache)
                if content:
                    await store_briefing(cache, uid, content)
                    _generated_today.add(uid)
                    generated += 1

                    # Push notification (best-effort)
                    try:
                        from .alert_service import _send_fcm_push

                        cur2 = await db.execute(
                            "SELECT fcm_token FROM users WHERE id = ? AND fcm_token IS NOT NULL",
                            (uid,),
                        )
                        fcm_row = await cur2.fetchone()
                        if fcm_row and fcm_row[0]:
                            lines = [l.strip() for l in content.strip().splitlines() if l.strip()]
                            body = " ".join(lines[:2])[:200]
                            await _send_fcm_push(
                                fcm_row[0],
                                "Your Lineage briefing is ready",
                                body,
                                data={"type": "daily_briefing"},
                            )
                    except Exception:
                        pass  # best-effort

                await asyncio.sleep(2)  # Rate-limit between users

            if generated:
                logger.info("[briefing] generated %d briefing(s)", generated)

        except asyncio.CancelledError:
            logger.info("[briefing] sweep task cancelled")
            break
        except Exception:
            logger.exception("[briefing] sweep check failed")

        await asyncio.sleep(_SWEEP_CHECK_INTERVAL)


# ── Helpers ───────────────────────────────────────────────────────────────────


async def _build_token_summary(
    mint: str, since_ts: float, cache: Any
) -> dict[str, Any]:
    """Build a summary for one token including delta events since last briefing.

    Returns {"text": "...", "delta": ["event1", "event2", ...]}.
    """
    result: dict[str, Any] = {"text": "", "delta": []}

    try:
        from .lineage_detector import get_cached_lineage_report
        from .chat_service import build_rich_context

        lin = await get_cached_lineage_report(mint)
        if lin is None:
            from .lineage_detector import detect_lineage
            lin = await asyncio.wait_for(detect_lineage(mint), timeout=15.0)

        if not lin:
            return result

        # Base summary from lineage
        ctx = build_rich_context(lin)
        qt = getattr(lin, "query_token", None)
        name = getattr(qt, "name", mint[:8]) if qt else mint[:8]
        symbol = getattr(qt, "symbol", "") if qt else ""
        label = f"{name} ({symbol})" if symbol else name

        # Enriched context from forensic signals
        extra_lines: list[str] = []

        # Insider sell flags
        ins = getattr(lin, "insider_sell", None)
        if ins:
            flags = getattr(ins, "flags", []) or []
            if "DEPLOYER_DUMP_RISK" in flags:
                extra_lines.append("⚠ Deployer holds significant supply relative to liquidity — dump risk")
            elif "DEPLOYER_HOLDS_SIGNIFICANT_SUPPLY" in flags:
                extra_lines.append("Deployer still holds notable % of supply")
            if getattr(ins, "deployer_exited", False):
                extra_lines.append("⚠ DEPLOYER HAS EXITED their position")

        # Death clock
        dc = getattr(lin, "death_clock", None)
        if dc:
            risk = getattr(dc, "risk_level", "") or ""
            if risk in ("critical", "high"):
                extra_lines.append(f"Death clock: {risk} risk")

        # Market anomalies
        if qt:
            liq = getattr(qt, "liquidity_usd", None)
            vol = getattr(qt, "volume_24h_usd", None)
            pc24 = getattr(qt, "price_change_24h", None)
            if liq and vol and liq > 0 and vol / liq > 20:
                extra_lines.append(f"Volume/liquidity ratio: {vol / liq:.0f}x (elevated)")
            if pc24 is not None and abs(pc24) > 50:
                direction = "pump" if pc24 > 0 else "crash"
                extra_lines.append(f"Price {direction}: {pc24:+.0f}% in 24h")

        extra_block = "\n".join(f"- {l}" for l in extra_lines) if extra_lines else ""
        result["text"] = f"### {label}\n{ctx[:400]}\n{extra_block}"

        # Delta events since last briefing
        if since_ts > 0:
            db = await cache._get_conn()

            # Check for new rugs on this token
            cursor = await db.execute(
                "SELECT rug_mechanism, liq_usd FROM intelligence_events "
                "WHERE mint = ? AND event_type = 'token_rugged' AND recorded_at > ?",
                (mint, since_ts),
            )
            for rug_row in await cursor.fetchall():
                mechanism = rug_row[0] or "unknown"
                liq = rug_row[1]
                result["delta"].append(
                    f"🚨 {label} RUGGED ({mechanism})"
                    + (f" — liquidity now ${liq:,.0f}" if liq else "")
                )

            # Check for deployer exit (from insider sell wallet_events)
            if ins and getattr(ins, "deployer_exited", False):
                result["delta"].append(f"⚠ {label} — deployer exited position")

    except Exception as exc:
        logger.debug("_build_token_summary failed for %s: %s", mint[:8], exc)
        result["text"] = f"### {mint[:8]}...\nScan failed"

    return result
