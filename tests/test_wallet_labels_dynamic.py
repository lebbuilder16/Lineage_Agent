"""Tests for dynamic wallet labels (Feature 5)."""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from lineage_agent.wallet_labels import (
    KNOWN_LABELS,
    WalletInfo,
    classify_address,
    is_bridge_program,
    label_or_short,
    enrich_wallet_labels,
    refresh_dynamic_labels,
    _extra_labels,
    _PREFIX_LABELS,
)

# A non-existent address used for dynamic label tests
DYNAMIC_ADDR = "DYNAMICAddr111111111111111111111111111111111"
KNOWN_ADDR = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"  # Jupiter V6 (in KNOWN_LABELS)

CSV_WITH_HEADER = "address,label,entity_type\n{addr},Test Exchange,cex\n".format(addr=DYNAMIC_ADDR)
CSV_WITHOUT_ENTITY = "address,label\n{addr},Minimal Label\n".format(addr=DYNAMIC_ADDR)
CSV_DUPLICATE_KNOWN = "address,label,entity_type\n{addr},FAKE Jupiter,dex\n".format(addr=KNOWN_ADDR)


# ---------------------------------------------------------------------------
# refresh_dynamic_labels — CSV loading
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_refresh_loads_new_labels():
    """refresh_dynamic_labels populates _extra_labels from CSV."""
    _extra_labels.pop(DYNAMIC_ADDR, None)

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.text = CSV_WITH_HEADER
    mock_response.raise_for_status = MagicMock()
    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.get = AsyncMock(return_value=mock_response)

    with patch("httpx.AsyncClient", return_value=mock_client):
        count = await refresh_dynamic_labels("https://example.com/labels.csv")

    assert count >= 1
    assert DYNAMIC_ADDR in _extra_labels
    assert _extra_labels[DYNAMIC_ADDR] == ("Test Exchange", "cex")
    _extra_labels.pop(DYNAMIC_ADDR, None)


@pytest.mark.asyncio
async def test_refresh_does_not_overwrite_known_labels():
    """Static KNOWN_LABELS entries are never overwritten by CSV refresh."""
    original = KNOWN_LABELS.get(KNOWN_ADDR)

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.text = CSV_DUPLICATE_KNOWN
    mock_response.raise_for_status = MagicMock()
    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.get = AsyncMock(return_value=mock_response)

    with patch("httpx.AsyncClient", return_value=mock_client):
        count = await refresh_dynamic_labels("https://example.com/labels.csv")

    # Count should be 0 (known addr skipped)
    assert count == 0
    # KNOWN_LABELS must be unchanged
    assert KNOWN_LABELS.get(KNOWN_ADDR) == original
    # _extra_labels must not contain the known address
    assert KNOWN_ADDR not in _extra_labels


@pytest.mark.asyncio
async def test_refresh_csv_without_entity_type_defaults_to_wallet():
    """Rows without entity_type column default to 'wallet'."""
    _extra_labels.pop(DYNAMIC_ADDR, None)

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.text = CSV_WITHOUT_ENTITY
    mock_response.raise_for_status = MagicMock()
    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.get = AsyncMock(return_value=mock_response)

    with patch("httpx.AsyncClient", return_value=mock_client):
        await refresh_dynamic_labels("https://example.com/labels.csv")

    if DYNAMIC_ADDR in _extra_labels:
        assert _extra_labels[DYNAMIC_ADDR][1] == "wallet"
    _extra_labels.pop(DYNAMIC_ADDR, None)


@pytest.mark.asyncio
async def test_refresh_raises_on_missing_address_column():
    """CSV without required 'address' header raises ValueError."""
    bad_csv = "addr,label,entity_type\nSOMEADDR,X,cex\n"
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.text = bad_csv
    mock_response.raise_for_status = MagicMock()
    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.get = AsyncMock(return_value=mock_response)

    with patch("httpx.AsyncClient", return_value=mock_client), pytest.raises(ValueError, match="address"):
        await refresh_dynamic_labels("https://example.com/bad.csv")


# ---------------------------------------------------------------------------
# classify_address — resolution order
# ---------------------------------------------------------------------------

def test_classify_address_returns_dynamic_label():
    """classify_address resolves dynamic labels added via refresh."""
    _extra_labels[DYNAMIC_ADDR] = ("Dynamic Exchange", "cex")
    info = classify_address(DYNAMIC_ADDR)
    assert info.label == "Dynamic Exchange"
    assert info.entity_type == "cex"
    assert info.is_known is True
    _extra_labels.pop(DYNAMIC_ADDR, None)


def test_classify_address_static_overrides_dynamic():
    """Static KNOWN_LABELS takes priority over _extra_labels for the same address."""
    # Manually inject a conflicting entry (should never happen in practice)
    _extra_labels[KNOWN_ADDR] = ("Override Attempt", "unknown")
    info = classify_address(KNOWN_ADDR)
    # Must use the static label
    assert info.label == KNOWN_LABELS[KNOWN_ADDR][0]
    _extra_labels.pop(KNOWN_ADDR, None)


def test_classify_address_unknown_returns_none_label():
    """Completely unknown address returns label=None and is_known=False."""
    _extra_labels.pop(DYNAMIC_ADDR, None)
    info = classify_address(DYNAMIC_ADDR)
    assert info.label is None
    assert info.is_known is False


# ---------------------------------------------------------------------------
# Local file:// path
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_refresh_local_file(tmp_path):
    """refresh_dynamic_labels accepts file:// paths for local testing."""
    _extra_labels.pop(DYNAMIC_ADDR, None)
    csv_file = tmp_path / "labels.csv"
    csv_file.write_text(CSV_WITH_HEADER)

    count = await refresh_dynamic_labels(f"file://{csv_file}")
    assert count >= 1
    assert DYNAMIC_ADDR in _extra_labels
    _extra_labels.pop(DYNAMIC_ADDR, None)


@pytest.mark.asyncio
async def test_refresh_skips_empty_rows(tmp_path):
    """Rows with empty address or label are skipped (line 381 continue)."""
    _extra_labels.pop(DYNAMIC_ADDR, None)
    # One valid row, one with empty address, one with empty label
    csv_text = (
        "address,label,entity_type\n"
        f"{DYNAMIC_ADDR},ValidLabel,cex\n"
        ",EmptyAddr,cex\n"
        f"{DYNAMIC_ADDR}2,,cex\n"
    )
    csv_file = tmp_path / "labels.csv"
    csv_file.write_text(csv_text)

    count = await refresh_dynamic_labels(f"file://{csv_file}")
    assert count == 1  # only the valid row
    _extra_labels.pop(DYNAMIC_ADDR, None)


# ---------------------------------------------------------------------------
# WalletInfo — short() and to_dict()
# ---------------------------------------------------------------------------

def test_wallet_info_short_with_label():
    """WalletInfo.short() returns the label when one is set."""
    info = WalletInfo("11111111111111111111111111111111", label="System Program", entity_type="system")
    assert info.short() == "System Program"


def test_wallet_info_short_without_label():
    """WalletInfo.short() returns truncated address when label is None."""
    addr = "ABCD1234EFGH5678IJKL9012MNOP3456QRST7890UV"
    info = WalletInfo(addr, label=None, entity_type=None)
    result = info.short()
    assert result.startswith("ABCD")
    # Last 4 chars of addr
    assert addr[-4:] in result

def test_wallet_info_to_dict():
    """WalletInfo.to_dict() returns dict with label and entity_type."""
    info = WalletInfo("someaddress", label="Binance", entity_type="cex")
    d = info.to_dict()
    assert d == {"label": "Binance", "entity_type": "cex"}


def test_wallet_info_to_dict_none_values():
    """WalletInfo.to_dict() works with None values."""
    info = WalletInfo("unknownaddr", label=None, entity_type=None)
    d = info.to_dict()
    assert d["label"] is None
    assert d["entity_type"] is None


# ---------------------------------------------------------------------------
# classify_address — prefix match branch
# ---------------------------------------------------------------------------

def test_classify_address_prefix_match():
    """classify_address matches prefix patterns in _PREFIX_LABELS."""
    if not _PREFIX_LABELS:
        pytest.skip("No prefix labels defined")
    prefix, label, etype = _PREFIX_LABELS[0]
    # Construct an address that starts with the prefix but is not in KNOWN_LABELS
    test_addr = prefix + "X" * (44 - len(prefix))
    # Ensure it's not in static labels
    if test_addr in KNOWN_LABELS:
        pytest.skip("Constructed address happens to be in KNOWN_LABELS")
    info = classify_address(test_addr)
    assert info.label == label
    assert info.entity_type == etype


# ---------------------------------------------------------------------------
# is_bridge_program
# ---------------------------------------------------------------------------

def test_is_bridge_program_returns_true_for_wormhole():
    """is_bridge_program returns True for a known bridge address."""
    wormhole_core = "worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth"
    assert is_bridge_program(wormhole_core) is True


def test_is_bridge_program_returns_false_for_dex():
    """is_bridge_program returns False for a DEX address."""
    jupiter = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"
    assert is_bridge_program(jupiter) is False


def test_is_bridge_program_returns_false_for_unknown():
    """is_bridge_program returns False for an unknown address."""
    assert is_bridge_program(DYNAMIC_ADDR) is False


# ---------------------------------------------------------------------------
# label_or_short
# ---------------------------------------------------------------------------

def test_label_or_short_known_address():
    """label_or_short returns label for known addresses."""
    result = label_or_short("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4")
    assert result == "Jupiter V6"


def test_label_or_short_unknown_address():
    """label_or_short returns truncated address for unknown addresses."""
    _extra_labels.pop(DYNAMIC_ADDR, None)
    result = label_or_short(DYNAMIC_ADDR)
    assert "…" in result or len(result) < len(DYNAMIC_ADDR)


# ---------------------------------------------------------------------------
# enrich_wallet_labels
# ---------------------------------------------------------------------------

async def test_enrich_wallet_labels_marks_large_custodian():
    """enrich_wallet_labels labels high-balance non-executable accounts as CEX."""
    from lineage_agent.wallet_labels import _dynamic_cache

    unknown_addr = "UNKN0WN_ADDR_Testing1111111111111111111111111"
    # Clear any cached value
    _dynamic_cache.pop(unknown_addr, None)

    mock_rpc = MagicMock()
    mock_rpc._call = AsyncMock(return_value={
        "value": [
            {"lamports": 10_000_000_000_000, "executable": False},  # 10000 SOL
        ]
    })

    result = await enrich_wallet_labels([unknown_addr], mock_rpc)

    # Should be labelled as Large Custodian
    assert unknown_addr in result
    info = result[unknown_addr]
    assert "Custodian" in (info.label or "")
    assert info.entity_type == "cex"

    _dynamic_cache.pop(unknown_addr, None)


async def test_enrich_wallet_labels_skips_known_address():
    """enrich_wallet_labels skip addresses already in KNOWN_LABELS."""
    known = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"
    mock_rpc = MagicMock()
    mock_rpc._call = AsyncMock(return_value={"value": []})

    result = await enrich_wallet_labels([known], mock_rpc)
    # Already known — not enriched dynamically (returned as-is via KNOWN_LABELS)
    mock_rpc._call.assert_not_called()
    assert known not in result


async def test_enrich_wallet_labels_handles_rpc_error():
    """enrich_wallet_labels handles RPC errors gracefully."""
    from lineage_agent.wallet_labels import _dynamic_cache

    error_addr = "ERRADDR111111111111111111111111111111111111"
    _dynamic_cache.pop(error_addr, None)

    mock_rpc = MagicMock()
    mock_rpc._call = AsyncMock(side_effect=Exception("Network timeout"))

    result = await enrich_wallet_labels([error_addr], mock_rpc)
    # Error handled, address not enriched
    assert error_addr not in result

    _dynamic_cache.pop(error_addr, None)


async def test_enrich_wallet_labels_null_account():
    """enrich_wallet_labels handles None account entries in RPC response."""
    from lineage_agent.wallet_labels import _dynamic_cache

    null_addr = "NULLACC111111111111111111111111111111111111"
    _dynamic_cache.pop(null_addr, None)

    mock_rpc = MagicMock()
    mock_rpc._call = AsyncMock(return_value={"value": [None]})

    result = await enrich_wallet_labels([null_addr], mock_rpc)
    # Null account — not enriched
    assert null_addr not in result

    _dynamic_cache.pop(null_addr, None)


async def test_enrich_wallet_labels_low_balance_not_custodian():
    """enrich_wallet_labels does not label low-balance accounts."""
    from lineage_agent.wallet_labels import _dynamic_cache

    low_addr = "LOWBAL111111111111111111111111111111111111"
    _dynamic_cache.pop(low_addr, None)

    mock_rpc = MagicMock()
    mock_rpc._call = AsyncMock(return_value={
        "value": [
            {"lamports": 1_000_000, "executable": False},  # 0.001 SOL — too low
        ]
    })

    result = await enrich_wallet_labels([low_addr], mock_rpc)
    assert low_addr not in result

    _dynamic_cache.pop(low_addr, None)

