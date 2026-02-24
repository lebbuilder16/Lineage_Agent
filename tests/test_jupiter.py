"""Tests for the Jupiter API client (mocked HTTP)."""

from __future__ import annotations

import time
from unittest.mock import AsyncMock, patch, MagicMock

import httpx
import pytest

from lineage_agent.data_sources.jupiter import JupiterClient


@pytest.fixture
async def client():
    c = JupiterClient(timeout=5)
    yield c
    await c.close()


class TestGetPrices:

    @pytest.mark.asyncio
    async def test_single_price(self, client):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "data": {
                "MINT_A": {"price": "1.23"},
            }
        }
        mock_resp.raise_for_status = MagicMock()

        with patch.object(client, "_get", new_callable=AsyncMock, return_value={"data": {"MINT_A": {"price": "1.23"}}}):
            result = await client.get_prices(["MINT_A"])
        assert result["MINT_A"] == 1.23

    @pytest.mark.asyncio
    async def test_empty_mints(self, client):
        result = await client.get_prices([])
        assert result == {}

    @pytest.mark.asyncio
    async def test_missing_price(self, client):
        with patch.object(client, "_get", new_callable=AsyncMock, return_value={"data": {}}):
            result = await client.get_prices(["UNKNOWN"])
        assert result["UNKNOWN"] is None

    @pytest.mark.asyncio
    async def test_api_failure(self, client):
        with patch.object(client, "_get", new_callable=AsyncMock, return_value=None):
            result = await client.get_prices(["MINT_A"])
        assert result["MINT_A"] is None


class TestGetPrice:

    @pytest.mark.asyncio
    async def test_delegates_to_get_prices(self, client):
        with patch.object(
            client, "get_prices", new_callable=AsyncMock, return_value={"M": 9.99}
        ):
            result = await client.get_price("M")
        assert result == 9.99


class TestGetVerifiedTokens:

    @pytest.mark.asyncio
    async def test_success(self, client):
        tokens = [
            {"address": "A", "name": "Alpha", "symbol": "ALP"},
            {"address": "B", "name": "Beta", "symbol": "BET"},
        ]
        with patch.object(client, "_get", new_callable=AsyncMock, return_value=tokens):
            result = await client.get_verified_tokens()
        assert len(result) == 2

    @pytest.mark.asyncio
    async def test_api_failure(self, client):
        with patch.object(client, "_get", new_callable=AsyncMock, return_value=None):
            result = await client.get_verified_tokens()
        assert result == []


class TestSearchVerifiedTokens:

    @pytest.mark.asyncio
    async def test_filter_by_name(self, client):
        tokens = [
            {"address": "A", "name": "Bonk", "symbol": "BONK"},
            {"address": "B", "name": "Raydium", "symbol": "RAY"},
        ]
        with patch.object(client, "get_verified_tokens", new_callable=AsyncMock, return_value=tokens):
            result = await client.search_verified_tokens("bonk")
        assert len(result) == 1
        assert result[0]["name"] == "Bonk"

    @pytest.mark.asyncio
    async def test_filter_by_symbol(self, client):
        tokens = [
            {"address": "A", "name": "Something", "symbol": "RAY"},
        ]
        with patch.object(client, "get_verified_tokens", new_callable=AsyncMock, return_value=tokens):
            result = await client.search_verified_tokens("ray")
        assert len(result) == 1

    @pytest.mark.asyncio
    async def test_no_match(self, client):
        tokens = [
            {"address": "A", "name": "Alpha", "symbol": "ALP"},
        ]
        with patch.object(client, "get_verified_tokens", new_callable=AsyncMock, return_value=tokens):
            result = await client.search_verified_tokens("zzz")
        assert result == []


class TestClientLifecycle:

    @pytest.mark.asyncio
    async def test_close_without_open(self):
        c = JupiterClient()
        await c.close()  # should not raise

    @pytest.mark.asyncio
    async def test_close_after_use(self):
        c = JupiterClient()
        with patch.object(c, "_get", new_callable=AsyncMock, return_value=None):
            await c.get_verified_tokens()
        await c.close()


class TestTokenListCache:
    """Tests for the verified token list TTL cache."""

    @pytest.mark.asyncio
    async def test_cached_on_second_call(self, client):
        tokens = [{"address": "A", "name": "Alpha", "symbol": "ALP"}]
        mock_get = AsyncMock(return_value=tokens)
        with patch.object(client, "_get", mock_get):
            first = await client.get_verified_tokens()
            second = await client.get_verified_tokens()
        # _get should only be called once — second call uses cache
        assert mock_get.call_count == 1
        assert first == second == tokens

    @pytest.mark.asyncio
    async def test_cache_expires(self, client):
        tokens_old = [{"address": "A", "name": "Old", "symbol": "OLD"}]
        tokens_new = [{"address": "B", "name": "New", "symbol": "NEW"}]
        mock_get = AsyncMock(side_effect=[tokens_old, tokens_new])

        with patch.object(client, "_get", mock_get):
            first = await client.get_verified_tokens()
            assert first == tokens_old

            # Simulate expiry by backdating the timestamp
            client._verified_tokens_ts = time.monotonic() - 600
            second = await client.get_verified_tokens()
            assert second == tokens_new
            assert mock_get.call_count == 2

    @pytest.mark.asyncio
    async def test_cache_returns_stale_on_failure(self, client):
        tokens = [{"address": "A", "name": "Alpha", "symbol": "ALP"}]
        # First call succeeds
        with patch.object(client, "_get", AsyncMock(return_value=tokens)):
            await client.get_verified_tokens()
        # Expire and fail
        client._verified_tokens_ts = time.monotonic() - 600
        with patch.object(client, "_get", AsyncMock(return_value=None)):
            result = await client.get_verified_tokens()
        # Should return stale data
        assert result == tokens
