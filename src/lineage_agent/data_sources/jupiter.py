"""
Jupiter API client for the Meme Lineage Agent.

Reference: https://station.jup.ag/docs/apis/price-api-v2

Jupiter provides:
- Token price data aggregated from multiple DEXes
- Token list with metadata

Price strategy (as of March 2025 that api.jup.ag requires auth):
  - SOL price  → CoinGecko public API (no key, reliable)
  - Other tokens → DexScreener pairs data (already fetched upstream)
  - Jupiter API  → kept as optional paid-tier upgrade via JUPITER_API_KEY env
"""

from __future__ import annotations

import logging
import time
from typing import Any, Optional

import httpx

from ._retry import async_http_get
from ..circuit_breaker import CircuitBreaker, CircuitOpenError

logger = logging.getLogger(__name__)

# Retry configuration
_MAX_RETRIES = 3
_BACKOFF_BASE = 1.0

_JUPITER_API_BASE = "https://api.jup.ag"
# Paid Jupiter price endpoint (requires Bearer token via JUPITER_API_KEY env var)
_JUPITER_PRICE_BASE = "https://api.jup.ag/price/v2"
_JUPITER_TOKEN_LIST = "https://tokens.jup.ag/tokens?tags=verified"

# CoinGecko public price endpoint — used as free fallback for SOL price
_COINGECKO_SIMPLE = "https://api.coingecko.com/api/v3/simple/price"
# Wrapped SOL mint address
_WSOL_MINT = "So11111111111111111111111111111111111111112"

# In-memory SOL price cache (avoid CoinGecko rate-limits during sweep bursts)
import time as _time
_sol_price_cache: dict[str, tuple[float, float]] = {}  # "sol" → (price, timestamp)
_SOL_CACHE_TTL = 300  # 5 min — SOL price doesn't move fast enough to matter for forensics

# TTL for the cached verified token list (seconds)
_TOKEN_LIST_TTL = 300  # 5 minutes


class JupiterClient:
    """Async client for the Jupiter aggregator API."""

    def __init__(
        self,
        timeout: int = 15,
        circuit_breaker: CircuitBreaker | None = None,
    ) -> None:
        self._timeout = timeout
        self._client: httpx.AsyncClient | None = None
        self._verified_tokens: list[dict[str, Any]] = []
        self._verified_tokens_ts: float = 0.0
        self._cb = circuit_breaker

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=self._timeout,
                headers={"Accept": "application/json"},
            )
        return self._client

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    async def _get(self, url: str, params: dict | None = None) -> Any:
        """GET with retry + exponential backoff, guarded by circuit breaker."""
        client = await self._get_client()

        async def _do() -> Any:
            result = await async_http_get(
                client, url, params=params,
                max_retries=_MAX_RETRIES, backoff_base=_BACKOFF_BASE,
                label="Jupiter",
            )
            if result is None:
                raise httpx.RequestError("Jupiter: all retries exhausted")
            return result

        if self._cb is not None:
            try:
                return await self._cb.call(_do)
            except CircuitOpenError:
                logger.warning("Jupiter circuit OPEN – fast-failing %s", url)
                return None
            except Exception:
                return None
        return await async_http_get(
            client, url, params=params,
            max_retries=_MAX_RETRIES, backoff_base=_BACKOFF_BASE,
            label="Jupiter",
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def get_prices(self, mints: list[str]) -> dict[str, Optional[float]]:
        """Fetch current USD prices for one or more token mints.

        Returns a dict mapping mint → price (or None if unavailable).

        Strategy:
          1. SOL (WSOL) → CoinGecko public API (free, reliable)
          2. Other tokens → Jupiter API (requires JUPITER_API_KEY for paid tier)
        """
        if not mints:
            return {}

        result: dict[str, Optional[float]] = {m: None for m in mints}

        # --- SOL price via CoinGecko (with in-memory cache to avoid rate-limits) ---
        sol_mints = [m for m in mints if m == _WSOL_MINT]
        if sol_mints:
            cached = _sol_price_cache.get("sol")
            if cached and (_time.time() - cached[1]) < _SOL_CACHE_TTL:
                for m in sol_mints:
                    result[m] = cached[0]
            else:
                try:
                    client = await self._get_client()
                    cg_data = await async_http_get(
                        client,
                        _COINGECKO_SIMPLE,
                        params={"ids": "solana", "vs_currencies": "usd"},
                        max_retries=2,
                        backoff_base=1.0,
                        label="CoinGecko",
                    )
                    if cg_data and isinstance(cg_data, dict):
                        sol_usd = cg_data.get("solana", {}).get("usd")
                        if sol_usd is not None:
                            price = float(sol_usd)
                            _sol_price_cache["sol"] = (price, _time.time())
                            for m in sol_mints:
                                result[m] = price
                        elif cached:
                            for m in sol_mints:
                                result[m] = cached[0]
                    elif cached:
                        # Rate-limited (async_http_get returned None) — use stale price
                        for m in sol_mints:
                            result[m] = cached[0]
                except Exception as exc:
                    logger.debug("CoinGecko SOL price failed: %s", exc)
                    if cached:
                        for m in sol_mints:
                            result[m] = cached[0]

        # --- Other tokens via Jupiter (paid tier — only if API key configured) ---
        import os
        other_mints = [m for m in mints if m != _WSOL_MINT]
        jup_key = os.getenv("JUPITER_API_KEY", "")
        if other_mints and jup_key:
            ids = ",".join(other_mints[:100])
            client = await self._get_client()
            # Set auth header dynamically for paid requests
            try:
                resp = await client.get(
                    _JUPITER_PRICE_BASE,
                    params={"ids": ids},
                    headers={"Authorization": f"Bearer {jup_key}"},
                )
                if resp.status_code == 200:
                    data = resp.json()
                    for mint in other_mints:
                        entry = (data.get("data") or {}).get(mint)
                        if entry and entry.get("price") is not None:
                            try:
                                result[mint] = float(entry["price"])
                            except (TypeError, ValueError):
                                pass
            except Exception as exc:
                logger.debug("Jupiter paid price failed: %s", exc)

        return result

    async def get_price(self, mint: str) -> Optional[float]:
        """Fetch the current USD price for a single token."""
        prices = await self.get_prices([mint])
        return prices.get(mint)

    async def get_verified_tokens(self) -> list[dict[str, Any]]:
        """Fetch the Jupiter verified token list (cached for 5 min).

        Returns a list of dicts with keys like:
        ``address``, ``name``, ``symbol``, ``logoURI``, ``decimals``, etc.
        """
        now = time.monotonic()
        if self._verified_tokens and (now - self._verified_tokens_ts) < _TOKEN_LIST_TTL:
            return self._verified_tokens

        data = await self._get(_JUPITER_TOKEN_LIST)
        if not data or not isinstance(data, list):
            return self._verified_tokens or []

        self._verified_tokens = data
        self._verified_tokens_ts = now
        logger.debug("Refreshed Jupiter verified token list: %d tokens", len(data))
        return data

    async def search_verified_tokens(self, query: str) -> list[dict[str, Any]]:
        """Search the verified token list by name or symbol (case-insensitive).

        This downloads the full list and filters locally. The list is
        relatively small (~2k tokens) so this is fast enough.
        """
        tokens = await self.get_verified_tokens()
        q = query.lower()
        return [
            t for t in tokens
            if q in (t.get("name", "")).lower()
            or q in (t.get("symbol", "")).lower()
        ]
