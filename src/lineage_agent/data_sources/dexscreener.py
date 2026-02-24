"""
DexScreener API client for the Meme Lineage Agent.

Reference: https://docs.dexscreener.com/api/reference

All public endpoints – no API key required.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

import requests

from ..models import TokenMetadata, TokenSearchResult

logger = logging.getLogger(__name__)


class DexScreenerClient:
    """Thin wrapper around the DexScreener REST API."""

    def __init__(self, base_url: str, timeout: int = 15) -> None:
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout
        self._session = requests.Session()
        self._session.headers.update({"Accept": "application/json"})

    # ------------------------------------------------------------------
    # Public helpers
    # ------------------------------------------------------------------

    def get_token_pairs(self, mint: str) -> list[dict[str, Any]]:
        """Return all DEX pairs for a given Solana token mint.

        GET /latest/dex/tokens/{tokenAddress}
        """
        url = f"{self._base_url}/latest/dex/tokens/{mint}"
        data = self._get(url)
        if data is None:
            return []
        return data.get("pairs") or []

    def search_tokens(self, query: str) -> list[dict[str, Any]]:
        """Search tokens by name or symbol.

        GET /latest/dex/search?q={query}
        """
        url = f"{self._base_url}/latest/dex/search"
        data = self._get(url, params={"q": query})
        if data is None:
            return []
        return data.get("pairs") or []

    def get_pair(self, chain_id: str, pair_address: str) -> Optional[dict[str, Any]]:
        """Return data for a specific pair.

        GET /latest/dex/pairs/{chainId}/{pairAddress}
        """
        url = f"{self._base_url}/latest/dex/pairs/{chain_id}/{pair_address}"
        data = self._get(url)
        if data is None:
            return None
        pairs = data.get("pairs") or []
        return pairs[0] if pairs else None

    # ------------------------------------------------------------------
    # Conversion helpers
    # ------------------------------------------------------------------

    def pairs_to_metadata(self, mint: str, pairs: list[dict]) -> TokenMetadata:
        """Build a ``TokenMetadata`` from the best available pair data."""
        if not pairs:
            return TokenMetadata(mint=mint)

        # Pick the pair with highest liquidity
        best = max(pairs, key=lambda p: (p.get("liquidity") or {}).get("usd") or 0)
        base_token = best.get("baseToken") or {}
        info = best.get("info") or {}
        image_uri = ""
        if info.get("imageUrl"):
            image_uri = info["imageUrl"]

        return TokenMetadata(
            mint=mint,
            name=base_token.get("name", ""),
            symbol=base_token.get("symbol", ""),
            image_uri=image_uri,
            price_usd=_safe_float(best.get("priceUsd")),
            market_cap_usd=_safe_float(best.get("marketCap")),
            liquidity_usd=_safe_float((best.get("liquidity") or {}).get("usd")),
            dex_url=best.get("url", ""),
        )

    def pairs_to_search_results(self, pairs: list[dict]) -> list[TokenSearchResult]:
        """Convert raw DexScreener pair dicts to ``TokenSearchResult`` list.

        Deduplicates by mint address, keeping the pair with highest liquidity.
        """
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

    def _get(
        self, url: str, params: dict | None = None
    ) -> Optional[dict[str, Any]]:
        try:
            resp = self._session.get(url, params=params, timeout=self._timeout)
            resp.raise_for_status()
            return resp.json()
        except requests.RequestException as exc:
            logger.warning("DexScreener request failed: %s – %s", url, exc)
            return None


def _safe_float(val: Any) -> Optional[float]:
    """Try to cast *val* to float, returning ``None`` on failure."""
    if val is None:
        return None
    try:
        return float(val)
    except (TypeError, ValueError):
        return None
