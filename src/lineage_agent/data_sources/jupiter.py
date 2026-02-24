"""
Jupiter API client for the Meme Lineage Agent.

Reference: https://station.jup.ag/docs/apis/price-api-v2

Jupiter provides:
- Token price data aggregated from multiple DEXes
- Token list with metadata

All public endpoints – no API key required.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Optional

import httpx

logger = logging.getLogger(__name__)

# Retry configuration
_MAX_RETRIES = 3
_BACKOFF_BASE = 1.0

_JUPITER_API_BASE = "https://api.jup.ag"
_JUPITER_PRICE_BASE = "https://api.jup.ag/price/v2"
_JUPITER_TOKEN_LIST = "https://tokens.jup.ag/tokens?tags=verified"


class JupiterClient:
    """Async client for the Jupiter aggregator API."""

    def __init__(self, timeout: int = 15) -> None:
        self._timeout = timeout
        self._client: httpx.AsyncClient | None = None

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
        """GET with retry + exponential backoff."""
        client = await self._get_client()
        for attempt in range(_MAX_RETRIES):
            try:
                resp = await client.get(url, params=params)
                if resp.status_code == 429:
                    wait = _BACKOFF_BASE * (2 ** attempt)
                    logger.warning("Jupiter rate-limited, retry in %.1fs", wait)
                    await asyncio.sleep(wait)
                    continue
                resp.raise_for_status()
                return resp.json()
            except httpx.HTTPStatusError as exc:
                logger.warning("Jupiter HTTP %s for %s", exc.response.status_code, url)
                if attempt < _MAX_RETRIES - 1:
                    await asyncio.sleep(_BACKOFF_BASE * (2 ** attempt))
                    continue
                return None
            except httpx.RequestError as exc:
                logger.warning("Jupiter request failed: %s", exc)
                if attempt < _MAX_RETRIES - 1:
                    await asyncio.sleep(_BACKOFF_BASE * (2 ** attempt))
                    continue
                return None
        return None

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
        """Fetch the Jupiter verified token list.

        Returns a list of dicts with keys like:
        ``address``, ``name``, ``symbol``, ``logoURI``, ``decimals``, etc.
        """
        data = await self._get(_JUPITER_TOKEN_LIST)
        if not data or not isinstance(data, list):
            return []
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
