"""
Phase 3 — Operator Fingerprint (Metadata DNA).

Detects when different deployer wallets share the same behavioural
fingerprint based on:
- Upload service pattern (Arweave, IPFS, Cloudflare, NFT.Storage)
- Normalised description prefix (first 60 chars stripped + lowercased)

If ≥2 different deployer wallets in a family share the same fingerprint,
they are likely the same human operator using multiple wallets.

metadata_uri is fetched from each pair's off-chain JSON.  Calls are
bounded to 3 concurrent fetches with a 5s timeout.  Failures are silent
(the signal is non-critical).
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import re
from typing import Optional

import httpx

from .data_sources._clients import (
    cache_get,
    cache_set,
    event_query,
    get_img_client,
    operator_mapping_upsert,
)
from .models import DeployerTokenSummary, OperatorFingerprint

logger = logging.getLogger(__name__)

_FETCH_TIMEOUT = 5.0        # seconds per metadata fetch
_FETCH_SEM = asyncio.Semaphore(3)

# Solana system/protocol addresses that should never be treated as human deployers
_SYSTEM_ADDRESSES: frozenset[str] = frozenset({
    "11111111111111111111111111111111",          # System Program
    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",  # Token Program
    "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1bRS",  # Associated Token Account
    "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",    # Metaplex Metadata
    "TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM",    # Pump.fun authority
    "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBymPkZu",   # Pump.fun program
    "Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1",   # Moonshot
})

# Known IPFS/Arweave gateway patterns
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
    (r"bafkreia?[a-z0-9]{50,}", "ipfs"),  # IPFS CIDv1 inline
]


async def build_operator_fingerprint(
    mints_deployers_uris: list[tuple[str, str, str]],
) -> Optional[OperatorFingerprint]:
    """Compute fingerprints for a list of (mint, deployer, metadata_uri) tuples.

    Parameters
    ----------
    mints_deployers_uris:
        List of (mint, deployer_address, metadata_uri) tuples.  Empty deployer
        or uri entries are skipped.

    Returns
    -------
    OperatorFingerprint if ≥2 distinct deployers share the same fingerprint,
    else None.
    """
    # Filter out entries without deployer or uri, and known system/protocol addresses
    valid = [
        (m, d, u)
        for m, d, u in mints_deployers_uris
        if d and u and d not in _SYSTEM_ADDRESSES
    ]
    if len(valid) < 2:
        return None

    # Fetch + compute fingerprints concurrently
    sem = asyncio.Semaphore(3)

    async def _fp(mint: str, deployer: str, uri: str) -> tuple[str, str, str] | None:
        async with sem:
            fp = await _get_fingerprint(mint, uri)
            if fp is None:
                return None
            return (deployer, fp, _detect_service(uri))

    tasks = [_fp(m, d, u) for m, d, u in valid]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Group deployers by fingerprint
    fp_to_deployers: dict[str, list[str]] = {}
    fp_to_service: dict[str, str] = {}
    fp_to_desc: dict[str, str] = {}

    for r in results:
        if not isinstance(r, tuple):
            continue
        deployer, fp, service = r
        if fp not in fp_to_deployers:
            fp_to_deployers[fp] = []
            fp_to_service[fp] = service
        if deployer not in fp_to_deployers[fp]:
            fp_to_deployers[fp].append(deployer)
        fp_to_desc[fp] = fp  # placeholder; enrich below

    # Find fingerprints shared by ≥2 distinct deployers
    shared = {fp: deps for fp, deps in fp_to_deployers.items() if len(deps) >= 2}
    if not shared:
        return None

    # Pick the fingerprint with the most linked wallets
    best_fp = max(shared, key=lambda k: len(shared[k]))
    linked = shared[best_fp]
    service = fp_to_service.get(best_fp, "unknown")

    # Enrich with tokens launched by each linked wallet
    linked_wallet_tokens = await _fetch_linked_wallet_tokens(linked)

    # Persist fingerprint→wallet mappings for Cartel Graph + Operator Impact
    for wallet in linked:
        try:
            await operator_mapping_upsert(best_fp, wallet)
        except Exception as _e:
            logger.debug("operator_mapping_upsert failed for %s: %s", wallet, _e)

    return OperatorFingerprint(
        fingerprint=best_fp,
        linked_wallets=linked,
        upload_service=service,
        description_pattern=best_fp[:16] + "...",
        confidence="confirmed" if len(linked) >= 3 else "probable",
        linked_wallet_tokens=linked_wallet_tokens,
    )


async def _fetch_linked_wallet_tokens(
    wallets: list[str],
    limit_per_wallet: int = 8,
) -> dict[str, list[DeployerTokenSummary]]:
    """Query intelligence_events for tokens launched by each linked wallet."""
    result: dict[str, list[DeployerTokenSummary]] = {}
    if not wallets:
        return result

    async def _query_wallet(wallet: str) -> None:
        if wallet in _SYSTEM_ADDRESSES:
            return
        try:
            rows = await event_query(
                where="event_type = 'token_created' AND deployer = ?",

                params=(wallet,),
                columns="mint, name, symbol, narrative, mcap_usd, created_at",
                limit=limit_per_wallet,
                order_by="recorded_at DESC",
            )
            tokens = []
            for row in rows:
                # Fetch rug status for this mint
                rug_rows = await event_query(
                    where="event_type = 'token_rugged' AND mint = ?",
                    params=(row.get("mint", ""),),
                    columns="rugged_at",
                    limit=1,
                )
                rugged_at_raw = rug_rows[0].get("rugged_at") if rug_rows else None
                from datetime import datetime, timezone

                def _parse(v: object):  # noqa: ANN202
                    if v is None or isinstance(v, datetime): return v
                    try:
                        dt = datetime.fromisoformat(str(v))
                        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
                    except ValueError:
                        return None

                tokens.append(DeployerTokenSummary(
                    mint=row.get("mint", ""),
                    name=row.get("name") or "",
                    symbol=row.get("symbol") or "",
                    created_at=_parse(row.get("created_at")),
                    rugged_at=_parse(rugged_at_raw),
                    mcap_usd=row.get("mcap_usd"),
                    narrative=row.get("narrative") or "",
                ))
            if tokens:
                result[wallet] = tokens
        except Exception as exc:
            logger.debug("_fetch_linked_wallet_tokens failed for %s: %s", wallet, exc)

    await asyncio.gather(*[_query_wallet(w) for w in wallets])
    return result


async def _get_fingerprint(mint: str, uri: str) -> Optional[str]:
    """Fetch metadata JSON and compute fingerprint. Uses cache."""
    if not uri:
        return None

    cache_key = f"dna:{mint}"
    cached = await cache_get(cache_key)
    if cached:
        return str(cached)

    try:
        client: httpx.AsyncClient = get_img_client()
        # Normalise URI (Arweave IDs may need arweave.net prefix)
        fetch_url = _normalise_uri(uri)
        if not fetch_url:
            return None

        resp = await asyncio.wait_for(client.get(fetch_url), timeout=_FETCH_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        logger.debug("metadata fetch failed for %s (%s): %s", mint, uri, exc)
        return None

    desc = str(data.get("description") or "").strip().lower()
    # Normalise: keep only alphanumeric + spaces, truncate to 60
    desc_norm = re.sub(r"[^a-z0-9 ]", "", desc)[:60].strip()
    # Empty description is too weak a signal — would cause false positives across
    # all tokens that have no description (they'd all share the same fingerprint)
    if not desc_norm:
        return None
    service = _detect_service(uri)
    raw = f"{service}:{desc_norm}"
    fp = hashlib.sha256(raw.encode()).hexdigest()[:16]

    await cache_set(cache_key, fp, ttl=86400)
    return fp


def _detect_service(uri: str) -> str:
    for pattern, name in _SERVICE_PATTERNS:
        if re.search(pattern, uri, re.IGNORECASE):
            return name
    return "other"


def _normalise_uri(uri: str) -> Optional[str]:
    """Ensure URI is a full HTTP URL."""
    uri = uri.strip()
    if uri.startswith("http://") or uri.startswith("https://"):
        return uri
    if uri.startswith("ipfs://"):
        cid = uri[7:]
        return f"https://cloudflare-ipfs.com/ipfs/{cid}"
    if uri.startswith("ar://"):
        tx = uri[5:]
        return f"https://arweave.net/{tx}"
    # Bare Arweave transaction ID (43 chars, base64url chars only)
    if re.fullmatch(r"[A-Za-z0-9_-]{43}", uri):
        return f"https://arweave.net/{uri}"
    # PumpFun metadata URI (e.g. https://pump.fun/coin/<mint>/metadata)
    if "pump.fun" in uri:
        return uri if uri.startswith("http") else f"https://{uri}"
    return None
