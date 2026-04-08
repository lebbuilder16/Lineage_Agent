"""Helius Enhanced webhook handler.

Validates incoming Helius events (HMAC-SHA256 over the raw body), extracts
impacted mints from ``tokenTransfers``, and dispatches immediate rescans via
``watchlist_monitor_service.trigger_immediate_rescan``.

The endpoint is disabled when ``HELIUS_WEBHOOK_SECRET`` is empty — in that
case the API layer returns 503 and Lineage Agent keeps using its existing
poll-based sweep loop as the sole monitor.
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
from typing import Any

import config as _config

logger = logging.getLogger(__name__)


class HeliusWebhookError(Exception):
    """Raised for any failure that should translate to a 4xx response."""

    def __init__(self, status: int, detail: str) -> None:
        super().__init__(detail)
        self.status = status
        self.detail = detail


def verify_signature(body: bytes, provided: str, secret: str) -> bool:
    """Constant-time HMAC-SHA256 comparison.

    *provided* is the raw value of the webhook auth header. Helius lets the
    caller set arbitrary strings, so we accept either ``sha256=<hex>`` or
    plain ``<hex>``. Empty secret always fails closed.
    """
    if not secret or not provided:
        return False
    token = provided.strip()
    if token.lower().startswith("sha256="):
        token = token.split("=", 1)[1].strip()
    expected = hmac.new(
        secret.encode("utf-8"),
        body,
        hashlib.sha256,
    ).hexdigest()
    try:
        return hmac.compare_digest(expected, token)
    except Exception:
        return False


def extract_mints(events: list[dict]) -> list[str]:
    """Return a de-duplicated list of mints referenced in *events*.

    Looks at ``tokenTransfers[].mint`` first, falls back to
    ``accountData[].tokenBalanceChanges[].mint`` for types where Helius does
    not populate tokenTransfers (e.g. BURN). Order is preserved to make
    logging and tests deterministic.
    """
    seen: dict[str, None] = {}  # dict preserves insertion order
    for ev in events:
        if not isinstance(ev, dict):
            continue
        for tt in ev.get("tokenTransfers") or []:
            if isinstance(tt, dict):
                m = tt.get("mint")
                if isinstance(m, str) and m:
                    seen.setdefault(m, None)
        for ad in ev.get("accountData") or []:
            if not isinstance(ad, dict):
                continue
            for tb in ad.get("tokenBalanceChanges") or []:
                if isinstance(tb, dict):
                    m = tb.get("mint")
                    if isinstance(m, str) and m:
                        seen.setdefault(m, None)
    return list(seen.keys())


async def handle_helius_webhook(
    body: bytes,
    signature: str,
    cache,
    *,
    secret: str | None = None,
) -> dict:
    """Validate, parse, and dispatch a Helius webhook payload.

    Returns a summary dict suitable for a JSON response. Raises
    :class:`HeliusWebhookError` for any recoverable validation failure —
    callers should translate ``.status`` / ``.detail`` to an HTTP response.

    The actual rescans run as background tasks so the handler returns within
    milliseconds (Helius requires a fast 2xx or it retries).
    """
    effective_secret = secret if secret is not None else _config.HELIUS_WEBHOOK_SECRET
    if not effective_secret:
        raise HeliusWebhookError(503, "Helius webhook disabled (no secret configured)")

    if not verify_signature(body, signature, effective_secret):
        logger.warning("[helius_webhook] signature rejected (body=%d bytes)", len(body))
        raise HeliusWebhookError(401, "invalid signature")

    try:
        payload = json.loads(body.decode("utf-8") if body else "[]")
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise HeliusWebhookError(400, f"invalid JSON: {exc}") from exc

    if isinstance(payload, dict):
        # Helius normally sends a list; accept {"events": [...]} defensively.
        events = payload.get("events") or []
    elif isinstance(payload, list):
        events = payload
    else:
        raise HeliusWebhookError(400, "payload must be list or object")

    if not events:
        logger.info("[helius_webhook] empty payload — ack")
        return {"status": "ok", "mints": 0, "dispatched": 0}

    mints = extract_mints(events)
    if not mints:
        logger.info("[helius_webhook] %d event(s) with no mints — ack", len(events))
        return {"status": "ok", "mints": 0, "dispatched": 0}

    logger.info(
        "[helius_webhook] %d event(s) → %d unique mint(s): %s",
        len(events), len(mints), ", ".join(m[:12] for m in mints[:5]),
    )

    # Dispatch as background tasks — Helius expects a fast ack.
    # trigger_immediate_rescan has its own per-mint dedup lock.
    from .watchlist_monitor_service import trigger_immediate_rescan

    dispatched = 0
    for mint in mints:
        try:
            asyncio.create_task(
                trigger_immediate_rescan(mint, reason="helius_webhook", cache=cache),
                name=f"helius_rescan_{mint[:8]}",
            )
            dispatched += 1
        except Exception as exc:
            logger.warning("[helius_webhook] task spawn failed for %s: %s", mint[:12], exc)

    return {
        "status": "ok",
        "events": len(events),
        "mints": len(mints),
        "dispatched": dispatched,
    }


__all__ = [
    "HeliusWebhookError",
    "verify_signature",
    "extract_mints",
    "handle_helius_webhook",
]
