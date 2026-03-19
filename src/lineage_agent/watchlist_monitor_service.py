"""Watchlist monitor service — periodic rescan of watched tokens with risk escalation alerts."""
from __future__ import annotations

import asyncio
import logging
import time

logger = logging.getLogger(__name__)

SWEEP_INTERVAL_SECONDS = 7200  # 2 hours


async def run_single_rescan(watch_id: int, cache) -> dict | None:
    """Rescan a single watch and return the result with risk comparison.

    Returns {mint, old_risk, new_risk, escalated} or None on failure.
    """
    try:
        db = await cache._get_conn()
        cursor = await db.execute(
            "SELECT value FROM user_watches WHERE id = ?", (watch_id,)
        )
        row = await cursor.fetchone()
        if not row:
            return None

        mint = row[0]

        # Get previous snapshot
        cursor = await db.execute(
            "SELECT risk_level, risk_score FROM watch_snapshots WHERE watch_id = ? ORDER BY scanned_at DESC LIMIT 1",
            (watch_id,)
        )
        prev = await cursor.fetchone()
        old_risk = prev[0] if prev else "unknown"
        old_score = prev[1] if prev else 0

        # Rescan
        from .lineage_core import detect_lineage
        lin = await asyncio.wait_for(detect_lineage(mint), timeout=30.0)

        dc = getattr(lin, "death_clock", None)
        new_risk = getattr(dc, "risk_level", "unknown") if dc else "unknown"
        new_score = getattr(dc, "rug_probability_pct", 0) or 0 if dc else 0

        # Store snapshot
        await db.execute(
            "INSERT INTO watch_snapshots (watch_id, mint, risk_level, risk_score, scanned_at) VALUES (?, ?, ?, ?, ?)",
            (watch_id, mint, new_risk, new_score, time.time())
        )
        await db.commit()

        # Check for escalation
        risk_levels = ["unknown", "insufficient_data", "low", "medium", "high", "critical"]
        old_idx = risk_levels.index(old_risk) if old_risk in risk_levels else 0
        new_idx = risk_levels.index(new_risk) if new_risk in risk_levels else 0
        escalated = new_idx > old_idx and new_idx >= 3  # medium or above

        return {
            "mint": mint,
            "watch_id": watch_id,
            "old_risk": old_risk,
            "new_risk": new_risk,
            "old_score": old_score,
            "new_score": new_score,
            "escalated": escalated,
        }
    except Exception as exc:
        logger.warning("run_single_rescan failed for watch %d: %s", watch_id, exc)
        return None


async def schedule_watchlist_sweep(cache) -> None:
    """Background task that rescans all watched tokens every SWEEP_INTERVAL_SECONDS.

    Runs forever — call as asyncio.create_task() on startup.
    """
    logger.info("[watchlist-monitor] sweep task started (interval=%ds)", SWEEP_INTERVAL_SECONDS)
    # Initial delay to let the app start up
    await asyncio.sleep(60)

    while True:
        try:
            logger.info("[watchlist-monitor] starting sweep")
            db = await cache._get_conn()
            cursor = await db.execute(
                "SELECT uw.id, uw.user_id, uw.value FROM user_watches uw WHERE uw.sub_type = 'mint'"
            )
            watches = await cursor.fetchall()

            scanned = 0
            escalations = 0

            for watch_id, user_id, mint in watches:
                result = await run_single_rescan(watch_id, cache)
                if result:
                    scanned += 1
                    if result.get("escalated"):
                        escalations += 1
                        # Fire alert to user
                        try:
                            from .alert_service import route_alert_to_channels
                            alert = {
                                "title": f"\u26a0\ufe0f Risk Escalation: {mint[:8]}...",
                                "body": f"Risk level changed: {result['old_risk']} \u2192 {result['new_risk']}",
                                "mint": mint,
                                "risk_level": result["new_risk"],
                                "type": "risk_escalation",
                            }
                            await route_alert_to_channels(cache, alert, user_id)
                        except Exception:
                            logger.warning("[watchlist-monitor] alert routing failed for user %d", user_id)

                # Rate limit: 1 scan per 3 seconds
                await asyncio.sleep(3)

            logger.info("[watchlist-monitor] sweep complete: %d scanned, %d escalations", scanned, escalations)
        except asyncio.CancelledError:
            logger.info("[watchlist-monitor] sweep task cancelled")
            break
        except Exception:
            logger.exception("[watchlist-monitor] sweep failed, retrying next interval")

        await asyncio.sleep(SWEEP_INTERVAL_SECONDS)
