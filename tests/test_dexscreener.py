"""Unit tests for the DexScreener client (conversion helpers + async)."""

from __future__ import annotations

import pytest

from lineage_agent.data_sources.dexscreener import DexScreenerClient


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
        assert meta.liquidity_usd == 15_000_000  # highest liquidity pair
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
        assert results[0].liquidity_usd == 500  # kept highest liquidity

    def test_empty_input(self, client):
        assert client.pairs_to_search_results([]) == []
