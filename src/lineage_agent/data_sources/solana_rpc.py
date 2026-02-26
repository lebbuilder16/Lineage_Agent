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

# Addresses that are programs / burned authorities, NOT user wallets.
# When extracting the deployer from a transaction's accountKeys we skip these
# so that launchpad programs (Moonshot, PumpFun, etc.) that front-run as the
# fee payer don't get stored as the deployer.
_PROGRAM_ADDRESSES: frozenset[str] = frozenset({
    "11111111111111111111111111111111",                    # System Program
    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",      # SPL Token Program
    "Token2022rMLqfGMQpwkX83CmP5VWMdM8RX8bH6TfpHn",    # Token-2022
    "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe8bXV",     # Associated Token Program
    "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",      # Metaplex Metadata
    "BPFLoaderUpgradeab1e11111111111111111111111",        # BPF Loader Upgradeable
    "TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM",      # PumpFun authority
    "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBymtzbm",    # PumpFun program
    "MoonCVVNZFSYkqNXP6bxHLPL6QQJiMEfzPWlVMMf9Ly",     # Moonshot program
    "Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1",    # Moonshot fee / authority
    "4wTV81rvZBKW8vFJX9PMwn5n46sYr6HfkWMqJjpPbZ6M",     # LetsBonk program
    "DEXYosS6oEGvk8uCDayvwEZz4qEyDJRf9nFgYCaqPMTm",    # Believe / Degen launchpad
})


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
                # jsonParsed encoding gives {pubkey, signer, writable} dicts.
                # Iterate all keys and return the first *signer* wallet that is
                # not a known program/launchpad address.  Launchpads like
                # Moonshot sometimes list their program as accountKeys[0], so
                # we must not blindly take index 0.
                for key in account_keys:
                    if isinstance(key, dict):
                        addr = key.get("pubkey", "")
                        is_signer = key.get("signer", False)
                    else:
                        # Older base64 encoding: all keys are strings, treat
                        # each as a candidate (first non-program wins).
                        addr = key
                        is_signer = True
                    if addr and is_signer and addr not in _PROGRAM_ADDRESSES:
                        deployer = addr
                        break
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

    async def get_wallet_token_balance(self, wallet: str, mint: str) -> float:
        """Return the current UI token balance for *wallet* holding *mint*.

        Calls ``getTokenAccountsByOwner`` with a mint filter — exactly 1 RPC
        call.  Returns 0.0 when the wallet has no token account or the balance
        is zero (i.e. the wallet has fully exited the position).
        """
        result = await self._call(
            "getTokenAccountsByOwner",
            [
                wallet,
                {"mint": mint},
                {"encoding": "jsonParsed"},
            ],
        )
        if not result or not isinstance(result, dict):
            return 0.0
        accounts = result.get("value") or []
        total = 0.0
        for account in accounts:
            try:
                info = account["account"]["data"]["parsed"]["info"]
                amt = info.get("tokenAmount", {}).get("uiAmount") or 0.0
                total += float(amt)
            except Exception:
                pass
        return total

    async def get_deployer_token_holdings(
        self, wallet: str, *, limit: int = 50
    ) -> list[str]:
        """Return mint addresses currently held by a wallet.

        Uses ``getTokenAccountsByOwner`` with the SPL Token Program.
        Returns a list of mint addresses with non-zero balance (up to *limit*).
        Returns [] on any failure.
        """
        result = await self._call(
            "getTokenAccountsByOwner",
            [
                wallet,
                {"programId": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"},
                {"encoding": "jsonParsed"},
            ],
        )
        if not result or not isinstance(result, dict):
            return []
        accounts = result.get("value") or []
        mints: list[str] = []
        for account in accounts[:limit]:
            try:
                info = account["account"]["data"]["parsed"]["info"]
                mint = info.get("mint", "")
                amount = int(info.get("tokenAmount", {}).get("amount", "0"))
                if mint and amount > 0:
                    mints.append(mint)
            except Exception:
                pass
        return mints

    async def search_assets_by_creator(
        self, creator: str, *, page: int = 1, limit: int = 100
    ) -> list[dict]:
        """Find all fungible tokens created by a given deployer (Helius DAS).

        Uses ``searchAssets`` with ``creatorAddress`` to discover tokens
        from the same deployer that DexScreener search may miss.
        Returns a list of asset dicts, or [] on failure.
        """
        # NOTE: Helius rejects `tokenType` when used with `creatorAddress`
        # (requires `ownerAddress` instead).  We omit it and filter post-hoc.
        # This call also bypasses the shared circuit breaker — searchAssets is
        # optional enrichment and its failures must NOT cascade to block critical
        # calls like getSignaturesForAddress or getAsset.
        result = await self._call("searchAssets", {
            "creatorAddress": creator,
            "creatorVerified": True,
            "page": page,
            "limit": min(limit, 1000),
        }, circuit_protect=False)
        if isinstance(result, dict):
            items = result.get("items") or []
            if not isinstance(items, list):
                return []
            # Filter to fungible tokens only (NFTs / compressed NFTs excluded)
            return [
                item for item in items
                if item.get("interface") in {"FungibleAsset", "FungibleToken"}
            ]
        return []

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    async def _call(
        self,
        method: str,
        params: list[Any] | dict,
        *,
        circuit_protect: bool = True,
    ) -> Any:
        """JSON-RPC call with retry + exponential backoff, guarded by circuit breaker.

        Parameters
        ----------
        circuit_protect:
            When *False* the call bypasses the shared circuit breaker entirely.
            Use this for optional enrichment methods (e.g. ``searchAssets``) whose
            failures should not cascade to block critical RPC calls such as
            ``getSignaturesForAddress`` or ``getAsset``.
        """
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

        if self._cb is not None and circuit_protect:
            try:
                return await self._cb.call(_do)
            except CircuitOpenError:
                logger.warning("Solana RPC circuit OPEN \u2013 fast-failing %s", method)
                return None
            except Exception:
                return None
        # Either circuit_protect=False (bypass CB) or no CB configured: call directly.
        try:
            return await _do()
        except Exception:
            return None
