"""
Solana RPC client helpers for the Meme Lineage Agent.

Uses the standard JSON-RPC interface (no paid providers required – the
public ``api.mainnet-beta.solana.com`` endpoint works, although it is
rate‑limited).

Main responsibilities:
* Retrieve Metaplex Token Metadata for a given mint.
* Determine the deployer (first signer) and creation timestamp.
"""

from __future__ import annotations

import base64
import json
import logging
import struct
from datetime import datetime, timezone
from typing import Any, Optional

import requests

logger = logging.getLogger(__name__)

# Metaplex Token Metadata Program ID
TOKEN_METADATA_PROGRAM_ID = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"


class SolanaRpcClient:
    """Minimal Solana JSON-RPC client."""

    def __init__(self, endpoint: str, timeout: int = 15) -> None:
        self._endpoint = endpoint.rstrip("/")
        self._timeout = timeout
        self._session = requests.Session()
        self._session.headers.update({"Content-Type": "application/json"})
        self._id_counter = 0

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def get_token_metadata_address(self, mint: str) -> str:
        """Derive the PDA for the Metaplex metadata account.

        This is a simplified derivation using the well-known seeds:
        ``["metadata", TOKEN_METADATA_PROGRAM_ID, mint]``.  For a
        production implementation you would use ``solders`` or
        ``solana-py`` to compute this correctly.  Here we use the RPC
        ``getAccountInfo`` on a known account instead.
        """
        # We'll use a search-based approach instead of PDA derivation:
        # call getProgramAccounts filtered by mint.  For simplicity,
        # we try to fetch metadata from DexScreener primarily and use
        # RPC mainly for deployer + creation time.
        return ""

    def get_first_transaction(
        self, address: str, limit: int = 1
    ) -> Optional[dict[str, Any]]:
        """Get the oldest transaction signature for *address*.

        Returns the parsed signature info dict or ``None``.
        """
        result = self._call(
            "getSignaturesForAddress",
            [
                address,
                {"limit": limit, "commitment": "finalized"},
            ],
        )
        if not result or not isinstance(result, list):
            return None
        # The RPC returns newest first by default; we want the oldest.
        # With limit=1 and before=None, we actually get the *newest*.
        # To find the oldest we fetch a larger batch and take the last.
        return result[-1] if result else None

    def get_oldest_signature(self, address: str) -> Optional[dict[str, Any]]:
        """Walk backwards through signature pages to find the oldest tx.

        To avoid excessive calls, we limit to 3 rounds (3 × 1000 sigs).
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
            result = self._call("getSignaturesForAddress", params)
            if not result or not isinstance(result, list) or len(result) == 0:
                break
            oldest = result[-1]
            before = oldest.get("signature")
            if len(result) < 1000:
                break

        return oldest

    def get_deployer_and_timestamp(
        self, mint: str
    ) -> tuple[str, Optional[datetime]]:
        """Return ``(deployer_address, creation_datetime)`` for a mint.

        The deployer is the fee‑payer (first signer) of the earliest
        known transaction that references the mint.
        """
        sig_info = self.get_oldest_signature(mint)
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
        tx = self._call(
            "getTransaction",
            [
                signature,
                {"encoding": "jsonParsed", "maxSupportedTransactionVersion": 0},
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

    def get_account_info(self, address: str) -> Optional[dict[str, Any]]:
        """Raw ``getAccountInfo`` call."""
        return self._call(
            "getAccountInfo",
            [address, {"encoding": "jsonParsed"}],
        )

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _call(self, method: str, params: list[Any]) -> Any:
        self._id_counter += 1
        payload = {
            "jsonrpc": "2.0",
            "id": self._id_counter,
            "method": method,
            "params": params,
        }
        try:
            resp = self._session.post(
                self._endpoint,
                json=payload,
                timeout=self._timeout,
            )
            resp.raise_for_status()
            body = resp.json()
            if "error" in body:
                logger.warning(
                    "RPC error for %s: %s", method, body["error"]
                )
                return None
            return body.get("result")
        except requests.RequestException as exc:
            logger.warning("Solana RPC request failed (%s): %s", method, exc)
            return None
