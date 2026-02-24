"""
Core logic for detecting memecoin lineage.

The ``detect_lineage`` function is the main async entry point.
It orchestrates data fetching from DexScreener and Solana RPC,
computes similarity scores, determines the root token and builds
the family tree.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Awaitable, Callable, Optional

from config import (
    IMAGE_SIMILARITY_THRESHOLD,
    MAX_CONCURRENT_RPC,
    MAX_DERIVATIVES,
    NAME_SIMILARITY_THRESHOLD,
    SYMBOL_SIMILARITY_THRESHOLD,
    WEIGHT_DEPLOYER,
    WEIGHT_IMAGE,
    WEIGHT_NAME,
    WEIGHT_SYMBOL,
    WEIGHT_TEMPORAL,
)
from .data_sources._clients import (
    cache as _cache,
    cache_get as _cache_get,
    cache_set as _cache_set,
    close_clients,
    get_dex_client as _get_dex_client,
    get_img_client as _get_img_client,
    get_jup_client as _get_jup_client,
    get_rpc_client as _get_rpc_client,
    init_clients,
)
from .data_sources.solana_rpc import SolanaRpcClient
from .models import (
    DerivativeInfo,
    LineageResult,
    SimilarityEvidence,
    TokenMetadata,
    TokenSearchResult,
)
from .similarity import (
    compute_composite_score,
    compute_deployer_score,
    compute_image_similarity,
    compute_name_similarity,
    compute_symbol_similarity,
    compute_temporal_score,
)

logger = logging.getLogger(__name__)

_WEIGHTS = {
    "name": WEIGHT_NAME,
    "symbol": WEIGHT_SYMBOL,
    "image": WEIGHT_IMAGE,
    "deployer": WEIGHT_DEPLOYER,
    "temporal": WEIGHT_TEMPORAL,
}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


ProgressCallback = Optional[Callable[[str, int], Awaitable[None]]]


async def detect_lineage(
    mint_address: str,
    *,
    progress_cb: ProgressCallback = None,
) -> LineageResult:
    """Detect the lineage of a Solana token identified by *mint_address*.

    Parameters
    ----------
    mint_address:
        Solana token mint address to analyse.
    progress_cb:
        Optional async callback ``(step_description, percent) -> None`` for
        streaming progress updates (used by the WebSocket endpoint).

    Steps
    -----
    1. Fetch metadata for the query token via DexScreener.
    2. Enrich with Jupiter price data.
    3. Search DexScreener for tokens with similar name / symbol.
    4. For each candidate, enrich with on-chain data (deployer, timestamp).
    5. Compute pairwise similarity scores (name, symbol, image, deployer, temporal).
    6. Select the root (oldest, highest liquidity, original deployer).
    7. Return a ``LineageResult`` with evidence.
    """

    async def _progress(step: str, pct: int) -> None:
        if progress_cb:
            try:
                await progress_cb(step, pct)
            except Exception:
                pass  # never let progress reporting break analysis

    # Check cache first
    cached = await _cache_get(f"lineage:{mint_address}")
    if cached is not None:
        # SQLite cache returns dicts (JSON-deserialized); convert back to model
        if isinstance(cached, dict):
            return LineageResult(**cached)
        if isinstance(cached, LineageResult):
            return cached
        # Stale string cache entry — ignore and re-compute
        logger.warning("Dropping invalid cached lineage for %s", mint_address)

    dex = _get_dex_client()
    rpc = _get_rpc_client()
    jup = _get_jup_client()
    img_client = _get_img_client()

    # --- Step 1: Fetch metadata for the query token ---
    await _progress("Fetching token metadata", 10)
    logger.info("Fetching metadata for %s ...", mint_address)
    pairs = await dex.get_token_pairs(mint_address)
    query_meta = dex.pairs_to_metadata(mint_address, pairs)

    # Enrich with on-chain deployer + creation time (cached per mint)
    await _progress("Resolving deployer & timestamp", 25)
    deployer, created_at = await _get_deployer_cached(rpc, mint_address)
    query_meta.deployer = deployer
    query_meta.created_at = created_at

    # Enrich with Jupiter price (cross-validate DexScreener price)
    try:
        jup_price = await jup.get_price(mint_address)
        if jup_price is not None and query_meta.price_usd is None:
            query_meta.price_usd = jup_price
    except Exception:
        logger.debug("Jupiter price enrichment failed for %s", mint_address)

    if not query_meta.name and not query_meta.symbol:
        result = LineageResult(
            mint=mint_address,
            query_token=query_meta,
            root=query_meta,
            confidence=0.0,
            derivatives=[],
            family_size=1,
        )
        await _cache_set(f"lineage:{mint_address}", result)
        return result

    # --- Step 2: Search for similar tokens ---
    await _progress("Searching for similar tokens", 40)
    search_query = query_meta.name or query_meta.symbol
    logger.info("Searching for tokens similar to '%s' ...", search_query)
    search_pairs = await dex.search_tokens(search_query)
    candidates = dex.pairs_to_search_results(search_pairs)

    # Remove the query token itself from candidates
    candidates = [c for c in candidates if c.mint != mint_address]

    if not candidates:
        result = LineageResult(
            mint=mint_address,
            query_token=query_meta,
            root=query_meta,
            confidence=1.0,
            derivatives=[],
            family_size=1,
        )
        await _cache_set(f"lineage:{mint_address}", result)
        return result

    # --- Step 3 & 4: Enrich candidates and score them ---
    family_members: list[_ScoredCandidate] = []

    # Pre-filter by name/symbol similarity (cheap, sync)
    pre_filtered = []
    for candidate in candidates[: MAX_DERIVATIVES * 2]:
        name_sim = compute_name_similarity(query_meta.name, candidate.name)
        sym_sim = compute_symbol_similarity(
            query_meta.symbol, candidate.symbol
        )
        if (
            name_sim < NAME_SIMILARITY_THRESHOLD
            and sym_sim < SYMBOL_SIMILARITY_THRESHOLD
        ):
            continue
        pre_filtered.append((candidate, name_sim, sym_sim))

    await _progress(f"Scoring {len(pre_filtered)} candidates", 60)

    # Enrich all pre-filtered candidates concurrently (bounded)
    sem = asyncio.Semaphore(MAX_CONCURRENT_RPC)
    img_sem = asyncio.Semaphore(5)  # limit concurrent image downloads

    async def _enrich(
        candidate: TokenSearchResult, name_sim: float, sym_sim: float
    ) -> Optional[_ScoredCandidate]:
        async with sem:
            c_deployer, c_created = await _get_deployer_cached(
                rpc, candidate.mint
            )

        # Image similarity — bounded concurrency for downloads
        async with img_sem:
            img_sim = await compute_image_similarity(
                query_meta.image_uri, candidate.image_uri,
                client=img_client,
            )

        # Post-filter: skip candidates with very low image similarity
        # when both images were available
        if (
            query_meta.image_uri
            and candidate.image_uri
            and img_sim < IMAGE_SIMILARITY_THRESHOLD
            and name_sim < NAME_SIMILARITY_THRESHOLD
        ):
            return None

        dep_score = compute_deployer_score(query_meta.deployer, c_deployer)
        temp_score = compute_temporal_score(created_at, c_created)

        scores = {
            "name": name_sim,
            "symbol": sym_sim,
            "image": img_sim,
            "deployer": dep_score,
            "temporal": temp_score,
        }
        composite = compute_composite_score(scores, _WEIGHTS)

        evidence = SimilarityEvidence(
            name_score=round(name_sim, 4),
            symbol_score=round(sym_sim, 4),
            image_score=round(img_sim, 4),
            deployer_score=round(dep_score, 4),
            temporal_score=round(temp_score, 4),
            composite_score=round(composite, 4),
        )

        return _ScoredCandidate(
            mint=candidate.mint,
            name=candidate.name,
            symbol=candidate.symbol,
            image_uri=candidate.image_uri,
            deployer=c_deployer,
            created_at=c_created,
            market_cap_usd=candidate.market_cap_usd,
            liquidity_usd=candidate.liquidity_usd,
            evidence=evidence,
            composite=composite,
        )

    tasks = [_enrich(c, ns, ss) for c, ns, ss in pre_filtered]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    for r in results:
        if isinstance(r, _ScoredCandidate):
            family_members.append(r)
        elif isinstance(r, Exception):
            logger.warning("Candidate enrichment failed: %s", r)

    # --- Step 5: Select root ---
    await _progress("Selecting root token", 85)
    all_tokens = [
        _ScoredCandidate(
            mint=query_meta.mint,
            name=query_meta.name,
            symbol=query_meta.symbol,
            image_uri=query_meta.image_uri,
            deployer=query_meta.deployer,
            created_at=query_meta.created_at,
            market_cap_usd=query_meta.market_cap_usd,
            liquidity_usd=query_meta.liquidity_usd,
            evidence=SimilarityEvidence(composite_score=1.0),
            composite=1.0,
        )
    ] + family_members

    root_candidate = _select_root(all_tokens)

    # Build derivatives list (everyone except root)
    derivatives: list[DerivativeInfo] = []
    for m in family_members[:MAX_DERIVATIVES]:
        if m.mint == root_candidate.mint:
            continue
        derivatives.append(
            DerivativeInfo(
                mint=m.mint,
                name=m.name,
                symbol=m.symbol,
                image_uri=m.image_uri,
                created_at=m.created_at,
                market_cap_usd=m.market_cap_usd,
                liquidity_usd=m.liquidity_usd,
                evidence=m.evidence,
            )
        )

    derivatives.sort(
        key=lambda d: d.evidence.composite_score, reverse=True
    )

    root_meta = TokenMetadata(
        mint=root_candidate.mint,
        name=root_candidate.name,
        symbol=root_candidate.symbol,
        image_uri=root_candidate.image_uri,
        deployer=root_candidate.deployer,
        created_at=root_candidate.created_at,
        market_cap_usd=root_candidate.market_cap_usd,
        liquidity_usd=root_candidate.liquidity_usd,
    )

    confidence = _compute_confidence(root_candidate, family_members)

    result = LineageResult(
        mint=mint_address,
        query_token=query_meta,
        root=root_meta,
        confidence=round(confidence, 4),
        derivatives=derivatives,
        family_size=1 + len(derivatives),
    )

    await _progress("Analysis complete", 100)
    await _cache_set(f"lineage:{mint_address}", result)
    return result


async def search_tokens(query: str) -> list[TokenSearchResult]:
    """Search for Solana tokens by name / symbol via DexScreener."""
    cached = await _cache_get(f"search:{query}")
    if cached is not None:
        if isinstance(cached, list):
            return [
                TokenSearchResult(**item) if isinstance(item, dict) else item
                for item in cached
            ]
        return cached

    dex = _get_dex_client()
    pairs = await dex.search_tokens(query)
    results = dex.pairs_to_search_results(pairs)
    await _cache_set(f"search:{query}", results)
    return results


async def _get_deployer_cached(
    rpc: SolanaRpcClient, mint: str
) -> tuple[str, Any]:
    """Fetch deployer + timestamp with per-mint caching (never changes)."""
    cache_key = f"rpc:deployer:{mint}"
    cached = await _cache_get(cache_key)
    if cached is not None:
        return cached

    deployer, created_at = await rpc.get_deployer_and_timestamp(mint)
    result = (deployer, created_at)
    # Long TTL: deployer/timestamp are immutable on-chain
    await _cache_set(cache_key, result, ttl=86400)
    return result


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


class _ScoredCandidate:
    """Lightweight container for a candidate during scoring."""

    __slots__ = (
        "mint",
        "name",
        "symbol",
        "image_uri",
        "deployer",
        "created_at",
        "market_cap_usd",
        "liquidity_usd",
        "evidence",
        "composite",
    )

    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)


def _select_root(candidates: list[_ScoredCandidate]) -> _ScoredCandidate:
    """Select the most likely root from a list of candidates.

    Heuristic (in order of importance):
    1. Oldest creation timestamp.
    2. Highest liquidity.
    3. Highest market cap.
    """
    if not candidates:
        raise ValueError("No candidates to select root from")

    def _root_key(c: _ScoredCandidate):
        ts_score = 0.0
        if c.created_at is not None:
            ts_score = -c.created_at.timestamp()
        liq = c.liquidity_usd or 0.0
        mcap = c.market_cap_usd or 0.0
        return (ts_score, liq, mcap)

    return max(candidates, key=_root_key)


def _compute_confidence(
    root: _ScoredCandidate,
    others: list[_ScoredCandidate],
) -> float:
    """Estimate confidence in the root selection."""
    if not others:
        return 1.0

    # Factor 1: temporal gap
    if root.created_at is not None:
        newer_count = sum(
            1
            for o in others
            if o.created_at is not None and o.created_at > root.created_at
        )
        temporal_factor = newer_count / len(others) if others else 1.0
    else:
        temporal_factor = 0.5

    # Factor 2: liquidity dominance
    root_liq = root.liquidity_usd or 0.0
    total_liq = root_liq + sum(o.liquidity_usd or 0.0 for o in others)
    liquidity_factor = root_liq / total_liq if total_liq > 0 else 0.5

    # Factor 3: few ambiguous candidates (composite > 0.8)
    highly_similar = sum(1 for o in others if o.composite > 0.8)
    ambiguity_factor = 1.0 - min(highly_similar / max(len(others), 1), 1.0)

    confidence = (
        0.4 * temporal_factor
        + 0.35 * liquidity_factor
        + 0.25 * ambiguity_factor
    )
    return min(max(confidence, 0.0), 1.0)
