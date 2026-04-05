"""
Solana RPC client helpers for the Meme Lineage Agent.

Uses the standard JSON-RPC interface. The public
``api.mainnet-beta.solana.com`` endpoint works but is rate-limited.
Uses ``httpx`` for async HTTP with retry + exponential backoff.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import re as _re
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

import httpx

from ._retry import async_http_post_json, MethodBlockedError
from ..circuit_breaker import CircuitBreaker, CircuitOpenError, register


# ---------------------------------------------------------------------------
# RPC endpoint descriptor — one per provider
# ---------------------------------------------------------------------------

@dataclass
class RpcEndpoint:
    """Describes a single Solana RPC provider endpoint."""

    url: str
    circuit_breaker: CircuitBreaker
    helius_api_key: str = ""
    supports_das: bool = False
    _client: httpx.AsyncClient | None = field(default=None, repr=False)

    def __post_init__(self) -> None:
        self.url = self.url.rstrip("/")
        qs = _re.search(r"api-key=([^&]+)", self.url)
        if qs:
            self.helius_api_key = qs.group(1)
        # Helius & Shyft support DAS; detect by domain
        host = self.url.split("//")[-1].split("/")[0].split("?")[0].lower()
        # QuickNode requires DAS addon to be manually enabled — don't auto-detect
        if any(p in host for p in ("helius", "shyft")):
            self.supports_das = True

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



# Retry configuration
_MAX_RETRIES = 3
_MAX_RETRIES_WITH_FALLBACK = 1  # fewer retries when fallback endpoints exist
_BACKOFF_BASE = 2.0  # seconds (increased from 1.5 to reduce 429 cascades)

# Global RPC concurrency limiter — caps total in-flight calls across ALL services
_GLOBAL_RPC_SEM: asyncio.Semaphore | None = None


def _get_global_sem() -> asyncio.Semaphore:
    global _GLOBAL_RPC_SEM
    if _GLOBAL_RPC_SEM is None:
        from config import MAX_CONCURRENT_RPC
        _GLOBAL_RPC_SEM = asyncio.Semaphore(MAX_CONCURRENT_RPC)
    return _GLOBAL_RPC_SEM

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
    "7rtiKSUDLBm59b1SBmD9oajcP8xE64vAGSMbAN5CXy1q",    # Moonshot relay wallet (signs on behalf of users)
    "4wTV81rvZBKW8vFJX9PMwn5n46sYr6HfkWMqJjpPbZ6M",     # LetsBonk program
    "DEXYosS6oEGvk8uCDayvwEZz4qEyDJRf9nFgYCaqPMTm",    # Believe / Degen launchpad
    # Raydium DEX programs (can appear as fee-payers in mint creation TXs)
    "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",    # Raydium AMM V4
    "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1",    # Raydium Authority V4
    "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK",    # Raydium CLMM
    "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C",    # Raydium CPMM
    # Raydium Launchpad (2025) — confirmed authority for tokens launched via Raydium pad
    "WLHv2UAZm6z4KyaaELi5pjdbJh6RESMva1Rnn8pJVVh",     # Raydium Launchpad authority
    "LanMV9sAd7wArD6GNnABFhv4Vf8W4N9xCRbTPgP3czj",    # Raydium Launchpad program
    # Bags.fm (Meteora-based launchpad) — program + authority addresses
    "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN",    # Meteora DBC (token creation)
    "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG",    # Meteora DAMM v2 (post-migration AMM)
    "FEE2tBhCKAt7shrod19QttSVREUYPiyMzoku1mL1gqVK",    # Bags Fee Share V2
    "BAGSB9TpGrZxQbEsrEznv5jXXdwyP6AXerN8aVRiAmcv",    # Bags.fm Update Authority / signer
})


# ── TX-level LRU cache for getTransaction ─────────────────────────────────────
# Avoids re-fetching the same transaction across sol_flow, bundle, and insider
# services. Entries expire after 10 minutes. Max 500 entries.
_TX_CACHE: dict[str, tuple[float, Any]] = {}  # sig → (timestamp, result)
_TX_CACHE_MAX = 500
_TX_CACHE_TTL = 600.0  # 10 minutes


def _tx_cache_get(sig: str) -> Any | None:
    entry = _TX_CACHE.get(sig)
    if entry is None:
        return None
    ts, result = entry
    if time.monotonic() - ts > _TX_CACHE_TTL:
        _TX_CACHE.pop(sig, None)
        return None
    return result


def _tx_cache_put(sig: str, result: Any) -> None:
    if len(_TX_CACHE) >= _TX_CACHE_MAX:
        # Evict oldest 20%
        sorted_keys = sorted(_TX_CACHE, key=lambda k: _TX_CACHE[k][0])
        for k in sorted_keys[:_TX_CACHE_MAX // 5]:
            _TX_CACHE.pop(k, None)
    _TX_CACHE[sig] = (time.monotonic(), result)


class SolanaRpcClient:
    """Async Solana JSON-RPC client with multi-endpoint fallback."""

    def __init__(
        self,
        endpoint: str,
        timeout: int = 15,
        circuit_breaker: CircuitBreaker | None = None,
        fallback_endpoints: list[RpcEndpoint] | None = None,
    ) -> None:
        self._timeout = timeout
        self._id_counter = 0

        # Build primary endpoint descriptor
        if circuit_breaker is None:
            circuit_breaker = CircuitBreaker("solana_rpc_primary", failure_threshold=8, recovery_timeout=60)
        primary = RpcEndpoint(url=endpoint, circuit_breaker=circuit_breaker)
        self._endpoints: list[RpcEndpoint] = [primary]
        if fallback_endpoints:
            self._endpoints.extend(fallback_endpoints)

        # Backwards-compat aliases
        self._endpoint = primary.url
        self._cb = circuit_breaker

    @property
    def helius_api_key(self) -> str:
        """Return the Helius API key from the first endpoint that has one."""
        for ep in self._endpoints:
            if ep.helius_api_key:
                return ep.helius_api_key
        return ""

    @property
    def _helius_api_key(self) -> str:
        return self.helius_api_key

    async def _get_client_for(self, ep: RpcEndpoint) -> httpx.AsyncClient:
        """Return (or create) the httpx client for a specific endpoint."""
        if ep._client is None or ep._client.is_closed:
            ep._client = httpx.AsyncClient(
                timeout=self._timeout,
                headers={"Content-Type": "application/json"},
                http2=True,
                limits=httpx.Limits(
                    max_connections=20,
                    max_keepalive_connections=10,
                    keepalive_expiry=30,
                ),
            )
        return ep._client

    async def _get_client(self) -> httpx.AsyncClient:
        """Backwards-compat: return client for primary endpoint."""
        return await self._get_client_for(self._endpoints[0])

    async def close(self) -> None:
        for ep in self._endpoints:
            if ep._client and not ep._client.is_closed:
                await ep._client.aclose()
                ep._client = None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def get_recent_signatures(
        self, address: str, *, limit: int = 200,
    ) -> list[dict[str, Any]]:
        """Return the *limit* most-recent confirmed signatures for *address*.

        Each dict contains at least ``signature``, ``slot``, ``blockTime``.
        Returns an empty list on RPC failure.
        """
        params: list[Any] = [
            address,
            {"limit": min(limit, 1000), "commitment": "finalized"},
        ]
        result = await self._call("getSignaturesForAddress", params)
        if not result or not isinstance(result, list):
            return []
        return result

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

    async def _fetch_dexscreener_pair(
        self, mint: str
    ) -> tuple[int, str] | tuple[None, None]:
        """Fetch the oldest DexScreener pair for *mint*.

        Returns ``(pair_created_at_unix_s, pair_address)`` on success, or
        ``(None, None)`` when DexScreener doesn't know the token yet.
        """
        client = await self._get_client()
        try:
            resp = await client.get(
                f"https://api.dexscreener.com/latest/dex/tokens/{mint}",
                timeout=8.0,
            )
            if resp.status_code != 200:
                return None, None
            pairs = resp.json().get("pairs") or []
            if not pairs:
                return None, None
            oldest = min(
                pairs,
                key=lambda p: p.get("pairCreatedAt") or 9_999_999_999_999,
            )
            pair_ts_ms: int = oldest.get("pairCreatedAt") or 0
            pair_address: str = oldest.get("pairAddress", "")
            if not pair_ts_ms or not pair_address:
                return None, None
            return pair_ts_ms // 1000, pair_address
        except Exception as exc:  # noqa: BLE001
            logger.debug(
                "[dexscreener_pair] fetch failed for %s: %s", mint[:16], exc
            )
            return None, None

    async def _get_deployer_via_pair_pivot(
        self,
        mint: str,
        pair_ts: int,
        pair_address: str,
    ) -> Optional[dict[str, Any]]:
        """Binary-search slot → getBlock scan → before-param walk → deployer.

        Algorithm (deterministic, ~1–3 s for migrated PumpFun tokens):

        1. Binary-search ``getBlockTime`` to locate the Solana slot whose
           timestamp is closest to *pair_ts* (the Raydium migration time from
           DexScreener ``pairCreatedAt``).
        2. Scan a ±65-slot window for the migration TX that includes
           *pair_address* in its ``accountKeys``.
        3. Call ``getSignaturesForAddress(mint, before=migration_sig)`` and
           paginate until the page is shorter than 1 000 (creation is last).
        4. Fetch the creation TX and return the first signer that is not a
           known program/launchpad address as ``feePayer`` / deployer.

        Returns ``{signature, slot, blockTime, feePayer}`` or ``None``.
        """
        # ── 1. Binary search (batched) ────────────────────────────────────────
        current_slot = await self._call("getSlot", [{"commitment": "finalized"}])
        if not current_slot:
            return None

        # Phase 1: Coarse binary search with batched getBlockTime
        # Sample 8 evenly-spaced slots per round to narrow the range quickly
        low: int = current_slot - 50_000_000
        high: int = current_slot

        for _ in range(3):  # 3 rounds of batched binary search
            if high - low <= 500:
                break
            # Sample 8 points in the range
            step = (high - low) // 9
            sample_slots = [low + step * i for i in range(1, 9)]

            batch_calls = [("getBlockTime", [s]) for s in sample_slots]
            times = await self._call_batch(batch_calls)

            # Find the narrowest bracket containing pair_ts
            for i, bt in enumerate(times):
                if bt is not None and bt <= pair_ts:
                    low = sample_slots[i]
                elif bt is not None and bt > pair_ts:
                    high = sample_slots[i]
                    break

        target_slot = (low + high) // 2
        logger.debug(
            "[pair_pivot] binary search done: target_slot=%d for %s",
            target_slot, mint[:16],
        )

        # ── 2. Scan blocks for migration TX (batched) ─────────────────────────
        migration_sig: Optional[str] = None

        # Scan in batches of 10 blocks
        for batch_start in range(-5, 65, 10):
            batch_end = min(batch_start + 10, 65)
            batch_calls = [
                ("getBlock", [
                    target_slot + delta,
                    {
                        "encoding": "jsonParsed",
                        "transactionDetails": "accounts",
                        "rewards": False,
                        "maxSupportedTransactionVersion": 0,
                    },
                ])
                for delta in range(batch_start, batch_end)
            ]
            blocks = await self._call_batch(batch_calls)

            for blk in blocks:
                if not blk or not isinstance(blk, dict):
                    continue
                for tx in blk.get("transactions") or []:
                    keys = tx.get("transaction", {}).get("accountKeys", [])
                    if any(
                        (k.get("pubkey", "") if isinstance(k, dict) else k) == pair_address
                        for k in keys
                    ):
                        sigs = tx.get("transaction", {}).get("signatures", [])
                        migration_sig = sigs[0] if sigs else None
                        break
                if migration_sig:
                    break
            if migration_sig:
                break

        if not migration_sig:
            logger.debug(
                "[pair_pivot] migration TX not found (window ±65) for %s", mint[:16],
            )
            return None

        # ── 3. Paginate mint sigs before migration ────────────────────────────
        cursor: str = migration_sig
        for _page in range(10):  # safety cap: 10k sigs max
            page_sigs = await self._call(
                "getSignaturesForAddress",
                [mint, {"limit": 1000, "before": cursor, "commitment": "finalized"}],
            )
            if not page_sigs:
                break
            cursor = page_sigs[-1]["signature"]
            if len(page_sigs) < 1000:
                # Last page — oldest entry is the true creation TX
                creation = page_sigs[-1]
                creation_slot = creation.get("slot")
                creation_time = creation.get("blockTime")
                sig = creation["signature"]

                # ── 4. Fetch creation TX → extract deployer ───────────────────
                tx = await self._call(
                    "getTransaction",
                    [
                        sig,
                        {
                            "encoding": "jsonParsed",
                            "maxSupportedTransactionVersion": 0,
                        },
                    ],
                )
                deployer = ""
                if tx and isinstance(tx, dict):
                    for key in (
                        tx.get("transaction", {})
                        .get("message", {})
                        .get("accountKeys", [])
                    ):
                        addr = key.get("pubkey", "") if isinstance(key, dict) else key
                        is_signer = (
                            key.get("signer", False) if isinstance(key, dict) else True
                        )
                        if addr and is_signer and addr not in _PROGRAM_ADDRESSES and addr != mint:
                            deployer = addr
                            break
                if deployer:
                    logger.debug(
                        "[pair_pivot] deployer=%s slot=%d for %s",
                        deployer[:12], creation_slot or 0, mint[:16],
                    )
                    return {
                        "signature": sig,
                        "slot": creation_slot,
                        "blockTime": creation_time,
                        "feePayer": deployer,
                        # migration_sig is stored so callers (e.g. the bundle
                        # tracker) can use it as a cursor to reach the pre-
                        # migration window without paginating 100+ pages.
                        "migration_sig": migration_sig,
                    }
                break  # TX parse failed — fall through to next strategy

        return None

    # PumpFun API cache — avoids re-hitting the API for the same mint.
    # In-process only; the lineage_detector has its own persistent cache layer.
    _pumpfun_cache: dict[str, Optional[dict]] = {}

    async def _get_pumpfun_creation_anchor(self, mint: str) -> Optional[dict[str, Any]]:
        """Resolve token creator + timestamp + slot via the PumpFun API.

        Two-step resolution (~400ms total):
          1. PumpFun API → creator + created_timestamp (~200ms)
          2. Bonding-curve PDA oldest sig → slot + signature (~200ms)

        The slot is required by the bundle tracker to define the bundle
        detection window. Without it, bundle analysis is skipped entirely.

        Returns an anchor dict with feePayer, slot, signature, blockTime,
        or None if the token is not a PumpFun token.
        """
        # In-process cache check
        if mint in self._pumpfun_cache:
            return self._pumpfun_cache[mint]

        try:
            client = await self._get_client()
            resp = await asyncio.wait_for(
                client.get(f"https://frontend-api-v3.pump.fun/coins/{mint}", timeout=5.0),
                timeout=5.0,
            )
            if resp.status_code == 200:
                data = resp.json()
                creator = data.get("creator", "")
                if creator and creator not in _PROGRAM_ADDRESSES and creator != mint:
                    created_ts_ms = data.get("created_timestamp")
                    block_time = (
                        int(created_ts_ms / 1000) if created_ts_ms else None
                    )

                    # Step 2: resolve slot + signature for bundle tracker.
                    # Try strategies in order of speed:
                    #   a) Helius Enhanced TX on mint (1 call, ~200ms)
                    #   b) getSignaturesForAddress on bonding-curve PDA (limit=1 from oldest)
                    #   c) getSignaturesForAddress on mint (limit=1 from oldest)
                    slot = None
                    signature = ""

                    # Strategy a: Helius Enhanced Transactions (fastest)
                    if self._helius_api_key:
                        try:
                            etxs = await asyncio.wait_for(
                                self.get_enhanced_transactions(
                                    mint, limit=1, tx_type="CREATE"
                                ),
                                timeout=5.0,
                            )
                            if etxs:
                                slot = etxs[0].get("slot")
                                signature = etxs[0].get("signature", "")
                                if etxs[0].get("timestamp"):
                                    block_time = etxs[0]["timestamp"]
                        except Exception:
                            pass

                    # Strategy b: bonding-curve PDA newest sig (1 RPC call)
                    # For PumpFun, the NEWEST sig on the curve PDA is the
                    # creation TX (bonding curve is only used at launch).
                    # This is a single getSignaturesForAddress with limit=1.
                    if slot is None:
                        curve_pda = _pump_bonding_curve_pda(mint)
                        if curve_pda:
                            try:
                                sigs = await self._call(
                                    "getSignaturesForAddress",
                                    [curve_pda, {"limit": 1, "commitment": "finalized"}],
                                    circuit_protect=False,
                                )
                                if sigs and isinstance(sigs, list) and sigs[0]:
                                    # For active PumpFun tokens, the newest sig
                                    # IS the creation TX. For migrated tokens,
                                    # the newest may be the migration — but the
                                    # slot is close enough for bundle detection.
                                    slot = sigs[0].get("slot")
                                    signature = sigs[0].get("signature", "")
                                    if sigs[0].get("blockTime"):
                                        block_time = sigs[0]["blockTime"]
                            except Exception:
                                pass

                    anchor = {
                        "signature": signature,
                        "slot": slot,
                        "blockTime": block_time,
                        "feePayer": creator,
                    }
                    self._pumpfun_cache[mint] = anchor
                    logger.info(
                        "[creation_anchor] PumpFun API resolved creator %s slot=%s for %s",
                        creator[:12], slot, mint[:12],
                    )
                    return anchor
            # Not a PumpFun token or no creator — cache negative
            self._pumpfun_cache[mint] = None
        except Exception as exc:
            logger.debug("[creation_anchor] PumpFun API failed for %s: %s", mint[:12], exc)
        return None

    async def get_creation_anchor(
        self, mint: str, *, circuit_protect: bool = True,
        pair_ts_ms: Optional[int] = None,
        pair_address: Optional[str] = None,
    ) -> Optional[dict[str, Any]]:
        """Return an anchor dict ``{signature, slot, blockTime, feePayer}`` for *mint*.

        Resolution order
        ----------------
        0. **PumpFun API** (fastest, ~200ms) — returns creator + created_timestamp
           directly from pump.fun backend. Works for all PumpFun tokens regardless
           of suffix. Returns 404 for non-PumpFun tokens (safe, fast).
        1. **DexScreener pair-pivot** (≈1–3 s) — uses ``pairCreatedAt``
           as the Raydium migration anchor, binary-searches the slot chain, walks
           backwards from the migration TX to the true creation TX.
           Works for any token listed on DexScreener (i.e. that has migrated).
           The caller may supply *pair_ts_ms* and *pair_address* to skip the
           DexScreener HTTP call.
        2. **Bonding-curve PDA** signature walk — PumpFun only; the PDA has very
           few transactions and resolves quickly for active tokens.
        3. **Direct mint** signature walk — last-resort fallback, capped at
           20 pages.
        """
        # ── 0. PumpFun API (fastest — ~200ms for deployer) ────────────────
        # Resolve creator first; then continue to strategies 1-3 to get the
        # slot + signature if PumpFun didn't resolve them.
        pf_anchor = await self._get_pumpfun_creation_anchor(mint)
        if pf_anchor and pf_anchor.get("slot") is not None:
            return pf_anchor
        # PumpFun resolved creator but not slot → continue to get slot,
        # then merge the creator (feePayer) into whatever anchor we find.

        # ── 1. DexScreener pair-pivot ────────────────────────────────────────
        if pair_ts_ms and pair_address:
            pivot = await self._get_deployer_via_pair_pivot(
                mint, pair_ts_ms // 1000, pair_address
            )
            if pivot:
                # Merge PumpFun creator if available (more reliable than sig-walk deployer)
                if pf_anchor and pf_anchor.get("feePayer"):
                    pivot["feePayer"] = pf_anchor["feePayer"]
                return pivot
        else:
            dex_ts, dex_pair = await self._fetch_dexscreener_pair(mint)
            if dex_ts and dex_pair:
                pivot = await self._get_deployer_via_pair_pivot(mint, dex_ts, dex_pair)
                if pivot:
                    if pf_anchor and pf_anchor.get("feePayer"):
                        pivot["feePayer"] = pf_anchor["feePayer"]
                    return pivot

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
                    if pf_anchor and pf_anchor.get("feePayer"):
                        sig["feePayer"] = pf_anchor["feePayer"]
                    return sig

        # ── 3. Direct mint walk ───────────────────────────────────────────────
        result = await self.get_oldest_signature(mint, circuit_protect=circuit_protect)
        if result and pf_anchor and pf_anchor.get("feePayer"):
            result["feePayer"] = pf_anchor["feePayer"]
        return result

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
                    if addr and is_signer and addr not in _PROGRAM_ADDRESSES and addr != mint:
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

    async def get_assets_batch(self, mints: list[str]) -> list[dict]:
        """Fetch DAS asset data for multiple mints in a single batch.

        Returns a list of asset dicts in the same order as *mints*.
        Missing/failed assets return {}.
        """
        if not mints:
            return []
        calls = [("getAsset", {"id": m}) for m in mints]
        results = await self._call_batch(calls, circuit_protect=False)
        return [r if isinstance(r, dict) else {} for r in results]

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

    async def get_assets_by_owner(
        self, owner: str, *, page: int = 1, limit: int = 100
    ) -> list[dict]:
        """Get all fungible token assets held by a wallet (Helius DAS).

        Uses ``getAssetsByOwner`` — 1 call replaces N ``getTokenAccountsByOwner`` calls.
        Ideal for bundle wallet detection (check what tokens a suspect wallet holds).
        """
        result = await self._call("getAssetsByOwner", {
            "ownerAddress": owner,
            "displayOptions": {"showFungible": True},
            "page": page,
            "limit": min(limit, 1000),
        }, circuit_protect=False)
        if isinstance(result, dict):
            items = result.get("items") or []
            if not isinstance(items, list):
                return []
            return [
                item for item in items
                if item.get("interface") in {"FungibleAsset", "FungibleToken"}
            ]
        return []

    async def get_enhanced_transactions(
        self, address: str, *, limit: int = 20, tx_type: str = ""
    ) -> list[dict]:
        """Fetch enriched transaction history via Helius Enhanced Transactions API.

        Returns pre-parsed transactions with tokenTransfers, nativeTransfers,
        accountData — no manual getTransaction + parse needed.

        Requires Helius API key in the RPC endpoint URL.
        """
        api_key = self.helius_api_key
        if not api_key:
            return []  # Not a Helius endpoint

        url = f"https://api.helius.xyz/v0/addresses/{address}/transactions"
        params: dict = {"api-key": api_key, "limit": min(limit, 100)}
        if tx_type:
            params["type"] = tx_type

        try:
            client = await self._get_client_for(self._endpoints[0])
            resp = await client.get(url, params=params, timeout=12.0)
            if resp.status_code == 200:
                data = resp.json()
                return data if isinstance(data, list) else []
            return []
        except Exception:
            return []

    async def get_enhanced_transactions_batch(
        self, signatures: list[str]
    ) -> list[dict]:
        """Parse multiple transactions in one call via Helius Enhanced API.

        Up to 100 signatures per call. Returns enriched transaction data
        with tokenTransfers, nativeTransfers pre-parsed.
        """
        api_key = self.helius_api_key
        if not api_key:
            return []

        url = "https://api.helius.xyz/v0/transactions"

        try:
            client = await self._get_client_for(self._endpoints[0])
            resp = await client.post(
                url,
                params={"api-key": api_key},
                json={"transactions": signatures[:100]},
                timeout=15.0,
            )
            if resp.status_code == 200:
                data = resp.json()
                return data if isinstance(data, list) else []
            return []
        except Exception:
            return []

    # ------------------------------------------------------------------
    # DAS methods — only work on endpoints that support DAS
    # ------------------------------------------------------------------
    _DAS_METHODS = frozenset({"getAsset", "getAssetsByOwner", "searchAssets"})

    def _eligible_endpoints(self, method: str) -> list[RpcEndpoint]:
        """Return endpoints eligible for *method*, respecting DAS support."""
        if method in self._DAS_METHODS:
            return [ep for ep in self._endpoints if ep.supports_das]
        return list(self._endpoints)

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
        """JSON-RPC call with retry, circuit breaker, and multi-endpoint fallback.

        Tries each eligible endpoint in order. If an endpoint's circuit
        breaker is OPEN or the call fails, the next endpoint is attempted.
        Uses a global semaphore to cap total in-flight RPC calls.
        """
        # TX-level cache for getTransaction (avoids redundant RPC calls)
        _cache_sig: str | None = None
        if method == "getTransaction" and isinstance(params, list) and params:
            _cache_sig = str(params[0])
            cached = _tx_cache_get(_cache_sig)
            if cached is not None:
                return cached

        endpoints = self._eligible_endpoints(method)
        if not endpoints:
            return None

        has_fallbacks = len(endpoints) > 1
        retries = _MAX_RETRIES_WITH_FALLBACK if has_fallbacks else _MAX_RETRIES

        self._id_counter += 1
        payload = {
            "jsonrpc": "2.0",
            "id": self._id_counter,
            "method": method,
            "params": params,
        }

        sem = _get_global_sem()

        for i, ep in enumerate(endpoints):
            client = await self._get_client_for(ep)
            is_last = i == len(endpoints) - 1

            async def _do(c=client, e=ep) -> Any:
                async with sem:
                    result = await async_http_post_json(
                        c, e.url, json_payload=payload,
                        max_retries=retries, backoff_base=_BACKOFF_BASE,
                        label=f"Solana RPC ({method})",
                    )
                if result is None:
                    raise httpx.RequestError(f"Solana RPC {method}: all retries exhausted")
                if _cache_sig and result:
                    _tx_cache_put(_cache_sig, result)
                return result

            if circuit_protect:
                try:
                    return await ep.circuit_breaker.call(_do)
                except CircuitOpenError:
                    if is_last:
                        logger.warning(
                            "Solana RPC all endpoints OPEN – fast-failing %s", method
                        )
                        return None
                    continue
                except MethodBlockedError:
                    # 403 = method blocked by this provider, skip to next
                    # without counting as a CB failure (undo the failure)
                    async with ep.circuit_breaker._lock:
                        if ep.circuit_breaker._failure_count > 0:
                            ep.circuit_breaker._failure_count -= 1
                    if is_last:
                        return None
                    continue
                except Exception:
                    if is_last:
                        return None
                    continue
            else:
                try:
                    return await _do()
                except MethodBlockedError:
                    if is_last:
                        return None
                    continue
                except Exception:
                    if is_last:
                        return None
                    continue

        return None  # pragma: no cover

    async def _call_batch(
        self,
        calls: list[tuple[str, list | dict]],
        *,
        circuit_protect: bool = True,
    ) -> list[Any]:
        """Execute multiple JSON-RPC calls in a single HTTP request (batch mode).

        Tries each eligible endpoint in order with fallback.
        """
        if not calls:
            return []

        # Build batch payload
        payloads = []
        for method, params in calls:
            self._id_counter += 1
            payloads.append({
                "jsonrpc": "2.0",
                "id": self._id_counter,
                "method": method,
                "params": params,
            })

        # Map id -> index for reordering
        id_to_idx = {p["id"]: i for i, p in enumerate(payloads)}

        # Use all endpoints (batch calls are standard RPC, not DAS)
        endpoints = list(self._endpoints)

        for i, ep in enumerate(endpoints):
            client = await self._get_client_for(ep)
            is_last = i == len(endpoints) - 1

            async def _do(c=client, e=ep) -> list[Any]:
                async with _get_global_sem():
                    resp = await c.post(
                        e.url,
                        json=payloads,
                        timeout=max(self._timeout, len(calls) * 0.5),
                    )
                    if resp.status_code == 429:
                        wait = float(resp.headers.get("retry-after", "2"))
                        await asyncio.sleep(min(wait, 5.0))
                        resp = await c.post(
                            e.url, json=payloads, timeout=self._timeout
                        )
                resp.raise_for_status()
                body = resp.json()

                results: list[Any] = [None] * len(calls)
                if isinstance(body, list):
                    for item in body:
                        idx = id_to_idx.get(item.get("id"))
                        if idx is not None:
                            if "error" in item:
                                logger.debug(
                                    "Batch RPC error id=%s: %s",
                                    item.get("id"),
                                    item["error"],
                                )
                            else:
                                results[idx] = item.get("result")
                return results

            if circuit_protect:
                try:
                    return await ep.circuit_breaker.call(_do)
                except Exception:
                    if is_last:
                        return [None] * len(calls)
                    continue
            else:
                try:
                    return await _do()
                except Exception as exc:
                    if is_last:
                        logger.warning("Batch RPC failed (%d calls): %s", len(calls), exc)
                        return [None] * len(calls)
                    continue

        return [None] * len(calls)  # pragma: no cover
