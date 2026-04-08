"""Tests for the Helius Enhanced webhook handler.

Covers signature verification, mint extraction, dispatch to
``trigger_immediate_rescan`` (mocked), and edge cases around malformed or
empty payloads.
"""
from __future__ import annotations

import hashlib
import hmac
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from lineage_agent.webhook_helius import (
    HeliusWebhookError,
    extract_mints,
    handle_helius_webhook,
    verify_signature,
)


SECRET = "test-secret-abcdef"


def _sign(body: bytes, secret: str = SECRET) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


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

def test_verify_signature_accepts_raw_hex():
    body = b'[{"a":1}]'
    sig = _sign(body)
    assert verify_signature(body, sig, SECRET) is True


def test_verify_signature_accepts_sha256_prefix():
    body = b'[{"a":1}]'
    sig = "sha256=" + _sign(body)
    assert verify_signature(body, sig, SECRET) is True


def test_verify_signature_rejects_wrong_secret():
    body = b'[{"a":1}]'
    sig = _sign(body, secret="other-secret")
    assert verify_signature(body, sig, SECRET) is False


def test_verify_signature_empty_secret_fails_closed():
    body = b'[]'
    assert verify_signature(body, _sign(body), "") is False


def test_verify_signature_empty_token_fails_closed():
    assert verify_signature(b'[]', "", SECRET) is False


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

    mock_rescan = AsyncMock(return_value={"skipped": False})

    with patch(
        "lineage_agent.watchlist_monitor_service.trigger_immediate_rescan",
        mock_rescan,
    ):
        result = await handle_helius_webhook(body, sig, cache=object(), secret=SECRET)

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

    mock_rescan = AsyncMock()
    with patch(
        "lineage_agent.watchlist_monitor_service.trigger_immediate_rescan",
        mock_rescan,
    ):
        result = await handle_helius_webhook(body, sig, cache=object(), secret=SECRET)

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
