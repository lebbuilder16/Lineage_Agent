"""
Solana RPC client helpers for the Meme Lineage Agent.

Uses the standard JSON-RPC interface. The public
``api.mainnet-beta.solana.com`` endpoint works but is rate-limited.
Uses ``httpx`` for async HTTP with retry + exponential backoff.
"""

from __future__ import annotations

import hashlib
import logging
import re
from datetime import datetime, timezone
from typing import Any, Optional

import httpx

from ._retry import async_http_post_json
from ..circuit_breaker import CircuitBreaker, CircuitOpenError

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Pure-Python PumpFun bonding-curve PDA derivation
# Used in get_deployer_and_timestamp to resolve deployer faster:
# the curve PDA has O(10) transactions vs O(10 000+) on the mint itself.
# ---------------------------------------------------------------------------
_PUMP_PROGRAM_ID = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBymtzbm"
_ED25519_P = 2**255 - 19
_ED25519_D = (-121665 * pow(121666, _ED25519_P - 2, _ED25519_P)) % _ED25519_P
_B58_ALPHA = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
_B58_MAP   = {c: i for i, c in enumerate(_B58_ALPHA)}


def _b58decode_32(s: str) -> bytes:
    n = 0
    for c in s:
        n = n * 58 + _B58_MAP[c]
    return n.to_bytes(32, "big")


def _b58encode(b: bytes) -> str:
    n = int.from_bytes(b, "big")
    out: list[str] = []
    while n:
        n, r = divmod(n, 58)
        out.append(_B58_ALPHA[r])
    for byte in b:
        if byte == 0:
            out.append(_B58_ALPHA[0])
        else:
            break
    return "".join(reversed(out))


def _is_on_ed25519_curve(b: bytes) -> bool:
    try:
        y_int = int.from_bytes(b, "little")
        sign = y_int >> 255
        y = y_int & ((1 << 255) - 1)
        y2 = (y * y) % _ED25519_P
        u = (y2 - 1) % _ED25519_P
        v = (_ED25519_D * y2 + 1) % _ED25519_P
        x2 = (u * pow(v, _ED25519_P - 2, _ED25519_P)) % _ED25519_P
        if x2 == 0:
            return sign == 0
        x = pow(x2, (_ED25519_P + 3) // 8, _ED25519_P)
        if (x * x) % _ED25519_P != x2:
            x = (x * pow(2, (_ED25519_P - 1) // 4, _ED25519_P)) % _ED25519_P
        return (x * x) % _ED25519_P == x2
    except Exception:
        return False


def _pump_bonding_curve_pda(mint: str) -> Optional[str]:
    """Derive the PumpFun bonding curve PDA for *mint* in pure Python.
    Returns None on any failure."""
    try:
        prog = _b58decode_32(_PUMP_PROGRAM_ID)
        mint_b = _b58decode_32(mint)
        for nonce in range(255, -1, -1):
            candidate = hashlib.sha256(
                b"bonding-curve" + mint_b + bytes([nonce]) + prog
                + b"ProgramDerivedAddress"
            ).digest()
            if not _is_on_ed25519_curve(candidate):
                return _b58encode(candidate)
    except Exception:
        pass
    return None


# Helius Enhanced Transactions API base URL (requires Starter plan or above)
_HELIUS_ENHANCED_BASE = "https://api.helius.xyz"


def _extract_helius_api_key(endpoint: str) -> Optional[str]:
    """Extract the Helius API key from an RPC endpoint URL such as
    ``https://beta.helius-rpc.com/?api-key=<key>``.
    Returns None when the endpoint is not a Helius URL.
    """
    m = re.search(r"[?&]api-key=([A-Za-z0-9_\-]+)", endpoint)
    return m.group(1) if m else None


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
        self._helius_api_key: Optional[str] = _extract_helius_api_key(endpoint)

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
        self, address: str, *, circuit_protect: bool = True,
    ) -> Optional[dict[str, Any]]:
        """Walk backwards through signature pages to find the oldest tx.

        Limits to 20 rounds (20 x 1000 sigs) to reach creation tx for
        wallets with large transaction histories.
        """
        before: Optional[str] = None
        oldest: Optional[dict] = None

        for _ in range(20):
            params: list[Any] = [
                address,
                {"limit": 1000, "commitment": "finalized"},
            ]
            if before:
                params[1]["before"] = before  # type: ignore[index]
            result = await self._call("getSignaturesForAddress", params,
                                       circuit_protect=circuit_protect)
            if not result or not isinstance(result, list) or len(result) == 0:
                break
            oldest = result[-1]
            before = oldest.get("signature")
            if len(result) < 1000:
                break

        return oldest

    async def _get_helius_creation(
        self, mint: str
    ) -> Optional[dict[str, Any]]:
        """Call the Helius Enhanced Transactions API to retrieve the creation TX.

        Requires a Helius **Starter plan or above** ($49/month).  Returns None
        when the API key is absent (free tier) or the call fails.

        On success returns a dict compatible with ``get_oldest_signature``
        callers, extended with a ``feePayer`` field::

            {"signature": str, "slot": int, "blockTime": int, "feePayer": str}
        """
        if not self._helius_api_key:
            return None
        url = (
            f"{_HELIUS_ENHANCED_BASE}/v0/addresses/{mint}/transactions"
            f"?api-key={self._helius_api_key}&limit=1&type=CREATE"
        )
        client = await self._get_client()
        try:
            resp = await client.get(url, timeout=10.0)
            if resp.status_code != 200:
                logger.debug(
                    "[helius_enhanced] HTTP %d for %s", resp.status_code, mint[:16]
                )
                return None
            data = resp.json()
            if not data or not isinstance(data, list):
                return None
            tx = data[0]
            slot = tx.get("slot")
            ts = tx.get("timestamp")
            fee_payer = tx.get("feePayer", "")
            sig = tx.get("signature", "")
            if not slot or not fee_payer or fee_payer in _PROGRAM_ADDRESSES:
                return None
            logger.debug(
                "[helius_enhanced] creation TX resolved for %s: deployer=%s slot=%d",
                mint[:16], fee_payer[:12], slot,
            )
            return {"signature": sig, "slot": slot, "blockTime": ts, "feePayer": fee_payer}
        except Exception as exc:  # noqa: BLE001
            logger.debug("[helius_enhanced] fetch failed for %s: %s", mint[:16], exc)
            return None

    async def get_creation_anchor(
        self, mint: str, *, circuit_protect: bool = True
    ) -> Optional[dict[str, Any]]:
        """Return an anchor dict ``{signature, slot, blockTime}`` for *mint*.

        When the Helius Enhanced API is available (Starter plan or above) the
        result also contains a ``feePayer`` key with the deployer address — this
        avoids the need for a separate ``getTransaction`` call.

        Resolution order
        ----------------
        1. **Helius Enhanced Transactions API** (``type=CREATE``) — 1 HTTP call,
           instant even for tokens with 500 000+ transactions (Starter+ plan).
        2. **Bonding-curve PDA** signature walk — PumpFun only; the PDA has very
           few transactions and resolves in milliseconds for active tokens.
        3. **Direct mint** signature walk — fallback, capped at 20 pages.
        """
        # ── 1. Helius Enhanced (fastest) ─────────────────────────────────────
        helius = await self._get_helius_creation(mint)
        if helius and helius.get("slot"):
            return helius

        # ── 2. Bonding-curve PDA (PumpFun only) ──────────────────────────────
        if mint.endswith("pump"):
            curve_pda = _pump_bonding_curve_pda(mint)
            if curve_pda:
                sig = await self.get_oldest_signature(
                    curve_pda, circuit_protect=circuit_protect
                )
                if sig:
                    logger.debug(
                        "[creation_anchor] resolved via curve PDA for %s", mint[:16]
                    )
                    return sig

        # ── 3. Direct mint walk ───────────────────────────────────────────────
        return await self.get_oldest_signature(mint, circuit_protect=circuit_protect)

    async def get_deployer_and_timestamp(
        self, mint: str
    ) -> tuple[str, Optional[datetime]]:
        """Return ``(deployer_address, creation_datetime)`` for a mint.

        Resolution order (delegated to ``get_creation_anchor``):
          1. Helius Enhanced Transactions API — 1 call, returns ``feePayer``
             directly (Starter plan required; skipped on free tier).
          2. Bonding-curve PDA signature walk (PumpFun tokens only).
          3. Direct mint signature walk (capped at 20 pages, fallback).
        """
        anchor = await self.get_creation_anchor(mint)
        if anchor is None:
            return ("", None)

        block_time = anchor.get("blockTime")
        created_at = (
            datetime.fromtimestamp(block_time, tz=timezone.utc)
            if block_time
            else None
        )

        # Helius Enhanced provides feePayer directly — no extra TX fetch needed.
        if anchor.get("feePayer"):
            return (anchor["feePayer"], created_at)

        # Fallback: fetch the full transaction to extract the signer.
        signature = anchor.get("signature", "")
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
