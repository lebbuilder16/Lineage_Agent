"""Shared test fixtures for the Meme Lineage Agent test suite."""

from __future__ import annotations

import os
import threading

import pytest
from datetime import datetime, timezone


# ---------------------------------------------------------------------------
# Work around leaked aiosqlite threads that prevent process exit.
#
# Several test modules create SQLiteCache instances backed by aiosqlite.
# Each aiosqlite.connect() spawns a non-daemon thread that blocks in
# ``self._tx.get()`` until the connection is explicitly closed.  When tests
# don't close them, these threads keep the Python process alive forever,
# blocking CI indefinitely.
#
# We use pytest_unconfigure (trylast=True so it runs after all plugins
# including pytest-cov have finished) and hard-exit if leaked threads remain.
# ---------------------------------------------------------------------------
_pytest_exit_code: int = 0


@pytest.hookimpl(trylast=True)
def pytest_sessionfinish(session, exitstatus):
    global _pytest_exit_code
    _pytest_exit_code = exitstatus


@pytest.hookimpl(trylast=True)
def pytest_unconfigure(config):
    alive = [t for t in threading.enumerate()
             if t is not threading.main_thread() and not t.daemon and t.is_alive()]
    if alive:
        import sys
        sys.stdout.flush()
        sys.stderr.flush()
        os._exit(_pytest_exit_code)


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
