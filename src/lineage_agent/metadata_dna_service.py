"""
Phase 3 — Operator Fingerprint (Metadata DNA).

Detects when different deployer wallets share the same behavioural
fingerprint based on:
- Campaign tags (Discord, Twitter, Telegram) — STRONGEST signal
- Upload service pattern (Arweave, IPFS, Cloudflare)
- Normalised description prefix (entropy-filtered)

Uses persistent `token_fingerprints` table to cache per-mint results,
avoiding re-fetching metadata URIs on subsequent scans. Only NEW mints
(not in cache) trigger HTTP fetches — making the service incremental.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import math
import re
import time
from typing import Optional

import httpx

from .data_sources._clients import (
    cache_get,
    cache_set,
    event_query,
    get_img_client,
    operator_mapping_query,
    operator_mapping_upsert,
)
from .models import DeployerTokenSummary, EvidenceLevel, OperatorFingerprint, RugMechanism
from .rug_detector import normalize_legacy_rug_events

logger = logging.getLogger(__name__)

_FETCH_TIMEOUT = 5.0        # seconds per metadata fetch
_FETCH_SEM = asyncio.Semaphore(3)
_MIN_DESC_ENTROPY = 0.35    # minimum Shannon entropy ratio to accept description
_MIN_DESC_LENGTH = 8        # minimum chars after normalisation

# Solana system/protocol addresses — never treated as human deployers
_SYSTEM_ADDRESSES: frozenset[str] = frozenset({
    "11111111111111111111111111111111",
    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1bRS",
    "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
    "TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM",
    "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBymPkZu",
    "Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1",
})

_CAMPAIGN_PATTERNS: list[tuple[str, str]] = [
    (r"discord\.gg/([a-zA-Z0-9_-]{2,32})", "discord"),
    (r"discord\.com/invite/([a-zA-Z0-9_-]{2,32})", "discord"),
    (r"(?:twitter\.com|x\.com)/([a-zA-Z0-9_]{1,15})(?:/|\s|$)", "twitter"),
    (r"t\.me/([a-zA-Z0-9_]{5,32})(?:/|\s|$)", "telegram"),
    (r"instagram\.com/([a-zA-Z0-9_.]{1,30})(?:/|\s|$)", "instagram"),
]

_SERVICE_PATTERNS: list[tuple[str, str]] = [
    (r"arweave\.net/", "arweave"),
    (r"ar-io\.net/", "arweave"),
    (r"ipfs\.io/ipfs/", "ipfs"),
    (r"cloudflare-ipfs\.com/ipfs/", "cloudflare"),
    (r"nftstorage\.link/", "nftstorage"),
    (r"dweb\.link/ipfs/", "ipfs"),
    (r"gateway\.pinata\.cloud/ipfs/", "pinata"),
    (r"cf-ipfs\.com/", "cloudflare"),
    (r"pump\.fun/", "pumpfun"),
    (r"bafkreia?[a-z0-9]{50,}", "ipfs"),
]

_CONFIRMED_EVIDENCE_LEVELS = {EvidenceLevel.MODERATE.value, EvidenceLevel.STRONG.value}
_CONFIRMED_RUG_MECHANISMS = {
    RugMechanism.DEX_LIQUIDITY_RUG.value,
    RugMechanism.PRE_DEX_EXTRACTION_RUG.value,
}


def _is_confirmed_linked_wallet_rug(row: dict) -> bool:
    mechanism = (row.get("rug_mechanism") or "").strip()
    evidence_level = (row.get("evidence_level") or "").strip()
    if not mechanism:
        return True
    if mechanism not in _CONFIRMED_RUG_MECHANISMS:
        return False
    if not evidence_level:
        return True
    return evidence_level in _CONFIRMED_EVIDENCE_LEVELS


def _shannon_entropy(s: str) -> float:
    """Shannon entropy normalised to [0, 1]."""
    if not s:
        return 0.0
    freq: dict[str, int] = {}
    for c in s:
        freq[c] = freq.get(c, 0) + 1
    n = len(s)
    ent = -sum((count / n) * math.log2(count / n) for count in freq.values())
    max_ent = math.log2(min(n, 26))  # max for lowercase alpha
    return ent / max_ent if max_ent > 0 else 0.0


# ── In-process fingerprint cache (no DB writes during scan) ──────────────────

_FP_MEM_CACHE: dict[str, tuple[str, str]] = {}  # mint → (fp, desc_norm)
_FP_MEM_MAX = 2000


# ── Core fingerprint computation ─────────────────────────────────────────────

async def _get_fingerprint(mint: str, uri: str) -> tuple[str, str] | None:
    """Compute (fingerprint, desc_norm) for a single token.

    1. Check persistent DB cache (token_fingerprints table)
    2. Check in-memory TTL cache (dna:v2:{mint})
    3. Fetch metadata URI (HTTP)
    4. Compute fingerprint with entropy filter
    5. Persist to DB + TTL cache
    """
    if not uri:
        return None

    # 1. In-process dict cache (instant, no DB I/O)
    if mint in _FP_MEM_CACHE:
        return _FP_MEM_CACHE[mint]

    # 2. In-memory TTL cache (fast path within same process)
    cache_key = f"dna:v2:{mint}"
    cached = await cache_get(cache_key)
    if cached:
        parts = str(cached).split("|", 2)
        if len(parts) >= 2:
            return parts[0], parts[1]

    # 3. Fetch metadata
    try:
        client: httpx.AsyncClient = get_img_client()
        fetch_url = _normalise_uri(uri)
        if not fetch_url:
            return None
        resp = await asyncio.wait_for(client.get(fetch_url), timeout=_FETCH_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        logger.debug("metadata fetch failed for %s (%s): %s", mint, uri, exc)
        return None

    desc = str(data.get("description") or "").strip()

    # Extract campaign tags (STRONGEST signal)
    campaign_tags: list[str] = []
    for pattern, platform in _CAMPAIGN_PATTERNS:
        for m in re.finditer(pattern, desc, re.IGNORECASE):
            tag = f"{platform}:{m.group(1).lower()}"
            if tag not in campaign_tags:
                campaign_tags.append(tag)
    tags_str = ";".join(sorted(campaign_tags))

    # Normalise description
    desc_norm = re.sub(r"[^a-z0-9 ]", "", desc.lower())[:200].strip()

    # Entropy filter — reject descriptions too generic (e.g. "buy token now")
    entropy = _shannon_entropy(desc_norm) if desc_norm else 0.0
    if not tags_str:
        if not desc_norm or len(desc_norm) < _MIN_DESC_LENGTH:
            return None
        if entropy < _MIN_DESC_ENTROPY:
            logger.debug("desc entropy too low for %s: %.2f < %.2f", mint[:12], entropy, _MIN_DESC_ENTROPY)
            return None

    service = _detect_service(uri)

    # Compute fingerprint
    if tags_str:
        raw = f"campaign:{tags_str}"
    else:
        raw = f"{service}:{desc_norm}"
    fp = hashlib.sha256(raw.encode()).hexdigest()[:32]

    # 5. Cache in-process + TTL
    if len(_FP_MEM_CACHE) < _FP_MEM_MAX:
        _FP_MEM_CACHE[mint] = (fp, desc_norm)
    await cache_set(cache_key, f"{fp}|{desc_norm}|{tags_str}", ttl=86400)

    return fp, desc_norm


# ── Main entry point ─────────────────────────────────────────────────────────

async def build_operator_fingerprint(
    mints_deployers_uris: list[tuple[str, str, str]],
) -> Optional[OperatorFingerprint]:
    """Compute fingerprints for a list of (mint, deployer, metadata_uri) tuples.

    Incremental: reads from persistent token_fingerprints cache for known mints,
    only fetches metadata for new ones. This makes repeated scans near-instant.
    """
    valid = [
        (m, d, u)
        for m, d, u in mints_deployers_uris
        if d and u and d not in _SYSTEM_ADDRESSES
    ]
    if not valid:
        return None

    # Single-token deployer: compute fingerprint and check operator_mappings
    # DB for known associations. This catches wallet-rotating operators who
    # reuse campaign tags (Discord/Twitter/Telegram links in metadata).
    if len(valid) == 1:
        mint, deployer, uri = valid[0]
        result = await _get_fingerprint(mint, uri)
        if result is None:
            return None
        fp, desc_norm = result
        service = _detect_service(uri)

        # Check if this fingerprint is already linked to other wallets
        try:
            existing = await operator_mapping_query(fp)
            known_wallets = [r["wallet"] for r in existing if r.get("wallet") and r["wallet"] != deployer]
        except Exception:
            known_wallets = []

        # Persist this wallet→fingerprint mapping for future lookups
        try:
            await operator_mapping_upsert(fp, deployer)
        except Exception as _e:
            logger.debug("operator_mapping_upsert failed for %s: %s", deployer, _e)

        if known_wallets:
            # Known operator — this wallet shares a fingerprint with others
            linked = [deployer] + known_wallets
            linked_wallet_tokens = await _fetch_linked_wallet_tokens(linked)
            return OperatorFingerprint(
                fingerprint=fp,
                linked_wallets=linked,
                upload_service=service,
                description_pattern=desc_norm if desc_norm else fp[:16] + "...",
                confidence="probable",
                linked_wallet_tokens=linked_wallet_tokens,
            )

        # No known associations yet — still return fingerprint (without
        # linked_wallets) so downstream can use it for operator_impact
        # when the DB grows. Return None for now (no actionable intel).
        return None

    # Fetch + compute fingerprints concurrently (bounded)
    sem = asyncio.Semaphore(5)  # increased from 3 — DB cache makes most calls instant

    async def _fp(mint: str, deployer: str, uri: str) -> tuple[str, str, str, str] | None:
        async with sem:
            result = await _get_fingerprint(mint, uri)
            if result is None:
                return None
            fp, desc_norm = result
            return (deployer, fp, _detect_service(uri), desc_norm)

    tasks = [_fp(m, d, u) for m, d, u in valid]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Group deployers by fingerprint
    fp_to_deployers: dict[str, list[str]] = {}
    fp_to_service: dict[str, str] = {}
    fp_to_desc: dict[str, str] = {}
    fp_token_count: dict[str, int] = {}

    for r in results:
        if not isinstance(r, tuple):
            continue
        deployer, fp, service, desc_norm = r
        if fp not in fp_to_deployers:
            fp_to_deployers[fp] = []
            fp_to_service[fp] = service
        if deployer not in fp_to_deployers[fp]:
            fp_to_deployers[fp].append(deployer)
        if fp not in fp_to_desc or not fp_to_desc[fp] or fp_to_desc[fp] == fp:
            fp_to_desc[fp] = desc_norm if desc_norm else fp[:16] + "..."
        fp_token_count[fp] = fp_token_count.get(fp, 0) + 1

    # Accept: ≥2 deployers (cross-wallet) OR 1 deployer with ≥2 tokens same DNA
    shared = {
        fp: deps
        for fp, deps in fp_to_deployers.items()
        if len(deps) >= 2 or fp_token_count.get(fp, 0) >= 2
    }
    if not shared:
        return None

    best_fp = max(shared, key=lambda k: (len(shared[k]), fp_token_count.get(k, 0)))
    linked = shared[best_fp]
    service = fp_to_service.get(best_fp, "unknown")
    is_cross_wallet = len(linked) >= 2

    linked_wallet_tokens = await _fetch_linked_wallet_tokens(linked)

    for wallet in linked:
        try:
            await operator_mapping_upsert(best_fp, wallet)
        except Exception as _e:
            logger.debug("operator_mapping_upsert failed for %s: %s", wallet, _e)

    return OperatorFingerprint(
        fingerprint=best_fp,
        linked_wallets=linked,
        upload_service=service,
        description_pattern=fp_to_desc.get(best_fp, best_fp[:16] + "..."),
        confidence=(
            "confirmed" if is_cross_wallet and len(linked) >= 3
            else "probable" if is_cross_wallet
            else "probable"
        ),
        linked_wallet_tokens=linked_wallet_tokens,
    )


# ── Helpers ──────────────────────────────────────────────────────────────────

async def _fetch_linked_wallet_tokens(wallets: list[str]) -> dict[str, list[DeployerTokenSummary]]:
    """Enrich each linked wallet with its token launch history."""
    result: dict[str, list[DeployerTokenSummary]] = {}

    async def _query_wallet(wallet: str) -> None:
        try:
            rows = await event_query(
                where="deployer = ? AND event_type = 'token_created'",
                params=(wallet,),
                columns="mint, name, symbol, created_at, lifecycle_stage, evidence_level, rug_mechanism",
                order_by="created_at DESC",
                limit=20,
            )
            if not rows:
                return

            legacy_rug_mints = [
                r.get("mint", "")
                for r in rows
                if r.get("mint") and not r.get("rug_mechanism")
            ]
            if legacy_rug_mints:
                await normalize_legacy_rug_events(mints=legacy_rug_mints)
                rows = await event_query(
                    where="deployer = ? AND event_type = 'token_created'",
                    params=(wallet,),
                    columns="mint, name, symbol, created_at, lifecycle_stage, evidence_level, rug_mechanism",
                    order_by="created_at DESC",
                    limit=20,
                )

            rugged_mints = await event_query(
                where="deployer = ? AND event_type = 'token_rugged'",
                params=(wallet,),
                columns="mint, rug_mechanism, evidence_level",
                limit=100,
            )
            rugged_map: dict[str, dict] = {}
            for r in rugged_mints:
                m = r.get("mint")
                if m:
                    rugged_map[m] = r

            tokens: list[DeployerTokenSummary] = []
            for r in rows:
                mint = r.get("mint", "")
                rug_info = rugged_map.get(mint)
                tokens.append(DeployerTokenSummary(
                    mint=mint,
                    name=r.get("name") or mint[:8],
                    symbol=r.get("symbol") or "?",
                    created_at=r.get("created_at"),
                    rug_mechanism=rug_info.get("rug_mechanism") if rug_info else None,
                    evidence_level=rug_info.get("evidence_level") if rug_info else None,
                    rugged_at=r.get("created_at") if rug_info and _is_confirmed_linked_wallet_rug(rug_info) else None,
                ))
            result[wallet] = tokens
        except Exception as exc:
            logger.debug("_fetch_linked_wallet_tokens failed for %s: %s", wallet, exc)

    await asyncio.gather(*[_query_wallet(w) for w in wallets])
    return result


def _detect_service(uri: str) -> str:
    for pattern, name in _SERVICE_PATTERNS:
        if re.search(pattern, uri, re.IGNORECASE):
            return name
    return "other"


def _normalise_uri(uri: str) -> Optional[str]:
    """Ensure URI is a full HTTP URL."""
    uri = uri.strip()
    if not uri:
        return None
    if uri.startswith("http://") or uri.startswith("https://"):
        return uri
    if uri.startswith("ipfs://"):
        return "https://ipfs.io/ipfs/" + uri[7:]
    if uri.startswith("ar://"):
        return "https://arweave.net/" + uri[5:]
    if re.match(r"^[a-zA-Z0-9_-]{43}$", uri):
        return "https://arweave.net/" + uri
    # Bare domain URIs (e.g. "pump.fun/coin/MINT/metadata")
    if "." in uri and "/" in uri:
        return "https://" + uri
    return None
