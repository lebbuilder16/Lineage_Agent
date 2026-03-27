"""Briefing service — generates daily briefings for users with active watchlists.

Improvements over v1:
- On-demand generation (not just cron)
- Delta tracking (compare with previous briefing's risk scores)
- Prioritize watches by risk level (high-risk first)
- Force-refresh lineage for high-risk tokens
- Rich push with critical alert count
- Timezone-aware briefing hour per user
"""
from __future__ import annotations

import asyncio
import datetime
import json
import logging
import time

logger = logging.getLogger(__name__)

BRIEFING_HOUR_UTC = 8  # Default — overridden by per-user agent_prefs.briefing_hour


async def generate_briefing(user_id: int, cache) -> str | None:
    """Generate a daily briefing for a user based on their watchlist.

    Improvements:
    - Prioritizes watches by risk (high-risk tokens first)
    - Tracks risk deltas from previous briefing
    - Force-refreshes lineage for tokens with risk > 50
    - Caps at 20 tokens but processes highest-risk first
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

        # ── Get previous risk scores for delta tracking ──────────────
        prev_risks: dict[str, int] = {}
        try:
            latest = await get_latest_briefing(cache, user_id)
            if latest and latest.get("risk_snapshot"):
                prev_risks = json.loads(latest["risk_snapshot"])
        except Exception:
            pass

        # ── Gather lineage data, prioritize by risk ──────────────────
        from .lineage_detector import detect_lineage, get_cached_lineage_report
        from .chat_service import build_rich_context

        token_data: list[dict] = []
        for mint in mints[:30]:  # fetch up to 30, then sort by risk
            try:
                lin = await get_cached_lineage_report(mint)
                # Force refresh for high-risk tokens (stale cache may hide rug)
                if lin is None or _extract_risk_score(lin) > 50:
                    try:
                        lin = await asyncio.wait_for(
                            detect_lineage(mint, force_refresh=(_extract_risk_score(lin) > 50 if lin else False)),
                            timeout=15.0,
                        )
                    except Exception:
                        pass
                if lin:
                    risk = _extract_risk_score(lin)
                    qt = getattr(lin, "query_token", None)
                    name = getattr(qt, "name", "") or mint[:8]
                    symbol = getattr(qt, "symbol", "") or "?"
                    ctx = build_rich_context(lin)
                    prev = prev_risks.get(mint, -1)
                    delta = f" (was {prev})" if prev >= 0 and prev != risk else ""
                    token_data.append({
                        "mint": mint, "name": name, "symbol": symbol,
                        "risk": risk, "delta": delta, "context": ctx[:400],
                    })
            except Exception:
                token_data.append({"mint": mint, "name": mint[:8], "symbol": "?",
                                   "risk": 0, "delta": "", "context": "Scan failed"})

        if not token_data:
            return None

        # Sort by risk DESC — most dangerous first
        token_data.sort(key=lambda t: t["risk"], reverse=True)
        token_data = token_data[:20]  # cap at 20

        # ── Build prompt with deltas ─────────────────────────────────
        summaries = []
        for t in token_data:
            summaries.append(
                f"### {t['symbol']} — {t['name']} (risk: {t['risk']}/100{t['delta']})\n{t['context']}"
            )

        from .ai_analyst import _get_client

        prompt = (
            "You are a Solana security analyst generating a daily briefing.\n\n"
            "RULES:\n"
            "- Lead with the most critical alerts (highest risk first)\n"
            "- Highlight risk CHANGES: if a token's risk went up or down, say so\n"
            "- Use bullet points, keep it under 400 words\n"
            "- End with a 1-sentence overall assessment\n"
            "- Language: English\n\n"
            f"Watched tokens ({len(token_data)}):\n\n"
            + "\n\n".join(summaries)
        )

        client = _get_client()
        response = await client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=600,
            messages=[{"role": "user", "content": prompt}],
        )

        content = response.content[0].text

        # ── Store risk snapshot for next delta ────────────────────────
        risk_snapshot = {t["mint"]: t["risk"] for t in token_data}

        return content, risk_snapshot
    except Exception as exc:
        logger.warning("generate_briefing failed for user %s: %s", user_id, exc)
        return None


def _extract_risk_score(lin) -> int:
    """Extract a risk score from lineage data (death clock or deployer profile)."""
    try:
        dc = getattr(lin, "death_clock", None)
        if dc:
            level = getattr(dc, "risk_level", "")
            if level == "critical":
                return 85
            if level == "high":
                return 65
            if level == "medium":
                return 40
        dp = getattr(lin, "deployer_profile", None)
        if dp and getattr(dp, "rug_rate_pct", 0) > 50:
            return 70
        ins = getattr(lin, "insider_sell", None)
        if ins and getattr(ins, "deployer_exited", False):
            return 90
    except Exception:
        pass
    return 15


async def store_briefing(cache, user_id: int, content: str, risk_snapshot: dict | None = None) -> None:
    """Store a generated briefing in the database."""
    db = await cache._get_conn()
    await db.execute(
        "INSERT INTO briefings (user_id, content, risk_snapshot, created_at) VALUES (?, ?, ?, ?)",
        (user_id, content, json.dumps(risk_snapshot) if risk_snapshot else None, time.time())
    )
    await db.commit()


async def get_latest_briefing(cache, user_id: int) -> dict | None:
    """Get the most recent briefing for a user."""
    db = await cache._get_conn()
    cursor = await db.execute(
        "SELECT id, content, created_at, risk_snapshot FROM briefings "
        "WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
        (user_id,)
    )
    row = await cursor.fetchone()
    if not row:
        return None
    return {"id": row[0], "content": row[1], "created_at": row[2], "risk_snapshot": row[3]}


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
    """Background task that generates daily briefings per user's timezone preference.

    Runs every hour. For each user with active watches, checks if the current UTC hour
    matches their briefing_hour preference (default 8 UTC).
    """
    logger.info("[briefing] sweep task started (checking every hour)")
    while True:
        try:
            now = datetime.datetime.now(datetime.timezone.utc)
            current_hour = now.hour

            db = await cache._get_conn()
            # Get users with watches, join with preferences for custom briefing hour
            cursor = await db.execute(
                "SELECT DISTINCT u.id, "
                "COALESCE((SELECT CAST(json_extract(prefs, '$.briefing_hour') AS INTEGER) "
                "          FROM agent_prefs WHERE user_id = u.id), 8) as brief_hour "
                "FROM users u "
                "INNER JOIN user_watches uw ON u.id = uw.user_id "
                "WHERE uw.sub_type = 'mint'"
            )
            users = await cursor.fetchall()

            eligible = [(uid, bh) for uid, bh in users if bh == current_hour]

            if eligible:
                logger.info("[briefing] hour %d UTC — %d user(s) eligible", current_hour, len(eligible))

            generated = 0
            for uid, _ in eligible:
                result = await generate_briefing(uid, cache)
                if result:
                    content, risk_snapshot = result
                    await store_briefing(cache, uid, content, risk_snapshot)
                    generated += 1

                    # Rich push notification with critical count
                    try:
                        critical_count = sum(1 for v in risk_snapshot.values() if v >= 70)
                        from .alert_service import _send_fcm_push
                        db2 = await cache._get_conn()
                        cur2 = await db2.execute(
                            "SELECT fcm_token FROM users WHERE id = ? AND fcm_token IS NOT NULL", (uid,)
                        )
                        row = await cur2.fetchone()
                        if row and row[0]:
                            if critical_count > 0:
                                title = f"Briefing: {critical_count} high-risk alert(s)"
                            else:
                                title = "Your daily briefing is ready"
                            lines = [l.strip() for l in content.strip().splitlines() if l.strip()]
                            body = " ".join(lines[:2])[:200]
                            await _send_fcm_push(
                                row[0], title, body,
                                data={"type": "daily_briefing", "critical_count": str(critical_count)},
                            )
                    except Exception:
                        pass  # best-effort

                await asyncio.sleep(2)  # stagger between users

            if eligible:
                logger.info("[briefing] sweep at hour %d: %d briefings for %d users",
                            current_hour, generated, len(eligible))

            # Sleep until the next hour
            next_hour = now.replace(minute=0, second=0, microsecond=0) + datetime.timedelta(hours=1)
            await asyncio.sleep((next_hour - now).total_seconds())

        except asyncio.CancelledError:
            logger.info("[briefing] sweep task cancelled")
            break
        except Exception:
            logger.exception("[briefing] sweep failed, retrying in 1h")
            await asyncio.sleep(3600)
