"""
REST API for the Meme Lineage Agent using FastAPI.

Endpoints
---------
GET  /health              - Health check
GET  /lineage?mint=<MINT> - Full lineage detection for a token
POST /lineage/batch       - Batch lineage detection (up to 10 mints)
WS   /ws/lineage           - WebSocket progress streaming for lineage
GET  /search?q=<QUERY>    - Search for tokens by name / symbol

Security features:
- Rate limiting via slowapi (per-IP)
- Base58 mint address validation
- Internal error details hidden from clients
- Graceful startup/shutdown of HTTP clients
"""

from __future__ import annotations

import asyncio
import logging
import re
import time
from contextlib import asynccontextmanager
from typing import Optional

import sentry_sdk
from fastapi import FastAPI, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from starlette.middleware.base import BaseHTTPMiddleware

from config import (
    ANALYSIS_TIMEOUT_SECONDS,
    API_HOST,
    API_PORT,
    CACHE_BACKEND,
    CORS_ORIGINS,
    RATE_LIMIT_LINEAGE,
    RATE_LIMIT_SEARCH,
    SENTRY_DSN,
    SENTRY_ENVIRONMENT,
    SENTRY_TRACES_SAMPLE_RATE,
    SOLANA_RPC_ENDPOINT,
)
from .circuit_breaker import get_all_statuses as cb_statuses
from .lineage_detector import (
    bootstrap_deployer_history,
    close_clients,
    detect_lineage,
    init_clients,
    search_tokens,
)
from .alert_service import cancel_alert_sweep, schedule_alert_sweep as _schedule_alert_sweep
from .deployer_service import compute_deployer_profile
from .operator_impact_service import compute_operator_impact
from .sol_flow_service import get_sol_flow_report, trace_sol_flow
from .lineage_detector import resolve_deployer as _resolve_deployer
from .cartel_service import compute_cartel_report, run_cartel_sweep
from .cartel_financial_service import build_financial_edges
from .data_sources._clients import operator_mapping_query, sol_flows_query
from .logging_config import generate_request_id, request_id_ctx, setup_logging
from .models import (
    BatchLineageRequest,
    BatchLineageResponse,
    BundleExtractionReport,
    CartelCommunity,
    CartelReport,
    DeployerProfile,
    FinancialGraphSummary,
    LineageResult,
    OperatorImpactReport,
    SolFlowReport,
    TokenSearchResult,
)
from .rug_detector import cancel_rug_sweep, schedule_rug_sweep
from .db_maintenance import cancel_db_maintenance, schedule_db_maintenance

# Initialise structured logging early
setup_logging()
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Sentry – initialise before anything else so startup errors are captured
# ---------------------------------------------------------------------------
if SENTRY_DSN:
    sentry_sdk.init(
        dsn=SENTRY_DSN,
        environment=SENTRY_ENVIRONMENT,
        traces_sample_rate=SENTRY_TRACES_SAMPLE_RATE,
        send_default_pii=False,
        # Don't capture 4xx client errors as Sentry events
        before_send=lambda event, hint: (
            None
            if (hint.get("exc_info") and
                isinstance(hint["exc_info"][1], HTTPException) and
                (hint["exc_info"][1].status_code or 500) < 500)
            else event
        ),
    )
    logger.info("Sentry initialised (env=%s)", SENTRY_ENVIRONMENT)
else:
    logger.info("SENTRY_DSN not set – error tracking disabled")

# ---------------------------------------------------------------------------
# Track startup time for uptime reporting
# ---------------------------------------------------------------------------
_start_time = time.monotonic()


# ---------------------------------------------------------------------------
# Base58 validation regex (Solana addresses are 32-44 base58 chars)
# ---------------------------------------------------------------------------
_BASE58_RE = re.compile(r"^[1-9A-HJ-NP-Za-km-z]{32,44}$")


_cartel_sweep_task: Optional[asyncio.Task] = None


async def _cartel_sweep_loop() -> None:
    """Run cartel edge building: immediately on startup, then hourly."""
    logger.info("Cartel sweep background task started (interval=3600s)")
    while True:
        try:
            await run_cartel_sweep()
        except asyncio.CancelledError:
            break
        except Exception:
            logger.exception("Cartel sweep iteration failed")
        try:
            await asyncio.sleep(3600)
        except asyncio.CancelledError:
            break


def _schedule_cartel_sweep() -> None:
    global _cartel_sweep_task
    _cartel_sweep_task = asyncio.create_task(_cartel_sweep_loop(), name="cartel_sweep")


def _cancel_cartel_sweep() -> None:
    global _cartel_sweep_task
    if _cartel_sweep_task and not _cartel_sweep_task.done():
        _cartel_sweep_task.cancel()


# ---------------------------------------------------------------------------
# Rate limiter
# ---------------------------------------------------------------------------
limiter = Limiter(key_func=get_remote_address)


# ---------------------------------------------------------------------------
# Lifespan: startup / shutdown
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(application: FastAPI):
    """Initialise shared HTTP clients on startup, close on shutdown."""
    # Validate critical env vars
    if not SOLANA_RPC_ENDPOINT or not SOLANA_RPC_ENDPOINT.startswith("http"):
        logger.error(
            "SOLANA_RPC_ENDPOINT is not a valid URL: %s", SOLANA_RPC_ENDPOINT
        )
        raise RuntimeError("Invalid SOLANA_RPC_ENDPOINT – must be an HTTP(S) URL")

    if CACHE_BACKEND != "sqlite":
        logger.critical(
            "CACHE_BACKEND=%r — all forensic signals (Factory Rhythm, Narrative "
            "Timing, Death Clock, Operator Fingerprint) are DISABLED. "
            "Set CACHE_BACKEND=sqlite to enable.", CACHE_BACKEND
        )
    logger.info("Starting up – initialising HTTP clients …")
    await init_clients()
    schedule_rug_sweep()
    _schedule_alert_sweep()
    _schedule_cartel_sweep()
    schedule_db_maintenance()
    yield
    logger.info("Shutting down \u2013 closing HTTP clients \u2026")
    cancel_rug_sweep()
    cancel_alert_sweep()
    _cancel_cartel_sweep()
    cancel_db_maintenance()
    await close_clients()


app = FastAPI(
    title="Meme Lineage Agent API",
    description="Detect memecoin lineage on Solana - find the root token and its clones.",
    version="3.1.0",
    lifespan=lifespan,
)

# Attach rate-limiter state
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS (so the Next.js frontend can call from localhost:3000 and Vercel)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_origin_regex=r"https://lineage-agent(-[a-z0-9]+)*\.vercel\.app",
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Accept"],
)


# ---------------------------------------------------------------------------
# Request-ID & access-log middleware
# ---------------------------------------------------------------------------
class RequestIdMiddleware(BaseHTTPMiddleware):
    """Attach a unique request ID to every request for tracing."""

    async def dispatch(self, request: Request, call_next):
        rid = generate_request_id()
        request_id_ctx.set(rid)
        start = time.perf_counter()
        response = await call_next(request)
        elapsed_ms = (time.perf_counter() - start) * 1000
        response.headers["X-Request-ID"] = rid
        logger.info(
            "%s %s -> %s (%.1f ms)",
            request.method,
            request.url.path,
            response.status_code,
            elapsed_ms,
        )
        return response


app.add_middleware(RequestIdMiddleware)


# ---------------------------------------------------------------------------
# Prometheus metrics
# ---------------------------------------------------------------------------
try:
    from prometheus_fastapi_instrumentator import Instrumentator

    _instrumentator = Instrumentator(
        should_group_status_codes=True,
        should_ignore_untemplated=True,
        excluded_handlers=["/health", "/metrics", "/docs", "/openapi.json"],
    )
    _instrumentator.instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)
    logger.info("Prometheus metrics enabled at /metrics")
except ImportError:
    logger.info("prometheus-fastapi-instrumentator not installed — metrics disabled")


# ------------------------------------------------------------------
# Endpoints
# ------------------------------------------------------------------


@app.get("/", tags=["system"], include_in_schema=False)
async def root():
    """Redirect to Swagger UI."""
    return RedirectResponse(url="/docs")


@app.get("/health", tags=["system"])
async def health() -> dict:
    """Lightweight public health check."""
    uptime_s = round(time.monotonic() - _start_time, 1)
    return {
        "status": "ok",
        "uptime_seconds": uptime_s,
    }


@app.get("/config", tags=["system"])
async def get_config() -> dict:
    """Return scoring weights and app configuration.

    Allows the frontend to stay in sync with backend weight configuration
    instead of hardcoding weight percentages.
    """
    from config import (
        WEIGHT_NAME, WEIGHT_SYMBOL, WEIGHT_IMAGE,
        WEIGHT_DEPLOYER, WEIGHT_TEMPORAL,
    )
    return {
        "weights": {
            "name": WEIGHT_NAME,
            "symbol": WEIGHT_SYMBOL,
            "image": WEIGHT_IMAGE,
            "deployer": WEIGHT_DEPLOYER,
            "temporal": WEIGHT_TEMPORAL,
        },
        "version": "3.2.0",
    }


@app.get("/admin/health", tags=["system"])
async def admin_health() -> dict:
    """Detailed health check including circuit breakers and cache stats."""
    from .data_sources._clients import cache

    uptime_s = round(time.monotonic() - _start_time, 1)

    # Cache stats (best-effort – not all backends expose stats)
    cache_info: dict = {}
    try:
        size = len(cache._store) if hasattr(cache, "_store") else None
        cache_info = {"backend": type(cache).__name__, "entries": size}
    except Exception:
        cache_info = {"backend": type(cache).__name__}

    return {
        "status": "ok",
        "uptime_seconds": uptime_s,
        "cache": cache_info,
        "circuit_breakers": cb_statuses(),
    }


@app.get("/lineage", response_model=LineageResult, tags=["lineage"])
@limiter.limit(RATE_LIMIT_LINEAGE)
async def get_lineage(
    request: Request,
    mint: str = Query(..., description="Solana mint address of the token"),
) -> LineageResult:
    """Return full lineage information for the given token mint."""
    if not mint or not _BASE58_RE.match(mint):
        raise HTTPException(
            status_code=400,
            detail="Invalid Solana mint address. Expected 32-44 base58 characters.",
        )
    try:
        return await asyncio.wait_for(
            detect_lineage(mint), timeout=ANALYSIS_TIMEOUT_SECONDS
        )
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=504,
            detail=f"Analysis timed out after {ANALYSIS_TIMEOUT_SECONDS}s. "
                   "The token may have too many similar tokens to analyse. Try again.",
        )
    except Exception as exc:
        logger.exception("Lineage detection failed for %s", mint)
        raise HTTPException(
            status_code=500, detail="Internal server error"
        ) from exc


@app.post(
    "/lineage/batch",
    response_model=BatchLineageResponse,
    tags=["lineage"],
)
@limiter.limit(RATE_LIMIT_LINEAGE)
async def batch_lineage(
    request: Request,
    body: BatchLineageRequest,
) -> BatchLineageResponse:
    """Analyse multiple mints concurrently (max 10, 3 at a time)."""
    # Validate all mints
    for mint in body.mints:
        if not _BASE58_RE.match(mint):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid mint address: {mint}",
            )

    sem = asyncio.Semaphore(3)
    per_mint_timeout = max(10, ANALYSIS_TIMEOUT_SECONDS // 2)
    results: dict[str, LineageResult | str] = {}

    async def _analyse(mint: str) -> None:
        async with sem:
            try:
                results[mint] = await asyncio.wait_for(
                    detect_lineage(mint), timeout=per_mint_timeout
                )
            except asyncio.TimeoutError:
                logger.warning("Batch lineage timed out for %s", mint)
                results[mint] = f"Analysis timed out after {per_mint_timeout}s"
            except Exception:
                logger.exception("Batch lineage failed for %s", mint)
                results[mint] = "Internal server error"

    await asyncio.gather(*[_analyse(m) for m in body.mints])
    return BatchLineageResponse(results=results)


# ------------------------------------------------------------------
# WebSocket: real-time lineage progress
# ------------------------------------------------------------------

@app.websocket("/ws/lineage")
async def ws_lineage(websocket: WebSocket):
    """Stream lineage analysis progress to the client.

    Protocol:
    1. Client connects and sends JSON: ``{"mint": "<address>"}``
    2. Server sends progress events:  ``{"step": "...", "progress": 0-100}``
    3. Server sends final result:     ``{"done": true, "result": {...}}``
       or error:                      ``{"done": true, "error": "..."}``
    4. Connection closes.
    """
    await websocket.accept()
    try:
        data = await websocket.receive_json()
        mint = data.get("mint", "")

        if not mint or not _BASE58_RE.match(mint):
            await websocket.send_json({"done": True, "error": "Invalid mint address"})
            await websocket.close()
            return

        # Send progress steps while running detect_lineage
        await websocket.send_json({"step": "Starting analysis", "progress": 0})

        async def _ws_progress(step: str, pct: int) -> None:
            await websocket.send_json({"step": step, "progress": pct})

        try:
            result = await asyncio.wait_for(
                detect_lineage(mint, progress_cb=_ws_progress),
                timeout=ANALYSIS_TIMEOUT_SECONDS,
            )
        except asyncio.TimeoutError:
            await websocket.send_json({
                "done": True,
                "error": f"Analysis timed out after {ANALYSIS_TIMEOUT_SECONDS}s. Try again.",
            })
            await websocket.close()
            return
        await websocket.send_json({"done": True, "result": result.model_dump()})

    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected during lineage analysis")
    except Exception:
        logger.exception("WebSocket lineage error")
        try:
            await websocket.send_json({"done": True, "error": "Internal server error"})
        except Exception:
            pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass


@app.get(
    "/search",
    response_model=list[TokenSearchResult],
    tags=["search"],
)
@limiter.limit(RATE_LIMIT_SEARCH)
async def search(
    request: Request,
    q: str = Query(..., description="Token name or symbol to search"),
    limit: int = Query(20, ge=1, le=100, description="Max results to return"),
    offset: int = Query(0, ge=0, description="Number of results to skip"),
) -> list[TokenSearchResult]:
    """Search Solana tokens by name or symbol via DexScreener."""
    if not q or len(q) > 100:
        raise HTTPException(
            status_code=400, detail="Query string required (max 100 chars)"
        )
    try:
        all_results = await search_tokens(q)
        return all_results[offset : offset + limit]
    except Exception as exc:
        logger.exception("Token search failed for '%s'", q)
        raise HTTPException(
            status_code=500, detail="Internal server error"
        ) from exc


# ------------------------------------------------------------------
# Deployer intelligence endpoint (Feature 2)
# ------------------------------------------------------------------

@app.get(
    "/deployer/{address}",
    response_model=DeployerProfile,
    tags=["intelligence"],
    summary="Historical behaviour profile for a deployer wallet",
)
@limiter.limit("20/minute")
async def get_deployer_profile(
    request: Request,
    address: str,
) -> DeployerProfile:
    """Return historical behaviour statistics for a Solana deployer wallet."""
    if not _BASE58_RE.match(address):
        raise HTTPException(status_code=400, detail="Invalid Solana address")
    try:
        profile = await compute_deployer_profile(address)
    except Exception as exc:
        logger.exception("Deployer profile failed for %s", address)
        raise HTTPException(status_code=500, detail="Internal server error") from exc
    if profile is None:
        raise HTTPException(
            status_code=404,
            detail="No deployment history found for this address",
        )
    return profile


# ------------------------------------------------------------------
# Operator Impact Report endpoint (Initiative 1)
# ------------------------------------------------------------------

_FP_RE = re.compile(r"^[0-9a-f]{16,32}$")


@app.get(
    "/operator/{fingerprint}",
    response_model=OperatorImpactReport,
    tags=["intelligence"],
    summary="Cross-wallet operator damage ledger",
)
@limiter.limit("20/minute")
async def get_operator_impact(
    request: Request,
    fingerprint: str,
) -> OperatorImpactReport:
    """Return the aggregated damage ledger for an operator DNA fingerprint."""
    if not _FP_RE.match(fingerprint):
        raise HTTPException(status_code=400, detail="Invalid fingerprint — expected 16-char hex")
    try:
        wallet_rows = await operator_mapping_query(fingerprint)
        wallets = [r["wallet"] for r in wallet_rows]
        if not wallets:
            raise HTTPException(status_code=404, detail="No wallets found for this fingerprint")
        # Bootstrap wallets that may have no intelligence_events yet.
        # This ensures the Operator Dossier page always shows real data.
        await asyncio.gather(
            *[bootstrap_deployer_history(w) for w in wallets[:5]],
            return_exceptions=True,
        )
        report = await compute_operator_impact(fingerprint, wallets)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Operator impact failed for %s", fingerprint)
        raise HTTPException(status_code=500, detail="Internal server error") from exc
    if report is None:
        raise HTTPException(status_code=404, detail="No impact data found for this fingerprint")
    return report


# ------------------------------------------------------------------
# SOL Trace endpoint (Initiative 2)
# ------------------------------------------------------------------


@app.get(
    "/lineage/{mint}/sol-trace",
    response_model=SolFlowReport,
    tags=["intelligence"],
    summary="Post-rug SOL capital flow trace",
)
@limiter.limit(RATE_LIMIT_LINEAGE)
async def get_sol_trace(
    request: Request,
    mint: str,
    force_refresh: bool = Query(False, description="Bypass DB cache and re-trace"),
) -> SolFlowReport:
    """Return (or trigger) the SOL flow trace for a rugged token."""
    if not _BASE58_RE.match(mint):
        raise HTTPException(status_code=400, detail="Invalid Solana mint address")
    try:
        # Check DB first (populated by rug sweep fire-and-forget tasks)
        from .data_sources._clients import sol_flows_query as _sfq
        db_rows = await _sfq(mint)
        from .sol_flow_service import _rows_to_report
        if db_rows and not force_refresh:
            return _rows_to_report(mint, db_rows)
        # Look up deployer for this mint from intelligence_events
        from .data_sources._clients import event_query as _eq
        _mint_rows = await _eq(
            where="event_type = 'token_created' AND mint = ?",
            params=(mint,), columns="deployer", limit=1,
        )
        _deployer = _mint_rows[0].get("deployer", "") if _mint_rows else ""
        if not _deployer:
            # Last resort: look up deployer directly from DAS / RPC
            # (handles cases where intelligence_events has no record yet,
            # e.g. first access after a server restart or on a fresh instance)
            _deployer = await _resolve_deployer(mint)
        if not _deployer:
            raise HTTPException(status_code=404, detail="No deployer found for this mint — analyse it first via /lineage")
        # Look up bundle wallets from DB to include as extra trace seeds.
        # PumpFun/Jito tokens: deployer rarely moves SOL directly — bundle
        # wallets are the actual extractors.
        # Use only wallets with verified on-chain deployer links as seeds.
        _bundle_seeds: list[str] = []
        try:
            import json as _json
            from .data_sources._clients import bundle_report_query as _brq
            _cached_br = await _brq(mint)
            if _cached_br:
                _bd = _json.loads(_cached_br)
                if _bd.get("overall_verdict") in (
                    "confirmed_team_extraction", "suspected_team_extraction",
                    "coordinated_dump_unknown_team",
                ):
                    _bundle_seeds = (
                        [w for w in _bd.get("confirmed_team_wallets", []) if w != _deployer]
                        + [w for w in _bd.get("suspected_team_wallets", []) if w != _deployer]
                        + [w for w in _bd.get("coordinated_dump_wallets", []) if w != _deployer]
                    )[:12]
                    # Fallback: if categorised lists are empty, use wallets
                    # that sold — they ARE the extraction vectors.
                    if not _bundle_seeds:
                        _bundle_seeds = [
                            w.get("wallet", "")
                            for w in _bd.get("bundle_wallets", [])
                            if w.get("post_sell", {}).get("sell_detected")
                            and w.get("wallet", "") != _deployer
                        ][:12]
        except Exception:
            pass
        logger.info(
            "[sol-trace] mint=%s deployer=%s bundle_seeds=%d seeds=%s",
            mint[:8], _deployer[:8] if _deployer else "?",
            len(_bundle_seeds),
            [s[:8] for s in _bundle_seeds[:4]],
        )
        # Trigger synchronously (trace_sol_flow has its own 45s timeout
        # and returns partial results on timeout, so outer timeout is generous)
        report = await asyncio.wait_for(
            trace_sol_flow(mint, _deployer, extra_seed_wallets=_bundle_seeds),
            timeout=55.0,
        )
    except (asyncio.TimeoutError, HTTPException):
        raise
    except Exception as exc:
        logger.exception("SOL trace failed for %s", mint)
        raise HTTPException(status_code=500, detail="Internal server error") from exc
    if report is None:
        raise HTTPException(status_code=404, detail="No SOL flows found for this token")
    return report


# ------------------------------------------------------------------
# Cartel Graph endpoints (Initiative 3)
# ------------------------------------------------------------------


@app.get(
    "/cartel/search",
    response_model=CartelReport,
    tags=["intelligence"],
    summary="Find cartel community for a deployer wallet",
)
@limiter.limit("20/minute")
async def cartel_search(
    request: Request,
    deployer: str = Query(..., description="Deployer wallet address"),
) -> CartelReport:
    """Find the cartel community containing a deployer wallet."""
    if not _BASE58_RE.match(deployer):
        raise HTTPException(status_code=400, detail="Invalid Solana address")
    try:
        report = await compute_cartel_report(deployer, deployer)
    except Exception as exc:
        logger.exception("Cartel search failed for %s", deployer)
        raise HTTPException(status_code=500, detail="Internal server error") from exc
    if report is None:
        raise HTTPException(status_code=500, detail="Internal server error")
    return report


@app.get(
    "/cartel/{community_id}",
    response_model=CartelCommunity,
    tags=["intelligence"],
    summary="Cartel community by ID",
)
@limiter.limit("20/minute")
async def get_cartel_community(
    request: Request,
    community_id: str,
) -> CartelCommunity:
    """Return a cartel community by its stable community_id."""
    if len(community_id) != 12 or not all(c in "0123456789abcdef" for c in community_id):
        raise HTTPException(status_code=400, detail="Invalid community_id — expected 12-char hex")
    try:
        # O(1) lookup via community_lookup table (populated during cartel sweep)
        from .data_sources._clients import community_lookup_query
        sample_wallet = await community_lookup_query(community_id)
        if sample_wallet:
            report = await compute_cartel_report(sample_wallet, sample_wallet)
            if report and report.deployer_community:
                if report.deployer_community.community_id == community_id:
                    return report.deployer_community

        # Fallback: scan all edges (slower, for communities not yet indexed)
        from .data_sources._clients import cartel_edges_query_all
        all_edges = await cartel_edges_query_all()
        if not all_edges:
            raise HTTPException(status_code=404, detail="No cartel data available yet")
        # Extract all unique wallets from edges
        wallets = set()
        for row in all_edges:
            wallets.add(row["wallet_a"])
            wallets.add(row["wallet_b"])
        # Try each wallet until we find the one whose community matches
        import hashlib
        for wallet in wallets:
            report = await compute_cartel_report(wallet, wallet)
            if report and report.deployer_community:
                if report.deployer_community.community_id == community_id:
                    return report.deployer_community
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Cartel community lookup failed for %s", community_id)
        raise HTTPException(status_code=500, detail="Internal server error") from exc
    raise HTTPException(status_code=404, detail="Community not found")


@app.get(
    "/cartel/{deployer}/financial",
    response_model=FinancialGraphSummary,
    tags=["intelligence"],
    summary="Financial coordination graph for a deployer",
)
@limiter.limit("10/minute")
async def cartel_financial_graph(
    request: Request,
    deployer: str,
) -> FinancialGraphSummary:
    """Build and return the financial coordination graph for a deployer.

    Runs the 3 financial signals (funding_link, shared_lp, sniper_ring)
    on-demand and returns a summary with scoring and edge details.
    """
    if not _BASE58_RE.match(deployer):
        raise HTTPException(status_code=400, detail="Invalid Solana address")
    try:
        # Trigger financial edge collection for this deployer
        await asyncio.wait_for(build_financial_edges(deployer), timeout=60.0)

        # Fetch all edges for scoring
        from .data_sources._clients import cartel_edges_query
        all_edges = await cartel_edges_query(deployer)

        import json as _json
        _FINANCIAL_TYPES = {"funding_link", "shared_lp", "sniper_ring"}
        _METADATA_TYPES = {"dna_match", "sol_transfer", "timing_sync", "phash_cluster", "cross_holding"}

        funding = 0
        shared_lp = 0
        sniper = 0
        metadata = 0
        timing = 0
        edge_list: list = []
        connected: set[str] = set()

        from .models import CartelEdge as _CE
        for row in all_edges:
            st = row.get("signal_type", "")
            try:
                ev = _json.loads(row.get("evidence_json") or "{}")
                if isinstance(ev, str):
                    ev = _json.loads(ev)
            except Exception:
                ev = {}
            edge = _CE(
                wallet_a=row["wallet_a"],
                wallet_b=row["wallet_b"],
                signal_type=st,
                signal_strength=float(row.get("signal_strength", 0.5)),
                evidence=ev,
            )
            edge_list.append(edge)

            other = row["wallet_b"] if row["wallet_a"] == deployer else row["wallet_a"]
            if st in _FINANCIAL_TYPES:
                connected.add(other)

            if st == "funding_link":
                funding += 1
            elif st == "shared_lp":
                shared_lp += 1
            elif st == "sniper_ring":
                sniper += 1
            elif st == "timing_sync":
                timing += 1
            elif st in _METADATA_TYPES:
                metadata += 1

        score = (
            funding * 30
            + shared_lp * 25
            + sniper * 20
            + timing * 15
            + metadata * 10
        )

        return FinancialGraphSummary(
            deployer=deployer,
            funding_links=funding,
            shared_lp_count=shared_lp,
            sniper_ring_count=sniper,
            metadata_edges=metadata + timing,
            financial_score=score,
            edges=edge_list,
            connected_deployers=sorted(connected),
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Financial graph analysis timed out")
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Financial graph failed for %s", deployer)
        raise HTTPException(status_code=500, detail="Internal server error") from exc


# ------------------------------------------------------------------
# Bundle wallet tracking endpoint (Initiative 5)
# ------------------------------------------------------------------

@app.get(
    "/bundle/{mint}",
    response_model=BundleExtractionReport,
    tags=["intelligence"],
    summary="Forensic bundle wallet analysis for a token launch",
)
@limiter.limit("10/minute")
async def get_bundle_report(
    request: Request,
    mint: str,
    deployer: Optional[str] = None,
    force_refresh: bool = False,
) -> BundleExtractionReport:
    """Detect Jito bundle wallets at token launch and trace their SOL flows.

    Returns the list of early coordinated buyers, which ones were funded by
    the deployer, how much SOL flowed back, and an extraction verdict.
    """
    if not _BASE58_RE.match(mint):
        raise HTTPException(status_code=400, detail="Invalid Solana mint address")
    if deployer and not _BASE58_RE.match(deployer):
        raise HTTPException(status_code=400, detail="Invalid deployer address")

    from .bundle_tracker_service import analyze_bundle
    from .data_sources._clients import get_jup_client as _gjup

    # Resolve deployer from on-chain if not supplied
    _deployer = deployer or ""
    if not _deployer:
        _deployer = await _resolve_deployer(mint)
    if not _deployer:
        raise HTTPException(status_code=404, detail="Could not resolve deployer for this mint")

    # Get current SOL price for USD conversion
    _sol_price: Optional[float] = None
    try:
        jup = _gjup()
        _sol_price = await jup.get_price("So11111111111111111111111111111111111111112")
    except Exception:
        pass

    try:
        report = await asyncio.wait_for(
            analyze_bundle(mint, _deployer, _sol_price, force_refresh=force_refresh),
            timeout=60.0,
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Bundle analysis timed out")
    except Exception as exc:
        logger.exception("Bundle analysis failed for %s", mint)
        raise HTTPException(status_code=500, detail="Internal server error") from exc

    if report is None:
        raise HTTPException(status_code=404, detail="No bundle activity detected for this token")
    return report


# ------------------------------------------------------------------
# Lineage multi-generation graph endpoint (Feature 4)
# ------------------------------------------------------------------

@app.get(
    "/lineage/{mint}/graph",
    tags=["lineage"],
    summary="Multi-generation graph data for a token family",
)
@limiter.limit(RATE_LIMIT_LINEAGE)
async def get_lineage_graph(
    request: Request,
    mint: str,
) -> dict:
    """Return edge/node lists suitable for graph rendering.

    Uses the cached lineage result (or triggers a fresh analysis) and
    exposes ``parent_mint`` + ``generation`` on each node.
    """
    if not _BASE58_RE.match(mint):
        raise HTTPException(status_code=400, detail="Invalid Solana mint address")
    try:
        result = await asyncio.wait_for(
            detect_lineage(mint), timeout=ANALYSIS_TIMEOUT_SECONDS
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Analysis timed out")
    except Exception as exc:
        logger.exception("Graph lineage failed for %s", mint)
        raise HTTPException(status_code=500, detail="Internal server error") from exc

    root = result.root
    nodes = []
    edges = []

    if root:
        nodes.append({
            "id": root.mint,
            "label": root.name or root.symbol or root.mint[:8],
            "symbol": root.symbol,
            "generation": 0,
            "parent_mint": None,
            "is_root": True,
            "score": 1.0,
            "liquidity_usd": root.liquidity_usd,
            "market_cap_usd": root.market_cap_usd,
        })

    for d in result.derivatives:
        parent = d.parent_mint or (root.mint if root else "")
        nodes.append({
            "id": d.mint,
            "label": d.name or d.symbol or d.mint[:8],
            "symbol": d.symbol,
            "generation": d.generation,
            "parent_mint": parent,
            "is_root": False,
            "score": d.evidence.composite_score,
            "liquidity_usd": d.liquidity_usd,
            "market_cap_usd": d.market_cap_usd,
        })
        if parent:
            edges.append({
                "source": parent,
                "target": d.mint,
                "score": d.evidence.composite_score,
            })

    return {
        "mint": mint,
        "family_size": result.family_size,
        "nodes": nodes,
        "edges": edges,
    }


# ------------------------------------------------------------------
# AI Forensic Analysis endpoint (Initiative 6)
# ------------------------------------------------------------------

@app.get(
    "/analyze/{mint}",
    tags=["lineage"],
    summary="AI forensic analysis — risk score, narrative, wallet classifications",
)
@limiter.limit("6/minute")
async def get_ai_analysis(
    request: Request,
    mint: str,
    force_refresh: bool = Query(False, description="Re-run AI analysis even if cached"),
) -> dict:
    """Generate an AI-powered forensic narrative from bundle + SOL flow + lineage data.

    Calls Anthropic Claude with all available on-chain evidence and returns:
    - risk_score (0-100)
    - confidence (low / medium / high)
    - rug_pattern classification
    - narrative (2-4 sentence explanation)
    - key_findings (3-6 bullet points)
    - wallet_classifications
    - operator_hypothesis
    """
    if not _BASE58_RE.match(mint):
        raise HTTPException(status_code=400, detail="Invalid Solana mint address")

    from .ai_analyst import analyze_token, _build_unified_response
    from .bundle_tracker_service import get_cached_bundle_report
    from .sol_flow_service import get_sol_flow_report

    # detect_lineage handles its own cache (instant if cached, RPC fallback if not)
    # sol_flow + bundle are pure DB reads — all run concurrently
    lineage_res, sol_flow_res, bundle_res = await asyncio.gather(
        asyncio.wait_for(detect_lineage(mint), timeout=55.0),
        get_sol_flow_report(mint),
        get_cached_bundle_report(mint),
        return_exceptions=True,
    )
    # Graceful degradation: treat any exception as missing data
    if isinstance(lineage_res, Exception):
        logger.warning("[analyze] lineage cache read failed for %s: %s", mint[:12], lineage_res)
        lineage_res = None
    if isinstance(sol_flow_res, Exception):
        sol_flow_res = None
    if isinstance(bundle_res, Exception):
        bundle_res = None

    if not lineage_res and not sol_flow_res and not bundle_res:
        raise HTTPException(
            status_code=404,
            detail="No on-chain data found. Run /lineage?mint=... and /bundle/{mint} first.",
        )

    try:
        ai_result = await asyncio.wait_for(
            analyze_token(
                mint,
                lineage_result=lineage_res,
                bundle_report=bundle_res,
                sol_flow_report=sol_flow_res,
            ),
            timeout=40.0,
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="AI analysis timed out")
    except Exception as exc:
        logger.exception("AI analysis failed for %s", mint)
        raise HTTPException(status_code=500, detail="Internal server error") from exc

    if ai_result is None:
        raise HTTPException(
            status_code=503,
            detail="AI analysis unavailable — check ANTHROPIC_API_KEY configuration",
        )

    return _build_unified_response(
        mint, ai_result,
        lineage=lineage_res,
        bundle=bundle_res,
        sol_flow=sol_flow_res,
    )


# ------------------------------------------------------------------
# Run with: python -m lineage_agent.api
# ------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "lineage_agent.api:app",
        host=API_HOST,
        port=API_PORT,
        reload=True,
    )
