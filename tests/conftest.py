"""Shared test fixtures for the Meme Lineage Agent test suite."""

from __future__ import annotations

import sys
import os

# Ensure src/ is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

import pytest
from datetime import datetime, timezone


# ---------------------------------------------------------------------------
# Sample data fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def sample_pairs():
    """Minimal DexScreener pairs response."""
    return [
        {
            "chainId": "solana",
            "baseToken": {
                "address": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
                "name": "Bonk",
                "symbol": "BONK",
            },
            "info": {"imageUrl": "https://example.com/bonk.png"},
            "priceUsd": "0.00001234",
            "marketCap": 850000000,
            "liquidity": {"usd": 15000000},
            "url": "https://dexscreener.com/solana/bonk",
        },
        {
            "chainId": "solana",
            "baseToken": {
                "address": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
                "name": "Bonk",
                "symbol": "BONK",
            },
            "info": {"imageUrl": "https://example.com/bonk.png"},
            "priceUsd": "0.00001234",
            "marketCap": 850000000,
            "liquidity": {"usd": 5000000},
            "url": "https://dexscreener.com/solana/bonk-2",
        },
    ]


@pytest.fixture
def sample_search_pairs():
    """Multiple tokens returned from a search."""
    return [
        {
            "chainId": "solana",
            "baseToken": {
                "address": "MINT_A_1234567890123456789012345678901234567890",
                "name": "BonkInu",
                "symbol": "BONKINU",
            },
            "info": {"imageUrl": "https://example.com/bonkinu.png"},
            "priceUsd": "0.000001",
            "marketCap": 100000,
            "liquidity": {"usd": 50000},
            "url": "https://dexscreener.com/solana/bonkinu",
        },
        {
            "chainId": "solana",
            "baseToken": {
                "address": "MINT_B_1234567890123456789012345678901234567890",
                "name": "BonkDog",
                "symbol": "BONKDOG",
            },
            "info": {},
            "priceUsd": None,
            "marketCap": None,
            "liquidity": {"usd": None},
            "url": "",
        },
        {
            "chainId": "ethereum",
            "baseToken": {
                "address": "0xabc",
                "name": "EthBonk",
                "symbol": "EBONK",
            },
            "info": {},
            "priceUsd": "1.0",
            "marketCap": 99999999,
            "liquidity": {"usd": 9999999},
            "url": "",
        },
    ]


@pytest.fixture
def now_utc():
    return datetime.now(tz=timezone.utc)
