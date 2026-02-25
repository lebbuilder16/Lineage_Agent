"""
Alert Sweep Service.

Runs a background sweep every ``_SWEEP_INTERVAL_SECONDS`` (default 5 min)
to check whether any new events have occurred that match active alert
subscriptions.

Subscription types
------------------
deployer   – notify when a watched deployer wallet launches a new token
narrative  – notify when a watched narrative category gains a new token

When a match is found, the service sends a Telegram message to the
subscribed ``chat_id`` via the active bot instance.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Optional

from .data_sources._clients import all_subscriptions, event_query

logger = logging.getLogger(__name__)

_SWEEP_INTERVAL_SECONDS = 5 * 60   # 5 minutes
_LOOKBACK_SECONDS = 6 * 60         # check events from last 6 min (overlap to cover delays)

_sweep_task: Optional[asyncio.Task] = None
# Store reference to the Telegram Application so we can send messages
_bot_app: Optional[object] = None


def set_bot_app(app: object) -> None:
    """Register the python-telegram-bot Application for alert dispatch."""
    global _bot_app
    _bot_app = app


async def _send_alert(chat_id: int, text: str) -> None:
    """Send *text* to *chat_id* via the registered bot application."""
    if _bot_app is None:
        logger.debug("Alert not sent (no bot app registered): %s", text[:60])
        return
    try:
        bot = getattr(_bot_app, "bot", None)
        if bot is not None:
            await bot.send_message(
                chat_id=chat_id,
                text=text,
                parse_mode="MarkdownV2",
            )
    except Exception as exc:
        logger.debug("Failed to send alert to %s: %s", chat_id, exc)


def _esc(text: str) -> str:
    """Escape Telegram MarkdownV2 special characters."""
    special = set(r"_*[]()~`>#+-=|{}.!")
    return "".join(f"\\{c}" if c in special else c for c in text)


async def _run_alert_sweep() -> int:
    """One sweep iteration. Returns number of alerts dispatched."""
    subscriptions = await all_subscriptions()
    if not subscriptions:
        return 0

    cutoff = time.time() - _LOOKBACK_SECONDS
    dispatched = 0

    for sub in subscriptions:
        sub_type = sub.get("sub_type", "")
        value = sub.get("value", "")
        chat_id = sub.get("chat_id")
        if not sub_type or not value or not chat_id:
            continue

        try:
            if sub_type == "deployer":
                rows = await event_query(
                    where="event_type = 'token_created' AND deployer = ? AND recorded_at > ?",
                    params=(value, cutoff),
                    columns="mint, name, symbol, mcap_usd",
                    limit=5,
                )
                for row in rows:
                    name = row.get("name") or row.get("symbol") or row.get("mint", "")[:8]
                    mcap = row.get("mcap_usd")
                    mcap_str = f"${mcap:,.0f}" if mcap else "n/a"
                    text = (
                        f"🚨 *Deployer Alert*\n\n"
                        f"Watched deployer `{_esc(value[:12])}…` just launched:\n"
                        f"*{_esc(name)}* — mcap {_esc(mcap_str)}\n"
                        f"`{_esc(row.get('mint', ''))}`"
                    )
                    await _send_alert(chat_id, text)
                    dispatched += 1

            elif sub_type == "narrative":
                rows = await event_query(
                    where="event_type = 'token_created' AND narrative = ? AND recorded_at > ?",
                    params=(value, cutoff),
                    columns="mint, name, symbol, mcap_usd",
                    limit=5,
                )
                for row in rows:
                    name = row.get("name") or row.get("symbol") or row.get("mint", "")[:8]
                    mcap = row.get("mcap_usd")
                    mcap_str = f"${mcap:,.0f}" if mcap else "n/a"
                    text = (
                        f"📢 *Narrative Alert*\n\n"
                        f"New *{_esc(value)}* token launched:\n"
                        f"*{_esc(name)}* — mcap {_esc(mcap_str)}\n"
                        f"`{_esc(row.get('mint', ''))}`"
                    )
                    await _send_alert(chat_id, text)
                    dispatched += 1

        except Exception as exc:
            logger.debug("Alert sweep error for sub %s: %s", sub, exc)

    return dispatched


async def _sweep_loop() -> None:
    """Background loop that runs the sweep every interval."""
    while True:
        try:
            await asyncio.sleep(_SWEEP_INTERVAL_SECONDS)
            count = await _run_alert_sweep()
            if count:
                logger.info("Alert sweep dispatched %d notifications", count)
        except asyncio.CancelledError:
            break
        except Exception as exc:
            logger.warning("Alert sweep loop error: %s", exc)


def schedule_alert_sweep() -> None:
    """Launch the background alert sweep task."""
    global _sweep_task
    if _sweep_task is None or _sweep_task.done():
        _sweep_task = asyncio.create_task(_sweep_loop())
        logger.info("Alert sweep scheduled (interval=%ds)", _SWEEP_INTERVAL_SECONDS)


def cancel_alert_sweep() -> None:
    """Cancel the background alert sweep task."""
    global _sweep_task
    if _sweep_task and not _sweep_task.done():
        _sweep_task.cancel()
        _sweep_task = None
