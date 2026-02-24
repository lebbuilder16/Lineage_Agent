"""
Singleton HTTP client management for the Meme Lineage Agent.

Provides lazy-initialised clients for DexScreener, Solana RPC, Jupiter,
and image downloads.  Also manages the cache backend instance.

``init_clients`` / ``close_clients`` should be called at app startup/shutdown.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Optional

import httpx

from ..cache import SQLiteCache, TTLCache
from ..circuit_breaker import CircuitBreaker, register
from ..data_sources.dexscreener import DexScreenerClient
from ..data_sources.jupiter import JupiterClient
from ..data_sources.solana_rpc import SolanaRpcClient
from config import (
    CACHE_BACKEND,
    CACHE_SQLITE_PATH,
    CACHE_TTL_SECONDS,
    CB_FAILURE_THRESHOLD,
    CB_RECOVERY_TIMEOUT,
    DEXSCREENER_BASE_URL,
    REQUEST_TIMEOUT,
    SOLANA_RPC_ENDPOINT,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Module-level singletons (created once, reused)
# ---------------------------------------------------------------------------
_dex_client: Optional[DexScreenerClient] = None
_rpc_client: Optional[SolanaRpcClient] = None
_jup_client: Optional[JupiterClient] = None
_img_client: Optional[httpx.AsyncClient] = None

# Cache: choose backend based on config
cache: TTLCache | SQLiteCache
if CACHE_BACKEND == "sqlite":
    cache = SQLiteCache(db_path=CACHE_SQLITE_PATH, default_ttl=CACHE_TTL_SECONDS)
else:
    cache = TTLCache(default_ttl=CACHE_TTL_SECONDS)

# Circuit breakers – one per external service, registered for health reporting
cb_dexscreener: CircuitBreaker = register(
    CircuitBreaker(
        "dexscreener",
        failure_threshold=CB_FAILURE_THRESHOLD,
        recovery_timeout=CB_RECOVERY_TIMEOUT,
    )
)
cb_solana_rpc: CircuitBreaker = register(
    CircuitBreaker(
        "solana_rpc",
        failure_threshold=CB_FAILURE_THRESHOLD,
        recovery_timeout=CB_RECOVERY_TIMEOUT,
    )
)
cb_jupiter: CircuitBreaker = register(
    CircuitBreaker(
        "jupiter",
        failure_threshold=CB_FAILURE_THRESHOLD,
        recovery_timeout=CB_RECOVERY_TIMEOUT,
    )
)


def get_dex_client() -> DexScreenerClient:
    global _dex_client
    if _dex_client is None:
        _dex_client = DexScreenerClient(
            base_url=DEXSCREENER_BASE_URL,
            timeout=REQUEST_TIMEOUT,
            circuit_breaker=cb_dexscreener,
        )
    return _dex_client


def get_rpc_client() -> SolanaRpcClient:
    global _rpc_client
    if _rpc_client is None:
        _rpc_client = SolanaRpcClient(
            endpoint=SOLANA_RPC_ENDPOINT,
            timeout=REQUEST_TIMEOUT,
            circuit_breaker=cb_solana_rpc,
        )
    return _rpc_client


def get_jup_client() -> JupiterClient:
    global _jup_client
    if _jup_client is None:
        _jup_client = JupiterClient(
            timeout=REQUEST_TIMEOUT,
            circuit_breaker=cb_jupiter,
        )
    return _jup_client


def get_img_client() -> httpx.AsyncClient:
    """Return a long-lived httpx client for image downloads."""
    global _img_client
    if _img_client is None or _img_client.is_closed:
        _img_client = httpx.AsyncClient(timeout=REQUEST_TIMEOUT)
    return _img_client


async def init_clients() -> None:
    """Eagerly create the singleton HTTP clients (called at startup)."""
    get_dex_client()
    get_rpc_client()
    get_jup_client()
    get_img_client()


async def close_clients() -> None:
    """Close singleton HTTP clients gracefully (called at shutdown)."""
    global _dex_client, _rpc_client, _jup_client, _img_client
    if _dex_client is not None:
        await _dex_client.close()
        _dex_client = None
    if _rpc_client is not None:
        await _rpc_client.close()
        _rpc_client = None
    if _jup_client is not None:
        await _jup_client.close()
        _jup_client = None
    if _img_client is not None:
        await _img_client.aclose()
        _img_client = None
    # Close SQLiteCache persistent connection
    if hasattr(cache, "close"):
        await cache.close()


# ---------------------------------------------------------------------------
# Async-safe cache helpers (TTLCache is sync, SQLiteCache is async)
# ---------------------------------------------------------------------------

async def cache_get(key: str) -> Any:
    result = cache.get(key)
    if asyncio.iscoroutine(result):
        return await result
    return result


async def cache_set(key: str, value: Any, *, ttl: int | None = None) -> None:
    if ttl is not None:
        result = cache.set(key, value, ttl=ttl)
    else:
        result = cache.set(key, value)
    if asyncio.iscoroutine(result):
        await result
