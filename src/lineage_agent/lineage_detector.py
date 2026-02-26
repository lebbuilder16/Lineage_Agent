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
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Optional

from config import (
    ANALYSIS_TIMEOUT_SECONDS,
    CACHE_TTL_LINEAGE_SECONDS,
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
    cache_delete as _cache_delete,
    cache_get as _cache_get,
    cache_set as _cache_set,
    close_clients,
    event_insert as _event_insert,
    get_dex_client as _get_dex_client,
    get_img_client as _get_img_client,
    get_jup_client as _get_jup_client,
    get_rpc_client as _get_rpc_client,
    init_clients,
)
from .death_clock import compute_death_clock
from .deployer_service import compute_deployer_profile
from .factory_service import analyze_factory_rhythm, record_token_creation
from .liquidity_arch import analyze_liquidity_architecture
from .metadata_dna_service import build_operator_fingerprint
from .narrative_service import compute_narrative_timing
from .zombie_detector import detect_resurrection
# Initiative 1: Operator Impact Report
from .operator_impact_service import compute_operator_impact
# Initiative 2: Follow The SOL
from .sol_flow_service import get_sol_flow_report, trace_sol_flow
# Initiative 3: Cartel Graph
from .cartel_service import build_cartel_edges_for_deployer, compute_cartel_report
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
            try:
                return LineageResult(**cached)
            except Exception:
                # Schema changed after deploy — discard and re-compute
                logger.warning(
                    "Dropping stale/invalid cached lineage for %s (schema mismatch)",
                    mint_address,
                )
                await _cache_delete(f"lineage:{mint_address}")
        elif isinstance(cached, LineageResult):
            return cached
        else:
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
    # Only overwrite DexScreener pairCreatedAt when RPC returned a real value
    if created_at is not None:
        query_meta.created_at = created_at

    # Enrich with on-chain DAS (Helius getAsset) — fills metadata_uri, image, deployer
    try:
        _q_asset = await _get_asset_cached(rpc, mint_address)
        if not query_meta.metadata_uri:
            query_meta.metadata_uri = (
                (_q_asset.get("content") or {}).get("json_uri") or ""
            )
        if not query_meta.image_uri:
            query_meta.image_uri = (
                ((_q_asset.get("content") or {}).get("links") or {}).get("image") or ""
            )
        if not query_meta.deployer:
            _q_creators = _q_asset.get("creators") or []
            query_meta.deployer = next(
                (c["address"] for c in _q_creators if c.get("verified")), ""
            )
    except Exception as _das_e:
        logger.debug("DAS getAsset enrichment failed for %s: %s", mint_address, _das_e)

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
        await _cache_set(f"lineage:{mint_address}", result, ttl=CACHE_TTL_LINEAGE_SECONDS)
        return result

    # --- Step 2: Search for similar tokens (multi-strategy) ---
    await _progress("Searching for similar tokens", 40)

    # Strategy A: DexScreener name search
    search_query = query_meta.name or query_meta.symbol
    logger.info("Searching for tokens similar to '%s' ...", search_query)
    search_pairs = await dex.search_tokens(search_query)
    candidates = dex.pairs_to_search_results(search_pairs)

    # Strategy B: DexScreener symbol search (if different from name query)
    if query_meta.symbol and query_meta.symbol.lower() != (search_query or "").lower():
        try:
            sym_pairs = await dex.search_tokens(query_meta.symbol)
            sym_results = dex.pairs_to_search_results(sym_pairs)
            _seen = {c.mint for c in candidates}
            for sr in sym_results:
                if sr.mint not in _seen:
                    candidates.append(sr)
                    _seen.add(sr.mint)
        except Exception as _e:
            logger.debug("Symbol search failed: %s", _e)

    # Strategy C: Helius searchAssets by deployer (finds same-deployer clones
    # that DexScreener name/symbol search can miss entirely)
    deployer_mints: set[str] = set()  # mints that came from deployer search
    if query_meta.deployer:
        try:
            deployer_assets = await asyncio.wait_for(
                rpc.search_assets_by_creator(query_meta.deployer),
                timeout=8.0,
            )
            _seen = {c.mint for c in candidates}
            for _da in deployer_assets:
                _da_id = _da.get("id", "")
                if _da_id and _da_id != mint_address and _da_id not in _seen:
                    _da_content = _da.get("content") or {}
                    _da_meta = (_da_content.get("metadata") or {})
                    candidates.append(
                        TokenSearchResult(
                            mint=_da_id,
                            name=_da_meta.get("name", ""),
                            symbol=_da_meta.get("symbol", ""),
                            image_uri=(
                                (_da_content.get("links") or {}).get("image", "")
                            ),
                            metadata_uri=_da_content.get("json_uri", ""),
                        )
                    )
                    _seen.add(_da_id)
                    deployer_mints.add(_da_id)
        except Exception as _e:
            logger.debug("Deployer searchAssets failed: %s", _e)

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
        await _cache_set(f"lineage:{mint_address}", result, ttl=CACHE_TTL_LINEAGE_SECONDS)
        return result

    # --- Step 3 & 4: Enrich candidates and score them ---
    family_members: list[_ScoredCandidate] = []

    # Pre-filter by name/symbol similarity (cheap, sync)
    # Candidates that came from the deployer search always pass — they share
    # the deployer by definition even if names differ.
    pre_filtered = []
    for candidate in candidates[: MAX_DERIVATIVES * 3]:
        name_sim = compute_name_similarity(query_meta.name, candidate.name)
        sym_sim = compute_symbol_similarity(
            query_meta.symbol, candidate.symbol
        )
        # Accept if name/symbol matches OR if found via deployer search
        if (
            name_sim < NAME_SIMILARITY_THRESHOLD
            and sym_sim < SYMBOL_SIMILARITY_THRESHOLD
            and candidate.mint not in deployer_mints
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
            c_asset = await _get_asset_cached(rpc, candidate.mint)

        # Fallback: DexScreener pairCreatedAt when on-chain timestamp unavailable.
        # This is critical for root selection — without it, tokens with no DAS
        # timestamp appear "infinitely new" and are never chosen as root.
        if c_created is None and candidate.pair_created_at is not None:
            c_created = candidate.pair_created_at

        # Derive image / metadata_uri from DAS if not available from DexScreener
        c_metadata_uri = (c_asset.get("content") or {}).get("json_uri") or ""
        c_image_uri = candidate.image_uri or (
            ((c_asset.get("content") or {}).get("links") or {}).get("image") or ""
        )

        # Image similarity — bounded concurrency for downloads
        async with img_sem:
            img_sim = await compute_image_similarity(
                query_meta.image_uri, c_image_uri,
                client=img_client,
            )

        # Track dimensions that are genuinely missing (vs. scored 0.0)
        _missing: set[str] = set()
        if img_sim < 0:
            # Sentinel from PIL-not-available or both URLs blank
            img_sim = 0.0
            _missing.add("image")

        # Post-filter: skip candidates with very low image similarity
        # when both images were available
        if (
            query_meta.image_uri
            and c_image_uri
            and "image" not in _missing
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
        composite = compute_composite_score(
            scores, _WEIGHTS, missing_dims=_missing or None
        )

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
            image_uri=c_image_uri,
            metadata_uri=c_metadata_uri or candidate.metadata_uri,
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
            metadata_uri=query_meta.metadata_uri,
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
                deployer=m.deployer,
                metadata_uri=m.metadata_uri,
                created_at=m.created_at,
                market_cap_usd=m.market_cap_usd,
                liquidity_usd=m.liquidity_usd,
                evidence=m.evidence,
            )
        )

    derivatives.sort(
        key=lambda d: d.evidence.composite_score, reverse=True
    )

    # Assign multi-generation depth (generation + parent_mint)
    _assign_generations(root_candidate.mint, derivatives)

    root_meta = TokenMetadata(
        mint=root_candidate.mint,
        name=root_candidate.name,
        symbol=root_candidate.symbol,
        image_uri=root_candidate.image_uri,
        deployer=root_candidate.deployer,
        metadata_uri=root_candidate.metadata_uri,
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

    # ------------------------------------------------------------------
    # Forensic enrichment — non-blocking, failures are silent
    # ------------------------------------------------------------------
    await _progress("Running forensic analysis", 92)

    # Record this token in the intelligence_events store (fire-and-forget)
    try:
        await record_token_creation(root_meta)
    except Exception as _e:
        logger.debug("record_token_creation failed: %s", _e)

    # Record confirmed derivatives (deployer_score == 1.0) as well
    for _d in result.derivatives:
        if _d.evidence.deployer_score >= 0.99:
            try:
                _d_meta = TokenMetadata(
                    mint=_d.mint,
                    name=_d.name,
                    symbol=_d.symbol,
                    image_uri=_d.image_uri,
                    deployer=root_meta.deployer,  # same deployer
                    created_at=_d.created_at,
                    market_cap_usd=_d.market_cap_usd,
                    liquidity_usd=_d.liquidity_usd,
                )
                await record_token_creation(_d_meta)
            except Exception as _e:
                logger.debug("record_token_creation (derivative) failed: %s", _e)

    # ── DAS bootstrap: discover deployer's other tokens via Helius ─────
    # If we have < 3 token_created events for this deployer, use searchAssets
    # to seed the DB so Factory Rhythm / Death Clock / Deployer Profile work.
    try:
        await _bootstrap_deployer_history(root_meta.deployer)
    except Exception as _boot_exc:
        logger.debug("DAS bootstrap failed: %s", _boot_exc)

    # Phase 1  — Zombie Token detection (sync, uses already-built result)
    try:
        result.zombie_alert = detect_resurrection(result)
    except Exception as _e:
        logger.debug("zombie detection failed: %s", _e)

    # Phase 4 — Liquidity Architecture (sync, uses already-fetched pairs)
    try:
        result.liquidity_arch = analyze_liquidity_architecture(pairs)
    except Exception as _e:
        logger.debug("liquidity_arch failed: %s", _e)

    # Build metadata URI list for Operator Fingerprint
    uri_tuples: list[tuple[str, str, str]] = [
        (t.mint, t.deployer or "", t.metadata_uri or "")
        for t in all_tokens
        if t.mint
    ]

    # Phases 2, 3, 5, 6, 7, 8, 9 — async enrichers in parallel
    async def _safe(coro, *, name: str = "enricher"):
        try:
            return await coro
        except Exception as exc:
            logger.warning("[%s] enricher failed: %s", name, exc)
            return None

    (
        result.death_clock,
        result.operator_fingerprint,
        result.factory_rhythm,
        result.narrative_timing,
        result.deployer_profile,
    ) = await asyncio.gather(
        _safe(compute_death_clock(root_meta.deployer, root_meta.created_at), name="death_clock"),
        _safe(build_operator_fingerprint(uri_tuples), name="operator_fingerprint"),
        _safe(analyze_factory_rhythm(root_meta.deployer), name="factory_rhythm"),
        _safe(compute_narrative_timing(root_meta), name="narrative_timing"),
        _safe(compute_deployer_profile(root_meta.deployer), name="deployer_profile"),
    )

    # Initiative 1: Operator Impact — requires operator_fingerprint result
    if result.operator_fingerprint is not None:
        # Bootstrap linked wallets that have no events yet so the Operator
        # Dossier page shows real data immediately on first visit.
        _linked_to_boot = [
            w for w in result.operator_fingerprint.linked_wallets
            if w and w != root_meta.deployer
        ]
        if _linked_to_boot:
            await asyncio.gather(*[
                _safe(_bootstrap_deployer_history(w), name=f"boot_{w[:8]}")
                for w in _linked_to_boot[:4]  # cap at 4 extra wallets
            ])
        try:
            result.operator_impact = await asyncio.wait_for(
                compute_operator_impact(
                    result.operator_fingerprint.fingerprint,
                    result.operator_fingerprint.linked_wallets,
                ),
                timeout=10.0,
            )
        except Exception as _oi_exc:
            logger.warning("[operator_impact] enricher failed: %s", _oi_exc)

    # Initiative 2: SOL flow — try DB first, else trace inline if deployer known
    result.sol_flow = await _safe(
        get_sol_flow_report(root_meta.mint), name="sol_flow_read",
    )
    if result.sol_flow is None and root_meta.deployer:
        result.sol_flow = await _safe(
            trace_sol_flow(root_meta.mint, root_meta.deployer),
            name="sol_flow_trace",
        )

    # Initiative 3: build cartel edges inline (don't wait for hourly sweep)
    if root_meta.deployer:
        await _safe(
            build_cartel_edges_for_deployer(root_meta.deployer),
            name="cartel_edge_build",
        )
    result.cartel_report = await _safe(
        compute_cartel_report(root_meta.mint, root_meta.deployer),
        name="cartel_report",
    )

    await _progress("Analysis complete", 100)
    await _cache_set(f"lineage:{mint_address}", result, ttl=CACHE_TTL_LINEAGE_SECONDS)
    return result


# ── DAS bootstrap helper ─────────────────────────────────────────────────

_BOOTSTRAP_MIN_THRESHOLD = 3  # only bootstrap if < this many events in DB


async def _bootstrap_deployer_history(deployer: str) -> None:
    """Discover a deployer's other tokens via Helius DAS and seed the DB.

    This ensures that Factory Rhythm (≥3 tokens), Death Clock (≥2 rugs),
    and Deployer Profile have enough data from the very first analysis.
    Skips the call if the deployer already has ≥ _BOOTSTRAP_MIN_THRESHOLD
    token_created events recorded.
    """
    if not deployer:
        return

    from .data_sources._clients import event_query as _eq, event_insert as _ei

    # Check how many events we already have for this deployer
    existing = await _eq(
        where="event_type = 'token_created' AND deployer = ?",
        params=(deployer,),
        columns="mint",
        limit=_BOOTSTRAP_MIN_THRESHOLD,
    )
    if len(existing) >= _BOOTSTRAP_MIN_THRESHOLD:
        return  # already enough data

    existing_mints = {r.get("mint") for r in existing}

    rpc = _get_rpc_client()
    try:
        assets = await asyncio.wait_for(
            rpc.search_assets_by_creator(deployer, limit=50),
            timeout=8.0,
        )
    except (asyncio.TimeoutError, Exception) as exc:
        logger.debug("DAS searchAssets timed out or failed for %s: %s", deployer, exc)
        return

    seeded = 0
    for asset in assets:
        try:
            mint = asset.get("id", "")
            if not mint or mint in existing_mints:
                continue
            content = asset.get("content") or {}
            metadata = content.get("metadata") or {}
            name = metadata.get("name", "")
            symbol = metadata.get("symbol", "")
            image_uri = (content.get("links") or {}).get("image", "")
            metadata_uri = content.get("json_uri", "")

            # Extract creation time from asset if available
            created_at_raw = asset.get("created_at")  # Helius DAS field
            created_at = None
            if created_at_raw:
                try:
                    from datetime import datetime as _dt, timezone as _tz
                    created_at = _dt.fromisoformat(str(created_at_raw).replace("Z", "+00:00"))
                except (ValueError, TypeError):
                    pass

            await _ei(
                event_type="token_created",
                mint=mint,
                deployer=deployer,
                name=name,
                symbol=symbol,
                image_uri=image_uri,
                metadata_uri=metadata_uri,
                narrative=_guess_narrative(name, symbol),
                created_at=created_at.isoformat() if created_at else None,
            )
            existing_mints.add(mint)
            seeded += 1
        except Exception:
            continue

    if seeded:
        logger.info("DAS bootstrap: seeded %d tokens for deployer %s", seeded, deployer[:8])


def _guess_narrative(name: str, symbol: str) -> str:
    """Best-effort narrative classification from name/symbol."""
    text = f"{name} {symbol}".lower()
    keywords = {
        "ai": "ai", "gpt": "ai", "neural": "ai",
        "dog": "dog", "doge": "dog", "shib": "dog", "inu": "dog",
        "cat": "cat", "meow": "cat", "kitty": "cat",
        "pepe": "pepe", "frog": "pepe", "kek": "pepe",
        "trump": "political", "biden": "political", "maga": "political",
        "elon": "celebrity", "musk": "celebrity",
    }
    for kw, narrative in keywords.items():
        if kw in text:
            return narrative
    return "meme"


# Public export so api.py can trigger bootstrap from the operator endpoint
bootstrap_deployer_history = _bootstrap_deployer_history


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


def _assign_generations(root_mint: str, derivatives: list[DerivativeInfo]) -> None:
    """Assign ``generation`` and ``parent_mint`` to each derivative in-place.

    Algorithm (chronological ordering):
      1. Sort derivatives oldest-first (None timestamps go last).
      2. Gen-1 = direct copies of the root (same deployer or deployer_score > 0.8).
      3. Each remaining token is assigned to the already-placed token with the
         closest creation time that precedes it, giving a realistic parent chain.
      4. generation depth = parent.generation + 1, capped at 5.
    """
    if not derivatives:
        return

    # Sort by creation time
    sorted_derivs = sorted(
        derivatives,
        key=lambda d: d.created_at.timestamp() if d.created_at else float("inf"),
    )

    # Map of mint → DerivativeInfo for quick lookup
    placed: dict[str, DerivativeInfo] = {}

    for d in sorted_derivs:
        # Heuristic: same deployer → always direct child of root
        if d.evidence.deployer_score >= 0.99:
            d.parent_mint = root_mint
            d.generation = 1
        else:
            # Find already-placed token with closest earlier timestamp
            best_parent: DerivativeInfo | None = None
            best_delta: float | None = None
            t_d = d.created_at.timestamp() if d.created_at else None
            for candidate in placed.values():
                t_c = candidate.created_at.timestamp() if candidate.created_at else None
                if t_c is None or t_d is None:
                    continue
                delta = t_d - t_c
                if delta > 0 and (best_delta is None or delta < best_delta):
                    best_delta = delta
                    best_parent = candidate

            if best_parent is not None:
                d.parent_mint = best_parent.mint
                d.generation = min(best_parent.generation + 1, 5)
            else:
                d.parent_mint = root_mint
                d.generation = 1

        placed[d.mint] = d


def _parse_datetime(value: Any) -> datetime | None:
    """Convert a value to datetime, handling strings from SQLite cache."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            # ISO format strings from json.dumps(default=str)
            dt = datetime.fromisoformat(value)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except (ValueError, TypeError):
            return None
    return None


# PumpFun program authority — when this is the update authority
# the real deployer is the first verified creator, not the fee payer.
_PUMPFUN_AUTHORITY = "TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM"


async def _get_deployer_cached(
    rpc: SolanaRpcClient, mint: str
) -> tuple[str, Any]:
    """Fetch deployer + timestamp with per-mint caching (never changes).

    Strategy (DAS-first, O(1)):
        1. Fetch DAS ``getAsset`` for the mint.
        2. Extract deployer from ``authorities`` (update-authority) or
           ``creators`` (on-chain verified creator).
        3. For PumpFun tokens the update authority is the PumpFun program
           itself — in that case the real deployer is ``creators[0].address``.
        4. Fall back to the legacy signature-walk only when DAS fails.
    """
    cache_key = f"rpc:deployer:{mint}"
    cached = await _cache_get(cache_key)
    if cached is not None:
        # SQLite cache returns lists; convert datetime string back
        if isinstance(cached, (list, tuple)) and len(cached) == 2:
            return cached[0], _parse_datetime(cached[1])
        return cached

    deployer = ""
    created_at: Any = None

    # --- DAS-first path (O(1), works for all token standards) ---
    asset = await rpc.get_asset(mint)
    if asset:
        # Populate the rpc:asset cache so _get_asset_cached() is a cache hit
        # for the same mint — avoids a redundant second DAS call in _enrich.
        _asset_cache_key = f"rpc:asset:{mint}"
        _asset_cached = await _cache_get(_asset_cache_key)
        if not isinstance(_asset_cached, dict):
            await _cache_set(_asset_cache_key, asset, ttl=86400)

        # Timestamp -------------------------------------------------
        # DAS may provide created_at in result root or token_info
        _token_info = asset.get("token_info") or {}
        _raw_ts = _token_info.get("created_at") or asset.get("created_at")
        created_at = _parse_datetime(_raw_ts)

        # Deployer --------------------------------------------------
        authorities = asset.get("authorities") or []
        creators = asset.get("creators") or []

        # 1) Check update-authority (first authority entry)
        ua = ""
        if authorities:
            ua = authorities[0].get("address", "")
        # 2) PumpFun detection: if UA is the PumpFun program, use creator[0]
        if ua == _PUMPFUN_AUTHORITY or not ua:
            deployer = next(
                (c["address"] for c in creators if c.get("verified")),
                creators[0]["address"] if creators else "",
            )
        else:
            deployer = ua

    # --- Signature-walk fallback (slow) — only when DAS returned no deployer ---
    if not deployer:
        deployer, _ts = await rpc.get_deployer_and_timestamp(mint)
        if _ts and not created_at:
            created_at = _ts

    result = (deployer, created_at)
    # Long TTL: deployer/timestamp are immutable on-chain
    await _cache_set(cache_key, result, ttl=86400)
    return result


async def _get_asset_cached(rpc: SolanaRpcClient, mint: str) -> dict:
    """Fetch Helius DAS asset data with 24 h per-mint caching.

    Relevant response fields::

        result.content.json_uri        → Metaplex metadata_uri
        result.content.links.image     → on-chain image URL
        result.creators[].address      → on-chain creators (check .verified)
    """
    cache_key = f"rpc:asset:{mint}"
    cached = await _cache_get(cache_key)
    if isinstance(cached, dict):
        return cached

    result = await rpc.get_asset(mint)
    if result:
        await _cache_set(cache_key, result, ttl=86400)
    return result or {}


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
        "metadata_uri",
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
    1. Deployer cluster size — prefer the candidate whose deployer
       launched the most tokens in the family (strongest serial-deployer
       signal).
    2. Oldest creation timestamp.
    3. Highest liquidity.
    4. Highest market cap.
    """
    if not candidates:
        raise ValueError("No candidates to select root from")

    # Build deployer frequency map (empty deployer doesn't count)
    from collections import Counter

    deployer_counts: Counter[str] = Counter()
    for c in candidates:
        if c.deployer:
            deployer_counts[c.deployer] += 1

    def _root_key(c: _ScoredCandidate):
        # PRIMARY: earliest creation timestamp → root is the oldest token.
        # SECONDARY: largest deployer cluster (tiebreaker for same-day launches).
        # TERTIARY: highest liquidity / market cap.
        cluster = -(deployer_counts.get(c.deployer, 0) if c.deployer else 0)
        liq = -(c.liquidity_usd or 0.0)
        mcap = -(c.market_cap_usd or 0.0)
        if c.created_at is not None:
            dt = _parse_datetime(c.created_at)
            if dt is not None:
                return (dt.timestamp(), cluster, liq, mcap)
        return (float("inf"), cluster, liq, mcap)

    return min(candidates, key=_root_key)


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
