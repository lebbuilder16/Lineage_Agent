"""
DexScreener API client for the Meme Lineage Agent.

Reference: https://docs.dexscreener.com/api/reference

All public endpoints – no API key required.
Uses ``httpx`` for async HTTP with retry + exponential backoff.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Optional

import httpx

from ..models import TokenMetadata, TokenSearchResult

logger = logging.getLogger(__name__)

# Retry configuration
_MAX_RETRIES = 3
_BACKOFF_BASE = 1.0  # seconds


class DexScreenerClient:
    """Async wrapper around the DexScreener REST API."""

    def __init__(self, base_url: str, timeout: int = 15) -> None:
        self._base_url = base_url.rstrip("/")
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

    # ------------------------------------------------------------------
    # Public helpers
    # ------------------------------------------------------------------

    async def get_token_pairs(self, mint: str) -> list[dict[str, Any]]:
        """Return all DEX pairs for a given Solana token mint."""
        url = f"{self._base_url}/latest/dex/tokens/{mint}"
        data = await self._get(url)
        if data is None:
            return []
        return data.get("pairs") or []

    async def search_tokens(self, query: str) -> list[dict[str, Any]]:
        """Search tokens by name or symbol."""
        url = f"{self._base_url}/latest/dex/search"
        data = await self._get(url, params={"q": query})
        if data is None:
            return []
        return data.get("pairs") or []

    async def get_pair(
        self, chain_id: str, pair_address: str
    ) -> Optional[dict[str, Any]]:
        """Return data for a specific pair."""
        url = f"{self._base_url}/latest/dex/pairs/{chain_id}/{pair_address}"
        data = await self._get(url)
        if data is None:
            return None
        pairs = data.get("pairs") or []
        return pairs[0] if pairs else None

    # ------------------------------------------------------------------
    # Conversion helpers (sync – pure data transforms)
    # ------------------------------------------------------------------

    def pairs_to_metadata(self, mint: str, pairs: list[dict]) -> TokenMetadata:
        """Build a ``TokenMetadata`` from the best available pair data."""
        if not pairs:
            return TokenMetadata(mint=mint)

        best = max(
            pairs, key=lambda p: (p.get("liquidity") or {}).get("usd") or 0
        )
        base_token = best.get("baseToken") or {}
        info = best.get("info") or {}
        image_uri = info.get("imageUrl", "")

        return TokenMetadata(
            mint=mint,
            name=base_token.get("name", ""),
            symbol=base_token.get("symbol", ""),
            image_uri=image_uri,
            price_usd=_safe_float(best.get("priceUsd")),
            market_cap_usd=_safe_float(best.get("marketCap")),
            liquidity_usd=_safe_float(
                (best.get("liquidity") or {}).get("usd")
            ),
            dex_url=best.get("url", ""),
        )

    def pairs_to_search_results(
        self, pairs: list[dict]
    ) -> list[TokenSearchResult]:
        """Convert raw DexScreener pair dicts to ``TokenSearchResult`` list."""
        seen: dict[str, TokenSearchResult] = {}
        for pair in pairs:
            base = pair.get("baseToken") or {}
            chain = pair.get("chainId", "")
            if chain != "solana":
                continue
            mint = base.get("address", "")
            if not mint:
                continue

            liq = _safe_float((pair.get("liquidity") or {}).get("usd"))
            info = pair.get("info") or {}

            existing = seen.get(mint)
            if existing and (existing.liquidity_usd or 0) >= (liq or 0):
                continue

            seen[mint] = TokenSearchResult(
                mint=mint,
                name=base.get("name", ""),
                symbol=base.get("symbol", ""),
                image_uri=info.get("imageUrl", ""),
                price_usd=_safe_float(pair.get("priceUsd")),
                market_cap_usd=_safe_float(pair.get("marketCap")),
                liquidity_usd=liq,
                dex_url=pair.get("url", ""),
            )

        return list(seen.values())

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    async def _get(
        self, url: str, params: dict | None = None
    ) -> Optional[dict[str, Any]]:
        """GET with retry + exponential backoff."""
        client = await self._get_client()
        for attempt in range(_MAX_RETRIES):
            try:
                resp = await client.get(url, params=params)
                if resp.status_code == 429:
                    wait = _BACKOFF_BASE * (2**attempt)
                    logger.warning(
                        "DexScreener rate-limited, retry in %.1fs", wait
                    )
                    await asyncio.sleep(wait)
                    continue
                resp.raise_for_status()
                return resp.json()
            except httpx.HTTPStatusError as exc:
                logger.warning(
                    "DexScreener HTTP %s for %s",
                    exc.response.status_code,
                    url,
                )
                if attempt < _MAX_RETRIES - 1:
                    await asyncio.sleep(_BACKOFF_BASE * (2**attempt))
                    continue
                return None
            except httpx.RequestError as exc:
                logger.warning("DexScreener request failed: %s – %s", url, exc)
                if attempt < _MAX_RETRIES - 1:
                    await asyncio.sleep(_BACKOFF_BASE * (2**attempt))
                    continue
                return None
        return None


def _safe_float(val: Any) -> Optional[float]:
    """Try to cast *val* to float, returning ``None`` on failure."""
    if val is None:
        return None
    try:
        return float(val)
    except (TypeError, ValueError):
        return None
