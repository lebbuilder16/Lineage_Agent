"""
DexScreener API client for the Meme Lineage Agent.

Reference: https://docs.dexscreener.com/api/reference

All public endpoints – no API key required.
Uses ``httpx`` for async HTTP with retry + exponential backoff.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

import httpx

from ..models import TokenMetadata, TokenSearchResult
from ..circuit_breaker import CircuitBreaker, CircuitOpenError
from ._retry import async_http_get

logger = logging.getLogger(__name__)

# Retry configuration
_MAX_RETRIES = 3
_BACKOFF_BASE = 1.0  # seconds


class DexScreenerClient:
    """Async wrapper around the DexScreener REST API."""

    def __init__(
        self,
        base_url: str,
        timeout: int = 15,
        circuit_breaker: CircuitBreaker | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout
        self._client: httpx.AsyncClient | None = None
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
        # Our mint might be the base OR the quote token in the pair.
        base_token = best.get("baseToken") or {}
        quote_token = best.get("quoteToken") or {}
        if base_token.get("address", "").lower() == mint.lower():
            token_info = base_token
        elif quote_token.get("address", "").lower() == mint.lower():
            token_info = quote_token
        else:
            token_info = base_token  # fallback
        info = best.get("info") or {}
        image_uri = info.get("imageUrl", "")

        # Use the EARLIEST pairCreatedAt across all pairs — the highest-liquidity
        # pair may not be the oldest, so we scan all pairs for the oldest date.
        created_at: Optional[datetime] = None
        for p in pairs:
            ms = p.get("pairCreatedAt")
            if ms:
                dt = datetime.fromtimestamp(ms / 1000, tz=timezone.utc)
                if created_at is None or dt < created_at:
                    created_at = dt

        return TokenMetadata(
            mint=mint,
            name=token_info.get("name", ""),
            symbol=token_info.get("symbol", ""),
            image_uri=image_uri,
            price_usd=_safe_float(best.get("priceUsd")),
            market_cap_usd=(
                _safe_float(best.get("marketCap"))
                or _safe_float(best.get("fdv"))  # fdv filled far more often
            ),
            liquidity_usd=_safe_float(
                (best.get("liquidity") or {}).get("usd")
            ),
            created_at=created_at,
            dex_url=best.get("url", ""),
        )

    def pairs_to_search_results(
        self, pairs: list[dict]
    ) -> list[TokenSearchResult]:
        """Convert raw DexScreener pair dicts to ``TokenSearchResult`` list."""
        seen: dict[str, TokenSearchResult] = {}
        # Track the earliest pairCreatedAt per mint independently of liquidity.
        # The highest-liquidity pair is used for price/mcap data, but the
        # oldest pair date is the best proxy for token age.
        earliest_created: dict[str, datetime] = {}

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

            # Always track the earliest pairCreatedAt for this mint
            pair_created_ms = pair.get("pairCreatedAt")
            if pair_created_ms:
                pair_dt = datetime.fromtimestamp(
                    pair_created_ms / 1000, tz=timezone.utc
                )
                prev = earliest_created.get(mint)
                if prev is None or pair_dt < prev:
                    earliest_created[mint] = pair_dt

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

        # Attach the earliest pairCreatedAt to each result
        for mint, result in seen.items():
            result.pair_created_at = earliest_created.get(mint)

        return list(seen.values())

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    async def _get(
        self, url: str, params: dict | None = None
    ) -> Optional[dict[str, Any]]:
        """GET with retry + exponential backoff, guarded by circuit breaker."""
        client = await self._get_client()

        async def _do() -> dict[str, Any]:
            result = await async_http_get(
                client, url, params=params,
                max_retries=_MAX_RETRIES, backoff_base=_BACKOFF_BASE,
                label="DexScreener",
            )
            if result is None:
                raise httpx.RequestError("DexScreener: all retries exhausted")
            return result

        if self._cb is not None:
            try:
                return await self._cb.call(_do)
            except CircuitOpenError:
                logger.warning("DexScreener circuit OPEN – fast-failing %s", url)
                return None
            except Exception:
                return None
        return await async_http_get(
            client, url, params=params,
            max_retries=_MAX_RETRIES, backoff_base=_BACKOFF_BASE,
            label="DexScreener",
        )


def _safe_float(val: Any) -> Optional[float]:
    """Try to cast *val* to float, returning ``None`` on failure."""
    if val is None:
        return None
    try:
        return float(val)
    except (TypeError, ValueError):
        return None
