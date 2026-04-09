"""Helius Enhanced webhook handler.

Validates incoming Helius events (shared-secret bearer in the Authorization
header), extracts impacted mints from ``tokenTransfers``, filters them to
the mints actually in ``user_watches`` (via a 60s in-memory cache), and
dispatches immediate rescans via
``watchlist_monitor_service.trigger_immediate_rescan``.

Filtering is critical: pump.fun/Raydium swaps always include Wrapped SOL
and often USDC/USDT in their ``tokenTransfers``. Without the filter we
fan out one background task per collateral mint, flooding the event loop
and starving concurrent forensic scans (proxy PU02 errors on Fly, 90s
pipeline cancellations, etc.).

The endpoint is disabled when ``HELIUS_WEBHOOK_SECRET`` is empty — in that
case the API layer returns 503 and Lineage Agent keeps using its existing
poll-based sweep loop as the sole monitor.
"""
from __future__ import annotations

import asyncio
import hmac
import json
import logging
import time
from typing import Any

import config as _config

logger = logging.getLogger(__name__)

# Common collateral / quote mints that appear in nearly every swap tx but
# are never legitimate watchlist targets. Always dropped before dispatch,
# even if the watched-mints cache lookup fails.
_NOISE_MINTS: frozenset[str] = frozenset({
    "So11111111111111111111111111111111111111112",  # Wrapped SOL
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",  # USDC
    "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",  # USDT
})

# In-memory cache of mints currently in user_watches (sub_type='mint').
# Refreshed opportunistically from handle_helius_webhook — never blocks
# the hot path. Stale-on-error: if a refresh fails, we keep the last
# known set rather than dropping all events.
_watched_mints_cache: set[str] = set()
_watched_mints_expiry: float = 0.0
_WATCHED_MINTS_TTL = 60.0  # seconds
_watched_mints_lock = asyncio.Lock()


async def _refresh_watched_mints(cache: Any) -> set[str]:
    """Reload the watched-mints set from the ``user_watches`` table.

    Safe to call concurrently — an asyncio lock prevents duplicate queries.
    Returns the current set (possibly stale) on any error.
    """
    global _watched_mints_cache, _watched_mints_expiry  # noqa: PLW0603
    async with _watched_mints_lock:
        # Double-checked — another coroutine may have refreshed while we waited
        if time.monotonic() < _watched_mints_expiry:
            return _watched_mints_cache
        try:
            db = await cache._get_conn()
            cursor = await db.execute(
                "SELECT DISTINCT value FROM user_watches WHERE sub_type = 'mint'"
            )
            rows = await cursor.fetchall()
            _watched_mints_cache = {r[0] for r in rows if r[0]}
            _watched_mints_expiry = time.monotonic() + _WATCHED_MINTS_TTL
            logger.debug(
                "[helius_webhook] watched-mints cache refreshed: %d mints",
                len(_watched_mints_cache),
            )
        except Exception as exc:
            logger.warning(
                "[helius_webhook] failed to refresh watched-mints cache: %s "
                "(keeping %d stale entries)",
                exc, len(_watched_mints_cache),
            )
        return _watched_mints_cache


async def _filter_to_watched(mints: list[str], cache: Any) -> list[str]:
    """Keep only mints that are currently in ``user_watches``.

    Always drops known noise mints (Wrapped SOL, USDC, USDT) as a safety
    net — even if the watched-mints cache is empty (e.g. on cold start)
    we never want to fan out rescans for those.

    If the cache is still empty after a refresh attempt (legitimately no
    watches, or DB unreachable), we fall back to the noise-blocklist only
    and dispatch nothing — correct behaviour on fresh deploys with zero
    watches, and fail-safe on DB failures.
    """
    if not mints:
        return []
    # Cheap synchronous prefilter — strip obvious noise before we touch the DB.
    prefiltered = [m for m in mints if m not in _NOISE_MINTS]
    if not prefiltered:
        return []
    # Refresh cache if expired (non-blocking for other callers via the lock)
    if time.monotonic() >= _watched_mints_expiry:
        await _refresh_watched_mints(cache)
    if not _watched_mints_cache:
        # No active watches → nothing legitimate to dispatch for
        return []
    return [m for m in prefiltered if m in _watched_mints_cache]


def invalidate_watched_mints_cache() -> None:
    """Force the next webhook call to reload ``user_watches``.

    Call this from any code path that adds or removes a mint watch so
    the webhook starts/stops dispatching for it within one request
    instead of waiting up to ``_WATCHED_MINTS_TTL`` seconds.
    """
    global _watched_mints_expiry  # noqa: PLW0603
    _watched_mints_expiry = 0.0


class HeliusWebhookError(Exception):
    """Raised for any failure that should translate to a 4xx response."""

    def __init__(self, status: int, detail: str) -> None:
        super().__init__(detail)
        self.status = status
        self.detail = detail


def verify_signature(body: bytes, provided: str, secret: str) -> bool:
    """Verify the webhook Authorization header against the shared secret.

    Helius Enhanced Webhooks send the ``authHeader`` value we registered
    verbatim in the Authorization request header — it is a shared bearer
    token, **not** an HMAC over the body. Verification is therefore a
    constant-time equality check against the configured secret.

    The ``body`` argument is kept for API compatibility with earlier
    call sites but is intentionally unused. Accepts optional ``Bearer ``
    or ``sha256=`` prefixes for robustness behind proxies. Empty secret
    or empty token always fails closed.
    """
    del body  # unused — Helius does not HMAC the body
    if not secret or not provided:
        return False
    token = provided.strip()
    low = token.lower()
    if low.startswith("bearer "):
        token = token[7:].strip()
    elif low.startswith("sha256="):
        token = token[7:].strip()
    try:
        return hmac.compare_digest(token, secret)
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

    raw_mints = extract_mints(events)
    if not raw_mints:
        logger.info("[helius_webhook] %d event(s) with no mints — ack", len(events))
        return {"status": "ok", "mints": 0, "dispatched": 0}

    # Filter down to mints actually in the watchlist. This is the hot-path
    # optimisation that prevents the event-loop storm described in the
    # module docstring. Collateral mints like Wrapped SOL are dropped here.
    mints = await _filter_to_watched(raw_mints, cache)
    if not mints:
        logger.debug(
            "[helius_webhook] %d event(s) / %d mint(s) — none watched, ack",
            len(events), len(raw_mints),
        )
        return {
            "status": "ok",
            "events": len(events),
            "mints": 0,
            "dispatched": 0,
            "filtered": len(raw_mints),
        }

    logger.info(
        "[helius_webhook] %d event(s) → %d watched mint(s) (from %d raw): %s",
        len(events), len(mints), len(raw_mints),
        ", ".join(m[:12] for m in mints[:5]),
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
    "invalidate_watched_mints_cache",
]
