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
from typing import Optional

from config import (
    CACHE_TTL_SECONDS,
    DEXSCREENER_BASE_URL,
    IMAGE_SIMILARITY_THRESHOLD,
    MAX_DERIVATIVES,
    NAME_SIMILARITY_THRESHOLD,
    REQUEST_TIMEOUT,
    SOLANA_RPC_ENDPOINT,
    SYMBOL_SIMILARITY_THRESHOLD,
    WEIGHT_DEPLOYER,
    WEIGHT_IMAGE,
    WEIGHT_NAME,
    WEIGHT_SYMBOL,
    WEIGHT_TEMPORAL,
)
from .cache import TTLCache
from .data_sources.dexscreener import DexScreenerClient
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

# ---------------------------------------------------------------------------
# Module-level singletons (created once, reused)
# ---------------------------------------------------------------------------
_dex_client: Optional[DexScreenerClient] = None
_rpc_client: Optional[SolanaRpcClient] = None
_cache = TTLCache(default_ttl=CACHE_TTL_SECONDS)

_WEIGHTS = {
    "name": WEIGHT_NAME,
    "symbol": WEIGHT_SYMBOL,
    "image": WEIGHT_IMAGE,
    "deployer": WEIGHT_DEPLOYER,
    "temporal": WEIGHT_TEMPORAL,
}


def _get_dex_client() -> DexScreenerClient:
    global _dex_client
    if _dex_client is None:
        _dex_client = DexScreenerClient(
            base_url=DEXSCREENER_BASE_URL, timeout=REQUEST_TIMEOUT
        )
    return _dex_client


def _get_rpc_client() -> SolanaRpcClient:
    global _rpc_client
    if _rpc_client is None:
        _rpc_client = SolanaRpcClient(
            endpoint=SOLANA_RPC_ENDPOINT, timeout=REQUEST_TIMEOUT
        )
    return _rpc_client


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def detect_lineage(mint_address: str) -> LineageResult:
    """Detect the lineage of a Solana token identified by *mint_address*.

    Steps
    -----
    1. Fetch metadata for the query token via DexScreener.
    2. Search DexScreener for tokens with similar name / symbol.
    3. For each candidate, enrich with on-chain data (deployer, timestamp).
    4. Compute pairwise similarity scores.
    5. Select the root (oldest, highest liquidity, original deployer).
    6. Return a ``LineageResult`` with evidence.
    """

    # Check cache first
    cached = _cache.get(f"lineage:{mint_address}")
    if cached is not None:
        return cached

    dex = _get_dex_client()
    rpc = _get_rpc_client()

    # --- Step 1: Fetch metadata for the query token ---
    logger.info("Fetching metadata for %s ...", mint_address)
    pairs = await dex.get_token_pairs(mint_address)
    query_meta = dex.pairs_to_metadata(mint_address, pairs)

    # Enrich with on-chain deployer + creation time
    deployer, created_at = await rpc.get_deployer_and_timestamp(mint_address)
    query_meta.deployer = deployer
    query_meta.created_at = created_at

    if not query_meta.name and not query_meta.symbol:
        result = LineageResult(
            mint=mint_address,
            query_token=query_meta,
            root=query_meta,
            confidence=0.0,
            derivatives=[],
            family_size=1,
        )
        _cache.set(f"lineage:{mint_address}", result)
        return result

    # --- Step 2: Search for similar tokens ---
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
        _cache.set(f"lineage:{mint_address}", result)
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

    # Enrich all pre-filtered candidates concurrently (bounded)
    sem = asyncio.Semaphore(5)  # max 5 concurrent RPC calls

    async def _enrich(
        candidate: TokenSearchResult, name_sim: float, sym_sim: float
    ) -> Optional[_ScoredCandidate]:
        async with sem:
            c_deployer, c_created = await rpc.get_deployer_and_timestamp(
                candidate.mint
            )

        # Image similarity (concurrent download already inside)
        img_sim = await compute_image_similarity(
            query_meta.image_uri, candidate.image_uri
        )

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

    _cache.set(f"lineage:{mint_address}", result)
    return result


async def search_tokens(query: str) -> list[TokenSearchResult]:
    """Search for Solana tokens by name / symbol via DexScreener."""
    cached = _cache.get(f"search:{query}")
    if cached is not None:
        return cached

    dex = _get_dex_client()
    pairs = await dex.search_tokens(query)
    results = dex.pairs_to_search_results(pairs)
    _cache.set(f"search:{query}", results)
    return results


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
