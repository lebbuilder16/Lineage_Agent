"""Unit tests for the DexScreener client (conversion helpers + async)."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest

from lineage_agent.circuit_breaker import CircuitOpenError
from lineage_agent.data_sources.dexscreener import DexScreenerClient, _safe_float


@pytest.fixture
def client():
    return DexScreenerClient(
        base_url="https://api.dexscreener.com", timeout=5
    )


class TestPairsToMetadata:
    def test_empty_pairs(self, client):
        meta = client.pairs_to_metadata("mintABC", [])
        assert meta.mint == "mintABC"
        assert meta.name == ""
        assert meta.symbol == ""

    def test_picks_best_liquidity(self, client, sample_pairs):
        meta = client.pairs_to_metadata(
            "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
            sample_pairs,
        )
        assert meta.name == "Bonk"
        assert meta.symbol == "BONK"
        assert meta.liquidity_usd == 20_000_000  # total across all Solana pools
        assert meta.image_uri == "https://example.com/bonk.png"
        assert meta.dex_url == "https://dexscreener.com/solana/bonk"

    def test_handles_missing_info(self, client):
        pairs = [
            {
                "baseToken": {"name": "X", "symbol": "X"},
                "liquidity": {},
            }
        ]
        meta = client.pairs_to_metadata("mint", pairs)
        assert meta.name == "X"
        assert meta.liquidity_usd is None
        assert meta.image_uri == ""


class TestPairsToSearchResults:
    def test_filters_non_solana(self, client, sample_search_pairs):
        results = client.pairs_to_search_results(sample_search_pairs)
        # Ethereum pair should be filtered out
        mints = [r.mint for r in results]
        assert "0xabc" not in mints
        assert len(results) == 2

    def test_deduplicates_by_mint(self, client):
        pairs = [
            {
                "chainId": "solana",
                "baseToken": {"address": "MINT_A", "name": "A", "symbol": "A"},
                "info": {},
                "priceUsd": "1.0",
                "marketCap": 100,
                "liquidity": {"usd": 100},
                "url": "",
            },
            {
                "chainId": "solana",
                "baseToken": {"address": "MINT_A", "name": "A", "symbol": "A"},
                "info": {},
                "priceUsd": "2.0",
                "marketCap": 200,
                "liquidity": {"usd": 500},
                "url": "",
            },
        ]
        results = client.pairs_to_search_results(pairs)
        assert len(results) == 1
        assert results[0].liquidity_usd == 600  # aggregated across all pools (100 + 500)

    def test_pair_created_at_uses_main_pool_not_earliest(self, client):
        """pair_created_at should reflect the highest-liquidity pool's date.

        Regression test for the jelly-my-jelly root-inversion bug: a token
        with an early low-liquidity test pool (pairCreatedAt = t1) and a later
        high-liquidity main pool (pairCreatedAt = t2 > t1) must report
        pair_created_at = t2.  Using t1 would make it look older than organic
        PumpFun launches and incorrectly select it as the root.
        """
        # Pool A: small test pool, created earlier (2025-01-29 12:00 UTC)
        early_ms = int(1738148400 * 1000)   # 2025-01-29 12:00 UTC
        # Pool B: main viral pool, created later (2025-01-30 15:31 UTC)
        main_ms = int(1738247460 * 1000)    # 2025-01-30 15:31 UTC

        pairs = [
            {
                "chainId": "solana",
                "baseToken": {"address": "MINT_X", "name": "CopyToken", "symbol": "CPY"},
                "info": {},
                "priceUsd": "0.001",
                "marketCap": 100_000,
                "liquidity": {"usd": 500},       # tiny test pool
                "url": "https://dex.com/test-pool",
                "pairCreatedAt": early_ms,
            },
            {
                "chainId": "solana",
                "baseToken": {"address": "MINT_X", "name": "CopyToken", "symbol": "CPY"},
                "info": {},
                "priceUsd": "0.001",
                "marketCap": 100_000,
                "liquidity": {"usd": 133_900_000},  # main viral pool
                "url": "https://dex.com/main-pool",
                "pairCreatedAt": main_ms,
            },
        ]
        results = client.pairs_to_search_results(pairs)
        assert len(results) == 1
        r = results[0]
        assert r.pair_created_at is not None
        # Must use the MAIN pool date (Jan 30), NOT the test pool date (Jan 29)
        assert r.pair_created_at.day == 30, (
            f"Expected pair_created_at = Jan 30 (main pool), got day={r.pair_created_at.day}"
        )
        # Total liquidity still aggregated from both pools
        assert r.liquidity_usd == pytest.approx(133_900_500)

    def test_empty_input(self, client):
        assert client.pairs_to_search_results([]) == []


class TestAsyncHelpers:
    async def test_get_client_reuses_open_client(self, client):
        first = await client._get_client()
        second = await client._get_client()

        assert first is second
        await client.close()

    async def test_close_closes_open_client(self, client):
        mock_client = MagicMock()
        mock_client.is_closed = False
        mock_client.aclose = AsyncMock(return_value=None)
        client._client = mock_client

        await client.close()

        mock_client.aclose.assert_awaited_once()

    async def test_get_token_pairs_returns_empty_on_none(self, client, monkeypatch):
        monkeypatch.setattr(client, "_get", AsyncMock(return_value=None))

        result = await client.get_token_pairs("mint")

        assert result == []

    async def test_get_token_pairs_returns_pairs(self, client, monkeypatch):
        monkeypatch.setattr(client, "_get", AsyncMock(return_value={"pairs": [{"x": 1}]}))

        result = await client.get_token_pairs("mint")

        assert result == [{"x": 1}]

    async def test_search_tokens_returns_empty_on_none(self, client, monkeypatch):
        monkeypatch.setattr(client, "_get", AsyncMock(return_value=None))

        result = await client.search_tokens("bonk")

        assert result == []

    async def test_search_tokens_returns_pairs(self, client, monkeypatch):
        monkeypatch.setattr(client, "_get", AsyncMock(return_value={"pairs": [{"mint": "x"}]}))

        result = await client.search_tokens("bonk")

        assert result == [{"mint": "x"}]


class TestPairsToMetadataExtra:
    def test_uses_quote_token_when_mint_matches_quote(self, client):
        pairs = [{
            "chainId": "solana",
            "baseToken": {"address": "other", "name": "Other", "symbol": "OTH"},
            "quoteToken": {"address": "mint-q", "name": "Quote", "symbol": "Q"},
            "liquidity": {"usd": 10},
            "priceUsd": "1.0",
            "url": "https://dex/q",
        }]

        meta = client.pairs_to_metadata("mint-q", pairs)

        assert meta.name == "Quote"
        assert meta.symbol == "Q"

    def test_falls_back_to_fdv_when_market_cap_missing(self, client):
        pairs = [{
            "chainId": "solana",
            "baseToken": {"address": "mint-f", "name": "Fallback", "symbol": "FB"},
            "liquidity": {"usd": 10},
            "fdv": "4321",
            "pairCreatedAt": 1_700_000_000_000,
            "url": "https://dex/f",
        }]

        meta = client.pairs_to_metadata("mint-f", pairs)

        assert meta.market_cap_usd == 4321.0
        assert meta.created_at is not None


class TestInternalGet:
    async def test_get_returns_none_when_retries_exhausted_under_cb(self, client):
        mock_cb = MagicMock()

        async def call_wrapper(fn):
            return await fn()

        mock_cb.call = AsyncMock(side_effect=call_wrapper)
        client._cb = mock_cb
        client._client = MagicMock(is_closed=False)

        with pytest.MonkeyPatch.context() as mp:
            mp.setattr("lineage_agent.data_sources.dexscreener.async_http_get", AsyncMock(return_value=None))
            result = await client._get("https://example.com")

        assert result is None

    async def test_get_returns_none_when_circuit_is_open(self, client):
        client._client = MagicMock(is_closed=False)
        client._cb = MagicMock(call=AsyncMock(side_effect=CircuitOpenError("open")))

        result = await client._get("https://example.com")

        assert result is None

    async def test_get_returns_none_when_cb_wrapper_raises(self, client):
        client._client = MagicMock(is_closed=False)
        client._cb = MagicMock(call=AsyncMock(side_effect=RuntimeError("boom")))

        result = await client._get("https://example.com")

        assert result is None

    async def test_get_without_cb_uses_async_http_get(self, client):
        client._client = MagicMock(is_closed=False)

        with pytest.MonkeyPatch.context() as mp:
            mp.setattr(
                "lineage_agent.data_sources.dexscreener.async_http_get",
                AsyncMock(return_value={"pairs": [1]}),
            )
            result = await client._get("https://example.com")

        assert result == {"pairs": [1]}


class TestSafeFloat:
    def test_returns_none_on_type_error(self):
        assert _safe_float(object()) is None

    def test_returns_none_on_value_error(self):
        assert _safe_float("abc") is None
