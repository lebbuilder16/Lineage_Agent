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

logger = logging.getLogger(__name__)

# Retry configuration
_MAX_RETRIES = 3
_BACKOFF_BASE = 1.5  # seconds


class SolanaRpcClient:
    """Async Solana JSON-RPC client."""

    def __init__(self, endpoint: str, timeout: int = 15) -> None:
        self._endpoint = endpoint.rstrip("/")
        self._timeout = timeout
        self._client: httpx.AsyncClient | None = None
        self._id_counter = 0

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

        Limits to 3 rounds (3 x 1000 sigs) to avoid excessive calls.
        """
        before: Optional[str] = None
        oldest: Optional[dict] = None

        for _ in range(3):
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

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    async def _call(self, method: str, params: list[Any]) -> Any:
        """JSON-RPC call with retry + exponential backoff (shared util)."""
        self._id_counter += 1
        payload = {
            "jsonrpc": "2.0",
            "id": self._id_counter,
            "method": method,
            "params": params,
        }
        client = await self._get_client()
        return await async_http_post_json(
            client,
            self._endpoint,
            json_payload=payload,
            max_retries=_MAX_RETRIES,
            backoff_base=_BACKOFF_BASE,
            label=f"Solana RPC ({method})",
        )
