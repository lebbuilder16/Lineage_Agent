"""
openclaw_gateway.py — Backend OpenClaw-compatible WebSocket gateway.

Implements the OpenClaw protocol so the mobile app can auto-connect
to the Lineage Agent backend without a separate self-hosted gateway.

Supported methods:
  connect        — Challenge-response handshake (API key auth)
  cron.list      — List user's cron jobs
  cron.add       — Create a cron job
  cron.remove    — Delete a cron job
  node.register  — Ack device registration (no-op server-side)

Server-push events:
  connect.challenge — Sent on WS open
  node.invoke       — Push commands to mobile device
  alert             — Rug/risk alerts forwarded from alert_service
"""
from __future__ import annotations

import asyncio
import json
import logging
import secrets
import time
import uuid
from typing import Optional

from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

# ── Protocol version (matches mobile PROTOCOL_VERSION = 3) ──────────────
PROTOCOL_VERSION = 3

# ── Connected clients: user_id → set[OpenClawClient] ────────────────────
_oc_clients: dict[int, set["OpenClawClient"]] = {}


class OpenClawClient:
    """Wraps a connected WebSocket with user context."""

    __slots__ = ("ws", "user_id", "user", "conn_id", "device_id", "caps")

    def __init__(self, ws: WebSocket, user: dict):
        self.ws = ws
        self.user_id: int = user["id"]
        self.user = user
        self.conn_id = str(uuid.uuid4())
        self.device_id: str | None = None
        self.caps: list[str] = []

    async def send_event(self, event: str, payload: dict | None = None) -> bool:
        try:
            frame = {"type": "event", "event": event}
            if payload is not None:
                frame["payload"] = payload
            await self.ws.send_json(frame)
            return True
        except Exception:
            return False

    async def send_response(self, req_id: str, ok: bool, payload=None, error=None) -> bool:
        try:
            frame: dict = {"type": "res", "id": req_id, "ok": ok}
            if payload is not None:
                frame["payload"] = payload
            if error is not None:
                frame["error"] = error
            await self.ws.send_json(frame)
            return True
        except Exception:
            return False


def register_oc_client(client: OpenClawClient) -> None:
    _oc_clients.setdefault(client.user_id, set()).add(client)


def unregister_oc_client(client: OpenClawClient) -> None:
    clients = _oc_clients.get(client.user_id)
    if clients:
        clients.discard(client)
        if not clients:
            del _oc_clients[client.user_id]


async def push_event_to_user(user_id: int, event: str, payload: dict) -> int:
    """Push an OpenClaw event to all connected clients of a user. Returns delivery count."""
    clients = _oc_clients.get(user_id, set())
    sent = 0
    dead: set[OpenClawClient] = set()
    for c in list(clients):
        ok = await c.send_event(event, payload)
        if ok:
            sent += 1
        else:
            dead.add(c)
    clients.difference_update(dead)
    return sent


async def push_node_invoke(user_id: int, command: str, params: dict | None = None) -> int:
    """Send a node.invoke command to all connected devices of a user."""
    cmd_id = f"srv-{uuid.uuid4().hex[:8]}"
    return await push_event_to_user(user_id, "node.invoke", {
        "id": cmd_id,
        "command": command,
        "params": params or {},
    })


# ── WebSocket handler ───────────────────────────────────────────────────


async def handle_openclaw_ws(websocket: WebSocket, cache) -> None:
    """Main WebSocket handler for /ws/openclaw — implements OpenClaw protocol."""
    from .auth_service import verify_api_key  # noqa: PLC0415

    # Auth via query param (same pattern as /ws/alerts)
    api_key = websocket.query_params.get("key", "")
    if not api_key:
        logger.warning("[openclaw-gw] rejected: no API key in query params")
        await websocket.close(code=1008, reason="unauthorized")
        return

    user = await verify_api_key(cache, api_key)
    if not user:
        logger.warning("[openclaw-gw] rejected: invalid API key (%s...)", api_key[:8])
        await websocket.close(code=1008, reason="unauthorized")
        return

    logger.info("[openclaw-gw] accepting WS for user=%s (key=%s...)", user.get("id"), api_key[:8])
    await websocket.accept()
    client = OpenClawClient(websocket, user)

    # 1. Send challenge
    nonce = secrets.token_hex(16)
    await client.send_event("connect.challenge", {
        "nonce": nonce,
        "ts": time.time(),
    })

    # 2. Server-side keepalive (Fly.io proxy needs outgoing traffic)
    ping_alive = True

    async def _keepalive():
        await asyncio.sleep(2)
        while ping_alive:
            try:
                await websocket.send_text("ping")
            except Exception:
                break
            await asyncio.sleep(15)

    ping_task = asyncio.create_task(_keepalive())

    try:
        while True:
            try:
                raw = await asyncio.wait_for(websocket.receive_text(), timeout=120)
            except asyncio.TimeoutError:
                logger.info("[openclaw-gw] user=%s timed out (no message in 120s)", client.user_id)
                break

            # Ignore ping/pong
            if raw.strip().lower() in ("ping", "pong"):
                try:
                    await websocket.send_text("pong")
                except Exception:
                    break
                continue

            try:
                frame = json.loads(raw)
            except json.JSONDecodeError:
                continue

            if frame.get("type") != "req":
                continue

            req_id = frame.get("id", "?")
            method = frame.get("method", "")
            params = frame.get("params", {})

            await _dispatch(client, cache, req_id, method, params)

    except WebSocketDisconnect:
        logger.info("[openclaw-gw] client disconnected (user=%s)", client.user_id)
    except Exception:
        logger.exception("[openclaw-gw] error for user=%s", client.user_id)
    finally:
        ping_alive = False
        ping_task.cancel()
        unregister_oc_client(client)
        try:
            await websocket.close()
        except Exception:
            pass


# ── Method dispatcher ───────────────────────────────────────────────────


async def _dispatch(client: OpenClawClient, cache, req_id: str, method: str, params: dict) -> None:
    try:
        match method:
            case "connect":
                await _handle_connect(client, cache, req_id, params)
            case "cron.list":
                await _handle_cron_list(client, cache, req_id)
            case "cron.add":
                await _handle_cron_add(client, cache, req_id, params)
            case "cron.remove":
                await _handle_cron_remove(client, cache, req_id, params)
            case "node.register":
                # Ack — we track caps but don't need to do anything else
                client.caps = params.get("capabilities", [])
                await client.send_response(req_id, True, {"registered": True})
            case "chat.send":
                await _handle_chat_send(client, cache, req_id, params)
            case "node.invoke.result":
                # Client returning result from a node.invoke — log and discard
                logger.debug("[openclaw-gw] node.invoke.result from user=%s", client.user_id)
                await client.send_response(req_id, True)
            case _:
                await client.send_response(req_id, False, error={
                    "code": "unknown_method",
                    "message": f"Unknown method: {method}",
                })
    except Exception as exc:
        logger.exception("[openclaw-gw] dispatch error: %s %s", method, exc)
        await client.send_response(req_id, False, error={
            "code": "internal_error",
            "message": str(exc),
        })


# ── connect ─────────────────────────────────────────────────────────────


async def _handle_connect(client: OpenClawClient, cache, req_id: str, params: dict) -> None:
    # Device identity (optional — API key already authenticated)
    device = params.get("device", {})
    if device:
        client.device_id = device.get("id")

    # Register client for push events
    register_oc_client(client)

    available_methods = [
        "connect", "cron.list", "cron.add", "cron.remove",
        "node.register", "node.invoke.result", "chat.send",
    ]
    available_events = [
        "connect.challenge", "node.invoke", "alert", "cron.result",
    ]

    await client.send_response(req_id, True, {
        "connId": client.conn_id,
        "methods": available_methods,
        "events": available_events,
        "deviceToken": None,  # not needed — API key is the auth
    })

    logger.info(
        "[openclaw-gw] user=%s connected (device=%s, plan=%s)",
        client.user_id, client.device_id or "none", client.user.get("plan", "free"),
    )


# ── cron.list ───────────────────────────────────────────────────────────


async def _handle_cron_list(client: OpenClawClient, cache, req_id: str) -> None:
    db = await cache._get_conn()
    cursor = await db.execute(
        "SELECT id, name, schedule, payload, delivery, enabled, last_run, next_run "
        "FROM user_crons WHERE user_id = ? ORDER BY name",
        (client.user_id,),
    )
    rows = await cursor.fetchall()
    jobs = []
    for r in rows:
        jobs.append({
            "id": r[0],
            "name": r[1],
            "schedule": json.loads(r[2]) if r[2] else {},
            "payload": json.loads(r[3]) if r[3] else {},
            "delivery": json.loads(r[4]) if r[4] else {},
            "enabled": bool(r[5]),
            "lastRun": r[6],
            "nextRun": r[7],
            "status": "active" if r[5] else "paused",
        })

    await client.send_response(req_id, True, {"jobs": jobs})


# ── cron.add ────────────────────────────────────────────────────────────


async def _handle_cron_add(client: OpenClawClient, cache, req_id: str, params: dict) -> None:
    name = params.get("name", "")
    if not name:
        await client.send_response(req_id, False, error={
            "code": "invalid_params", "message": "name is required",
        })
        return

    cron_id = f"cron-{uuid.uuid4().hex[:12]}"
    schedule = json.dumps(params.get("schedule", {}))
    # Mobile sends 'text' for the prompt; normalize to payload
    text = params.get("text", "")
    payload_obj = params.get("payload", {"type": "agentTurn", "message": text})
    payload = json.dumps(payload_obj)
    delivery = json.dumps(params.get("delivery", {"mode": "announce"}))
    enabled = 1 if params.get("enabled", True) else 0

    db = await cache._get_conn()

    # Upsert: if same name exists for this user, replace
    await db.execute(
        "DELETE FROM user_crons WHERE user_id = ? AND name = ?",
        (client.user_id, name),
    )
    await db.execute(
        "INSERT INTO user_crons (id, user_id, name, schedule, payload, delivery, enabled, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (cron_id, client.user_id, name, schedule, payload, delivery, enabled, time.time()),
    )
    await db.commit()

    await client.send_response(req_id, True, {"id": cron_id, "status": "active"})
    logger.info("[openclaw-gw] cron.add user=%s name=%s", client.user_id, name)


# ── cron.remove ─────────────────────────────────────────────────────────


async def _handle_cron_remove(client: OpenClawClient, cache, req_id: str, params: dict) -> None:
    cron_id = params.get("id", "")
    if not cron_id:
        await client.send_response(req_id, False, error={
            "code": "invalid_params", "message": "id is required",
        })
        return

    db = await cache._get_conn()
    cursor = await db.execute(
        "DELETE FROM user_crons WHERE id = ? AND user_id = ?",
        (cron_id, client.user_id),
    )
    await db.commit()
    deleted = cursor.rowcount > 0

    await client.send_response(req_id, True, {"deleted": deleted})
    if deleted:
        logger.info("[openclaw-gw] cron.remove user=%s id=%s", client.user_id, cron_id)


# ── Cron sweep loop (runs in background) ────────────────────────────────

_cron_sweep_task: Optional[asyncio.Task] = None
_CRON_CHECK_INTERVAL = 60  # seconds


def schedule_cron_sweep(cache) -> None:
    global _cron_sweep_task
    _cron_sweep_task = asyncio.create_task(_cron_sweep_loop(cache))
    logger.info("[openclaw-gw] cron sweep scheduled (check every %ds)", _CRON_CHECK_INTERVAL)


def cancel_cron_sweep() -> None:
    global _cron_sweep_task
    if _cron_sweep_task:
        _cron_sweep_task.cancel()


async def _cron_sweep_loop(cache) -> None:
    """Check for due cron jobs and execute them."""
    import croniter  # noqa: PLC0415

    while True:
        await asyncio.sleep(_CRON_CHECK_INTERVAL)
        try:
            db = await cache._get_conn()
            cursor = await db.execute(
                "SELECT id, user_id, name, schedule, payload, delivery, last_run "
                "FROM user_crons WHERE enabled = 1"
            )
            jobs = await cursor.fetchall()
            now = time.time()

            for row in jobs:
                cron_id, user_id, name, schedule_json, payload_json, delivery_json, last_run = row
                try:
                    schedule = json.loads(schedule_json)
                except json.JSONDecodeError:
                    continue

                # Parse schedule — support { kind: "cron", at: "0 */6 * * *" }
                # and { cron: "0 */6 * * *" } formats
                cron_expr = schedule.get("at") or schedule.get("cron")
                if not cron_expr:
                    continue

                tz_str = schedule.get("timezone", "UTC")

                try:
                    # Compute next run from last_run (or creation)
                    from datetime import datetime, timezone  # noqa: PLC0415
                    if last_run:
                        # last_run is stored as ISO string — parse it
                        if isinstance(last_run, str):
                            base_dt = datetime.fromisoformat(last_run)
                        else:
                            base_dt = datetime.fromtimestamp(float(last_run), tz=timezone.utc)
                    else:
                        base_dt = datetime.fromtimestamp(now - 86400, tz=timezone.utc)
                    cron = croniter.croniter(cron_expr, base_dt)
                    next_run_dt = cron.get_next(datetime)
                    next_run_ts = next_run_dt.timestamp()
                except Exception as _cron_exc:
                    logger.debug("[openclaw-gw] cron parse error for %s: %s", name, _cron_exc)
                    continue

                if next_run_ts > now:
                    # Update next_run in DB for display purposes
                    await db.execute(
                        "UPDATE user_crons SET next_run = ? WHERE id = ?",
                        (next_run_dt.isoformat(), cron_id),
                    )
                    continue  # not due yet

                # Job is due — execute it
                logger.info("[openclaw-gw] cron firing: user=%s name=%s", user_id, name)

                await db.execute(
                    "UPDATE user_crons SET last_run = ? WHERE id = ?",
                    (datetime.now(timezone.utc).isoformat(), cron_id),
                )
                await db.commit()

                # Fire the cron job asynchronously
                asyncio.create_task(
                    _execute_cron_job(cache, user_id, name, payload_json, delivery_json)
                )

        except Exception:
            logger.exception("[openclaw-gw] cron sweep error")


async def _execute_cron_job(cache, user_id: int, name: str, payload_json: str, delivery_json: str) -> None:
    """Execute a single cron job — trigger watchlist re-scan or briefing."""
    try:
        payload = json.loads(payload_json)
        message = payload.get("message", "")

        # Watchlist re-scan crons: name = "lineage:watchlist:{watchId}"
        if name.startswith("lineage:watchlist:"):
            from .watchlist_monitor_service import run_single_rescan  # noqa: PLC0415
            parts = name.split(":")
            if len(parts) >= 3:
                watch_suffix = parts[2]
                db = await cache._get_conn()
                # Read user plan to route AI correctly
                _plan_cursor = await db.execute("SELECT plan FROM users WHERE id = ?", (user_id,))
                _plan_row = await _plan_cursor.fetchone()
                _user_plan = _plan_row[0] if _plan_row else "free"
                cursor = await db.execute(
                    "SELECT id FROM user_watches WHERE user_id = ? AND id = ?",
                    (user_id, watch_suffix),
                )
                row = await cursor.fetchone()
                if row:
                    await run_single_rescan(row[0], user_id, cache, plan=_user_plan)
                    logger.info("[openclaw-gw] watchlist rescan done: user=%s watch=%s", user_id, watch_suffix)
            return

        # Briefing crons: name = "lineage:briefing"
        if name == "lineage:briefing":
            from .briefing_service import generate_briefing  # noqa: PLC0415
            content = await generate_briefing(user_id, cache)
            if content:
                # Push briefing to connected devices
                await push_event_to_user(user_id, "cron.result", {
                    "name": name,
                    "content": content,
                })
                # Also send FCM push if user has a token
                try:
                    db2 = await cache._get_conn()
                    cur2 = await db2.execute(
                        "SELECT fcm_token FROM users WHERE id = ? AND fcm_token IS NOT NULL",
                        (user_id,),
                    )
                    fcm_row = await cur2.fetchone()
                    if fcm_row and fcm_row[0]:
                        from .alert_service import _send_fcm_push  # noqa: PLC0415
                        await _send_fcm_push(
                            fcm_row[0], title="Daily Briefing",
                            body=content[:200], data={"type": "briefing"},
                        )
                except Exception:
                    pass
            return

        # Generic cron — just push event to connected clients
        await push_event_to_user(user_id, "cron.result", {
            "name": name,
            "message": message,
        })

    except Exception:
        logger.exception("[openclaw-gw] cron execution error: user=%s name=%s", user_id, name)


# ── chat.send — stream AI response via WebSocket events ─────────────────


async def _handle_chat_send(client: OpenClawClient, cache, req_id: str, params: dict) -> None:
    """Handle chat.send — run Claude streaming in background, push 'chat' events."""
    message = params.get("message", "")
    session_key = params.get("sessionKey", "")
    idempotency_key = params.get("idempotencyKey", req_id)

    if not message:
        await client.send_response(req_id, False, error={
            "code": "invalid_params", "message": "message is required",
        })
        return

    # Ack immediately (non-blocking) — response streams via events
    await client.send_response(req_id, True, {
        "runId": idempotency_key,
        "status": "started",
    })

    # Run the streaming in background
    asyncio.create_task(_stream_chat_to_client(client, cache, idempotency_key, session_key, message))


async def _stream_chat_to_client(
    client: OpenClawClient,
    cache,
    run_id: str,
    session_key: str,
    message: str,
) -> None:
    """Stream Claude AI response to the client via 'chat' events."""
    seq = 0

    async def _push_chat_event(state: str, text: str = "", error_msg: str = "") -> None:
        nonlocal seq
        seq += 1
        payload: dict = {
            "runId": run_id,
            "sessionKey": session_key,
            "seq": seq,
            "state": state,
        }
        if text:
            payload["message"] = {
                "role": "assistant",
                "content": [{"type": "text", "text": text}],
                "timestamp": int(time.time() * 1000),
            }
        if state == "final" and text:
            payload["message"]["stopReason"] = "end_turn"
        if error_msg:
            payload["errorMessage"] = error_msg
        await client.send_event("chat", payload)

    try:
        from .ai_analyst import _get_client as _get_ai_client, _MODEL  # noqa: PLC0415
        from .chat_service import get_system_prompt  # noqa: PLC0415

        # Extract mint from session key if present (lineage:token:{mint})
        mint = None
        if session_key.startswith("lineage:token:"):
            mint = session_key.split(":", 2)[2] if session_key.count(":") >= 2 else None

        # Build forensic context
        system_prompt = get_system_prompt()
        context_parts: list[str] = []
        if mint:
            context_parts.append(f"MINT ADDRESS: {mint}")
            try:
                from .lineage_detector import get_cached_lineage_report  # noqa: PLC0415
                _lin = await get_cached_lineage_report(mint)
                if _lin:
                    _qt = getattr(_lin, "query_token", None) or getattr(_lin, "root", None)
                    if _qt:
                        context_parts.append(
                            f"TOKEN: {getattr(_qt, 'name', '?')} ({getattr(_qt, 'symbol', '?')})"
                        )
                        context_parts.append(f"DEPLOYER: {getattr(_qt, 'deployer', 'N/A')}")
                        _mcap = getattr(_qt, "market_cap_usd", None)
                        if _mcap:
                            context_parts.append(f"MCap: ${_mcap:,.0f}")
            except Exception:
                pass

        forensic_ctx = "\n".join(context_parts) if context_parts else "No token context."
        full_system = f"{system_prompt}\n\n---\nFORENSIC CONTEXT:\n{forensic_ctx}\n---"

        # Stream Claude
        ai_client = _get_ai_client()
        cumulative_text = ""

        async with ai_client.messages.stream(
            model=_MODEL,
            max_tokens=400,
            temperature=0,
            system=full_system,
            messages=[{"role": "user", "content": message}],
        ) as stream:
            last_push = time.monotonic()
            async for chunk in stream.text_stream:
                cumulative_text += chunk
                # Push delta every ~150ms (match mobile expectation)
                now = time.monotonic()
                if now - last_push >= 0.15:
                    await _push_chat_event("delta", cumulative_text)
                    last_push = now

        # Final event with complete text
        await _push_chat_event("final", cumulative_text)

    except Exception as exc:
        logger.exception("[openclaw-gw] chat.send error for user=%s", client.user_id)
        await _push_chat_event("error", error_msg=str(exc))


# ── Alert bridge: forward rug alerts to OpenClaw clients ────────────────


async def forward_alert_to_openclaw(user_id: int, alert: dict) -> int:
    """Called from alert_service to push alerts to OpenClaw-connected devices.
    Returns the number of clients that received the event."""
    return await push_event_to_user(user_id, "alert", alert)
