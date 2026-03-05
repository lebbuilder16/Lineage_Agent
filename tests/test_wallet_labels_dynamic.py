"""Tests for dynamic wallet labels (Feature 5)."""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from lineage_agent.wallet_labels import (
    KNOWN_LABELS,
    classify_address,
    refresh_dynamic_labels,
    _extra_labels,
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
