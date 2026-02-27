"""Integration tests for the full detect_lineage flow with mocked data sources."""

from __future__ import annotations

from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, patch

import pytest

from lineage_agent.lineage_detector import detect_lineage, search_tokens
from lineage_agent.data_sources import _clients
from lineage_agent.cache import TTLCache


@pytest.fixture(autouse=True)
def clear_cache():
    """Replace the module-level cache with a fresh in-memory TTLCache before each test."""
    old_cache = _clients.cache
    _clients.cache = TTLCache()
    yield
    _clients.cache = old_cache


# Sample pair data returned by DexScreener
_QUERY_PAIRS = [
    {
        "chainId": "solana",
        "baseToken": {
            "address": "QueryMint1234567890123456789012345678",
            "name": "OriginalDoge",
            "symbol": "ODOGE",
        },
        "info": {"imageUrl": "https://img.example.com/odoge.png"},
        "priceUsd": "0.001",
        "marketCap": 5_000_000,
        "liquidity": {"usd": 300_000},
        "url": "https://dex.example.com/odoge",
    }
]

_SEARCH_PAIRS = [
    {
        "chainId": "solana",
        "baseToken": {
            "address": "CloneMintA12345678901234567890123456789",
            "name": "OriginalDoge",
            "symbol": "ODOGE",
        },
        "info": {"imageUrl": "https://img.example.com/clone1.png"},
        "priceUsd": "0.0001",
        "marketCap": 100_000,
        "liquidity": {"usd": 10_000},
        "url": "",
    },
    {
        "chainId": "solana",
        "baseToken": {
            "address": "CloneMintB12345678901234567890123456789",
            "name": "OrigDoge2",
            "symbol": "ODOGE2",
        },
        "info": {},
        "priceUsd": None,
        "marketCap": None,
        "liquidity": {"usd": 500},
        "url": "",
    },
    {
        "chainId": "ethereum",  # non-Solana — should be filtered out
        "baseToken": {
            "address": "0xabc",
            "name": "EthDoge",
            "symbol": "EDOGE",
        },
        "info": {},
        "priceUsd": "1.0",
        "marketCap": 99_999_999,
        "liquidity": {"usd": 9_999_999},
        "url": "",
    },
]


def _make_dex_client():
    """Create a mock DexScreenerClient."""
    dex = AsyncMock()
    dex.get_token_pairs = AsyncMock(return_value=_QUERY_PAIRS)
    dex.search_tokens = AsyncMock(return_value=_SEARCH_PAIRS)

    # Use real conversion methods from the actual class
    from lineage_agent.data_sources.dexscreener import DexScreenerClient
    real = DexScreenerClient.__new__(DexScreenerClient)
    dex.pairs_to_metadata = real.pairs_to_metadata
    dex.pairs_to_search_results = real.pairs_to_search_results
    return dex


def _make_rpc_client():
    """Create a mock SolanaRpcClient that returns predictable data."""
    base_time = datetime(2024, 1, 1, tzinfo=timezone.utc)

    async def fake_deployer(mint: str):
        if "Query" in mint:
            return ("DeployerAAA", base_time)
        elif "CloneA" in mint:
            return ("DeployerAAA", base_time + timedelta(days=5))
        elif "CloneB" in mint:
            return ("DeployerBBB", base_time + timedelta(days=30))
        return ("", None)

    rpc = AsyncMock()
    rpc.get_deployer_and_timestamp = AsyncMock(side_effect=fake_deployer)
    rpc.get_asset = AsyncMock(return_value={})  # DAS returns empty → falls back to sig walk
    rpc.search_assets_by_creator = AsyncMock(return_value=[])  # no extra deployer candidates
    return rpc


class TestDetectLineageIntegration:

    @pytest.mark.asyncio
    async def test_full_flow(self):
        """Full lineage detection with mocked DexScreener + RPC."""
        dex = _make_dex_client()
        rpc = _make_rpc_client()

        with patch("lineage_agent.lineage_detector._get_dex_client", return_value=dex), \
             patch("lineage_agent.lineage_detector._get_rpc_client", return_value=rpc), \
             patch("lineage_agent.lineage_detector.compute_image_similarity", new_callable=AsyncMock, return_value=0.9):

            result = await detect_lineage("QueryMint1234567890123456789012345678")

        assert result.mint == "QueryMint1234567890123456789012345678"
        assert result.root is not None
        assert result.root.name == "OriginalDoge"
        assert result.family_size >= 1
        assert 0.0 <= result.confidence <= 1.0

    @pytest.mark.asyncio
    async def test_query_deployer_prefers_creator_over_update_authority(self):
        """Regression: deployer must match on-chain creator (Solscan-style)."""
        dex = AsyncMock()
        dex.get_token_pairs = AsyncMock(return_value=_QUERY_PAIRS)
        dex.search_tokens = AsyncMock(return_value=[])
        dex.pairs_to_metadata = _make_dex_client().pairs_to_metadata
        dex.pairs_to_search_results = _make_dex_client().pairs_to_search_results

        creator = "5hH3qDQEHXa7Rff5k1Tz3Dot6HFTjQcfMQQJRXyxRszA"
        wrong_ua_or_signer = "29bu1111111111111111111111111111111111W4mw"

        rpc = AsyncMock()
        rpc.get_asset = AsyncMock(return_value={
            "authorities": [{"address": wrong_ua_or_signer}],
            "creators": [{"address": creator, "verified": True}],
        })
        rpc.get_deployer_and_timestamp = AsyncMock(
            return_value=(wrong_ua_or_signer, datetime(2024, 1, 1, tzinfo=timezone.utc))
        )
        rpc.search_assets_by_creator = AsyncMock(return_value=[])

        with patch("lineage_agent.lineage_detector._get_dex_client", return_value=dex), \
             patch("lineage_agent.lineage_detector._get_rpc_client", return_value=rpc):
            result = await detect_lineage("QueryMint1234567890123456789012345678")

        assert result.query_token.deployer == creator

    @pytest.mark.asyncio
    async def test_no_name_no_symbol(self):
        """Token with no name/symbol should return early with self as root."""
        empty_pairs = [
            {
                "chainId": "solana",
                "baseToken": {"address": "EmptyMint12345678901234567890123456", "name": "", "symbol": ""},
                "info": {},
                "priceUsd": None,
                "marketCap": None,
                "liquidity": {"usd": None},
                "url": "",
            }
        ]

        dex = AsyncMock()
        dex.get_token_pairs = AsyncMock(return_value=empty_pairs)
        dex.pairs_to_metadata = _make_dex_client().pairs_to_metadata

        rpc = AsyncMock()
        rpc.get_deployer_and_timestamp = AsyncMock(return_value=("", None))
        rpc.get_asset = AsyncMock(return_value={})
        rpc.search_assets_by_creator = AsyncMock(return_value=[])

        with patch("lineage_agent.lineage_detector._get_dex_client", return_value=dex), \
             patch("lineage_agent.lineage_detector._get_rpc_client", return_value=rpc):

            result = await detect_lineage("EmptyMint12345678901234567890123456")

        assert result.family_size == 1
        assert result.confidence == 0.0
        assert result.derivatives == []

    @pytest.mark.asyncio
    async def test_no_candidates(self):
        """If search returns no Solana tokens, result has no derivatives."""
        dex = AsyncMock()
        dex.get_token_pairs = AsyncMock(return_value=_QUERY_PAIRS)
        dex.search_tokens = AsyncMock(return_value=[])
        dex.pairs_to_metadata = _make_dex_client().pairs_to_metadata
        dex.pairs_to_search_results = _make_dex_client().pairs_to_search_results

        rpc = AsyncMock()
        rpc.get_deployer_and_timestamp = AsyncMock(return_value=("Deployer", datetime(2024, 1, 1, tzinfo=timezone.utc)))
        rpc.get_asset = AsyncMock(return_value={})
        rpc.search_assets_by_creator = AsyncMock(return_value=[])

        with patch("lineage_agent.lineage_detector._get_dex_client", return_value=dex), \
             patch("lineage_agent.lineage_detector._get_rpc_client", return_value=rpc):

            result = await detect_lineage("QueryMint1234567890123456789012345678")

        assert result.family_size == 1
        assert result.confidence == 1.0
        assert result.derivatives == []

    @pytest.mark.asyncio
    async def test_result_is_cached(self):
        """Second call should hit the cache."""
        dex = _make_dex_client()
        rpc = _make_rpc_client()

        with patch("lineage_agent.lineage_detector._get_dex_client", return_value=dex), \
             patch("lineage_agent.lineage_detector._get_rpc_client", return_value=rpc), \
             patch("lineage_agent.lineage_detector.compute_image_similarity", new_callable=AsyncMock, return_value=0.9):

            result1 = await detect_lineage("QueryMint1234567890123456789012345678")
            result2 = await detect_lineage("QueryMint1234567890123456789012345678")

        # DexScreener should only be called once
        assert dex.get_token_pairs.call_count == 1
        assert result1.mint == result2.mint


class TestSearchTokensIntegration:

    @pytest.mark.asyncio
    async def test_search_returns_results(self):
        dex = _make_dex_client()

        with patch("lineage_agent.lineage_detector._get_dex_client", return_value=dex):
            results = await search_tokens("doge")

        # Should have solana tokens only (ethereum filtered)
        assert len(results) >= 1
        assert all(r.mint for r in results)

    @pytest.mark.asyncio
    async def test_search_is_cached(self):
        dex = _make_dex_client()

        with patch("lineage_agent.lineage_detector._get_dex_client", return_value=dex):
            r1 = await search_tokens("doge")
            r2 = await search_tokens("doge")

        assert dex.search_tokens.call_count == 1
        assert r1 == r2
