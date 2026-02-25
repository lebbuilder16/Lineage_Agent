"""
Solana RPC client helpers for the Meme Lineage Agent.

Uses the standard JSON-RPC interface. The public
``api.mainnet-beta.solana.com`` endpoint works but is rate-limited.
Uses ``httpx`` for async HTTP with retry + exponential backoff.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

import httpx

from ._retry import async_http_post_json
from ..circuit_breaker import CircuitBreaker, CircuitOpenError

logger = logging.getLogger(__name__)

# Retry configuration
_MAX_RETRIES = 3
_BACKOFF_BASE = 1.5  # seconds


class SolanaRpcClient:
    """Async Solana JSON-RPC client."""

    def __init__(
        self,
        endpoint: str,
        timeout: int = 15,
        circuit_breaker: CircuitBreaker | None = None,
    ) -> None:
        self._endpoint = endpoint.rstrip("/")
        self._timeout = timeout
        self._client: httpx.AsyncClient | None = None
        self._id_counter = 0
        self._cb = circuit_breaker

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=self._timeout,
                headers={"Content-Type": "application/json"},
            )
        return self._client

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def get_oldest_signature(
        self, address: str
    ) -> Optional[dict[str, Any]]:
        """Walk backwards through signature pages to find the oldest tx.

        Limits to 10 rounds (10 x 1000 sigs) to reach creation tx for
        wallets with large transaction histories.
        """
        before: Optional[str] = None
        oldest: Optional[dict] = None

        for _ in range(10):
            params: list[Any] = [
                address,
                {"limit": 1000, "commitment": "finalized"},
            ]
            if before:
                params[1]["before"] = before  # type: ignore[index]
            result = await self._call("getSignaturesForAddress", params)
            if not result or not isinstance(result, list) or len(result) == 0:
                break
            oldest = result[-1]
            before = oldest.get("signature")
            if len(result) < 1000:
                break

        return oldest

    async def get_deployer_and_timestamp(
        self, mint: str
    ) -> tuple[str, Optional[datetime]]:
        """Return ``(deployer_address, creation_datetime)`` for a mint."""
        sig_info = await self.get_oldest_signature(mint)
        if sig_info is None:
            return ("", None)

        signature = sig_info.get("signature", "")
        block_time = sig_info.get("blockTime")
        created_at = (
            datetime.fromtimestamp(block_time, tz=timezone.utc)
            if block_time
            else None
        )

        # Fetch full transaction to extract the fee payer
        tx = await self._call(
            "getTransaction",
            [
                signature,
                {
                    "encoding": "jsonParsed",
                    "maxSupportedTransactionVersion": 0,
                },
            ],
        )
        deployer = ""
        if tx and isinstance(tx, dict):
            try:
                account_keys = (
                    tx.get("transaction", {})
                    .get("message", {})
                    .get("accountKeys", [])
                )
                if account_keys:
                    first = account_keys[0]
                    if isinstance(first, dict):
                        deployer = first.get("pubkey", "")
                    elif isinstance(first, str):
                        deployer = first
            except (KeyError, IndexError, TypeError):
                pass

        return (deployer, created_at)

    async def get_asset(self, mint: str) -> dict:
        """Fetch Metaplex / Helius DAS asset data for a Solana mint.

        Uses the ``getAsset`` method available on Helius RPC endpoints.
        Returns the result dict, or {} if the endpoint does not support DAS
        or the asset is not found.

        Relevant response fields::

            result.content.json_uri        → Metaplex metadata_uri
            result.content.links.image     → on-chain image URL
            result.creators[].address      → on-chain creators (check .verified)
        """
        result = await self._call("getAsset", {"id": mint})
        if isinstance(result, dict):
            return result
        return {}

    async def search_assets_by_creator(
        self, creator: str, *, page: int = 1, limit: int = 100
    ) -> list[dict]:
        """Find all fungible tokens created by a given deployer (Helius DAS).

        Uses ``searchAssets`` with ``creatorAddress`` to discover tokens
        from the same deployer that DexScreener search may miss.
        Returns a list of asset dicts, or [] on failure.
        """
        result = await self._call("searchAssets", {
            "creatorAddress": creator,
            "creatorVerified": True,
            "tokenType": "fungible",
            "page": page,
            "limit": min(limit, 1000),
        })
        if isinstance(result, dict):
            items = result.get("items") or []
            return items if isinstance(items, list) else []
        return []

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    async def _call(self, method: str, params: list[Any] | dict) -> Any:
        """JSON-RPC call with retry + exponential backoff, guarded by circuit breaker."""
        self._id_counter += 1
        payload = {
            "jsonrpc": "2.0",
            "id": self._id_counter,
            "method": method,
            "params": params,
        }
        client = await self._get_client()

        async def _do() -> Any:
            result = await async_http_post_json(
                client, self._endpoint, json_payload=payload,
                max_retries=_MAX_RETRIES, backoff_base=_BACKOFF_BASE,
                label=f"Solana RPC ({method})",
            )
            if result is None:
                raise httpx.RequestError(f"Solana RPC {method}: all retries exhausted")
            return result

        if self._cb is not None:
            try:
                return await self._cb.call(_do)
            except CircuitOpenError:
                logger.warning("Solana RPC circuit OPEN – fast-failing %s", method)
                return None
            except Exception:
                return None
        return await async_http_post_json(
            client, self._endpoint, json_payload=payload,
            max_retries=_MAX_RETRIES, backoff_base=_BACKOFF_BASE,
            label=f"Solana RPC ({method})",
        )
