"""
Jupiter API client for the Meme Lineage Agent.

Reference: https://station.jup.ag/docs/apis/price-api-v2

Jupiter provides:
- Token price data aggregated from multiple DEXes
- Token list with metadata

All public endpoints – no API key required.
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
_JUPITER_PRICE_BASE = "https://api.jup.ag/price/v2"
_JUPITER_TOKEN_LIST = "https://tokens.jup.ag/tokens?tags=verified"

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
        """
        if not mints:
            return {}

        # Jupiter price API accepts comma-separated IDs
        ids = ",".join(mints[:100])  # API limit
        data = await self._get(_JUPITER_PRICE_BASE, params={"ids": ids})
        if not data or "data" not in data:
            return {m: None for m in mints}

        result: dict[str, Optional[float]] = {}
        for mint in mints:
            entry = data["data"].get(mint)
            if entry and entry.get("price") is not None:
                try:
                    result[mint] = float(entry["price"])
                except (TypeError, ValueError):
                    result[mint] = None
            else:
                result[mint] = None
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
