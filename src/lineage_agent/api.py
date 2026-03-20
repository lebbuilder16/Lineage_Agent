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
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from starlette.middleware.base import BaseHTTPMiddleware

from config import (
    ANALYSIS_TIMEOUT_SECONDS,
    API_HOST,
    API_PORT,
    CACHE_BACKEND,
    RATE_LIMIT_LINEAGE,
    RATE_LIMIT_SEARCH,
    SENTRY_DSN,
    SENTRY_ENVIRONMENT,
    SENTRY_TRACES_SAMPLE_RATE,
    SOLANA_RPC_ENDPOINT,
    WALLET_LABELS_CSV_URL,
    WALLET_LABELS_REFRESH_HOURS,
)
from .circuit_breaker import get_all_statuses as cb_statuses
from .data_sources._clients import close_clients, init_clients, get_rpc_client
from .data_sources._clients import cache_delete_prefix
from .lineage_detector import (
    bootstrap_deployer_history,
    detect_lineage,
    get_cached_lineage_report,
    search_tokens,
)
from .alert_service import (
    cancel_alert_sweep,
    register_web_client,
    schedule_alert_sweep as _schedule_alert_sweep,
    unregister_web_client,
)
from .deployer_service import compute_deployer_profile
from .operator_impact_service import compute_operator_impact
from .rug_detector import normalize_legacy_rug_events
from .sol_flow_service import get_sol_flow_report, trace_sol_flow
from .lineage_detector import resolve_deployer as _resolve_deployer
from .cartel_service import compute_cartel_report, run_cartel_sweep
from .cartel_financial_service import build_financial_edges
from .data_sources._clients import operator_mapping_query
from .logging_config import generate_request_id, request_id_ctx, setup_logging
from .models import (
    BatchLineageRequest,
    BatchLineageResponse,
    BundleExtractionReport,
    CartelCommunity,
    CartelReport,
    DeployerProfile,
    FinancialGraphSummary,
    GlobalStats,
    LineageResult,
    NarrativeCount,
    OperatorImpactReport,
    SolFlowReport,
    TokenCompareResult,
    TokenSearchResult,
)
from .rug_detector import cancel_rug_sweep, schedule_rug_sweep
from .db_maintenance import cancel_db_maintenance, schedule_db_maintenance
from .auth_service import (
    create_or_get_user,
    verify_api_key,
    get_user_watches,
    add_user_watch,
    remove_user_watch,
)

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


async def _purge_legacy_forensic_cache_namespaces() -> None:
    purged_ai = await cache_delete_prefix("ai:v3:")
    purged_lineage = await cache_delete_prefix("lineage:v4:")
    if purged_ai or purged_lineage:
        logger.info(
            "Purged legacy forensic cache namespaces: ai:v3=%d lineage:v4=%d",
            purged_ai,
            purged_lineage,
        )


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
# Dynamic wallet label refresh task
# ---------------------------------------------------------------------------
_wallet_label_task: Optional[asyncio.Task] = None


async def _wallet_label_refresh_loop() -> None:
    """Refresh dynamic wallet labels immediately and then every N hours."""
    from .wallet_labels import refresh_dynamic_labels  # noqa: PLC0415
    logger.info("Wallet label refresh task started (interval=%dh)", WALLET_LABELS_REFRESH_HOURS)
    while True:
        try:
            await refresh_dynamic_labels(WALLET_LABELS_CSV_URL)
        except asyncio.CancelledError:
            break
        except Exception:
            logger.exception("Wallet label refresh failed")
        try:
            await asyncio.sleep(WALLET_LABELS_REFRESH_HOURS * 3600)
        except asyncio.CancelledError:
            break


def _schedule_wallet_label_refresh() -> None:
    global _wallet_label_task
    _wallet_label_task = asyncio.create_task(
        _wallet_label_refresh_loop(), name="wallet_label_refresh"
    )


def _cancel_wallet_label_refresh() -> None:
    global _wallet_label_task
    if _wallet_label_task and not _wallet_label_task.done():
        _wallet_label_task.cancel()


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
    await _purge_legacy_forensic_cache_namespaces()
    schedule_rug_sweep()
    _schedule_alert_sweep()
    _schedule_cartel_sweep()
    schedule_db_maintenance()

    # ── Log arq status ─────────────────────────────────────────────────────
    from config import ARQ_REDIS_URL  # noqa: PLC0415
    if ARQ_REDIS_URL:
        logger.info("arq: Redis queue enabled (%s)", ARQ_REDIS_URL.split("@")[-1])
    else:
        logger.info("arq: ARQ_REDIS_URL not set — background tasks use asyncio.create_task")

    # ── Wallet labels dynamic refresh ──────────────────────────────────────
    if WALLET_LABELS_CSV_URL:
        _schedule_wallet_label_refresh()
        logger.info(
            "Dynamic wallet labels enabled — CSV=%s, refresh every %dh",
            WALLET_LABELS_CSV_URL, WALLET_LABELS_REFRESH_HOURS,
        )
    else:
        logger.info("WALLET_LABELS_CSV_URL not set — using static labels only")

    yield

    # -----------------------------------------------------------------------
    # Shutdown
    # -----------------------------------------------------------------------
    logger.info("Shutting down \u2013 closing HTTP clients \u2026")
    cancel_rug_sweep()
    cancel_alert_sweep()
    _cancel_cartel_sweep()
    cancel_db_maintenance()
    _cancel_wallet_label_refresh()
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
    # Public API — no credentials involved, wildcard is safe and avoids
    # maintaining a regex that breaks every time a new Vercel preview URL is
    # generated or a custom domain is added.
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type", "Accept", "X-API-Key"],
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


def _analysis_deployer_from_lineage(lineage_res: Optional[LineageResult]) -> str:
    if lineage_res is None:
        return ""
    query_token = getattr(lineage_res, "query_token", None) or getattr(lineage_res, "root", None)
    return getattr(query_token, "deployer", "") or ""


def _bundle_seed_wallets(bundle_report: Optional[BundleExtractionReport], deployer: str) -> list[str]:
    if bundle_report is None:
        return []
    if getattr(bundle_report, "overall_verdict", None) not in (
        "confirmed_team_extraction",
        "suspected_team_extraction",
        "coordinated_dump_unknown_team",
    ):
        return []
    return [
        wallet
        for wallet in (
            (getattr(bundle_report, "confirmed_team_wallets", []) or [])
            + (getattr(bundle_report, "suspected_team_wallets", []) or [])
            + (getattr(bundle_report, "coordinated_dump_wallets", []) or [])
        )
        if wallet and wallet != deployer
    ][:12]


async def _load_analyze_supporting_reports(
    mint: str,
    lineage_res: Optional[LineageResult],
    *,
    force_refresh: bool,
) -> tuple[Optional[BundleExtractionReport], Optional[SolFlowReport]]:
    from .bundle_tracker_service import analyze_bundle, get_cached_bundle_report

    if not force_refresh:
        return await asyncio.gather(
            get_cached_bundle_report(mint),
            get_sol_flow_report(mint),
        )

    deployer = _analysis_deployer_from_lineage(lineage_res)
    if not deployer:
        bundle_res, sol_flow_res = await asyncio.gather(
            get_cached_bundle_report(mint, force_refresh=True),
            get_sol_flow_report(mint, force_refresh=True),
        )
        return bundle_res, sol_flow_res

    bundle_res = await analyze_bundle(mint, deployer, force_refresh=True)
    sol_flow_res = await trace_sol_flow(
        mint,
        deployer,
        extra_seed_wallets=_bundle_seed_wallets(bundle_res, deployer),
    )

    # Sanity gate: discard sol_flow when all traced activity predates the
    # token's creation (same check as _run_sol_flow in lineage_detector.py).
    if sol_flow_res is not None and lineage_res is not None:
        _qt = getattr(lineage_res, "query_token", None) or getattr(lineage_res, "root", None)
        _token_created_at = getattr(_qt, "created_at", None) if _qt else None
        _rug_ts = getattr(sol_flow_res, "rug_timestamp", None)
        if _rug_ts and _token_created_at and _rug_ts < _token_created_at:
            logger.info(
                "[analyze] discarding sol_flow for %s — rug_timestamp (%s) predates "
                "token creation (%s)",
                mint[:8], _rug_ts.isoformat(), _token_created_at.isoformat(),
            )
            from .sol_flow_service import sol_flows_delete as _sfd
            try:
                await _sfd(mint)
            except Exception:
                pass
            sol_flow_res = None

    return bundle_res, sol_flow_res


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
    force_refresh: bool = Query(False, description="Bust cache and re-run full analysis"),
) -> LineageResult:
    """Return full lineage information for the given token mint."""
    if not mint or not _BASE58_RE.match(mint):
        raise HTTPException(
            status_code=400,
            detail="Invalid Solana mint address. Expected 32-44 base58 characters.",
        )
    try:
        return await asyncio.wait_for(
            detect_lineage(mint, force_refresh=force_refresh), timeout=ANALYSIS_TIMEOUT_SECONDS
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

        force_refresh: bool = bool(data.get("force_refresh", False))

        # Send progress steps while running detect_lineage
        await websocket.send_json({"step": "Starting analysis", "progress": 0})

        async def _ws_progress(step: str, pct: int) -> None:
            await websocket.send_json({"step": step, "progress": pct})

        try:
            result = await asyncio.wait_for(
                detect_lineage(mint, progress_cb=_ws_progress, force_refresh=force_refresh),
                timeout=ANALYSIS_TIMEOUT_SECONDS,
            )
        except asyncio.TimeoutError:
            await websocket.send_json({
                "done": True,
                "error": f"Analysis timed out after {ANALYSIS_TIMEOUT_SECONDS}s. Try again.",
            })
            await websocket.close()
            return
        await websocket.send_json({"done": True, "result": result.model_dump(mode="json")})

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


# ------------------------------------------------------------------
# WebSocket: real-time alert push for the browser dashboard
# ------------------------------------------------------------------

@app.websocket("/ws/alerts")
async def ws_alerts(websocket: WebSocket):
    """Push deployer/narrative alerts to browser dashboard clients.

    The client connects and keeps the connection open. The server pushes
    JSON events whenever a watched deployer or narrative produces a new token::

        {"event": "alert", "type": "deployer|narrative", "title": "...",
         "body": "...", "mint": "<address>"}

    The client should send periodic pings (plain text ``"ping"``) to keep
    the connection alive through proxies.
    """
    await websocket.accept()
    register_web_client(websocket)
    logger.info("Browser alert client connected")
    try:
        while True:
            # Wait for client keepalive pings; timeout = 90s
            try:
                msg = await asyncio.wait_for(websocket.receive_text(), timeout=90)
                if msg.strip().lower() == "ping":
                    await websocket.send_text("pong")
            except asyncio.TimeoutError:
                # No ping received — send a server-side keepalive
                try:
                    await websocket.send_text("ping")
                except Exception:
                    break
    except WebSocketDisconnect:
        logger.info("Browser alert client disconnected")
    except Exception:
        logger.exception("WebSocket alert error")
    finally:
        unregister_web_client(websocket)
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
        all_results = await asyncio.wait_for(search_tokens(q), timeout=10.0)
        return all_results[offset : offset + limit]
    except asyncio.TimeoutError:
        logger.warning("Token search timed out for '%s'", q)
        raise HTTPException(status_code=504, detail="Search timed out, please try again")
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
# Bundle result polling endpoint  (Gap 6)
# ------------------------------------------------------------------

@app.get(
    "/lineage/{mint}/bundle",
    response_model=BundleExtractionReport,
    tags=["intelligence"],
    summary="Poll cached bundle extraction report for a token",
)
@limiter.limit(RATE_LIMIT_LINEAGE)
async def get_lineage_bundle(
    request: Request,
    mint: str,
) -> BundleExtractionReport:
    """Return the cached bundle extraction report without triggering new RPC calls.

    The bundle report is computed during the main ``/lineage`` scan and
    persisted to the DB.  If the inline 30-second cap was hit, the full
    analysis completes in the background and this endpoint exposes the
    result once available.  Returns 404 if analysis has not yet run.
    """
    if not _BASE58_RE.match(mint):
        raise HTTPException(status_code=400, detail="Invalid Solana mint address")
    try:
        from .bundle_tracker_service import get_cached_bundle_report as _gcbr
        report = await _gcbr(mint)
    except Exception as exc:
        logger.exception("Bundle cache read failed for %s", mint)
        raise HTTPException(status_code=500, detail="Internal server error") from exc
    if report is None:
        raise HTTPException(
            status_code=404,
            detail=(
                "Bundle report not yet available for this token. "
                "Run /lineage first, then poll this endpoint."
            ),
        )
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
            timeout=150.0,
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

    try:
        lineage_res = await asyncio.wait_for(
            detect_lineage(mint, force_refresh=force_refresh),
            timeout=55.0,
        )
    except Exception as exc:
        lineage_res = exc

    if isinstance(lineage_res, Exception):
        logger.warning("[analyze] lineage cache read failed for %s: %s", mint[:12], lineage_res)
        lineage_res = None

    try:
        bundle_res, sol_flow_res = await _load_analyze_supporting_reports(
            mint,
            lineage_res,
            force_refresh=force_refresh,
        )
    except Exception as exc:
        logger.warning("[analyze] supporting report refresh failed for %s: %s", mint[:12], exc)
        bundle_res = None
        sol_flow_res = None

    # Fire-and-forget bundle analysis if not yet cached — next /analyze call will have it
    if bundle_res is None and lineage_res is not None and not force_refresh:
        try:
            from .bundle_tracker_service import analyze_bundle as _ab
            _deployer_for_bundle = ""
            _qt = getattr(lineage_res, "query_token", None) or getattr(lineage_res, "root", None)
            if _qt:
                _deployer_for_bundle = getattr(_qt, "deployer", "") or ""
            if _deployer_for_bundle:
                asyncio.create_task(
                    _ab(mint, _deployer_for_bundle),
                    name=f"bundle_bg:{mint[:8]}",
                )
                logger.info("[analyze] bundle not cached — background task started for %s", mint[:8])
        except Exception:
            pass  # non-blocking — never fail /analyze because of this

    if not lineage_res and not sol_flow_res and not bundle_res:
        raise HTTPException(
            status_code=404,
            detail="No on-chain data found. Run /lineage?mint=... and /bundle/{mint} first.",
        )

    try:
        from .data_sources._clients import cache as _cache  # noqa: PLC0415
        ai_result = await asyncio.wait_for(
            analyze_token(
                mint,
                lineage_result=lineage_res,
                bundle_report=bundle_res,
                sol_flow_report=sol_flow_res,
                cache=_cache,
                force_refresh=force_refresh,
            ),
            timeout=60.0,  # raised from 50s — covers up to 2 retries on 529 overload (3+6s extra)
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
# AI Forensic Analysis — SSE streaming endpoint
# ------------------------------------------------------------------

@app.get(
    "/analyze/{mint}/stream",
    tags=["lineage"],
    summary="AI forensic analysis with SSE progress events",
)
@limiter.limit("6/minute")
async def stream_ai_analysis(
    request: Request,
    mint: str,
    force_refresh: bool = Query(False, description="Re-run AI analysis even if cached"),
) -> EventSourceResponse:
    """Same as /analyze/{mint} but streams progress via Server-Sent Events.

    Events:
      step  {"step":"lineage"|"deployer"|"cartel"|"bundle"|"sol_flow"|"ai", "status":"running"|"done", "ms":<int>}
      complete  <full AnalyzeResponse JSON>
      error  {"detail":"..."}
    """
    if not _BASE58_RE.match(mint):
        raise HTTPException(status_code=400, detail="Invalid Solana mint address")

    async def _generator():
        import json as _json
        import time as _time
        from .ai_analyst import analyze_token as _analyze_token, _build_unified_response as _bur, _heuristic_score

        def _evt(event: str, data: dict) -> dict:
            return {"event": event, "data": _json.dumps(data)}

        # 1. Lineage
        yield _evt("step", {"step": "lineage", "status": "running"})
        _t0 = _time.monotonic()
        try:
            lineage_res = await asyncio.wait_for(
                detect_lineage(mint, force_refresh=force_refresh),
                timeout=55.0,
            )
        except Exception as _e:
            logger.warning("[stream] lineage failed for %s: %s", mint[:12], _e)
            lineage_res = None
        yield _evt("step", {"step": "lineage", "status": "done", "ms": int((_time.monotonic() - _t0) * 1000)})

        # 2. Deployer profile — prefer data already computed by detect_lineage
        _deployer_addr = _analysis_deployer_from_lineage(lineage_res)
        yield _evt("step", {"step": "deployer", "status": "running"})
        _td = _time.monotonic()
        _has_deployer = lineage_res and getattr(lineage_res, "deployer_profile", None) is not None
        if not _has_deployer and _deployer_addr:
            logger.warning("[stream] deployer_profile missing from lineage for %s — falling back to direct fetch", mint[:12])
            try:
                await asyncio.wait_for(compute_deployer_profile(_deployer_addr), timeout=15.0)
            except Exception as _dep_exc:
                logger.warning("[stream] deployer fallback failed for %s: %s", mint[:12], _dep_exc)
        yield _evt("step", {"step": "deployer", "status": "done", "ms": int((_time.monotonic() - _td) * 1000)})

        # 3. Cartel detection — prefer data already computed by detect_lineage
        yield _evt("step", {"step": "cartel", "status": "running"})
        _tc = _time.monotonic()
        _has_cartel = lineage_res and getattr(lineage_res, "cartel_report", None) is not None
        if not _has_cartel and _deployer_addr:
            logger.warning("[stream] cartel_report missing from lineage for %s — falling back to direct fetch", mint[:12])
            try:
                await asyncio.wait_for(compute_cartel_report(mint, _deployer_addr), timeout=15.0)
            except Exception as _cartel_exc:
                logger.warning("[stream] cartel fallback failed for %s: %s", mint[:12], _cartel_exc)
        yield _evt("step", {"step": "cartel", "status": "done", "ms": int((_time.monotonic() - _tc) * 1000)})

        # 4-5. Bundle + SOL flow
        yield _evt("step", {"step": "bundle", "status": "running"})
        yield _evt("step", {"step": "sol_flow", "status": "running"})
        _t1 = _time.monotonic()
        try:
            _bundle_res, _sol_res = await _load_analyze_supporting_reports(
                mint, lineage_res, force_refresh=force_refresh,
            )
        except Exception as _support_exc:
            logger.warning("[stream] supporting reports failed for %s: %s", mint[:12], _support_exc)
            _bundle_res = None
            _sol_res = None
        _data_ms = int((_time.monotonic() - _t1) * 1000)
        yield _evt("step", {"step": "bundle",   "status": "done", "ms": _data_ms})
        yield _evt("step", {"step": "sol_flow", "status": "done", "ms": _data_ms})

        if not lineage_res and not _bundle_res and not _sol_res:
            yield _evt("error", {"detail": "No on-chain data found. Run /lineage?mint=... first."})
            return

        # 6. AI analysis
        try:
            from .data_sources._clients import cache as _cache  # noqa: PLC0415
        except Exception:
            _cache = None
        _hscore = _heuristic_score(lineage_res, _bundle_res, _sol_res)
        yield _evt("step", {"step": "ai", "status": "running", "heuristic": _hscore})
        _t2 = _time.monotonic()
        try:
            ai_result = await asyncio.wait_for(
                _analyze_token(
                    mint,
                    lineage_result=lineage_res,
                    bundle_report=_bundle_res,
                    sol_flow_report=_sol_res,
                    cache=_cache,
                    force_refresh=force_refresh,
                ),
                timeout=55.0,
            )
        except asyncio.TimeoutError:
            yield _evt("error", {"detail": "AI analysis timed out"})
            return
        except Exception as _exc:
            logger.exception("[stream] AI failed for %s", mint[:12])
            yield _evt("error", {"detail": "AI analysis failed"})
            return
        _ai_ms = int((_time.monotonic() - _t2) * 1000)
        yield _evt("step", {"step": "ai", "status": "done", "ms": _ai_ms})

        if ai_result is None:
            yield _evt("error", {"detail": "AI analysis unavailable — check ANTHROPIC_API_KEY"})
            return

        payload = _bur(mint, ai_result, lineage=lineage_res, bundle=_bundle_res, sol_flow=_sol_res)
        yield _evt("complete", payload)

    return EventSourceResponse(_generator())

# ------------------------------------------------------------------
# AI Forensic Chat — conversational analysis endpoint (Phase 3.1)
# ------------------------------------------------------------------

class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []


_CHAT_SYSTEM = """\
You are a Solana blockchain forensics detective embedded in the Lineage Agent platform.
On-chain data for the queried token has been fetched and is provided under FORENSIC CONTEXT.

RULES:
- Answer ONLY about the analysed token and its on-chain data.
- Cite specific numbers and addresses from the context when relevant.
- Be concise but complete — bullet points are welcome.
- If the context contains TOKEN/DEPLOYER/PLATFORM lines, answer directly from those fields — do NOT say you cannot find the data.
- If the context says "No on-chain data loaded yet", tell the user to trigger a full scan first (via the Analyze button or the /analyze endpoint) and then retry the chat.
- NEVER fabricate on-chain data (addresses, balances, timestamps).
- Keep responses tight: 2–4 sentences or a short bullet list. No padding.
"""

# In-process context cache: mint -> (timestamp, context_str)
# Avoids redundant cache.get() calls on every chat turn for the same token.
_chat_context_cache: dict[str, tuple[float, str]] = {}
_CHAT_CONTEXT_TTL = 120.0  # seconds


@app.post(
    "/chat/{mint}",
    tags=["chat"],
    summary="Conversational forensic chat for a specific token (SSE streaming)",
)
@limiter.limit("20/minute")
async def forensic_chat(
    request: Request,
    mint: str,
    body: ChatRequest,
) -> EventSourceResponse:
    """Stream a Claude reply about a specific token's forensic analysis.

    Events:
      token  {"text": "<chunk>"}
      done   {}
      error  {"detail": "..."}
    """
    if not _BASE58_RE.match(mint):
        raise HTTPException(status_code=400, detail="Invalid Solana mint address")

    if not body.message or len(body.message) > 2000:
        raise HTTPException(status_code=400, detail="Message required (max 2000 chars)")

    async def _generator():
        import json as _json
        import time as _time
        from .ai_analyst import _get_client as _get_ai_client, _MODEL

        def _evt(event: str, data: dict) -> dict:
            return {"event": event, "data": _json.dumps(data)}

        # ── Build forensic context from cache (with in-process TTL cache) ─
        now = _time.monotonic()
        cached_ctx = _chat_context_cache.get(mint)
        if cached_ctx and (now - cached_ctx[0]) < _CHAT_CONTEXT_TTL:
            forensic_context = cached_ctx[1]
        else:
            context_parts: list[str] = []
            try:
                from .data_sources._clients import cache as _cache  # noqa: PLC0415
                from .ai_analyst import build_ai_cache_key  # noqa: PLC0415
                # Try cached AI analysis first
                _ai_key = build_ai_cache_key(mint)
                _ai_cached = _cache.get(_ai_key)
                if hasattr(_ai_cached, "__await__"):
                    _ai_cached = await _ai_cached
                if isinstance(_ai_cached, dict):
                    context_parts.append(f"RISK SCORE: {_ai_cached.get('risk_score', 'N/A')}/100")
                    context_parts.append(f"CONFIDENCE: {_ai_cached.get('confidence', 'N/A')}")
                    _verdict = _ai_cached.get("verdict_summary") or ""
                    if _verdict:
                        context_parts.append(f"VERDICT: {_verdict}")
                    _narrative = _ai_cached.get("narrative") or ""
                    if _narrative:
                        context_parts.append(f"NARRATIVE:\n{_narrative}")
                    _findings = _ai_cached.get("key_findings") or []
                    if _findings:
                        context_parts.append("KEY FINDINGS:\n" + "\n".join(f"- {f}" for f in _findings))
                    _chain = _ai_cached.get("conviction_chain") or []
                    if _chain:
                        context_parts.append("CONVICTION CHAIN:\n" + "\n".join(f"- {c}" for c in _chain))

                # Always expose the mint address so the AI can reference it directly
                context_parts.append(f"MINT ADDRESS: {mint}")

                # Try cached lineage for token metadata
                _lin_cached = await get_cached_lineage_report(mint)
                # If no cache, trigger a live detect_lineage fetch (with timeout)
                if _lin_cached is None:
                    try:
                        logger.info("[chat] no lineage cache for %s — triggering detect_lineage", mint[:12])
                        _lin_cached = await asyncio.wait_for(
                            detect_lineage(mint),
                            timeout=30.0,
                        )
                    except Exception as _ld_exc:
                        logger.warning("[chat] live detect_lineage failed for %s: %s", mint[:12], _ld_exc)
                        _lin_cached = None

                # Prefer query_token (most recently enriched) then fall back to root
                _token_node = None
                if _lin_cached is not None:
                    _token_node = (
                        getattr(_lin_cached, "query_token", None)
                        or getattr(_lin_cached, "root", None)
                    )
                if _token_node:
                    _deployer_addr = getattr(_token_node, "deployer", None) or "N/A"
                    context_parts.append(
                        f"TOKEN: {getattr(_token_node, 'name', '?')} ({getattr(_token_node, 'symbol', '?')}) | "
                        f"DEPLOYER: {_deployer_addr} | "
                        f"MCap: ${getattr(_token_node, 'market_cap_usd', None) or 'N/A'}"
                    )
                    _platform = getattr(_token_node, "launch_platform", None)
                    _stage = getattr(_token_node, "lifecycle_stage", None)
                    _created = getattr(_token_node, "created_at", None)
                    if _platform:
                        context_parts.append(f"LAUNCH PLATFORM: {_platform}")
                    if _stage:
                        context_parts.append(f"LIFECYCLE STAGE: {getattr(_stage, 'value', _stage)}")
                    if _created:
                        context_parts.append(f"CREATED AT: {_created}")
                    if getattr(_lin_cached, "derivatives", None):
                        context_parts.append(f"FAMILY SIZE: {_lin_cached.family_size} tokens")
                    _deployer_profile = getattr(_lin_cached, "deployer_profile", None)
                    if _deployer_profile:
                        context_parts.append(
                            f"DEPLOYER PROFILE: {getattr(_deployer_profile, 'total_tokens_launched', '?')} tokens launched | "
                            f"Rug rate: {getattr(_deployer_profile, 'rug_rate_pct', 'N/A')}% | "
                            f"Confirmed rugs: {getattr(_deployer_profile, 'confirmed_rug_count', 'N/A')}"
                        )
            except Exception as _ctx_exc:
                logger.warning("[chat] context fetch failed: %s", _ctx_exc)

            # Build the final context string
            # "More than just MINT ADDRESS" = we have real on-chain data
            _has_real_data = len(context_parts) > 1
            if _has_real_data:
                forensic_context = "\n\n".join(context_parts)
            else:
                forensic_context = (
                    f"MINT ADDRESS: {mint}\n\n"
                    "No on-chain data loaded yet. "
                    "The token may be very new or the on-chain fetch timed out."
                )
            # Only cache when we actually have data — no-data results should be retried
            if _has_real_data:
                _chat_context_cache[mint] = (_time.monotonic(), forensic_context)
            # Intentionally NOT caching no-data results so next message retries freely

        system_with_ctx = f"{_CHAT_SYSTEM}\n\n---\nFORENSIC CONTEXT FOR {mint}:\n{forensic_context}\n---"

        # ── Build messages list ───────────────────────────────────────────
        messages = [
            {"role": msg.role, "content": msg.content}
            for msg in body.history[-8:]  # keep last 8 turns for context window
        ]
        messages.append({"role": "user", "content": body.message})

        # ── Stream Claude response (Haiku for low latency) ────────────────
        try:
            client = _get_ai_client()
            async with client.messages.stream(
                model=_MODEL,
                max_tokens=400,
                temperature=0,
                system=system_with_ctx,
                messages=messages,
            ) as stream:
                async for text_chunk in stream.text_stream:
                    yield _evt("token", {"text": text_chunk})

            yield _evt("done", {})

        except Exception as _exc:
            logger.exception("[chat] stream failed for %s", mint[:12])
            yield _evt("error", {"detail": f"Chat error: {type(_exc).__name__}"})

    return EventSourceResponse(_generator())


# ------------------------------------------------------------------
# AI General Chat — no token context (SSE streaming)
# ------------------------------------------------------------------

@app.post(
    "/chat",
    tags=["chat"],
    summary="General AI forensics chat — no specific token context (SSE streaming)",
)
@limiter.limit("20/minute")
async def general_chat(
    request: Request,
    body: ChatRequest,
) -> EventSourceResponse:
    """Stream a Claude reply for general Solana forensics questions.

    Events:
      token  {"text": "<chunk>"}
      done   {}
      error  {"detail": "..."}
    """
    if not body.message or len(body.message) > 2000:
        raise HTTPException(status_code=400, detail="Message required (max 2000 chars)")

    async def _generator():
        import json as _json
        from .ai_analyst import _get_client as _get_ai_client, _MODEL

        def _evt(event: str, data: dict) -> dict:
            return {"event": event, "data": _json.dumps(data)}

        _general_system = """\
You are a Solana blockchain forensics detective embedded in the Lineage Agent platform.
No specific token has been selected. Answer general questions about Solana, rug pulls,
token forensics, deployer patterns, and on-chain analysis.

RULES:
- Be concise but complete — bullet points are welcome.
- NEVER fabricate specific on-chain data (addresses, balances, timestamps).
- If the user asks about a specific token, tell them to select it first via the Scan screen.
- Keep responses tight: 2–5 sentences or a short bullet list. No padding.
"""
        messages = [
            {"role": msg.role, "content": msg.content}
            for msg in body.history[-8:]
        ]
        messages.append({"role": "user", "content": body.message})

        try:
            client = _get_ai_client()
            async with client.messages.stream(
                model=_MODEL,
                max_tokens=400,
                temperature=0,
                system=_general_system,
                messages=messages,
            ) as stream:
                async for text_chunk in stream.text_stream:
                    yield _evt("token", {"text": text_chunk})

            yield _evt("done", {})

        except Exception as _exc:
            logger.exception("[chat/general] stream failed")
            yield _evt("error", {"detail": f"Chat error: {type(_exc).__name__}"})

    return EventSourceResponse(_generator())


# ---------------------------------------------------------------------------
# Agentic Forensic Investigation (SSE streaming, multi-turn tool use)
# ---------------------------------------------------------------------------


@app.post(
    "/agent/{mint}",
    tags=["agent"],
    summary="Agentic forensic investigation (SSE streaming, multi-turn tool use)",
)
@limiter.limit("3/minute")
async def agent_investigate(
    request: Request,
    mint: str,
) -> EventSourceResponse:
    """Launch an autonomous forensic investigation on a token.

    The agent selects which tools to call, reasons about results, iterates,
    and delivers a structured verdict. Progress is streamed via SSE.

    Events:
      thinking    {"turn": int, "text": str}
      tool_call   {"turn": int, "tool": str, "input": dict, "call_id": str}
      tool_result {"turn": int, "tool": str, "call_id": str, "result": dict|null, "error": str|null, "duration_ms": int}
      text        {"turn": int, "text": str}
      done        {"verdict": {...}, "turns_used": int, "tokens_used": int}
      error       {"detail": str, "recoverable": bool}
    """
    if not _BASE58_RE.match(mint):
        raise HTTPException(status_code=400, detail="Invalid Solana mint address")

    from .data_sources._clients import cache as _cache  # noqa: PLC0415

    # Auth + tier gate (optional — skip when no API key, matching /chat pattern)
    api_key = request.headers.get("X-API-Key", "")
    if api_key:
        user = await _get_current_user(request)
        user_plan = user.get("plan", "free")

        from .subscription_tiers import get_limits as _get_tier_limits  # noqa: PLC0415

        tier = _get_tier_limits(user_plan)
        if not tier.has_agent:
            raise HTTPException(status_code=403, detail="Agent investigation requires Pro+ or Whale plan")

        # Usage check
        from .usage_service import check_limit, increment_usage  # noqa: PLC0415

        under_limit = await check_limit(_cache, user["id"], "agent", int(tier.agent_daily_limit))
        if not under_limit:
            raise HTTPException(status_code=429, detail="Daily agent investigation limit reached")

        await increment_usage(_cache, user["id"], "agent")

    async def _generator():
        import json as _json  # noqa: PLC0415
        from .agent_service import run_agent  # noqa: PLC0415

        try:
            async for event in run_agent(mint, cache=_cache):
                yield {"event": event["event"], "data": _json.dumps(event["data"], default=str)}
        except Exception as _exc:
            logger.exception("[agent] unhandled error for %s", mint[:12])
            yield {"event": "error", "data": _json.dumps({"detail": f"Agent error: {type(_exc).__name__}", "recoverable": False})}

    return EventSourceResponse(_generator())


# ---------------------------------------------------------------------------
# Auth — Phase 1 (Privy-based API keys)
# ---------------------------------------------------------------------------

class _LoginRequest(BaseModel):
    privy_id: str
    wallet_address: Optional[str] = None
    email: Optional[str] = None


class _WatchRequest(BaseModel):
    sub_type: str  # e.g. "deployer", "mint"
    value: str     # address


async def _get_current_user(request: Request):
    """Dependency: parse X-API-Key header → user dict or raise 401."""
    api_key = request.headers.get("X-API-Key", "")
    if not api_key:
        raise HTTPException(status_code=401, detail="Missing X-API-Key header")
    from .data_sources._clients import cache as _cache  # noqa: PLC0415
    user = await verify_api_key(_cache, api_key)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return user


@app.post("/auth/login", tags=["auth"])
async def auth_login(body: _LoginRequest, request: Request):
    """
    Upsert a user identified by their Privy ID.
    Returns the user record including the API key.
    Call this from the frontend after Privy.authenticate().
    """
    if not body.privy_id or len(body.privy_id) < 5:
        raise HTTPException(status_code=422, detail="privy_id is required")
    from .data_sources._clients import cache as _cache  # noqa: PLC0415
    try:
        user = await create_or_get_user(
            _cache,
            privy_id=body.privy_id,
            wallet_address=body.wallet_address,
            email=body.email,
        )
    except Exception as exc:
        logger.exception("auth_login failed")
        raise HTTPException(status_code=500, detail="User creation failed") from exc
    return {
        "id": user["id"],
        "privy_id": user["privy_id"],
        "wallet_address": user["wallet_address"],
        "email": user["email"],
        "plan": user["plan"],
        "api_key": user["api_key"],
    }


@app.get("/auth/me", tags=["auth"])
async def auth_me(request: Request):
    """Return current user info. Requires X-API-Key header."""
    user = await _get_current_user(request)
    return {
        "id": user["id"],
        "privy_id": user["privy_id"],
        "wallet_address": user["wallet_address"],
        "email": user["email"],
        "plan": user["plan"],
    }


@app.get("/auth/watches", tags=["auth"])
async def auth_watches(request: Request):
    """Return user's watches. Requires X-API-Key header."""
    user = await _get_current_user(request)
    from .data_sources._clients import cache as _cache  # noqa: PLC0415
    watches = await get_user_watches(_cache, user["id"])
    return {"watches": watches}


@app.post("/auth/watches", tags=["auth"])
async def auth_add_watch(body: _WatchRequest, request: Request):
    """Add a watch for the current user. Requires X-API-Key header."""
    user = await _get_current_user(request)
    from .data_sources._clients import cache as _cache  # noqa: PLC0415
    watch = await add_user_watch(_cache, user["id"], body.sub_type, body.value)
    if watch is None:
        raise HTTPException(status_code=409, detail="Watch already exists")
    return watch


@app.delete("/auth/watches/{watch_id}", tags=["auth"])
async def auth_remove_watch(watch_id: int, request: Request):
    """Delete a watch by id. Requires X-API-Key header."""
    user = await _get_current_user(request)
    from .data_sources._clients import cache as _cache  # noqa: PLC0415
    deleted = await remove_user_watch(_cache, user["id"], watch_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Watch not found")
    return {"deleted": True}


# ---------------------------------------------------------------------------
# Token comparison endpoint
# ---------------------------------------------------------------------------

@app.get(
    "/compare",
    response_model=TokenCompareResult,
    tags=["intelligence"],
    summary="Side-by-side similarity analysis between two tokens",
)
@limiter.limit("30/minute")  # raised from 10 → 30 (point 8)
async def compare_tokens(
    request: Request,
    mint_a: str = Query(..., description="First Solana mint address"),
    mint_b: str = Query(..., description="Second Solana mint address"),
) -> TokenCompareResult:
    """Compare two tokens across name, symbol, image, deployer, temporal and lineage dimensions."""
    # ── 1. Basic format validation ────────────────────────────────────────────
    if not _BASE58_RE.match(mint_a):
        raise HTTPException(status_code=400, detail="Invalid mint_a address")
    if not _BASE58_RE.match(mint_b):
        raise HTTPException(status_code=400, detail="Invalid mint_b address")
    if mint_a == mint_b:
        raise HTTPException(status_code=400, detail="mint_a and mint_b must be different")

    from .similarity import (  # noqa: PLC0415
        compute_name_similarity,
        compute_symbol_similarity,
        compute_image_similarity,
        compute_temporal_score,
    )

    # ── 2. Validate mint existence on-chain (getAccountInfo) ─────────────────
    # Runs concurrently with lineage fetch to avoid extra latency.
    # We skip the hard validation only if the RPC call itself times out/errors
    # (avoid blocking the comparison on a network hiccup).
    rpc = get_rpc_client()
    _SPL_TOKEN_PROGRAMS = frozenset({
        "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",   # SPL Token
        "Token2022rMLqfGMQpwkX83CmP5VWMdM8RX8bH6TfpHn",  # Token-2022
    })

    async def _get_account(mint: str) -> dict | None:
        try:
            return await asyncio.wait_for(
                rpc._call("getAccountInfo", [mint, {"encoding": "base64"}]),
                timeout=8.0,
            )
        except Exception:
            return None

    # ── 3. Concurrent: account validation + lineage fetch ────────────────────
    acc_a, acc_b, res_a, res_b = await asyncio.gather(
        _get_account(mint_a),
        _get_account(mint_b),
        detect_lineage(mint_a),
        detect_lineage(mint_b),
        return_exceptions=True,
    )

    # Validate on-chain existence when we got a definitive null value
    if isinstance(acc_a, dict) and acc_a.get("value") is None:
        raise HTTPException(status_code=400, detail="mint_a not found on Solana")
    if isinstance(acc_b, dict) and acc_b.get("value") is None:
        raise HTTPException(status_code=400, detail="mint_b not found on Solana")

    # Extract token program owner from mint accounts (point 6)
    owner_a = ((acc_a.get("value") or {}).get("owner", "") if isinstance(acc_a, dict) else "")
    owner_b = ((acc_b.get("value") or {}).get("owner", "") if isinstance(acc_b, dict) else "")
    # Only flag as "same program" for non-standard programs (custom token programs)
    same_token_program = bool(
        owner_a and owner_b
        and owner_a == owner_b
        and owner_a not in _SPL_TOKEN_PROGRAMS
    )

    # ── 4. Handle lineage result errors (point 1) ─────────────────────────────
    lineage_a_err = isinstance(res_a, Exception)
    lineage_b_err = isinstance(res_b, Exception)

    if lineage_a_err:
        logger.warning("compare: lineage for %s failed: %s", mint_a[:8], res_a)
        res_a = None
    if lineage_b_err:
        logger.warning("compare: lineage for %s failed: %s", mint_b[:8], res_b)
        res_b = None

    # If BOTH lineage fetches failed we cannot produce any meaningful score —
    # return an explicit 503 instead of a misleading "unrelated" verdict.
    if lineage_a_err and lineage_b_err:
        raise HTTPException(
            status_code=503,
            detail=(
                "Could not fetch on-chain data for either token — "
                "the Solana RPC may be temporarily unavailable. Try again shortly."
            ),
        )

    tok_a = res_a.root if res_a and res_a.root else None
    tok_b = res_b.root if res_b and res_b.root else None

    # ── 5. Similarity signals ─────────────────────────────────────────────────
    name_sim = compute_name_similarity(
        tok_a.name if tok_a else "", tok_b.name if tok_b else ""
    )
    sym_sim = compute_symbol_similarity(
        tok_a.symbol if tok_a else "", tok_b.symbol if tok_b else ""
    )

    # Image similarity — distinguish "no URL" (-1) from "fetch failed" (-2)
    img_sim = -1.0
    if tok_a and tok_b and tok_a.image_uri and tok_b.image_uri:
        try:
            img_sim = await asyncio.wait_for(
                compute_image_similarity(tok_a.image_uri, tok_b.image_uri),
                timeout=10.0,
            )
        except asyncio.TimeoutError:
            img_sim = -2.0  # fetch timed out (point 3)
            logger.warning("compare: image similarity timed out for %s vs %s", mint_a[:8], mint_b[:8])
        except Exception:
            img_sim = -2.0  # fetch/hash failed (point 3)
            logger.warning("compare: image similarity failed", exc_info=True)

    # Temporal signal — how far apart were these tokens deployed? (point 4)
    ts_a = tok_a.created_at if tok_a else None
    ts_b = tok_b.created_at if tok_b else None
    temporal_score = compute_temporal_score(ts_a, ts_b)
    # Convert directional score to proximity (1=same age, 0=far apart) for composite
    temporal_proximity = 1.0 - 2.0 * abs(temporal_score - 0.5)

    # Metadata URI exact match (point 5)
    metadata_uri_match = bool(
        tok_a and tok_b
        and tok_a.metadata_uri and tok_b.metadata_uri
        and tok_a.metadata_uri.strip() == tok_b.metadata_uri.strip()
    )
    # Image URL exact match (point 5)
    image_url_match = bool(
        tok_a and tok_b
        and tok_a.image_uri and tok_b.image_uri
        and tok_a.image_uri.strip() == tok_b.image_uri.strip()
    )

    same_deployer = bool(
        tok_a and tok_b
        and tok_a.deployer
        and tok_a.deployer == tok_b.deployer
    )

    # Family membership check
    same_family = False
    if res_a and res_b:
        mints_a = {d.mint for d in (res_a.derivatives or [])} | {res_a.mint}
        mints_b = {d.mint for d in (res_b.derivatives or [])} | {res_b.mint}
        same_family = mint_b in mints_a or mint_a in mints_b

    # ── 6. Composite score (point 4 — includes temporal) ─────────────────────
    img_available = img_sim >= 0.0
    if img_available:
        # name 30% + symbol 20% + image 35% + temporal 15%
        composite = (
            name_sim * 0.30
            + sym_sim * 0.20
            + img_sim * 0.35
            + temporal_proximity * 0.15
        )
    else:
        # name 45% + symbol 35% + temporal 20%  (image unavailable)
        composite = (
            name_sim * 0.45
            + sym_sim * 0.35
            + temporal_proximity * 0.20
        )

    # ── 7. Verdict ────────────────────────────────────────────────────────────
    # URL exact-match is definitive clone evidence regardless of composite score
    has_url_match = metadata_uri_match or image_url_match

    if has_url_match and same_deployer:
        verdict = "identical_operator"
    elif has_url_match or (same_deployer and composite >= 0.8):
        verdict = "clone"
    elif composite >= 0.70 or same_family:
        verdict = "clone"
    elif composite >= 0.40 or same_deployer:
        verdict = "related"
    else:
        verdict = "unrelated"

    # ── 8. Human-readable verdict reasons ────────────────────────────────────
    verdict_reasons: list[str] = []
    if same_deployer:
        verdict_reasons.append("same deployer address")
    if same_family:
        verdict_reasons.append("one token appears in the other's lineage")
    if metadata_uri_match:
        verdict_reasons.append("identical on-chain metadata URI")
    if image_url_match:
        verdict_reasons.append("identical image URL")
    if same_token_program:
        verdict_reasons.append(f"same custom token program ({owner_a[:8]}…)")
    if img_available and round(composite * 100) >= 70:
        verdict_reasons.append(f"composite score {round(composite * 100)}% ≥ 70% clone threshold")
    elif round(composite * 100) >= 40:
        verdict_reasons.append(f"composite score {round(composite * 100)}% ≥ 40% related threshold")
    if lineage_a_err:
        verdict_reasons.append("⚠ on-chain data unavailable for token A — scores may be incomplete")
    if lineage_b_err:
        verdict_reasons.append("⚠ on-chain data unavailable for token B — scores may be incomplete")

    return TokenCompareResult(
        mint_a=mint_a,
        mint_b=mint_b,
        token_a=tok_a,
        token_b=tok_b,
        same_deployer=same_deployer,
        same_family=same_family,
        name_similarity=round(name_sim, 4),
        symbol_similarity=round(sym_sim, 4),
        image_similarity=round(img_sim, 4),
        temporal_score=round(temporal_score, 4),
        metadata_uri_match=metadata_uri_match,
        image_url_match=image_url_match,
        same_token_program=same_token_program,
        composite_score=round(composite, 4),
        verdict=verdict,  # type: ignore[arg-type]
        verdict_reasons=verdict_reasons,
    )


# ---------------------------------------------------------------------------
# Global statistics dashboard
# ---------------------------------------------------------------------------

# 60-second in-process result cache to avoid DB hammering
_stats_cache: Optional[tuple[float, GlobalStats]] = None
_STATS_CACHE_TTL = 60.0


def _is_confirmed_rug_stats_row(row: dict) -> bool:
    mechanism = str(row.get("rug_mechanism") or "").strip().lower()
    evidence_level = str(row.get("evidence_level") or "").strip().lower()
    if not mechanism:
        return True
    if mechanism not in {"dex_liquidity_rug", "pre_dex_extraction_rug", "liquidity_drain_rug"}:
        return False
    if not evidence_level:
        return True
    return evidence_level in {"moderate", "strong"}


@app.get(
    "/stats/global",
    response_model=GlobalStats,
    tags=["intelligence"],
    summary="Aggregate activity statistics for the last 24 hours",
)
@limiter.limit("30/minute")
async def get_global_stats(request: Request) -> GlobalStats:
    """Return aggregate intelligence stats: rug count, active deployers, top narratives, etc.

    Results are cached in-process for 60 seconds to keep DB load minimal.
    """
    import time as _time  # noqa: PLC0415
    from datetime import datetime, timezone, timedelta  # noqa: PLC0415

    global _stats_cache
    now_mono = _time.monotonic()
    if _stats_cache and (now_mono - _stats_cache[0]) < _STATS_CACHE_TTL:
        return _stats_cache[1]

    try:
        from .data_sources._clients import event_query as _eq  # noqa: PLC0415

        cutoff = (datetime.now(tz=timezone.utc) - timedelta(hours=24)).isoformat()

        # Parallel DB reads
        created_rows, rugged_rows, total_rows, narrative_rows = await asyncio.gather(
            _eq(
                where="event_type = 'token_created' AND created_at >= ?",
                params=(cutoff,),
                columns="DISTINCT mint, deployer",
            ),
            _eq(
                where="event_type = 'token_rugged' AND rugged_at >= ?",
                params=(cutoff,),
                columns="mint, rug_mechanism, evidence_level",
            ),
            _eq(where="1=1", params=(), columns="COUNT(*) as cnt", limit=1),
            _eq(
                where="event_type = 'token_created' AND created_at >= ? AND narrative IS NOT NULL AND narrative != '' AND narrative != 'other'",
                params=(cutoff,),
                columns="narrative",
            ),
        )

        legacy_rug_mints = [
            row.get("mint", "")
            for row in rugged_rows
            if row.get("mint") and not row.get("rug_mechanism")
        ]
        if legacy_rug_mints:
            await normalize_legacy_rug_events(mints=legacy_rug_mints)
            rugged_rows = await _eq(
                where="event_type = 'token_rugged' AND rugged_at >= ?",
                params=(cutoff,),
                columns="mint, rug_mechanism, evidence_level",
            )

        tokens_scanned = len(created_rows)
        tokens_negative_outcomes = len(rugged_rows)
        tokens_rugged = sum(1 for row in rugged_rows if _is_confirmed_rug_stats_row(row))
        rug_rate = round((tokens_rugged / tokens_scanned * 100) if tokens_scanned > 0 else 0.0, 2)
        negative_outcome_rate = round((tokens_negative_outcomes / tokens_scanned * 100) if tokens_scanned > 0 else 0.0, 2)
        active_deployers = len({r.get("deployer", "") for r in created_rows if r.get("deployer")})
        db_total = total_rows[0].get("cnt", 0) if total_rows else 0

        # Top 5 narratives by occurrence
        from collections import Counter  # noqa: PLC0415
        nar_counter: Counter = Counter(
            r.get("narrative", "") for r in narrative_rows if r.get("narrative")
        )
        top_narratives = [
            NarrativeCount(narrative=nar, count=cnt)
            for nar, cnt in nar_counter.most_common(5)
        ]

        stats = GlobalStats(
            tokens_scanned_24h=tokens_scanned,
            tokens_rugged_24h=tokens_rugged,
            rug_rate_24h_pct=rug_rate,
            tokens_negative_outcomes_24h=tokens_negative_outcomes,
            negative_outcome_rate_24h_pct=negative_outcome_rate,
            active_deployers_24h=active_deployers,
            top_narratives=top_narratives,
            db_events_total=db_total,
            last_updated=datetime.now(tz=timezone.utc),
        )
        _stats_cache = (_time.monotonic(), stats)
        return stats

    except Exception as exc:
        logger.exception("get_global_stats failed")
        raise HTTPException(status_code=500, detail="Internal server error") from exc


# ---------------------------------------------------------------------------
# /stats/brief  — 2-sentence intelligence summary
# ---------------------------------------------------------------------------
@app.get(
    "/stats/brief",
    tags=["intelligence"],
    summary="Human-readable 2-sentence intelligence brief from the last 24 h stats",
)
@limiter.limit("60/minute")
async def get_stats_brief(request: Request) -> dict:
    """Compose a short English summary from GlobalStats for display in the mobile AI Brief card."""
    from datetime import datetime, timezone  # noqa: PLC0415

    stats: GlobalStats = await get_global_stats(request)

    top_nar = stats.top_narratives[0].narrative.upper() if stats.top_narratives else "MISC"
    rug_rate = f"{stats.rug_rate_24h_pct:.1f}"

    text = (
        f"{stats.tokens_rugged_24h} confirmed rug pulls detected in the last 24 h "
        f"({rug_rate}% confirmed rug rate) across {stats.tokens_scanned_24h:,} scanned tokens. "
        f"Top narrative: {top_nar} — {stats.active_deployers_24h} active deployers tracked."
    )

    return {"text": text, "generated_at": datetime.now(tz=timezone.utc).isoformat()}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "lineage_agent.api:app",
        host=API_HOST,
        port=API_PORT,
        reload=True,
    )