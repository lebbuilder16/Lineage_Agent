"""Alert Sweep Service.

Runs a background sweep every ``_SWEEP_INTERVAL_SECONDS`` (default 5 min)
to check whether any new events have occurred that match active alert
subscriptions.

Subscription types
------------------
deployer   – notify when a watched deployer wallet launches a new token
narrative  – notify when a watched narrative category gains a new token
token      – notify when a watched token has a new forensic signal

When a match is found, the service:
  1. Broadcasts to WebSocket browser clients
  2. Sends a Firebase Cloud Messaging push to the user's registered device
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
import time
from typing import TYPE_CHECKING, Optional

import httpx

if TYPE_CHECKING:
    from fastapi import WebSocket

# Lazily imported to avoid circular imports at module load time
async def event_query(
    where: str,
    params: tuple = (),
    columns: str = "*",
    limit: int = 1000,
    order_by: str = "",
) -> list[dict]:
    """Thin wrapper that delegates to data_sources._clients.event_query."""
    from .data_sources._clients import event_query as _eq
    return await _eq(where=where, params=params, columns=columns, limit=limit, order_by=order_by)


async def all_subscriptions() -> list[dict]:
    """Return all active alert subscriptions (sub_type, value, chat_id).

    Queries the *user_watches* table and joins with *users* to retrieve the
    associated Telegram ``chat_id``.  Returns an empty list when the DB is
    unavailable (e.g. during testing without a real DB).
    """
    try:
        from .data_sources._clients import cache as _sc  # noqa: PLC0415
        from .cache import SQLiteCache  # noqa: PLC0415
        if not isinstance(_sc, SQLiteCache):
            return []
        db = await _sc._get_conn()
        cursor = await db.execute(
            "SELECT uw.sub_type, uw.value, u.telegram_chat_id AS chat_id, u.id AS user_id "
            "FROM user_watches uw JOIN users u ON u.id = uw.user_id"
        )
        rows = await cursor.fetchall()
        return [{"sub_type": r[0], "value": r[1], "chat_id": r[2], "user_id": r[3]} for r in rows]
    except Exception:
        return []

logger = logging.getLogger(__name__)

_SWEEP_INTERVAL_SECONDS = 5 * 60   # 5 minutes
_LOOKBACK_SECONDS = 6 * 60         # check events from last 6 min (overlap to cover delays)

# ── Telegram bot application (set via set_bot_app at startup) ─────────────────
_bot_app: Optional[object] = None

_MARKDOWNV2_SPECIAL = re.compile(r"([_*\[\]()~`>#+=|{}.!\-\\])")


def _esc(text: str) -> str:
    """Escape *text* for Telegram MarkdownV2 parse mode."""
    return _MARKDOWNV2_SPECIAL.sub(r"\\\1", text)


def set_bot_app(app: object) -> None:
    """Register the PTB Application instance used for Telegram delivery."""
    global _bot_app
    _bot_app = app


async def _send_alert(chat_id: int, text: str) -> None:
    """Send *text* to *chat_id* via the registered Telegram bot. Silently swallows errors."""
    if _bot_app is None:
        return
    try:
        await _bot_app.bot.send_message(  # type: ignore[attr-defined]
            chat_id=chat_id,
            text=text,
            parse_mode="MarkdownV2",
        )
    except Exception as exc:
        logger.debug("[Telegram] send_message error: %s", exc)

async def _send_discord_webhook(webhook_url: str, title: str, body: str, color: int = 0xFF3366) -> None:
    """Send an embed to a Discord webhook URL. Silently swallows errors."""
    if not webhook_url:
        return
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(
                webhook_url,
                json={
                    "embeds": [{
                        "title": title[:256],
                        "description": body[:4096],
                        "color": color,
                        "footer": {"text": "Lineage Agent"},
                    }],
                },
            )
    except Exception as exc:
        logger.debug("[Discord] webhook error: %s", exc)


async def _send_discord_for_user(user_id: int, title: str, body: str) -> None:
    """Look up user's discord_webhook_url and send the alert."""
    try:
        from .data_sources._clients import cache as _sc
        db = await _sc._get_conn()
        cursor = await db.execute(
            "SELECT discord_webhook_url FROM users WHERE id = ?", (user_id,)
        )
        row = await cursor.fetchone()
        if row and row[0]:
            await _send_discord_webhook(row[0], title, body)
    except Exception:
        pass  # best-effort


_sweep_task: Optional[asyncio.Task] = None
# Web WebSocket clients keyed by user_id → set of connections
_web_clients: dict[int, set["WebSocket"]] = {}

# ── Firebase Cloud Messaging (HTTP v1) ────────────────────────────────────────
# Accepts FIREBASE_SERVICE_ACCOUNT_JSON as either:
#   - A file path (e.g. /app/firebase-sa.json)
#   - Raw JSON string (for Fly.io secrets / env injection)
# Silently disabled when not configured.
_FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID", "")
_FIREBASE_SA_JSON_RAW = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", "")
_FCM_ENDPOINT = "https://fcm.googleapis.com/v1/projects/{project}/messages:send"
_fcm_client: Optional[httpx.AsyncClient] = None
_fcm_access_token: Optional[str] = None
_fcm_token_expiry: float = 0.0


def _load_sa_credentials():
    """Load service account credentials from file path or inline JSON string."""
    from google.oauth2 import service_account  # type: ignore

    raw = _FIREBASE_SA_JSON_RAW
    if not raw:
        return None
    # If it looks like JSON (starts with '{'), parse inline; otherwise treat as file path
    if raw.strip().startswith("{"):
        import json as _json
        info = _json.loads(raw)
        return service_account.Credentials.from_service_account_info(
            info,
            scopes=["https://www.googleapis.com/auth/firebase.messaging"],
        )
    return service_account.Credentials.from_service_account_file(
        raw,
        scopes=["https://www.googleapis.com/auth/firebase.messaging"],
    )


async def _get_fcm_access_token() -> Optional[str]:
    """Return a valid Google OAuth2 access token for FCM v1 API.

    Uses the service account JSON (file path or inline JSON string).
    Tokens are cached until 5 minutes before expiry to avoid OAuth2 round-trips.
    Returns None when Firebase is not configured or the credentials are invalid.
    """
    global _fcm_access_token, _fcm_token_expiry

    if not _FIREBASE_PROJECT_ID or not _FIREBASE_SA_JSON_RAW:
        return None

    now = time.monotonic()
    if _fcm_access_token and now < _fcm_token_expiry:
        return _fcm_access_token

    try:
        import google.auth.transport.requests  # type: ignore

        creds = _load_sa_credentials()
        if creds is None:
            return None
        req = google.auth.transport.requests.Request()
        creds.refresh(req)
        _fcm_access_token = creds.token
        # Cache until (expiry - 5 min) expressed as monotonic time
        exp_utc = creds.expiry.timestamp() if creds.expiry else time.time() + 3600
        _fcm_token_expiry = now + max(0, exp_utc - time.time() - 300)
        return _fcm_access_token
    except ImportError:
        logger.debug("[FCM] google-auth not installed; install with: pip install google-auth")
        return None
    except Exception as exc:
        logger.warning("[FCM] Failed to get access token: %s", exc)
        return None


async def _send_fcm_push(fcm_token: str, title: str, body: str, data: dict) -> bool:
    """Send a single FCM v1 push message. Returns True on success."""
    access_token = await _get_fcm_access_token()
    if not access_token:
        return False

    global _fcm_client
    if _fcm_client is None:
        _fcm_client = httpx.AsyncClient(timeout=10.0)

    url = _FCM_ENDPOINT.format(project=_FIREBASE_PROJECT_ID)
    payload = {
        "message": {
            "token": fcm_token,
            "notification": {"title": title, "body": body},
            "data": {k: str(v) for k, v in data.items()},  # FCM data values must be strings
            "android": {
                "priority": "high",
                "notification": {
                    "channel_id": "critical" if data.get("urgency") == "high" else "default",
                    "color": "#00FF9D",
                },
            },
        }
    }
    try:
        resp = await _fcm_client.post(
            url,
            json=payload,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
        )
        if resp.status_code == 200:
            return True
        logger.debug("[FCM] Push failed (%s): %s", resp.status_code, resp.text[:200])
        return False
    except Exception as exc:
        logger.debug("[FCM] Push error: %s", exc)
        return False


async def _push_fcm_to_watchers(
    mint: Optional[str],
    title: str,
    body: str,
    alert_type: str,
) -> None:
    """Fetch FCM tokens for all users watching *mint* and send them a push.

    Silently skips if Firebase is not configured or no matching FCM tokens exist.
    """
    if not _FIREBASE_PROJECT_ID:
        return

    try:
        from .data_sources._clients import cache as _cache  # noqa: PLC0415

        db = await _cache._get_conn()  # type: ignore[union-attr]
        # Find users watching this specific mint (sub_type='mint', value=mint)
        cursor = await db.execute(
            """
            SELECT DISTINCT u.fcm_token
            FROM users u
            JOIN user_watches uw ON uw.user_id = u.id
            WHERE u.fcm_token IS NOT NULL
              AND uw.sub_type = 'mint'
              AND uw.value = ?
            """,
            (mint,),
        )
        rows = await cursor.fetchall()
        for (token,) in rows:
            if token:
                await _send_fcm_push(
                    token,
                    title=title,
                    body=body,
                    data={"type": alert_type, "mint": mint or ""},
                )
    except Exception as exc:
        logger.debug("[FCM] push_to_watchers error: %s", exc)


async def _push_fcm_to_deployer_investigators(deployer: str, title: str, body: str, data: dict) -> None:
    """FCM push only to users who previously investigated a token from this deployer."""
    if not _FIREBASE_PROJECT_ID:
        return
    try:
        from .data_sources._clients import cache as _cache
        db = await _cache._get_conn()
        cursor = await db.execute(
            """SELECT DISTINCT u.fcm_token FROM users u
               JOIN investigations inv ON inv.user_id = u.id
               JOIN investigation_episodes ep ON ep.mint = inv.mint
               WHERE ep.deployer = ? AND u.fcm_token IS NOT NULL""",
            (deployer,),
        )
        rows = await cursor.fetchall()
        for (token,) in rows:
            if token:
                await _send_fcm_push(token, title=title, body=body, data=data)
    except Exception as exc:
        logger.debug("[FCM] deployer_investigators error: %s", exc)


def register_web_client(ws: "WebSocket", user_id: int) -> None:
    """Register a browser/mobile WebSocket client for push alerts, scoped to *user_id*."""
    _web_clients.setdefault(user_id, set()).add(ws)


def unregister_web_client(ws: "WebSocket") -> None:
    """Remove a disconnected WebSocket client."""
    for uid, clients in list(_web_clients.items()):
        clients.discard(ws)
        if not clients:
            del _web_clients[uid]


async def _broadcast_web_alert(payload: dict, user_id: int | None = None) -> None:
    """Push *payload* to the WebSocket connections of *user_id* and FCM watchers."""
    # ── 1. WebSocket broadcast (scoped to user)
    target = _web_clients.get(user_id, set()) if user_id else set()
    if target:
        dead: set["WebSocket"] = set()
        for ws in list(target):
            try:
                await ws.send_json(payload)
            except Exception:
                dead.add(ws)
        target.difference_update(dead)

    # ── 2. FCM mobile push (fire-and-forget)
    mint = payload.get("mint")
    title = payload.get("title", "Lineage Alert")
    body = payload.get("body", "")
    alert_type = payload.get("type", "alert")
    if mint:
        asyncio.ensure_future(
            _push_fcm_to_watchers(mint, title=title, body=body, alert_type=alert_type)
        )


async def _run_alert_sweep() -> int:
    """One sweep iteration — queries subscriptions and dispatches alerts.

    Returns the number of notifications dispatched.
    """
    subs = await all_subscriptions()
    if not subs:
        return 0

    count = 0
    lookback_ts = int(time.time()) - _LOOKBACK_SECONDS

    for sub in subs:
        sub_type = sub.get("sub_type")
        value = sub.get("value")
        chat_id = sub.get("chat_id")

        if not sub_type or not value or not chat_id:
            continue

        try:
            if sub_type == "deployer":
                rows = await event_query(
                    where="deployer = ? AND created_at > ?",
                    params=(value, lookback_ts),
                    columns="mint,name,symbol,mcap_usd",
                    limit=5,
                )
            elif sub_type == "narrative":
                rows = await event_query(
                    where="narrative = ? AND created_at > ?",
                    params=(value, lookback_ts),
                    columns="mint,name,symbol,mcap_usd",
                    limit=5,
                )
            elif sub_type == "token" or sub_type == "mint":
                rows = await event_query(
                    where="mint = ? AND created_at > ?",
                    params=(value, lookback_ts),
                    columns="mint,name,symbol,mcap_usd",
                    limit=5,
                )
            elif sub_type == "cartel":
                # Cartel monitor: find tokens by deployers in this community
                try:
                    from .data_sources._clients import cache as _sc  # noqa: PLC0415
                    from .cache import SQLiteCache  # noqa: PLC0415
                    if isinstance(_sc, SQLiteCache):
                        _db = await _sc._get_conn()
                        _cur = await _db.execute(
                            "SELECT sample_wallet FROM community_lookup WHERE community_id = ?",
                            (value,),
                        )
                        _cw = await _cur.fetchone()
                        if _cw:
                            rows = await event_query(
                                where="deployer = ? AND created_at > ?",
                                params=(_cw[0], lookback_ts),
                                columns="mint,name,symbol,mcap_usd",
                                limit=5,
                            )
                        else:
                            rows = []
                    else:
                        rows = []
                except Exception:
                    rows = []
            else:
                continue

            for row in rows:
                name = row.get("name") or row.get("symbol") or row.get("mint", "?")
                mcap = row.get("mcap_usd")
                mcap_str = f" · ${mcap:,.0f} mcap" if mcap else ""
                text = (
                    f"🚨 *{_esc(sub_type.upper())} ALERT*\n"
                    f"{_esc(name)}{_esc(mcap_str)}\n"
                    f"`{_esc(row.get('mint', ''))}`"
                )
                if chat_id:
                    await _send_alert(chat_id=int(chat_id), text=text)
                # Discord delivery (parallel, best-effort)
                user_id = sub.get("user_id")
                if user_id:
                    await _send_discord_for_user(
                        user_id, f"{sub_type.upper()} ALERT", f"{name}{mcap_str}"
                    )
                await _broadcast_web_alert({
                    "event": "alert",
                    "type": sub_type,
                    "title": f"{sub_type.upper()} alert",
                    "body": name,
                    "mint": row.get("mint"),
                }, user_id=user_id)
                count += 1

        except Exception as exc:
            logger.debug("[alert_sweep] sub=%s error: %s", sub_type, exc)

    return count


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


# ── Direct Telegram HTTP send (for channel routing) ───────────────────────

async def _send_telegram(bot_token: str, chat_id: str, text: str) -> None:
    """Send a message via the Telegram Bot API using a raw HTTP POST."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        await client.post(
            f"https://api.telegram.org/bot{bot_token}/sendMessage",
            json={"chat_id": chat_id, "text": text, "parse_mode": "HTML"},
        )


# ── Phase 2 Option B — server-side alert routing & enrichment ─────────────

async def route_alert_to_channels(cache, alert: dict, user_id: int) -> dict:
    """Route an alert to all channels configured by the user.

    Reads alert_prefs from DB, dispatches to each enabled channel in parallel.
    Returns {routed: ["telegram", "discord"], failed: []}
    """
    db = await cache._get_conn()
    cursor = await db.execute(
        "SELECT channel, config_json FROM alert_prefs WHERE user_id = ? AND enabled = 1",
        (user_id,)
    )
    rows = await cursor.fetchall()

    routed = []
    failed = []

    for channel, config_json in rows:
        try:
            import json
            config = json.loads(config_json) if config_json else {}

            if channel == "telegram":
                bot_token = config.get("bot_token") or os.getenv("TELEGRAM_BOT_TOKEN", "")
                chat_id = config.get("chat_id", "")
                if bot_token and chat_id:
                    text = f"\U0001f6a8 {alert.get('title', 'Alert')}\n\n{alert.get('body', '')}"
                    await _send_telegram(bot_token, chat_id, text)
                    routed.append("telegram")
                else:
                    failed.append("telegram: not configured")

            elif channel == "discord":
                webhook_url = config.get("webhook_url", "")
                if webhook_url:
                    await _send_discord_webhook(webhook_url,
                        title=alert.get("title", "Alert"),
                        body=alert.get("body", ""),
                        color=0xFF3366,
                    )
                    routed.append("discord")
                else:
                    failed.append("discord: no webhook_url")

            elif channel == "push":
                # FCM push — if available
                routed.append("push")
        except Exception as exc:
            logger.warning("route_alert channel=%s failed: %s", channel, exc)
            failed.append(f"{channel}: {exc}")

    return {"routed": routed, "failed": failed}


async def enrich_alert(alert: dict) -> dict:
    """Enrich an alert with AI analysis using Claude Haiku.

    Returns the alert dict with added fields: ai_summary, risk_delta, recommended_action.
    """
    try:
        from .ai_analyst import _get_client, _MODEL

        prompt = (
            f"You are a Solana security analyst. Analyze this alert and provide a brief summary.\n\n"
            f"Alert: {alert.get('title', '')}\n"
            f"Details: {alert.get('body', '')}\n"
            f"Token: {alert.get('mint', 'unknown')}\n"
            f"Risk level: {alert.get('risk_level', 'unknown')}\n\n"
            f"Respond in JSON: {{\"summary\": \"...\", \"risk_delta\": \"...\", \"recommended_action\": \"...\"}}"
        )

        client = _get_client()
        response = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=300,
            messages=[{"role": "user", "content": prompt}],
        )

        import json
        text = response.content[0].text
        enrichment = json.loads(text)
        return {**alert, **enrichment}
    except Exception as exc:
        logger.warning("enrich_alert failed: %s", exc)
        return alert
