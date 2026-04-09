"""Tests for the Helius Enhanced webhook handler.

Covers signature verification (shared-secret bearer model — Helius sends
the ``authHeader`` value verbatim), mint extraction, the watched-mints
filter, dispatch to ``trigger_immediate_rescan`` (mocked), and edge cases
around malformed or empty payloads.
"""
from __future__ import annotations

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from lineage_agent import webhook_helius as _webhook_mod
from lineage_agent.webhook_helius import (
    HeliusWebhookError,
    extract_mints,
    handle_helius_webhook,
    invalidate_watched_mints_cache,
    verify_signature,
)


SECRET = "test-secret-abcdef"


def _make_cache(watched: list[str]):
    """Build a mock cache whose ``_get_conn()`` serves *watched* mints.

    Mirrors the subset of ``SQLiteCache`` that the webhook filter touches:
    ``await cache._get_conn()`` → ``await db.execute(sql, ...)`` →
    ``await cursor.fetchall()`` returning ``(value,)`` tuples.
    """
    rows = [(m,) for m in watched]
    cursor = SimpleNamespace(fetchall=AsyncMock(return_value=rows))
    db = SimpleNamespace(execute=AsyncMock(return_value=cursor))
    cache = SimpleNamespace(_get_conn=AsyncMock(return_value=db))
    return cache


@pytest.fixture(autouse=True)
def _reset_watched_mints_cache():
    """Ensure the module-level watched-mints cache is empty between tests."""
    _webhook_mod._watched_mints_cache = set()
    _webhook_mod._watched_mints_expiry = 0.0
    yield
    _webhook_mod._watched_mints_cache = set()
    _webhook_mod._watched_mints_expiry = 0.0


def _sign(body: bytes, secret: str = SECRET) -> str:  # noqa: ARG001 - body ignored
    """Return the Authorization header value Helius would send.

    With the shared-secret bearer model, Helius sends the configured
    ``authHeader`` verbatim regardless of the body. Kept as a helper so
    individual tests stay short and intent-revealing.
    """
    return secret


def _event(mint: str, tx_type: str = "SWAP") -> dict:
    return {
        "type": tx_type,
        "source": "RAYDIUM",
        "signature": "5abc",
        "tokenTransfers": [
            {
                "fromUserAccount": "A",
                "toUserAccount": "B",
                "mint": mint,
                "tokenAmount": 1.0,
            }
        ],
        "nativeTransfers": [],
    }


# ---------------------------------------------------------------------------
# verify_signature
# ---------------------------------------------------------------------------

def test_verify_signature_accepts_raw_secret():
    """Helius sends the configured authHeader verbatim — plain secret matches."""
    assert verify_signature(b'[{"a":1}]', SECRET, SECRET) is True


def test_verify_signature_accepts_bearer_prefix():
    """Robust against proxies that prepend 'Bearer '."""
    assert verify_signature(b'[{"a":1}]', f"Bearer {SECRET}", SECRET) is True


def test_verify_signature_accepts_sha256_prefix():
    """Robust against legacy configs that prepend 'sha256='."""
    assert verify_signature(b'[{"a":1}]', f"sha256={SECRET}", SECRET) is True


def test_verify_signature_rejects_wrong_token():
    assert verify_signature(b'[{"a":1}]', "other-secret", SECRET) is False


def test_verify_signature_empty_secret_fails_closed():
    assert verify_signature(b'[]', SECRET, "") is False


def test_verify_signature_empty_token_fails_closed():
    assert verify_signature(b'[]', "", SECRET) is False


def test_verify_signature_ignores_body():
    """Body is never part of the check — only the bearer token matches."""
    assert verify_signature(b'any-body-whatsoever', SECRET, SECRET) is True


# ---------------------------------------------------------------------------
# extract_mints
# ---------------------------------------------------------------------------

def test_extract_mints_from_token_transfers():
    events = [_event("MINT_A"), _event("MINT_B")]
    assert extract_mints(events) == ["MINT_A", "MINT_B"]


def test_extract_mints_dedupe_preserves_order():
    events = [_event("MINT_A"), _event("MINT_B"), _event("MINT_A")]
    assert extract_mints(events) == ["MINT_A", "MINT_B"]


def test_extract_mints_falls_back_to_account_data():
    events = [
        {
            "type": "BURN",
            "tokenTransfers": [],
            "accountData": [
                {
                    "account": "X",
                    "tokenBalanceChanges": [
                        {"mint": "MINT_C", "rawTokenAmount": {"tokenAmount": "-1"}}
                    ],
                }
            ],
        }
    ]
    assert extract_mints(events) == ["MINT_C"]


def test_extract_mints_ignores_garbage():
    events = [{}, None, {"tokenTransfers": [None, {"mint": 0}]}]
    assert extract_mints(events) == []  # type: ignore[list-item]


# ---------------------------------------------------------------------------
# handle_helius_webhook — happy path & dispatch
# ---------------------------------------------------------------------------


async def test_webhook_valid_signature_triggers_rescan():
    events = [_event("MINT_A"), _event("MINT_B"), _event("MINT_A")]
    body = json.dumps(events).encode()
    sig = _sign(body)
    cache = _make_cache(["MINT_A", "MINT_B"])

    mock_rescan = AsyncMock(return_value={"skipped": False})

    with patch(
        "lineage_agent.watchlist_monitor_service.trigger_immediate_rescan",
        mock_rescan,
    ):
        result = await handle_helius_webhook(body, sig, cache=cache, secret=SECRET)

    assert result["status"] == "ok"
    assert result["mints"] == 2  # dedup MINT_A
    assert result["dispatched"] == 2
    # Yield so that the background tasks created via asyncio.create_task run
    import asyncio
    await asyncio.sleep(0)
    assert mock_rescan.await_count == 2
    called_mints = sorted(call.args[0] for call in mock_rescan.await_args_list)
    assert called_mints == ["MINT_A", "MINT_B"]


async def test_webhook_invalid_signature_rejects():
    body = json.dumps([_event("MINT_A")]).encode()
    bad_sig = _sign(body, secret="other")
    mock_rescan = AsyncMock()

    with patch(
        "lineage_agent.watchlist_monitor_service.trigger_immediate_rescan",
        mock_rescan,
    ):
        with pytest.raises(HeliusWebhookError) as exc_info:
            await handle_helius_webhook(body, bad_sig, cache=object(), secret=SECRET)

    assert exc_info.value.status == 401
    mock_rescan.assert_not_called()


async def test_webhook_disabled_when_secret_empty():
    body = b"[]"
    with pytest.raises(HeliusWebhookError) as exc_info:
        await handle_helius_webhook(body, "irrelevant", cache=object(), secret="")
    assert exc_info.value.status == 503


async def test_webhook_empty_payload_acks():
    body = b"[]"
    sig = _sign(body)
    result = await handle_helius_webhook(body, sig, cache=object(), secret=SECRET)
    assert result == {"status": "ok", "mints": 0, "dispatched": 0}


async def test_webhook_malformed_json_returns_400():
    body = b"not json"
    sig = _sign(body)
    with pytest.raises(HeliusWebhookError) as exc_info:
        await handle_helius_webhook(body, sig, cache=object(), secret=SECRET)
    assert exc_info.value.status == 400


async def test_webhook_accepts_object_payload_with_events_key():
    """Defensive: Helius normally sends a list, but accept {events: [...]} too."""
    payload = {"events": [_event("MINT_X")]}
    body = json.dumps(payload).encode()
    sig = _sign(body)
    cache = _make_cache(["MINT_X"])

    mock_rescan = AsyncMock()
    with patch(
        "lineage_agent.watchlist_monitor_service.trigger_immediate_rescan",
        mock_rescan,
    ):
        result = await handle_helius_webhook(body, sig, cache=cache, secret=SECRET)

    assert result["mints"] == 1


async def test_webhook_events_without_mints_ack_zero():
    events = [{"type": "UNKNOWN", "tokenTransfers": [], "accountData": []}]
    body = json.dumps(events).encode()
    sig = _sign(body)

    mock_rescan = AsyncMock()
    with patch(
        "lineage_agent.watchlist_monitor_service.trigger_immediate_rescan",
        mock_rescan,
    ):
        result = await handle_helius_webhook(body, sig, cache=object(), secret=SECRET)

    assert result == {"status": "ok", "mints": 0, "dispatched": 0}
    mock_rescan.assert_not_called()


# ---------------------------------------------------------------------------
# Watched-mints filter — the hot-path fix for webhook storms
# ---------------------------------------------------------------------------

async def test_webhook_filters_noise_mints():
    """Wrapped SOL / USDC / USDT must never be dispatched even if watched."""
    wrapped_sol = "So11111111111111111111111111111111111111112"
    usdc = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
    events = [_event(wrapped_sol), _event(usdc), _event("MINT_REAL")]
    body = json.dumps(events).encode()
    sig = _sign(body)
    cache = _make_cache(["MINT_REAL"])

    mock_rescan = AsyncMock()
    with patch(
        "lineage_agent.watchlist_monitor_service.trigger_immediate_rescan",
        mock_rescan,
    ):
        result = await handle_helius_webhook(body, sig, cache=cache, secret=SECRET)

    import asyncio
    await asyncio.sleep(0)
    assert result["dispatched"] == 1
    called_mints = [call.args[0] for call in mock_rescan.await_args_list]
    assert called_mints == ["MINT_REAL"]


async def test_webhook_drops_unwatched_mints():
    """Mints present in the payload but absent from user_watches are dropped."""
    events = [_event("MINT_WATCHED"), _event("MINT_COLLATERAL")]
    body = json.dumps(events).encode()
    sig = _sign(body)
    cache = _make_cache(["MINT_WATCHED"])

    mock_rescan = AsyncMock()
    with patch(
        "lineage_agent.watchlist_monitor_service.trigger_immediate_rescan",
        mock_rescan,
    ):
        result = await handle_helius_webhook(body, sig, cache=cache, secret=SECRET)

    import asyncio
    await asyncio.sleep(0)
    assert result["dispatched"] == 1
    assert result.get("filtered") is None  # at least one survived
    called_mints = [call.args[0] for call in mock_rescan.await_args_list]
    assert called_mints == ["MINT_WATCHED"]


async def test_webhook_empty_watchlist_dispatches_nothing():
    """Fresh deploy with zero watches → ack + drop everything."""
    events = [_event("MINT_A"), _event("MINT_B")]
    body = json.dumps(events).encode()
    sig = _sign(body)
    cache = _make_cache([])  # no watches at all

    mock_rescan = AsyncMock()
    with patch(
        "lineage_agent.watchlist_monitor_service.trigger_immediate_rescan",
        mock_rescan,
    ):
        result = await handle_helius_webhook(body, sig, cache=cache, secret=SECRET)

    assert result["dispatched"] == 0
    assert result["mints"] == 0
    assert result["filtered"] == 2
    mock_rescan.assert_not_called()


async def test_webhook_db_failure_falls_back_safely():
    """If the DB lookup explodes, keep the stale cache and fail closed."""
    events = [_event("MINT_A")]
    body = json.dumps(events).encode()
    sig = _sign(body)

    cache = SimpleNamespace(
        _get_conn=AsyncMock(side_effect=RuntimeError("db down"))
    )

    mock_rescan = AsyncMock()
    with patch(
        "lineage_agent.watchlist_monitor_service.trigger_immediate_rescan",
        mock_rescan,
    ):
        result = await handle_helius_webhook(body, sig, cache=cache, secret=SECRET)

    # Cache stayed empty → nothing dispatched, no exception raised
    assert result["dispatched"] == 0
    mock_rescan.assert_not_called()


async def test_invalidate_watched_mints_cache_forces_refresh():
    """Calling invalidate_watched_mints_cache() should trigger a reload."""
    cache = _make_cache(["MINT_A"])
    body = json.dumps([_event("MINT_A")]).encode()
    sig = _sign(body)

    with patch(
        "lineage_agent.watchlist_monitor_service.trigger_immediate_rescan",
        AsyncMock(),
    ):
        # First call populates the cache from ["MINT_A"]
        await handle_helius_webhook(body, sig, cache=cache, secret=SECRET)
        assert _webhook_mod._watched_mints_cache == {"MINT_A"}

        # Swap the underlying watched set, then invalidate — next call must see MINT_B.
        cache2 = _make_cache(["MINT_B"])
        invalidate_watched_mints_cache()
        body2 = json.dumps([_event("MINT_B")]).encode()
        result = await handle_helius_webhook(body2, sig, cache=cache2, secret=SECRET)
        assert _webhook_mod._watched_mints_cache == {"MINT_B"}
        assert result["dispatched"] == 1
