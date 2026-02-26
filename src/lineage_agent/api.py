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
from .cartel_service import compute_cartel_report, run_cartel_sweep
from .data_sources._clients import operator_mapping_query, sol_flows_query
from .logging_config import generate_request_id, request_id_ctx, setup_logging
from .models import (
    BatchLineageRequest,
    BatchLineageResponse,
    CartelCommunity,
    CartelReport,
    DeployerProfile,
    LineageResult,
    OperatorImpactReport,
    SolFlowReport,
    TokenSearchResult,
)
from .rug_detector import cancel_rug_sweep, schedule_rug_sweep

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
    yield
    logger.info("Shutting down – closing HTTP clients …")
    cancel_rug_sweep()
    cancel_alert_sweep()
    _cancel_cartel_sweep()
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
    allow_origin_regex=r"https://lineage-agent[a-zA-Z0-9\-]*\.vercel\.app",
    allow_credentials=True,
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


# ------------------------------------------------------------------
# Endpoints
# ------------------------------------------------------------------


@app.get("/", tags=["system"], include_in_schema=False)
async def root():
    """Redirect to Swagger UI."""
    return RedirectResponse(url="/docs")


@app.get("/health", tags=["system"])
async def health() -> dict:
    """Health check including uptime, circuit breaker states, and cache stats."""
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
    results: dict[str, LineageResult | str] = {}

    async def _analyse(mint: str) -> None:
        async with sem:
            try:
                results[mint] = await detect_lineage(mint)
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

_FP_RE = re.compile(r"^[0-9a-f]{16}$")


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
) -> SolFlowReport:
    """Return (or trigger) the SOL flow trace for a rugged token."""
    if not _BASE58_RE.match(mint):
        raise HTTPException(status_code=400, detail="Invalid Solana mint address")
    try:
        # Check DB first (populated by rug sweep fire-and-forget tasks)
        from .data_sources._clients import sol_flows_query as _sfq
        db_rows = await _sfq(mint)
        from .sol_flow_service import _rows_to_report
        if db_rows:
            return _rows_to_report(mint, db_rows)
        # Look up deployer for this mint from intelligence_events
        from .data_sources._clients import event_query as _eq
        _mint_rows = await _eq(
            where="event_type = 'token_created' AND mint = ?",
            params=(mint,), columns="deployer", limit=1,
        )
        _deployer = _mint_rows[0].get("deployer", "") if _mint_rows else ""
        if not _deployer:
            raise HTTPException(status_code=404, detail="No deployer found for this mint — analyse it first via /lineage")
        # If not in DB: trigger synchronously with 20s timeout
        report = await asyncio.wait_for(
            trace_sol_flow(mint, _deployer),
            timeout=22.0,
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="SOL trace timed out — try again later")
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
        # Scan all cartel edges to find a community matching this ID
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
