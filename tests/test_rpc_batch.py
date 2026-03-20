"""Tests for JSON-RPC batch support in SolanaRpcClient."""
import pytest
import httpx
from unittest.mock import AsyncMock, patch

from lineage_agent.data_sources.solana_rpc import SolanaRpcClient


@pytest.fixture
def rpc():
    return SolanaRpcClient("https://test-rpc.example.com", timeout=5)


@pytest.mark.asyncio
async def test_call_batch_empty(rpc):
    result = await rpc._call_batch([])
    assert result == []


@pytest.mark.asyncio
async def test_call_batch_returns_ordered_results(rpc):
    """Batch results are returned in the same order as input calls."""
    mock_response = httpx.Response(
        200,
        json=[
            {"jsonrpc": "2.0", "id": 2, "result": "second"},
            {"jsonrpc": "2.0", "id": 1, "result": "first"},
        ],
        request=httpx.Request("POST", "https://test-rpc.example.com"),
    )

    with patch.object(rpc, "_get_client") as mock_get:
        mock_client = AsyncMock()
        mock_client.post.return_value = mock_response
        mock_get.return_value = mock_client

        results = await rpc._call_batch([
            ("getBlockTime", [100]),
            ("getBlockTime", [200]),
        ])

    assert results == ["first", "second"]


@pytest.mark.asyncio
async def test_call_batch_handles_partial_errors(rpc):
    """Individual batch items can fail without killing the whole batch."""
    mock_response = httpx.Response(
        200,
        json=[
            {"jsonrpc": "2.0", "id": 1, "result": "ok"},
            {"jsonrpc": "2.0", "id": 2, "error": {"code": -32600, "message": "Invalid"}},
        ],
        request=httpx.Request("POST", "https://test-rpc.example.com"),
    )

    with patch.object(rpc, "_get_client") as mock_get:
        mock_client = AsyncMock()
        mock_client.post.return_value = mock_response
        mock_get.return_value = mock_client

        results = await rpc._call_batch([
            ("getBlockTime", [100]),
            ("getBlockTime", [200]),
        ])

    assert results[0] == "ok"
    assert results[1] is None


@pytest.mark.asyncio
async def test_call_batch_handles_http_failure(rpc):
    """Complete HTTP failure returns all None."""
    with patch.object(rpc, "_get_client") as mock_get:
        mock_client = AsyncMock()
        mock_client.post.side_effect = httpx.RequestError("connection failed")
        mock_get.return_value = mock_client

        results = await rpc._call_batch([
            ("getBlockTime", [100]),
            ("getBlockTime", [200]),
        ])

    assert results == [None, None]


@pytest.mark.asyncio
async def test_get_assets_batch_returns_dicts(rpc):
    """get_assets_batch returns list of dicts in order."""
    mock_response = httpx.Response(
        200,
        json=[
            {"jsonrpc": "2.0", "id": 1, "result": {"content": {"metadata": {"name": "TokenA"}}}},
            {"jsonrpc": "2.0", "id": 2, "result": {"content": {"metadata": {"name": "TokenB"}}}},
        ],
        request=httpx.Request("POST", "https://test-rpc.example.com"),
    )

    with patch.object(rpc, "_get_client") as mock_get:
        mock_client = AsyncMock()
        mock_client.post.return_value = mock_response
        mock_get.return_value = mock_client

        results = await rpc.get_assets_batch(["mint1", "mint2"])

    assert len(results) == 2
    assert results[0]["content"]["metadata"]["name"] == "TokenA"
    assert results[1]["content"]["metadata"]["name"] == "TokenB"


@pytest.mark.asyncio
async def test_get_assets_batch_empty(rpc):
    results = await rpc.get_assets_batch([])
    assert results == []
