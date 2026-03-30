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
                limits=httpx.Limits(
                    max_connections=15,
                    max_keepalive_connections=8,
                    keepalive_expiry=30,
                ),
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

    async def get_token_pairs_with_fallback(self, mint: str) -> list[dict[str, Any]]:
        """Try DexScreener first, fall back to Birdeye if unavailable."""
        try:
            pairs = await self.get_token_pairs(mint)
            if pairs:
                return pairs
        except (CircuitOpenError, Exception) as exc:
            logger.info("[dex] primary failed for %s (%s), trying birdeye", mint[:12], type(exc).__name__)

        # Fallback: Birdeye
        try:
            from ._clients import get_birdeye_client
            birdeye = get_birdeye_client()
            pairs = await birdeye.get_token_pairs_normalized(mint)
            if pairs:
                logger.info("[dex] birdeye fallback succeeded for %s", mint[:12])
                return pairs
        except Exception as exc:
            logger.debug("[dex] birdeye fallback failed: %s", exc)

        return []

    async def search_tokens(self, query: str) -> list[dict[str, Any]]:
        """Search tokens by name or symbol."""
        url = f"{self._base_url}/latest/dex/search"
        data = await self._get(url, params={"q": query})
        if data is None:
            return []
        return data.get("pairs") or []

    async def search_tokens_with_fallback(self, query: str) -> list[dict[str, Any]]:
        """Try DexScreener search first, fall back to Jupiter verified list."""
        try:
            pairs = await self.search_tokens(query)
            if pairs:
                return pairs
        except (CircuitOpenError, Exception) as exc:
            logger.info("[dex] search failed (%s), trying Jupiter fallback", type(exc).__name__)

        # Fallback: Jupiter verified token list (local filter, ~2k tokens)
        try:
            from ._clients import get_jup_client
            jup = get_jup_client()
            tokens = await jup.search_verified_tokens(query)
            # Convert Jupiter format to DexScreener pair format for compatibility
            return [{
                "chainId": "solana",
                "baseToken": {"address": t.get("address", ""), "name": t.get("name", ""), "symbol": t.get("symbol", "")},
                "quoteToken": {"address": "", "name": "", "symbol": ""},
                "priceUsd": None,
                "marketCap": None,
                "fdv": None,
                "liquidity": {},
                "info": {"imageUrl": t.get("logoURI", "")},
                "pairCreatedAt": None,
                "url": "",
            } for t in tokens[:20]]
        except Exception as exc:
            logger.debug("[dex] Jupiter search fallback failed: %s", exc)

        return []

    # ------------------------------------------------------------------
    # Conversion helpers (sync – pure data transforms)
    # ------------------------------------------------------------------

    def pairs_to_metadata(self, mint: str, pairs: list[dict]) -> TokenMetadata:
        """Build a ``TokenMetadata`` from the best available pair data."""
        if not pairs:
            return TokenMetadata(mint=mint)

        # Restrict to Solana pairs for accurate aggregation; fall back to all
        # pairs only when no Solana-tagged entries are present.
        solana_pairs = [
            p for p in pairs
            if (p.get("chainId") or "").lower() == "solana"
        ] or pairs

        best = max(
            solana_pairs, key=lambda p: (p.get("liquidity") or {}).get("usd") or 0
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

        # Aggregate total liquidity across ALL Solana pools (Raydium, Orca,
        # Meteora, …).  Showing only the best pool's liquidity understates the
        # true on-market depth when a token has multiple pools.
        liq_sum = sum(
            _safe_float((p.get("liquidity") or {}).get("usd")) or 0.0
            for p in solana_pairs
        )
        total_liquidity: Optional[float] = liq_sum if liq_sum > 0 else None

        # Scan ALL Solana pairs for the best market cap.  DexScreener populates
        # `marketCap` (circulating supply × price) only when on-chain supply
        # data is available; `fdv` (total supply × price) is set more often.
        # Prefer `marketCap` — they differ for tokens with locked/burned supply.
        market_cap: Optional[float] = None
        for p in solana_pairs:
            mc = _safe_float(p.get("marketCap"))
            if mc:
                market_cap = mc
                break
        if not market_cap:
            for p in solana_pairs:
                fdv = _safe_float(p.get("fdv"))
                if fdv:
                    market_cap = fdv
                    break

        # Extract volume, transactions, price changes from best pair
        _vol = best.get("volume") or {}
        _txns = best.get("txns") or {}
        _price_change = best.get("priceChange") or {}
        _txns_h24 = _txns.get("h24") or {}

        # Aggregate 24h volume across all Solana pairs (same logic as liquidity)
        vol_24h_sum = sum(
            _safe_float((p.get("volume") or {}).get("h24")) or 0.0
            for p in solana_pairs
        )

        # Extract boost count and social links
        _boost_count = None
        _boosts = best.get("boosts")
        if isinstance(_boosts, (int, float)):
            _boost_count = int(_boosts)
        elif isinstance(_boosts, list):
            _boost_count = len(_boosts)

        _socials: list[dict] = []
        for _s in (info.get("socials") or []):
            if isinstance(_s, dict) and _s.get("type") and _s.get("url"):
                _socials.append({"type": _s["type"], "url": _s["url"]})
        _websites = info.get("websites") or []
        for _w in _websites:
            if isinstance(_w, dict) and _w.get("url"):
                _socials.append({"type": "website", "url": _w["url"]})

        return TokenMetadata(
            mint=mint,
            name=token_info.get("name", ""),
            symbol=token_info.get("symbol", ""),
            image_uri=image_uri,
            price_usd=_safe_float(best.get("priceUsd")),
            market_cap_usd=market_cap,
            liquidity_usd=total_liquidity,
            created_at=created_at,
            # Keep the DEX listing date separate so callers can distinguish
            # "mint initialisation date" (created_at, overwritten by on-chain
            # sig-walk) from "first listed on DEX" (pair_created_at, stable).
            pair_created_at=created_at,
            dex_url=best.get("url", ""),
            volume_24h_usd=vol_24h_sum if vol_24h_sum > 0 else None,
            txns_24h_buys=int(_txns_h24["buys"]) if _txns_h24.get("buys") else None,
            txns_24h_sells=int(_txns_h24["sells"]) if _txns_h24.get("sells") else None,
            price_change_24h=_safe_float(_price_change.get("h24")),
            price_change_1h=_safe_float(_price_change.get("h1")),
            boost_count=_boost_count,
            socials=_socials,
        )

    def pairs_to_search_results(
        self, pairs: list[dict]
    ) -> list[TokenSearchResult]:
        """Convert raw DexScreener pair dicts to ``TokenSearchResult`` list."""
        seen: dict[str, TokenSearchResult] = {}
        # Track per-mint aggregates across all Solana pairs for the same token.
        # pairCreatedAt of the highest-liquidity pair per mint.
        # We intentionally use the MAIN (highest-liquidity) pool's creation date
        # rather than the earliest across all pools.  Tokens can have small test
        # pools created days before the real viral launch; anchoring to the
        # main pool avoids making a copycat appear older than an organic PumpFun
        # launch (e.g., pre-minted token with a tiny early pool).
        selected_pair_created: dict[str, Optional[datetime]] = {}
        accumulated_liq: dict[str, float] = {}  # total liquidity across pools

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

            # Accumulate total liquidity for this mint across all its pools
            accumulated_liq[mint] = accumulated_liq.get(mint, 0.0) + (liq or 0.0)

            # Keep the highest-liquidity pair to source price / mcap / image
            existing = seen.get(mint)
            if existing and (existing.liquidity_usd or 0) >= (liq or 0):
                continue

            # Record the pairCreatedAt of this (now-highest-liq) pair.
            pair_created_ms = pair.get("pairCreatedAt")
            selected_pair_created[mint] = (
                datetime.fromtimestamp(pair_created_ms / 1000, tz=timezone.utc)
                if pair_created_ms
                else None
            )

            seen[mint] = TokenSearchResult(
                mint=mint,
                name=base.get("name", ""),
                symbol=base.get("symbol", ""),
                image_uri=info.get("imageUrl", ""),
                price_usd=_safe_float(pair.get("priceUsd")),
                # Prefer circulating-supply market cap; fall back to FDV so
                # that the value is consistent with the detail view.
                market_cap_usd=(
                    _safe_float(pair.get("marketCap"))
                    or _safe_float(pair.get("fdv"))
                ),
                liquidity_usd=liq,  # replaced with total below
                dex_url=pair.get("url", ""),
            )

        # Attach the main-pool pairCreatedAt and the aggregated liquidity to each
        # result so users see the true on-market depth, not just the best pool.
        for mint, result in seen.items():
            result.pair_created_at = selected_pair_created.get(mint)
            total_liq = accumulated_liq.get(mint, 0.0)
            if total_liq > 0:
                result.liquidity_usd = total_liq

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
