"""Token identity resolution -- metadata, DAS, Jupiter price.

Extracts the first phase of detect_lineage: fetching metadata from
DexScreener, enriching with on-chain DAS data and Jupiter price.
Runs 3 concurrent requests (deployer, asset, price) via asyncio.gather.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

logger = logging.getLogger(__name__)


@dataclass
class TokenIdentity:
    """Resolved token identity -- all data needed to start forensics."""
    mint: str
    name: str = ""
    symbol: str = ""
    deployer: str = ""
    created_at: Optional[datetime] = None
    image_uri: str = ""
    metadata_uri: str = ""
    price_usd: Optional[float] = None
    market_cap_usd: Optional[float] = None
    liquidity_usd: Optional[float] = None
    launch_platform: Optional[str] = None
    lifecycle_stage: Any = None
    market_surface: Any = None
    evidence_level: Any = None
    reason_codes: list[str] = field(default_factory=list)
    pairs: list[dict] = field(default_factory=list)
    das_asset: dict = field(default_factory=dict)
    # Internal: TokenMetadata for backward compat
    _query_meta: Any = None


async def resolve_token_identity(
    mint: str,
    *,
    force_refresh: bool = False,
) -> TokenIdentity:
    """Resolve token identity from DexScreener + DAS + Jupiter.

    This is the first phase of the forensic pipeline. It resolves:
    - Token name, symbol, image from DexScreener pairs
    - Deployer address + creation timestamp from RPC sig-walk
    - DAS metadata (on-chain name/symbol/image)
    - Jupiter price cross-validation

    Returns a TokenIdentity dataclass with all resolved fields.
    Wall-time: ~2-3s (3 concurrent fetches).
    """
    from .data_sources._clients import (
        cache_delete as _cache_delete,
        cache_get as _cache_get,
        get_dex_client as _get_dex_client,
        get_jup_client as _get_jup_client,
        get_rpc_client as _get_rpc_client,
    )
    from .lineage_detector import (
        _get_deployer_cached,
        _get_asset_cached,
        _lineage_cache_key,
        _legacy_lineage_cache_key,
        classify_market_context,
        _NON_DEPLOYER_AUTHORITIES,
    )

    dex = _get_dex_client()
    rpc = _get_rpc_client()
    jup = _get_jup_client()

    # Force-refresh: clear stale caches
    if force_refresh:
        await _cache_delete(_lineage_cache_key(mint))
        await _cache_delete(_legacy_lineage_cache_key(mint))
        await _cache_delete(f"rpc:deployer:v6:{mint}")
        await _cache_delete(f"rpc:asset:{mint}")

    # Step 1: Fetch DexScreener pairs
    pairs = await dex.get_token_pairs_with_fallback(mint)
    query_meta = dex.pairs_to_metadata(mint, pairs)

    # Step 2: Concurrent enrichment (deployer + DAS + Jupiter price)
    _deployer_result, _q_asset_result, _jup_price_result = await asyncio.gather(
        _get_deployer_cached(rpc, mint),
        _get_asset_cached(rpc, mint),
        jup.get_price(mint),
        return_exceptions=True,
    )

    # Apply deployer
    deployer = ""
    if not isinstance(_deployer_result, Exception):
        deployer_addr, created_at = _deployer_result
        query_meta.deployer = deployer_addr
        deployer = deployer_addr
        if created_at is not None:
            if query_meta.created_at is None or created_at < query_meta.created_at:
                query_meta.created_at = created_at

    # Apply DAS
    das_asset: dict = {}
    if not isinstance(_q_asset_result, Exception):
        das_asset = _q_asset_result or {}
        try:
            _q_content = das_asset.get("content") or {}
            _q_content_meta = _q_content.get("metadata") or {}
            if not query_meta.name:
                query_meta.name = _q_content_meta.get("name") or ""
            if not query_meta.symbol:
                query_meta.symbol = _q_content_meta.get("symbol") or ""
            if not query_meta.metadata_uri:
                query_meta.metadata_uri = _q_content.get("json_uri") or ""
            if not query_meta.image_uri:
                query_meta.image_uri = (_q_content.get("links") or {}).get("image") or ""
            if not query_meta.deployer or query_meta.deployer in _NON_DEPLOYER_AUTHORITIES:
                _q_creators = das_asset.get("creators") or []
                _resolved = next(
                    (c["address"] for c in _q_creators if c.get("verified")), ""
                )
                if _resolved and _resolved not in _NON_DEPLOYER_AUTHORITIES:
                    query_meta.deployer = _resolved
                    deployer = _resolved
            _market_ctx = classify_market_context(das_asset, pairs, mint_address=mint)
            query_meta.launch_platform = _market_ctx["launch_platform"]
            query_meta.lifecycle_stage = _market_ctx["lifecycle_stage"]
            query_meta.market_surface = _market_ctx["market_surface"]
            query_meta.evidence_level = _market_ctx["evidence_level"]
            query_meta.reason_codes = _market_ctx["reason_codes"]
        except Exception as _e:
            logger.debug("DAS enrichment failed for %s: %s", mint[:12], _e)

    # Apply Jupiter price
    if not isinstance(_jup_price_result, Exception):
        if _jup_price_result is not None and query_meta.price_usd is None:
            query_meta.price_usd = _jup_price_result

    return TokenIdentity(
        mint=mint,
        name=query_meta.name,
        symbol=query_meta.symbol,
        deployer=query_meta.deployer or deployer,
        created_at=query_meta.created_at,
        image_uri=query_meta.image_uri,
        metadata_uri=query_meta.metadata_uri,
        price_usd=query_meta.price_usd,
        market_cap_usd=query_meta.market_cap_usd,
        liquidity_usd=query_meta.liquidity_usd,
        launch_platform=query_meta.launch_platform,
        lifecycle_stage=query_meta.lifecycle_stage,
        market_surface=query_meta.market_surface,
        evidence_level=query_meta.evidence_level,
        reason_codes=query_meta.reason_codes or [],
        pairs=pairs,
        das_asset=das_asset,
        _query_meta=query_meta,
    )
