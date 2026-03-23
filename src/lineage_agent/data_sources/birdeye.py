"""
Birdeye API client — fallback data source when DexScreener is unavailable.

Used as secondary source for token price, market cap, and liquidity data.
Requires BIRDEYE_API_KEY environment variable (free tier: 100 req/min).

Reference: https://docs.birdeye.so/
"""
from __future__ import annotations

import logging
import os
from typing import Any, Optional

import httpx

from ..circuit_breaker import CircuitBreaker

logger = logging.getLogger(__name__)

_API_KEY = os.environ.get("BIRDEYE_API_KEY", "")


class BirdeyeClient:
    """Async wrapper around the Birdeye public API."""

    BASE_URL = "https://public-api.birdeye.so"

    def __init__(
        self,
        timeout: int = 10,
        circuit_breaker: CircuitBreaker | None = None,
    ) -> None:
        self._timeout = timeout
        self._client: httpx.AsyncClient | None = None
        self._cb = circuit_breaker

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=self._timeout,
                headers={
                    "Accept": "application/json",
                    "X-API-KEY": _API_KEY,
                    "x-chain": "solana",
                },
            )
        return self._client

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    async def get_token_overview(self, mint: str) -> dict[str, Any] | None:
        """Fetch token overview: price, mcap, liquidity, volume.

        Returns the raw Birdeye response dict or None on failure.
        """
        if not _API_KEY:
            return None
        url = f"{self.BASE_URL}/defi/token_overview"
        return await self._get(url, params={"address": mint})

    async def get_token_pairs_normalized(self, mint: str) -> list[dict[str, Any]]:
        """Return pairs in DexScreener-compatible format for seamless fallback.

        Birdeye doesn't expose full pair lists, so we synthesize one "pair"
        from the token overview data.  This is sufficient for
        ``pairs_to_metadata()`` to produce a valid ``TokenMetadata``.
        """
        overview = await self.get_token_overview(mint)
        if not overview or "data" not in overview:
            return []

        d = overview["data"]
        price = d.get("price")
        mcap = d.get("mc") or d.get("realMc")
        liq = d.get("liquidity")
        name = d.get("name", "")
        symbol = d.get("symbol", "")
        logo = d.get("logoURI", "")

        # Synthesize a DexScreener-compatible pair dict
        return [{
            "chainId": "solana",
            "baseToken": {"address": mint, "name": name, "symbol": symbol},
            "quoteToken": {"address": "So11111111111111111111111111111111111111112", "name": "SOL", "symbol": "SOL"},
            "priceUsd": str(price) if price else None,
            "marketCap": mcap,
            "fdv": d.get("fdv") or mcap,
            "liquidity": {"usd": liq} if liq else {},
            "info": {"imageUrl": logo} if logo else {},
            "pairCreatedAt": None,
            "url": "",
        }]

    # ------------------------------------------------------------------
    # Internal HTTP helper
    # ------------------------------------------------------------------

    async def _get(
        self, url: str, params: dict | None = None
    ) -> dict[str, Any] | None:
        if self._cb:
            self._cb.check()
        try:
            client = await self._get_client()
            resp = await client.get(url, params=params)
            if resp.status_code == 429:
                logger.warning("[birdeye] rate limited (429)")
                if self._cb:
                    self._cb.record_failure()
                return None
            if resp.status_code != 200:
                logger.debug("[birdeye] HTTP %s for %s", resp.status_code, url)
                if self._cb:
                    self._cb.record_failure()
                return None
            data = resp.json()
            if self._cb:
                self._cb.record_success()
            return data
        except Exception as exc:
            logger.debug("[birdeye] request failed: %s", exc)
            if self._cb:
                self._cb.record_failure()
            return None
