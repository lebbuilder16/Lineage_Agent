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
import time
from typing import TYPE_CHECKING, Optional

import httpx

if TYPE_CHECKING:
    from fastapi import WebSocket

logger = logging.getLogger(__name__)

_SWEEP_INTERVAL_SECONDS = 5 * 60   # 5 minutes
_LOOKBACK_SECONDS = 6 * 60         # check events from last 6 min (overlap to cover delays)

_sweep_task: Optional[asyncio.Task] = None
# Web WebSocket clients (browser dashboard)
_web_clients: set["WebSocket"] = set()

# ── Firebase Cloud Messaging (HTTP v1) ────────────────────────────────────────
# Set FIREBASE_PROJECT_ID + FIREBASE_SERVICE_ACCOUNT_JSON (path to SA JSON) env vars
# to activate mobile push delivery. Silently disabled when not configured.
_FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID", "")
_FIREBASE_SA_JSON_PATH = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", "")
_FCM_ENDPOINT = "https://fcm.googleapis.com/v1/projects/{project}/messages:send"
_fcm_client: Optional[httpx.AsyncClient] = None
_fcm_access_token: Optional[str] = None
_fcm_token_expiry: float = 0.0


async def _get_fcm_access_token() -> Optional[str]:
    """Return a valid Google OAuth2 access token for FCM v1 API.

    Uses the service account JSON file at ``FIREBASE_SERVICE_ACCOUNT_JSON`` path.
    Tokens are cached until 5 minutes before expiry to avoid OAuth2 round-trips.
    Returns None when Firebase is not configured or the credentials are invalid.
    """
    global _fcm_access_token, _fcm_token_expiry

    if not _FIREBASE_PROJECT_ID or not _FIREBASE_SA_JSON_PATH:
        return None

    now = time.monotonic()
    if _fcm_access_token and now < _fcm_token_expiry:
        return _fcm_access_token

    try:
        import google.auth  # type: ignore
        import google.auth.transport.requests  # type: ignore
        from google.oauth2 import service_account  # type: ignore

        creds = service_account.Credentials.from_service_account_file(
            _FIREBASE_SA_JSON_PATH,
            scopes=["https://www.googleapis.com/auth/firebase.messaging"],
        )
        req = google.auth.transport.requests.Request()
        creds.refresh(req)
        _fcm_access_token = creds.token
        # Cache until (expiry - 5 min) expressed as monotonic time
        exp_utc = creds.expiry.timestamp() if creds.expiry else time.time() + 3600
        _fcm_token_expiry = now + max(0, exp_utc - time.time() - 300)
        return _fcm_access_token
    except ImportError:
        # google-auth not installed — graceful no-op
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

        db = await _cache._get_conn()
        # Find users watching this specific mint (sub_type='token', value=mint)
        # Also notifies users watching the deployer of that mint (if resolvable).
        # We use a broad query: any user with a fcm_token who watches this mint.
        cursor = await db.execute(
            """
            SELECT DISTINCT u.fcm_token
            FROM users u
            JOIN user_watches uw ON uw.user_id = u.id
            WHERE u.fcm_token IS NOT NULL
              AND uw.sub_type = 'token'
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


def register_web_client(ws: "WebSocket") -> None:
    """Register a new browser WebSocket client for push alerts."""
    _web_clients.add(ws)


def unregister_web_client(ws: "WebSocket") -> None:
    """Remove a disconnected browser WebSocket client."""
    _web_clients.discard(ws)


async def _broadcast_web_alert(payload: dict) -> None:
    """Push *payload* to all connected browser web clients and Mobile FCM watchers."""
    # ── 1. WebSocket broadcast
    if _web_clients:
        dead: set["WebSocket"] = set()
        for ws in list(_web_clients):
            try:
                await ws.send_json(payload)
            except Exception:
                dead.add(ws)
        _web_clients.difference_update(dead)

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
    """One sweep iteration. Returns 0 (Telegram removed; web alerts triggered on scan)."""
    return 0


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
