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
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
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
from .openclaw_gateway import (
    handle_openclaw_ws,
    schedule_cron_sweep,
    cancel_cron_sweep,
    forward_alert_to_openclaw,
)
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
    TopToken,
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

# Loop heartbeats — updated by each background loop on every cycle
_loop_heartbeats: dict[str, float] = {}
_LOOP_STALE_THRESHOLD = 300  # 5 min — if no heartbeat in 5 min, loop is considered dead


def _heartbeat(loop_name: str) -> None:
    """Record a heartbeat for a background loop."""
    _loop_heartbeats[loop_name] = time.time()


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
# Rate limiter — use API key when present, fall back to IP
# ---------------------------------------------------------------------------
def _rate_limit_key(request: Request) -> str:
    """Per-user rate limiting via API key, fallback to IP for unauthenticated endpoints."""
    api_key = request.headers.get("X-API-Key", "")
    if api_key:
        return f"key:{api_key[:16]}"  # truncate for privacy in logs
    return get_remote_address(request)

limiter = Limiter(key_func=_rate_limit_key)


# ---------------------------------------------------------------------------
# Lifespan: startup / shutdown
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(application: FastAPI):
    """Initialise shared HTTP clients on startup, close on shutdown."""
    # Configure structured logging (JSON in production, colored in dev)
    try:
        from .log_config import configure_logging
        configure_logging()
    except Exception:
        pass  # fall back to default logging if structlog not available
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

    # Initialize database backend (SQLite or PostgreSQL based on DATABASE_URL)
    from .db import init_backend as _init_db
    _db = await _init_db()
    logger.info("Database backend: %s", _db.dialect)

    await _purge_legacy_forensic_cache_namespaces()

    # One-time fix: backfill NULL created_at in intelligence_events using recorded_at
    try:
        from .data_sources._clients import cache as _fix_cache
        _fix_db = await _fix_cache._get_conn()
        _fix_cursor = await _fix_db.execute(
            "UPDATE intelligence_events SET created_at = "
            "datetime(recorded_at, 'unixepoch') WHERE created_at IS NULL AND recorded_at IS NOT NULL"
        )
        await _fix_db.commit()
        if _fix_cursor.rowcount > 0:
            logger.info("Backfilled created_at for %d intelligence_events rows", _fix_cursor.rowcount)
    except Exception as _fix_exc:
        logger.debug("created_at backfill skipped: %s", _fix_exc)

    schedule_rug_sweep()
    _schedule_alert_sweep()
    _schedule_cartel_sweep()
    schedule_db_maintenance()

    _schedule_watchlist_sweep()
    _schedule_market_pulse()
    _schedule_briefing_loop()
    _schedule_wallet_monitor()

    # OpenClaw gateway cron sweep
    from .data_sources._clients import cache as _oc_cache  # noqa: PLC0415
    schedule_cron_sweep(_oc_cache)

    # ── Pump.fun real-time listener ───────────────────────────────────────
    from .pump_fun_listener import schedule_pump_fun_listener, is_listener_active
    _pf_task = schedule_pump_fun_listener()
    if _pf_task:
        logger.info("Pump.fun real-time listener: ACTIVE")
    else:
        logger.info("Pump.fun real-time listener: DISABLED (set HELIUS_API_KEY to enable)")

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
    from .db import close_backend as _close_db
    await _close_db()
    from .pump_fun_listener import cancel_pump_fun_listener
    cancel_pump_fun_listener()
    cancel_rug_sweep()
    cancel_alert_sweep()
    _cancel_cartel_sweep()
    cancel_db_maintenance()
    _cancel_watchlist_sweep()
    _cancel_market_pulse()
    _cancel_briefing_loop()
    _cancel_wallet_monitor()
    _cancel_wallet_label_refresh()
    cancel_cron_sweep()
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
    """Health check with operational metrics."""
    uptime_s = round(time.monotonic() - _start_time, 1)
    try:
        from .db import get_backend
        db_dialect = get_backend().dialect
    except Exception:
        db_dialect = "unknown"

    # Sweep + pulse metrics (best-effort)
    sweep_info: dict = {}
    try:
        from .data_sources._clients import cache as _cache
        from .cache import SQLiteCache
        if isinstance(_cache, SQLiteCache):
            db = await _cache._get_conn()
            # Last sweep time
            c = await db.execute("SELECT MAX(scanned_at) FROM watch_snapshots")
            r = await c.fetchone()
            if r and r[0]:
                sweep_info["last_sweep_ago_s"] = round(time.time() - r[0])
            # Total watches
            c = await db.execute("SELECT COUNT(*) FROM user_watches WHERE sub_type = 'mint'")
            r = await c.fetchone()
            sweep_info["watched_tokens"] = r[0] if r else 0
            # Pending notifications
            try:
                c = await db.execute("SELECT COUNT(*) FROM pending_notifications WHERE attempts < 3")
                r = await c.fetchone()
                sweep_info["pending_notifications"] = r[0] if r else 0
            except Exception:
                pass
    except Exception:
        pass

    # Listener stats
    try:
        from .pump_fun_listener import get_listener_stats
        sweep_info["listener"] = get_listener_stats()
    except Exception:
        pass

    # Redis cache status
    try:
        from .redis_cache import redis_health
        sweep_info["redis"] = await redis_health()
    except Exception:
        pass

    # Loop watchdog — check heartbeats and auto-recover dead loops
    now = time.time()
    loops_status: dict[str, str] = {}
    for loop_name, tasks_info in [
        ("sweep", ("_watchlist_sweep_task", "_schedule_watchlist_sweep")),
        ("pulse", ("_market_pulse_task", "_schedule_market_pulse")),
    ]:
        last_hb = _loop_heartbeats.get(loop_name, 0)
        age = now - last_hb if last_hb > 0 else uptime_s
        task_var = tasks_info[0]
        restart_fn = tasks_info[1]

        task = globals().get(task_var)
        if task and not task.done() and age < _LOOP_STALE_THRESHOLD:
            loops_status[loop_name] = "alive"
        elif age >= _LOOP_STALE_THRESHOLD and uptime_s > _LOOP_STALE_THRESHOLD:
            loops_status[loop_name] = "restarted"
            # Auto-recover: restart the dead loop
            try:
                fn = globals().get(restart_fn)
                if callable(fn):
                    fn()
                    logger.warning("[watchdog] restarted dead loop: %s (last heartbeat %ds ago)", loop_name, int(age))
            except Exception as exc:
                logger.warning("[watchdog] failed to restart %s: %s", loop_name, exc)
                loops_status[loop_name] = "dead"
        else:
            loops_status[loop_name] = "starting"

    sweep_info["loops"] = loops_status

    return {
        "status": "ok",
        "uptime_seconds": uptime_s,
        "db": db_dialect,
        **sweep_info,
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

    from .pump_fun_listener import get_listener_stats
    return {
        "status": "ok",
        "uptime_seconds": uptime_s,
        "cache": cache_info,
        "circuit_breakers": cb_statuses(),
        "pump_fun_listener": get_listener_stats(),
    }


@app.get("/admin/sweep-status", tags=["system"])
async def admin_sweep_status() -> dict:
    """Sweep monitor status — intelligence_events counts and rug detection stats."""
    from .data_sources._clients import cache as _cache
    from .cache import SQLiteCache

    if not isinstance(_cache, SQLiteCache):
        return {"error": "requires SQLiteCache backend"}

    db = await _cache._get_conn()

    # Event counts by type
    cur = await db.execute(
        "SELECT event_type, COUNT(*) FROM intelligence_events GROUP BY event_type"
    )
    event_counts = {row[0]: row[1] for row in await cur.fetchall()}

    # Recent rugs (last 48h)
    cur = await db.execute(
        "SELECT COUNT(*) FROM intelligence_events WHERE event_type = 'token_rugged' "
        "AND recorded_at > ?", (time.time() - 48 * 3600,)
    )
    recent_rugs = (await cur.fetchone())[0]

    # Total tokens monitored (created in last 48h)
    cur = await db.execute(
        "SELECT COUNT(*) FROM intelligence_events WHERE event_type = 'token_created' "
        "AND recorded_at > ?", (time.time() - 48 * 3600,)
    )
    recent_created = (await cur.fetchone())[0]

    # Operator mappings
    cur = await db.execute("SELECT COUNT(DISTINCT fingerprint), COUNT(DISTINCT wallet) FROM operator_mappings")
    om_row = await cur.fetchone()

    from .rug_detector import get_sweep_stats
    return {
        "intelligence_events": event_counts,
        "recent_48h": {"tokens_created": recent_created, "tokens_rugged": recent_rugs},
        "operator_mappings": {"fingerprints": om_row[0], "wallets": om_row[1]},
        "sweep": get_sweep_stats(),
    }


@app.get("/admin/cartel-forensics/{deployer}", tags=["system"])
async def admin_cartel_forensics(deployer: str) -> dict:
    """Trigger forensic proof signals for a deployer (no full sweep needed)."""
    from .cartel_service import (
        _signal_profit_convergence,
        _signal_capital_recycling,
        _signal_temporal_fingerprint,
        _signal_compute_budget_fingerprint,
    )
    from .cartel_financial_service import signal_common_funder

    results = {}
    for name, fn, timeout in [
        ("profit_convergence", _signal_profit_convergence, 30),
        ("temporal_fingerprint", _signal_temporal_fingerprint, 30),
        ("compute_budget_fp", _signal_compute_budget_fingerprint, 60),
        ("common_funder", signal_common_funder, 120),
        ("capital_recycling", _signal_capital_recycling, 30),
    ]:
        try:
            count = await asyncio.wait_for(fn(deployer), timeout=timeout)
            results[name] = {"edges": count, "status": "ok"}
        except asyncio.TimeoutError:
            results[name] = {"edges": 0, "status": "timeout"}
        except Exception as exc:
            results[name] = {"edges": 0, "status": f"error: {exc}"}
    return {"deployer": deployer, "signals": results}


@app.get("/admin/memory-stats", tags=["system"])
async def admin_memory_stats() -> dict:
    """Return enrichment state of the agent memory system."""
    from .data_sources._clients import cache as _cache
    from .cache import SQLiteCache

    if not isinstance(_cache, SQLiteCache):
        return {"error": "memory requires SQLiteCache backend"}

    db = await _cache._get_conn()

    # Episodes
    cur = await db.execute("SELECT COUNT(*) FROM investigation_episodes")
    episode_count = (await cur.fetchone())[0]

    cur = await db.execute(
        "SELECT MIN(created_at), MAX(created_at) FROM investigation_episodes"
    )
    row = await cur.fetchone()
    oldest_ep = row[0]
    newest_ep = row[1]

    cur = await db.execute(
        "SELECT COUNT(*) FROM investigation_episodes WHERE model NOT LIKE 'heuristic%' AND is_latest = 1"
    )
    ai_episodes = (await cur.fetchone())[0]

    cur = await db.execute(
        "SELECT COUNT(DISTINCT deployer) FROM investigation_episodes WHERE deployer IS NOT NULL"
    )
    unique_deployers_ep = (await cur.fetchone())[0]

    cur = await db.execute(
        "SELECT COUNT(DISTINCT operator_fp) FROM investigation_episodes WHERE operator_fp IS NOT NULL"
    )
    unique_operators_ep = (await cur.fetchone())[0]

    # Entity knowledge
    cur = await db.execute(
        "SELECT entity_type, COUNT(*), ROUND(AVG(avg_risk_score),1), SUM(total_rugs) "
        "FROM entity_knowledge GROUP BY entity_type"
    )
    ek_rows = await cur.fetchall()
    entity_knowledge = {
        r[0]: {"count": r[1], "avg_risk": r[2], "total_rugs": r[3]}
        for r in ek_rows
    }

    # Campaign timelines
    cur = await db.execute("SELECT COUNT(*) FROM campaign_timelines")
    timeline_events = (await cur.fetchone())[0]

    # Calibration rules
    cur = await db.execute(
        "SELECT COUNT(*), SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) FROM calibration_rules"
    )
    cal_row = await cur.fetchone()
    calibration_total = cal_row[0]
    calibration_active = cal_row[1] or 0

    # Top deployers by episode count
    cur = await db.execute(
        "SELECT deployer, COUNT(*) as cnt, ROUND(AVG(risk_score),1) "
        "FROM investigation_episodes WHERE deployer IS NOT NULL "
        "GROUP BY deployer ORDER BY cnt DESC LIMIT 5"
    )
    top_deployers = [
        {"deployer": r[0][:16] + "...", "episodes": r[1], "avg_risk": r[2]}
        for r in await cur.fetchall()
    ]

    return {
        "episodes": {
            "total": episode_count,
            "ai_verdicts": ai_episodes,
            "heuristic_only": episode_count - ai_episodes,
            "unique_deployers": unique_deployers_ep,
            "unique_operators": unique_operators_ep,
            "oldest": oldest_ep,
            "newest": newest_ep,
        },
        "entity_knowledge": entity_knowledge,
        "campaign_timelines": timeline_events,
        "calibration_rules": {
            "total": calibration_total,
            "active": calibration_active,
        },
        "top_deployers": top_deployers,
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

    # Enforce daily scan limit (server-side)
    api_key = request.headers.get("X-API-Key", "")
    if api_key:
        from .data_sources._clients import cache as _cache_auth  # noqa: PLC0415
        _user = await verify_api_key(_cache_auth, api_key)
        if _user:
            await _enforce_daily_limit(_user, "scans", "scans_per_day")

    try:
        result = await asyncio.wait_for(
            detect_lineage(mint, force_refresh=force_refresh), timeout=ANALYSIS_TIMEOUT_SECONDS
        )
        # Record scan event for top-tokens ranking
        _qt = getattr(result, "query_token", None) or getattr(result, "root", None)
        asyncio.create_task(_record_scan_event(mint, _qt))

        # Warm cache: pre-compute heavy analyses in background so /investigate is fast
        _qt_warm = getattr(result, "query_token", None) or getattr(result, "root", None)
        _deployer = getattr(_qt_warm, "deployer", "") or ""
        if _deployer:
            asyncio.create_task(_warm_heavy_analyses(mint, _deployer))

        # Record memory episode from scan data (enriches agent memory on every scan)
        asyncio.create_task(_record_scan_episode(mint, result))

        return result
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


async def _warm_heavy_analyses(mint: str, deployer: str):
    """Pre-compute bundle, sol_flow, cartel in background for fast /investigate.

    These are the 3 heaviest analyses (10-60s each). By running them here
    (fire-and-forget after /lineage returns), the /investigate pipeline
    finds them already cached and completes in 5-7s instead of 20-40s.
    """
    try:
        from .bundle_tracker_service import analyze_bundle, get_cached_bundle_report
        from .sol_flow_service import trace_sol_flow, get_sol_flow_report
        from .cartel_service import compute_cartel_report

        async def _safe_bundle():
            # Skip if already cached
            cached = await get_cached_bundle_report(mint)
            if cached:
                return
            try:
                await asyncio.wait_for(analyze_bundle(mint, deployer), timeout=150.0)
            except Exception:
                pass

        async def _safe_sol_flow():
            cached = await get_sol_flow_report(mint)
            if cached:
                return
            try:
                await asyncio.wait_for(trace_sol_flow(mint, deployer), timeout=90.0)
            except Exception:
                pass

        async def _safe_cartel():
            try:
                await asyncio.wait_for(compute_cartel_report(mint, deployer), timeout=45.0)
            except Exception:
                pass

        async def _safe_operator():
            try:
                from .metadata_dna_service import build_operator_fingerprint
                await asyncio.wait_for(build_operator_fingerprint(deployer), timeout=30.0)
            except Exception:
                pass

        async def _safe_factory():
            try:
                from .factory_service import analyze_factory_rhythm
                await asyncio.wait_for(analyze_factory_rhythm(deployer), timeout=20.0)
            except Exception:
                pass

        await asyncio.gather(
            _safe_bundle(),
            _safe_sol_flow(),
            _safe_cartel(),
            _safe_operator(),
            _safe_factory(),
            return_exceptions=True,
        )
        logger.info("[warm] pre-computed bundle/sol_flow/cartel/operator/factory for %s", mint[:12])

        # Invalidate lineage cache so next /lineage call re-assembles with warm results
        try:
            from .data_sources._clients import cache_delete_prefix
            await cache_delete_prefix(f"lineage_v5:{mint}")
        except Exception:
            pass
    except Exception as exc:
        logger.debug("[warm] failed for %s: %s", mint[:12], exc)


async def _record_scan_episode(mint: str, result: Any) -> None:
    """Record a memory episode from a /lineage scan (fire-and-forget).

    Builds a heuristic verdict from the scan data so the agent memory
    accumulates intelligence on every scan, not just full investigations.
    """
    try:
        from .memory_service import record_episode
        from .ai_analyst import _heuristic_score

        # Convert LineageResult to dict for signal extraction
        scan_dict = result.model_dump(mode="json") if hasattr(result, "model_dump") else {}

        # Compute heuristic risk score from available signals
        hscore = 0
        try:
            hscore = _heuristic_score(
                scan_dict,
                scan_dict.get("bundle_report"),
                scan_dict.get("sol_flow"),
            )
        except Exception:
            pass

        # Determine risk pattern from signals
        pattern = "minimal_risk"
        if hscore >= 75:
            pattern = "high_risk_signals"
        elif hscore >= 50:
            pattern = "moderate_risk_signals"
        elif hscore >= 25:
            pattern = "low_risk_signals"

        # Build a synthetic verdict dict
        deployer = ""
        root = scan_dict.get("root") or scan_dict.get("query_token") or {}
        deployer = root.get("deployer", "")

        # Operator fingerprint
        op = scan_dict.get("operator_fingerprint") or {}
        operator_fp = op.get("fingerprint", "") if isinstance(op, dict) else ""

        # Cartel community
        cr = scan_dict.get("cartel_report") or {}
        dc = cr.get("deployer_community") or {}
        community_id = dc.get("community_id", "") if isinstance(dc, dict) else ""

        verdict = {
            "risk_score": hscore,
            "confidence": "low",  # heuristic-only, not AI-verified
            "rug_pattern": pattern,
            "verdict_summary": f"Heuristic scan: {hscore}/100 ({pattern})",
            "conviction_chain": "",
            "key_findings": [],
            "model": "heuristic",
        }

        await record_episode(
            mint=mint,
            verdict=verdict,
            scan_data=scan_dict,
            deployer=deployer or None,
            operator_fp=operator_fp or None,
            community_id=community_id or None,
        )
    except Exception as exc:
        logger.debug("[memory] scan episode failed for %s: %s", mint[:12], exc)


async def _record_scan_event(mint: str, token_meta: Any) -> None:
    """Record a user scan event so top-tokens reflects actual usage."""
    try:
        from .data_sources._clients import event_insert
        await event_insert(
            event_type="token_scanned",
            mint=mint,
            name=getattr(token_meta, "name", "") or "",
            symbol=getattr(token_meta, "symbol", "") or "",
            deployer=getattr(token_meta, "deployer", "") or "",
            mcap_usd=getattr(token_meta, "market_cap_usd", None),
            narrative=getattr(token_meta, "narrative", None) if hasattr(token_meta, "narrative") else None,
            created_at=str(getattr(token_meta, "created_at", "")) if getattr(token_meta, "created_at", None) else None,
        )
    except Exception:
        pass  # best-effort, never fail the main request


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
    """Push alerts to connected clients.

    If ``?key=<API_KEY>`` is provided, alerts are scoped to the user.
    Without a key, the client receives global broadcasts (graduations, etc.).
    """
    api_key = websocket.query_params.get("key", "")
    user_id: int = 0  # 0 = anonymous / global broadcast receiver
    if api_key:
        from .data_sources._clients import cache as _cache  # noqa: PLC0415
        user = await verify_api_key(_cache, api_key)
        if user is not None:
            user_id = user["id"]
    await websocket.accept()
    register_web_client(websocket, user_id)
    logger.info("Alert client connected (user=%s)", user_id)

    # Server-side keep-alive: send "ping" every 15s so the Fly.io proxy
    # sees outgoing traffic and doesn't close the connection.
    # This runs in parallel with the receive loop below.
    ping_alive = True

    async def _server_ping_loop():
        # Send FIRST ping immediately (within 1s of connect) to establish
        # bidirectional traffic before Fly.io proxy can timeout
        await asyncio.sleep(1)
        while ping_alive:
            try:
                await websocket.send_text("ping")
            except Exception:
                break
            await asyncio.sleep(10)  # every 10s to stay well under Fly's timeout

    ping_task = asyncio.create_task(_server_ping_loop())

    try:
        while True:
            try:
                msg = await asyncio.wait_for(websocket.receive_text(), timeout=60)
                if msg.strip().lower() == "ping":
                    await websocket.send_text("pong")
            except asyncio.TimeoutError:
                # 60s with no message at all — client is truly gone
                break
    except WebSocketDisconnect:
        logger.info("Browser alert client disconnected")
    except Exception:
        logger.exception("WebSocket alert error")
    finally:
        ping_alive = False
        ping_task.cancel()
        unregister_web_client(websocket)
        try:
            await websocket.close()
        except Exception:
            pass



# ------------------------------------------------------------------
# WebSocket: OpenClaw Gateway (managed, auto-connect for all users)
# ------------------------------------------------------------------


@app.websocket("/ws/openclaw")
async def ws_openclaw(websocket: WebSocket):
    """OpenClaw-compatible WebSocket gateway.

    Auth via query param: ``?key=<API_KEY>``
    Implements: connect, cron.list, cron.add, cron.remove, node.register
    Pushes: connect.challenge, node.invoke, alert, cron.result
    """
    from .data_sources._clients import cache as _cache  # noqa: PLC0415
    await handle_openclaw_ws(websocket, _cache)


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

        # 2. Deployer profile
        _deployer_addr = _analysis_deployer_from_lineage(lineage_res)
        yield _evt("step", {"step": "deployer", "status": "running"})
        _td = _time.monotonic()
        try:
            if _deployer_addr:
                await asyncio.wait_for(compute_deployer_profile(_deployer_addr), timeout=15.0)
        except Exception as _dep_exc:
            logger.warning("[stream] deployer failed for %s: %s", mint[:12], _dep_exc)
        yield _evt("step", {"step": "deployer", "status": "done", "ms": int((_time.monotonic() - _td) * 1000)})

        # 3. Cartel detection
        yield _evt("step", {"step": "cartel", "status": "running"})
        _tc = _time.monotonic()
        try:
            if _deployer_addr:
                await asyncio.wait_for(compute_cartel_report(mint, _deployer_addr), timeout=15.0)
        except Exception as _cartel_exc:
            logger.warning("[stream] cartel failed for %s: %s", mint[:12], _cartel_exc)
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
# Unified Investigation — tier-adaptive SSE endpoint
# ------------------------------------------------------------------

@app.post(
    "/investigate/{mint}",
    tags=["lineage"],
    summary="Tier-adaptive investigation with SSE progress events",
)
@limiter.limit("6/minute")
async def investigate_token(
    request: Request,
    mint: str,
) -> EventSourceResponse:
    """Unified investigation endpoint. Adapts depth based on user tier:
    - Free: forensic pipeline → heuristic score
    - Pro: pipeline + single-shot AI verdict
    - Pro+/Whale: pipeline + autonomous agent multi-turn

    The investigation runs server-side to completion even if the client
    disconnects (SSE stream closes).  The verdict is always persisted to
    the ``investigations`` table and a FCM push is sent on completion so
    offline users are notified.
    """
    if not _BASE58_RE.match(mint):
        raise HTTPException(status_code=400, detail="Invalid Solana mint address")

    from .investigate_service import run_investigation
    from .subscription_tiers import get_limits

    # Resolve user tier from API key (default to free)
    api_key = request.headers.get("X-API-Key", "")
    user_plan = "free"
    user_id = None
    if api_key:
        from .data_sources._clients import cache as _cache
        user = await verify_api_key(_cache, api_key)
        if user:
            user_plan = user.get("plan", "free")
            user_id = user.get("id")

    tier = get_limits(user_plan)

    from .data_sources._clients import cache as _cache

    # Check scan quota / credits before running the pipeline
    from .scan_credit_service import can_scan, deduct_scan_credit
    from .usage_service import increment_usage, check_limit
    if user_id:
        allowed, source = await can_scan(_cache, user_id, user_plan)
        if not allowed:
            raise HTTPException(
                status_code=429,
                detail="Daily scan limit reached. Purchase scan credits to continue." if source == "no_credits" else "Daily scan limit reached.",
            )
        # Enforce daily investigate limit
        inv_limit = tier.investigate_daily_limit
        if inv_limit != float("inf"):
            inv_allowed = await check_limit(_cache, user_id, "investigate", int(inv_limit))
            if not inv_allowed:
                raise HTTPException(status_code=429, detail="Daily investigation limit reached")
        # Deduct credit if using credits, increment daily usage otherwise
        if source == "credit":
            await deduct_scan_credit(_cache, user_id)
        await increment_usage(_cache, user_id, "scans")
        await increment_usage(_cache, user_id, "investigate")

    # Shared mutable state between the background task and the SSE generator.
    # The background task produces events into _event_queue; the generator
    # consumes and yields them to the client.  If the client disconnects the
    # background task keeps running — verdict is still stored + FCM push sent.
    _event_queue: asyncio.Queue[dict | None] = asyncio.Queue()

    async def _background_investigation():
        """Run the full investigation in the background, pushing events to the queue."""
        import json as _json
        try:
            async for event in run_investigation(
                mint, tier=tier, cache=_cache, user_id=user_id,
                # NOTE: no is_disconnected — investigation runs to completion
                session_id=request.headers.get("X-Session-ID") or None,
            ):
                await _event_queue.put(event)
                # Record scan event with identity data from pipeline
                if event.get("event") == "identity_ready":
                    _id_data = _json.loads(event["data"]) if isinstance(event.get("data"), str) else event.get("data", {})
                    asyncio.create_task(_record_scan_event(
                        mint, type("_", (), {
                            "name": _id_data.get("name", ""),
                            "symbol": _id_data.get("symbol", ""),
                            "deployer": _id_data.get("deployer", ""),
                            "market_cap_usd": None,
                            "created_at": _id_data.get("created_at"),
                        })(),
                    ))
                # Store verdict + notify via FCM
                ev_type = event.get("event", "") if isinstance(event, dict) else ""
                if user_id and ev_type == "verdict":
                    ev_data = event.get("data", "")
                    verdict_dict = _json.loads(ev_data) if isinstance(ev_data, str) else ev_data
                    if isinstance(verdict_dict, dict):
                        asyncio.create_task(
                            _store_investigation(_cache, user_id, mint, verdict_dict)
                        )
                        asyncio.create_task(
                            _notify_investigation_complete(user_id, mint, verdict_dict)
                        )
        except Exception as exc:
            logger.exception("[investigate] background error for %s", mint[:12])
            await _event_queue.put({
                "event": "error",
                "data": _json.dumps({"detail": f"Investigation failed: {type(exc).__name__}", "recoverable": False}),
            })
        finally:
            await _event_queue.put(None)  # sentinel — signals end of stream

    # Start the investigation immediately; it will outlive the SSE connection
    bg_task = asyncio.create_task(_background_investigation())

    async def _generator():
        """Yield events from the background task to the SSE stream."""
        try:
            while True:
                event = await _event_queue.get()
                if event is None:
                    break
                yield event
        except asyncio.CancelledError:
            # Client disconnected — background task keeps running
            logger.info("[investigate] SSE client disconnected for %s — investigation continues in background", mint[:12])

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
    _skip_limit: bool = False,
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

    # Enforce daily AI chat limit (skipped when called from investigate_chat)
    if not _skip_limit:
        api_key = request.headers.get("X-API-Key", "")
        if api_key:
            from .data_sources._clients import cache as _cache  # noqa: PLC0415
            user = await verify_api_key(_cache, api_key)
            if user:
                await _enforce_daily_limit(user, "ai_chat", "ai_chat_daily_limit")

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


@app.post(
    "/investigate/{mint}/chat",
    tags=["lineage"],
    summary="Follow-up chat within an investigation context (delegates to /chat/{mint})",
)
@limiter.limit("20/minute")
async def investigate_chat(
    request: Request,
    mint: str,
    body: ChatRequest,
) -> EventSourceResponse:
    """Follow-up chat within an investigation — enforces investigate_chat limit."""
    # Enforce investigate chat limit (separate from ai_chat)
    api_key = request.headers.get("X-API-Key", "")
    if api_key:
        from .data_sources._clients import cache as _cache  # noqa: PLC0415
        user = await verify_api_key(_cache, api_key)
        if user:
            await _enforce_daily_limit(user, "investigate_chat", "investigate_chat_daily_limit")
    return await forensic_chat(request, mint, body, _skip_limit=True)


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

    # Enforce daily AI chat limit
    api_key = request.headers.get("X-API-Key", "")
    if api_key:
        from .data_sources._clients import cache as _cache  # noqa: PLC0415
        user = await verify_api_key(_cache, api_key)
        if user:
            await _enforce_daily_limit(user, "ai_chat", "ai_chat_daily_limit")

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
# Auth — Phase 1 (Privy-based API keys)
# ---------------------------------------------------------------------------

class _LoginRequest(BaseModel):
    privy_id: str
    wallet_address: Optional[str] = None
    email: Optional[str] = None


class _WatchRequest(BaseModel):
    sub_type: str  # e.g. "deployer", "mint"
    value: str     # address


class _CartelMonitorRequest(BaseModel):
    cartel_id: str = ""


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


async def _enforce_daily_limit(user: dict, counter_key: str, limit_attr: str) -> None:
    """Check + increment daily usage counter. Raises 429 if limit exceeded."""
    from .data_sources._clients import cache as _cache  # noqa: PLC0415
    from .subscription_tiers import get_limits  # noqa: PLC0415
    from .usage_service import check_limit, increment_usage  # noqa: PLC0415

    limits = get_limits(user.get("plan", "free"))
    daily_limit = getattr(limits, limit_attr, 0)
    if daily_limit == 0:
        raise HTTPException(status_code=403, detail=f"Your plan does not include this feature")
    if daily_limit != float("inf"):
        allowed = await check_limit(_cache, user["id"], counter_key, int(daily_limit))
        if not allowed:
            raise HTTPException(status_code=429, detail=f"Daily {counter_key.replace('_', ' ')} limit reached")
    await increment_usage(_cache, user["id"], counter_key)


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
        logger.exception("auth_login failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"User creation failed: {exc}") from exc
    # Sync OpenClaw crons for this user (watch crons + briefing)
    from .cron_manager import sync_all_user_crons  # noqa: PLC0415
    asyncio.create_task(
        sync_all_user_crons(_cache, user["id"], user.get("plan", "free")),
        name=f"login_cron_sync_{user['id']}",
    )

    return {
        "id": user["id"],
        "privy_id": user["privy_id"],
        "wallet_address": user["wallet_address"],
        "email": user["email"],
        "plan": user["plan"],
        "api_key": user["api_key"],
    }


@app.post("/auth/admin/upgrade", tags=["auth"])
async def auth_admin_upgrade(request: Request):
    """Upgrade a user's plan. Requires admin secret in X-Admin-Secret header."""
    import os
    admin_secret = os.environ.get("ADMIN_SECRET", "")
    if not admin_secret or request.headers.get("X-Admin-Secret") != admin_secret:
        raise HTTPException(status_code=403, detail="Forbidden")
    body = await request.json()
    email = body.get("email")
    plan = body.get("plan")
    if not email or not plan:
        raise HTTPException(status_code=422, detail="email and plan required")
    from .data_sources._clients import cache as _cache
    db = await _cache._get_conn()
    cursor = await db.execute("SELECT id FROM users WHERE email = ?", (email,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    from .auth_service import upgrade_user_plan
    logger.info("admin upgrade: user_id=%s email=%s plan=%s", row[0], email, plan)
    try:
        ok = await upgrade_user_plan(_cache, row[0], plan)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Upgrade failed: {exc}") from exc
    if not ok:
        raise HTTPException(status_code=400, detail=f"Invalid plan: {plan!r} for user_id={row[0]}")
    return {"email": email, "plan": plan, "upgraded": True}


@app.get("/auth/me", tags=["auth"])
async def auth_me(request: Request):
    """Return current user info + daily usage counters. Requires X-API-Key header."""
    user = await _get_current_user(request)
    from .data_sources._clients import cache as _cache  # noqa: PLC0415
    from .usage_service import get_usage  # noqa: PLC0415
    uid = user["id"]
    usage = {
        "scans": await get_usage(_cache, uid, "scans"),
        "ai_chat": await get_usage(_cache, uid, "ai_chat"),
        "agent": await get_usage(_cache, uid, "agent"),
        "investigate": await get_usage(_cache, uid, "investigate"),
        "investigate_chat": await get_usage(_cache, uid, "investigate_chat"),
    }
    return {
        "id": uid,
        "privy_id": user["privy_id"],
        "wallet_address": user["wallet_address"],
        "email": user["email"],
        "plan": user["plan"],
        "username": user.get("username"),
        "display_name": user.get("display_name"),
        "avatar_url": user.get("avatar_url"),
        "created_at": user.get("created_at"),
        "usage": usage,
    }


@app.patch("/auth/profile", tags=["auth"])
async def auth_update_profile(request: Request):
    """Update user profile (username, display_name, avatar_url). Requires X-API-Key."""
    user = await _get_current_user(request)
    body = await request.json()
    from .data_sources._clients import cache as _cache  # noqa: PLC0415
    from .auth_service import update_user_profile  # noqa: PLC0415
    try:
        updated = await update_user_profile(_cache, user["id"], body)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if updated is None:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    return {
        "id": updated["id"],
        "privy_id": updated["privy_id"],
        "wallet_address": updated["wallet_address"],
        "email": updated["email"],
        "plan": updated["plan"],
        "username": updated.get("username"),
        "display_name": updated.get("display_name"),
        "avatar_url": updated.get("avatar_url"),
        "created_at": updated.get("created_at"),
    }


@app.post("/auth/regenerate-key", tags=["auth"])
async def auth_regenerate_key(request: Request):
    """Regenerate the user's API key, invalidating the old one."""
    user = await _get_current_user(request)
    from .data_sources._clients import cache as _cache  # noqa: PLC0415
    from .auth_service import regenerate_api_key  # noqa: PLC0415
    new_key = await regenerate_api_key(_cache, user["id"])
    if not new_key:
        raise HTTPException(status_code=500, detail="Key regeneration failed")
    return {"api_key": new_key}


class _FcmTokenRequest(BaseModel):
    fcm_token: str


@app.put("/auth/fcm-token", tags=["auth"])
async def auth_register_fcm_token(body: _FcmTokenRequest, request: Request):
    """Register or update the user's FCM device token for push notifications."""
    user = await _get_current_user(request)
    from .data_sources._clients import cache as _cache  # noqa: PLC0415
    from .auth_service import register_fcm_token  # noqa: PLC0415
    ok = await register_fcm_token(_cache, user["id"], body.fcm_token)
    if not ok:
        raise HTTPException(status_code=400, detail="Invalid FCM token")
    return {"ok": True}


@app.delete("/auth/fcm-token", tags=["auth"])
async def auth_deregister_fcm_token(request: Request):
    """Clear the user's FCM token (logout / uninstall). Prevents stale pushes."""
    user = await _get_current_user(request)
    from .data_sources._clients import cache as _cache  # noqa: PLC0415
    db = await _cache._get_conn()
    await db.execute("UPDATE users SET fcm_token = NULL WHERE id = ?", (user["id"],))
    await db.commit()
    return {"ok": True}


@app.get("/auth/watches", tags=["auth"])
async def auth_watches(request: Request):
    """Return user's watches. Requires X-API-Key header."""
    user = await _get_current_user(request)
    from .data_sources._clients import cache as _cache  # noqa: PLC0415
    watches = await get_user_watches(_cache, user["id"])
    return {"watches": watches}


@app.post("/auth/watches", tags=["auth"])
async def auth_add_watch(body: _WatchRequest, request: Request):
    """Add a watch for the current user. Requires X-API-Key header.

    For mint watches, triggers an immediate background scan so the user
    sees baseline data within seconds instead of waiting 45min.
    """
    user = await _get_current_user(request)
    from .data_sources._clients import cache as _cache  # noqa: PLC0415
    from .subscription_tiers import get_limits  # noqa: PLC0415
    from .usage_service import get_usage, increment_usage  # noqa: PLC0415

    plan = user.get("plan", "free")
    limits = get_limits(plan)

    # Enforce max watchlist size
    current_watches = await get_user_watches(_cache, user["id"])
    if len(current_watches) >= limits.max_watchlist:
        raise HTTPException(
            status_code=403,
            detail=f"Watchlist limit reached ({limits.max_watchlist} max for your plan)",
        )

    # Anti-abuse: daily add limit (prevents rotate-to-bypass)
    _MAX_DAILY_ADDS = {"free": 2, "pro": 6, "elite": 12}
    adds_today = await get_usage(_cache, user["id"], "watch_adds")
    max_adds = _MAX_DAILY_ADDS.get(plan, 2)
    if adds_today >= max_adds:
        raise HTTPException(
            status_code=429,
            detail=f"Daily watchlist add limit reached ({max_adds}/day)",
        )

    watch = await add_user_watch(_cache, user["id"], body.sub_type, body.value)
    if watch is None:
        raise HTTPException(status_code=409, detail="Watch already exists")

    await increment_usage(_cache, user["id"], "watch_adds")

    # Trigger immediate background scan for mint watches
    if body.sub_type == "mint" and watch.get("id"):
        async def _initial_scan():
            try:
                from .watchlist_monitor_service import run_single_rescan
                await asyncio.wait_for(
                    run_single_rescan(watch["id"], user["id"], _cache, plan=plan),
                    timeout=30.0,
                )
                logger.info("[watch] initial scan completed for %s", body.value[:12])
            except Exception as exc:
                logger.debug("[watch] initial scan failed for %s: %s", body.value[:12], exc)
        asyncio.create_task(_initial_scan(), name=f"initial_scan_{body.value[:8]}")

    # Create OpenClaw cron for this watch (server-managed)
    from .cron_manager import ensure_watch_cron  # noqa: PLC0415
    asyncio.create_task(
        ensure_watch_cron(_cache, user["id"], watch, plan=plan),
        name=f"cron_create_{watch.get('id', '')}",
    )

    return watch


@app.delete("/auth/watches/{watch_id}", tags=["auth"])
async def auth_remove_watch(watch_id: int, request: Request):
    """Delete a watch by id. Requires X-API-Key header."""
    user = await _get_current_user(request)
    from .data_sources._clients import cache as _cache  # noqa: PLC0415
    deleted = await remove_user_watch(_cache, user["id"], watch_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Watch not found")

    # Remove the associated OpenClaw cron + clean up flags
    from .cron_manager import remove_watch_cron  # noqa: PLC0415

    async def _cleanup_watch():
        try:
            await remove_watch_cron(_cache, user["id"], watch_id)
            # Delete sweep flags for this watch so they don't linger in the UI
            db = await _cache._get_conn()
            await db.execute(
                "DELETE FROM sweep_flags WHERE watch_id = ? AND user_id = ?",
                (watch_id, user["id"]),
            )
            await db.commit()
        except Exception:
            pass

    asyncio.create_task(_cleanup_watch(), name=f"cleanup_watch_{watch_id}")

    return {"deleted": True}


# ---------------------------------------------------------------------------
# Cartel monitors — CRUD for per-user cartel monitoring
# ---------------------------------------------------------------------------

@app.post("/auth/cartel-monitors", tags=["auth"])
async def auth_add_cartel_monitor(body: _CartelMonitorRequest, request: Request):
    """Start monitoring a cartel community. Requires X-API-Key header."""
    if not body.cartel_id:
        raise HTTPException(status_code=400, detail="cartel_id is required")
    user = await _get_current_user(request)
    from .data_sources._clients import cache as _cache  # noqa: PLC0415
    db = await _cache._get_conn()
    # Check if already monitoring
    cursor = await db.execute(
        "SELECT id FROM user_watches WHERE user_id = ? AND sub_type = 'cartel' AND value = ?",
        (user["id"], body.cartel_id),
    )
    if await cursor.fetchone():
        return {"status": "already_monitoring"}
    import time as _time  # noqa: PLC0415
    await db.execute(
        "INSERT INTO user_watches (user_id, sub_type, value, created_at) VALUES (?, 'cartel', ?, ?)",
        (user["id"], body.cartel_id, _time.time()),
    )
    await db.commit()
    return {"status": "monitoring_started", "cartel_id": body.cartel_id}


@app.get("/auth/cartel-monitors", tags=["auth"])
async def auth_cartel_monitors(request: Request):
    """List cartel monitors for the current user. Requires X-API-Key header."""
    user = await _get_current_user(request)
    from .data_sources._clients import cache as _cache  # noqa: PLC0415
    db = await _cache._get_conn()
    cursor = await db.execute(
        "SELECT value FROM user_watches WHERE user_id = ? AND sub_type = 'cartel' ORDER BY created_at DESC",
        (user["id"],),
    )
    rows = await cursor.fetchall()
    return [{"cartel_id": r[0]} for r in rows]


@app.delete("/auth/cartel-monitors/{cartel_id}", tags=["auth"])
async def auth_remove_cartel_monitor(cartel_id: str, request: Request):
    """Stop monitoring a cartel. Requires X-API-Key header."""
    user = await _get_current_user(request)
    from .data_sources._clients import cache as _cache  # noqa: PLC0415
    db = await _cache._get_conn()
    cursor = await db.execute(
        "DELETE FROM user_watches WHERE user_id = ? AND sub_type = 'cartel' AND value = ?",
        (user["id"], cartel_id),
    )
    await db.commit()
    if cursor.rowcount == 0:
        raise HTTPException(status_code=404, detail="Cartel monitor not found")
    return {"status": "monitoring_stopped"}


# ---------------------------------------------------------------------------
# Anomaly alerts — proactive deviation detection
# ---------------------------------------------------------------------------

@app.get("/auth/anomalies", tags=["intelligence"])
async def auth_anomalies(request: Request):
    """Return active anomaly alerts for entities the user has investigated.

    Returns alerts for deployers/operators where unusual behavior was detected
    (velocity spikes, risk jumps, extraction spikes, rug rate inflections).
    """
    user = await _get_current_user(request)
    from .data_sources._clients import cache as _cache  # noqa: PLC0415
    from .cache import SQLiteCache  # noqa: PLC0415
    if not isinstance(_cache, SQLiteCache):
        return []
    db = await _cache._get_conn()
    cursor = await db.execute(
        "SELECT entity_type, entity_id, anomaly_type, severity, "
        "baseline_value, current_value, description, created_at "
        "FROM anomaly_alerts WHERE resolved = 0 "
        "ORDER BY created_at DESC LIMIT 20",
    )
    rows = await cursor.fetchall()
    return [
        {
            "entity_type": r[0], "entity_id": r[1],
            "anomaly_type": r[2], "severity": r[3],
            "baseline": r[4], "current": r[5],
            "description": r[6],
            "age_hours": round((time.time() - r[7]) / 3600, 1),
        }
        for r in rows
    ]


@app.get("/auth/anomalies/{entity_id}", tags=["intelligence"])
async def auth_anomalies_for_entity(entity_id: str, request: Request):
    """Return active anomaly alerts for a specific deployer or operator."""
    await _get_current_user(request)
    from .data_sources._clients import cache as _cache  # noqa: PLC0415
    from .cache import SQLiteCache  # noqa: PLC0415
    if not isinstance(_cache, SQLiteCache):
        return []
    db = await _cache._get_conn()
    cursor = await db.execute(
        "SELECT entity_type, anomaly_type, severity, "
        "baseline_value, current_value, description, created_at "
        "FROM anomaly_alerts WHERE entity_id = ? AND resolved = 0 "
        "ORDER BY created_at DESC LIMIT 10",
        (entity_id,),
    )
    rows = await cursor.fetchall()
    return [
        {
            "entity_type": r[0], "anomaly_type": r[1], "severity": r[2],
            "baseline": r[3], "current": r[4],
            "description": r[5],
            "age_hours": round((time.time() - r[6]) / 3600, 1),
        }
        for r in rows
    ]


# ---------------------------------------------------------------------------
# Narrative clusters — cross-deployer thematic wave detection
# ---------------------------------------------------------------------------

@app.get("/narrative-clusters", tags=["intelligence"])
async def get_narrative_clusters():
    """Return active narrative clusters (coordinated thematic waves).

    No auth required — public intelligence data.
    """
    from .data_sources._clients import cache as _cache  # noqa: PLC0415
    from .cache import SQLiteCache  # noqa: PLC0415
    if not isinstance(_cache, SQLiteCache):
        return []
    db = await _cache._get_conn()
    cursor = await db.execute(
        "SELECT narrative_key, deployer_count, token_count, avg_risk_score, "
        "window_start, window_end, created_at "
        "FROM narrative_clusters WHERE active = 1 "
        "ORDER BY deployer_count DESC LIMIT 20",
    )
    rows = await cursor.fetchall()
    return [
        {
            "narrative": r[0], "deployer_count": r[1], "token_count": r[2],
            "avg_risk_score": r[3],
            "window_hours": round((r[5] - r[4]) / 3600, 1),
            "age_hours": round((time.time() - r[6]) / 3600, 1),
        }
        for r in rows
    ]


# ---------------------------------------------------------------------------
# Wallet connect pages — served to in-app browsers (Phantom, Solflare, Backpack)
# ---------------------------------------------------------------------------

_WALLET_CONNECT_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Lineage Agent — Connect {wallet_name}</title>
<style>
  *{{margin:0;padding:0;box-sizing:border-box}}
  body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
    background:#020617;color:#fff;display:flex;align-items:center;justify-content:center;
    min-height:100vh;padding:24px}}
  .card{{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);
    border-radius:24px;padding:40px 28px;max-width:380px;width:100%;text-align:center}}
  .icon{{width:64px;height:64px;border-radius:18px;background:{wallet_bg};
    display:flex;align-items:center;justify-content:center;margin:0 auto 20px;
    font-size:28px;font-weight:700;color:{wallet_color}}}
  h1{{font-size:22px;font-weight:600;margin-bottom:8px}}
  p{{font-size:14px;color:rgba(255,255,255,.5);line-height:1.6;margin-bottom:28px}}
  .btn{{display:block;width:100%;padding:16px;border-radius:999px;border:none;
    background:linear-gradient(135deg,#091A7A,#4F8EFF);color:#fff;font-size:16px;
    font-weight:600;cursor:pointer;letter-spacing:.3px}}
  .btn:disabled{{opacity:.5;cursor:not-allowed}}
  .status{{margin-top:16px;font-size:13px;color:rgba(255,255,255,.4)}}
  .error{{color:#FF3366}}
</style>
</head>
<body>
<div class="card">
  <div class="icon">{wallet_letter}</div>
  <h1>Connect {wallet_name}</h1>
  <p>Authorize Lineage Agent to view your public wallet address. No funds access required.</p>
  <button class="btn" id="connectBtn" onclick="connectWallet()">Connect Wallet</button>
  <div class="status" id="status"></div>
</div>
<script>
const WALLET = '{wallet_id}';
const API_BASE = window.location.origin;

async function connectWallet() {{
  const btn = document.getElementById('connectBtn');
  const status = document.getElementById('status');
  btn.disabled = true;
  status.textContent = 'Connecting...';
  status.className = 'status';

  try {{
    let provider;
    if (WALLET === 'phantom' && window.phantom?.solana) {{
      provider = window.phantom.solana;
    }} else if (WALLET === 'solflare' && window.solflare) {{
      provider = window.solflare;
    }} else if (WALLET === 'backpack' && window.backpack) {{
      provider = window.backpack;
    }} else if (window.solana) {{
      provider = window.solana;
    }}

    if (!provider) {{
      status.textContent = 'Wallet not detected. Please open this page in your wallet browser.';
      status.className = 'status error';
      btn.disabled = false;
      return;
    }}

    const resp = await provider.connect();
    const pubkey = resp.publicKey.toString();
    status.textContent = 'Wallet connected: ' + pubkey.slice(0, 4) + '...' + pubkey.slice(-4);

    // Register with backend
    const res = await fetch(API_BASE + '/auth/login', {{
      method: 'POST',
      headers: {{'Content-Type': 'application/json'}},
      body: JSON.stringify({{
        privy_id: 'wallet:' + pubkey,
        wallet_address: pubkey,
      }}),
    }});
    const data = await res.json();

    if (data.api_key) {{
      status.textContent = 'Authenticated! Redirecting...';
      // Redirect back to app via deep link
      window.location.href = 'lineage://activate?key=' + encodeURIComponent(data.api_key);
    }} else {{
      status.textContent = 'Authentication failed. Please try again.';
      status.className = 'status error';
      btn.disabled = false;
    }}
  }} catch (err) {{
    status.textContent = err.message || 'Connection failed';
    status.className = 'status error';
    btn.disabled = false;
  }}
}}

// Auto-connect if wallet injects provider after page load
setTimeout(connectWallet, 800);
</script>
</body>
</html>"""


@app.get("/auth/phantom", tags=["auth"], response_class=HTMLResponse)
async def auth_phantom_page():
    """Wallet connect page for Phantom — opened in Phantom's in-app browser."""
    return HTMLResponse(_WALLET_CONNECT_HTML.format(
        wallet_name="Phantom",
        wallet_id="phantom",
        wallet_letter="P",
        wallet_color="#AB9FF2",
        wallet_bg="rgba(171,159,242,.15)",
    ))


@app.get("/auth/solflare", tags=["auth"], response_class=HTMLResponse)
async def auth_solflare_page():
    """Wallet connect page for Solflare — opened in Solflare's in-app browser."""
    return HTMLResponse(_WALLET_CONNECT_HTML.format(
        wallet_name="Solflare",
        wallet_id="solflare",
        wallet_letter="S",
        wallet_color="#FC7227",
        wallet_bg="rgba(252,114,39,.15)",
    ))


@app.get("/auth/backpack", tags=["auth"], response_class=HTMLResponse)
async def auth_backpack_page():
    """Wallet connect page for Backpack — opened in Backpack's in-app browser."""
    return HTMLResponse(_WALLET_CONNECT_HTML.format(
        wallet_name="Backpack",
        wallet_id="backpack",
        wallet_letter="B",
        wallet_color="#E33E3F",
        wallet_bg="rgba(227,62,63,.15)",
    ))


# ---------------------------------------------------------------------------
# Scan credits (pay-per-scan)
# ---------------------------------------------------------------------------

@app.get("/credits", tags=["credits"])
async def get_credits(request: Request):
    """Return scan credit balance and available packs."""
    user = await _get_current_user(request)
    from .data_sources._clients import cache as _cache
    from .scan_credit_service import get_scan_credits, CREDIT_PACKS
    balance = await get_scan_credits(_cache, user["id"])
    return {
        "credits": balance,
        "packs": [
            {"key": k, **v} for k, v in CREDIT_PACKS.items()
        ],
    }


@app.post("/credits/purchase", tags=["credits"])
async def purchase_credits(request: Request):
    """Add scan credits after payment verification.

    Body: {"pack": "single"|"five_pack"|"fifteen_pack", "tx_signature": "..."}
    """
    user = await _get_current_user(request)
    body = await request.json()
    pack_key = body.get("pack", "")
    tx_sig = body.get("tx_signature", "")

    from .scan_credit_service import CREDIT_PACKS, add_scan_credits
    from .data_sources._clients import cache as _cache

    pack = CREDIT_PACKS.get(pack_key)
    if not pack:
        raise HTTPException(status_code=400, detail=f"Unknown pack: {pack_key}")
    if not tx_sig:
        raise HTTPException(status_code=400, detail="tx_signature required")

    # TODO: verify on-chain transaction via Helio webhook or RPC
    # For now, trust the client — will be replaced with Helio webhook verification
    new_balance = await add_scan_credits(_cache, user["id"], pack["credits"])
    logger.info("credits/purchase: user=%s pack=%s +%d → %d (tx=%s)",
                user["id"], pack_key, pack["credits"], new_balance, tx_sig[:20])
    return {"credits": new_balance, "added": pack["credits"]}


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
    # Include dead_token with moderate+ evidence (tokens that lost 50%+ liquidity)
    accepted = {"dex_liquidity_rug", "pre_dex_extraction_rug", "liquidity_drain_rug", "dead_token"}
    if mechanism not in accepted:
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
# /graduations  — recent Pump.fun DEX graduations (from listener)
# ---------------------------------------------------------------------------

@app.get("/token-meta/{mint}", tags=["lineage"], summary="Lightweight token metadata (DAS + DexScreener)")
async def get_token_meta(mint: str, request: Request):
    """Return name, symbol, image_uri for a token. Uses DAS getAsset + DexScreener pairs.

    Much lighter than /lineage — no forensic pipeline, just metadata resolution.
    """
    result = {"mint": mint, "name": "", "symbol": "", "image_uri": ""}

    # Try DexScreener first (has image)
    try:
        from .data_sources._clients import get_dex_client
        dex = get_dex_client()
        pairs = await asyncio.wait_for(dex.get_token_pairs(mint), timeout=5.0)
        if pairs:
            meta = dex.pairs_to_metadata(mint, pairs)
            if meta.name:
                result["name"] = meta.name
                result["symbol"] = meta.symbol or ""
                result["image_uri"] = meta.image_uri or ""
                return result
    except Exception:
        pass

    # Fallback: Helius DAS getAsset (on-chain metadata)
    try:
        from .data_sources._clients import get_rpc_client
        rpc = get_rpc_client()
        asset = await asyncio.wait_for(rpc.get_asset(mint), timeout=5.0)
        if asset:
            content = asset.get("content", {}) or {}
            metadata = content.get("metadata", {}) or {}
            links = content.get("links", {}) or {}
            # DAS returns name/symbol in content.metadata
            name = metadata.get("name", "") or metadata.get("token_name", "")
            symbol = metadata.get("symbol", "")
            image = links.get("image", "") or content.get("json_uri", "")
            # Also check top-level fields (some DAS versions)
            if not name:
                name = asset.get("name", "")
            if not symbol:
                symbol = asset.get("symbol", "")
            result["name"] = name
            result["symbol"] = symbol
            result["image_uri"] = image
            if name:
                return result
    except Exception as exc:
        logger.debug("[token-meta] DAS getAsset failed for %s: %s", mint[:12], exc)

    # Last resort: check intelligence_events for cached name
    try:
        from .data_sources._clients import cache as _cache
        from .cache import SQLiteCache
        if isinstance(_cache, SQLiteCache):
            db = await _cache._get_conn()
            cursor = await db.execute(
                "SELECT name, symbol FROM intelligence_events WHERE mint = ? AND name != '' LIMIT 1",
                (mint,),
            )
            row = await cursor.fetchone()
            if row and row[0]:
                result["name"] = row[0]
                result["symbol"] = row[1] or ""
    except Exception:
        pass

    return result


@app.get("/graduations", tags=["intelligence"], summary="Recent Pump.fun tokens that graduated to DEX")
@limiter.limit("60/minute")
async def get_graduations(
    request: Request,
    limit: int = Query(20, ge=1, le=50),
):
    """Return the most recent Pump.fun tokens that graduated to a DEX pool.

    Populated in real-time by the background graduation listener.
    Useful for mobile apps that cannot maintain a persistent WebSocket.
    """
    from .pump_fun_listener import get_recent_graduations
    return get_recent_graduations(limit)


# /stats/top-tokens  — most scanned tokens in the last 24h
# ---------------------------------------------------------------------------

@app.get(
    "/stats/top-tokens",
    response_model=list[TopToken],
    tags=["intelligence"],
    summary="Top tokens by intelligence event count in the last 24 hours",
)
@limiter.limit("30/minute")
async def get_top_tokens(
    request: Request,
    limit: int = Query(10, ge=1, le=50, description="Max tokens to return"),
) -> list[TopToken]:
    """Return the most actively scanned tokens ranked by event count."""
    import time as _time  # noqa: PLC0415
    from datetime import datetime, timezone, timedelta  # noqa: PLC0415

    global _top_tokens_cache
    now_mono = _time.monotonic()
    if _top_tokens_cache and (now_mono - _top_tokens_cache[0]) < 120.0:
        return _top_tokens_cache[1][:limit]

    try:
        from .data_sources._clients import event_query as _eq  # noqa: PLC0415

        # Rank by weighted event count: scans count 5x more than passive events
        # Only consider events from the last 7 days so stale tokens rotate out.
        from .data_sources._clients import cache as _cache  # noqa: PLC0415
        db = await _cache._get_conn()
        cutoff_ts = _time.time() - 7 * 86_400  # 7 days
        sql = """
            SELECT mint,
                   MAX(name) as name,
                   MAX(symbol) as symbol,
                   MAX(narrative) as narrative,
                   -- Use mcap from the most recently recorded event, not MAX
                   (SELECT ie2.mcap_usd FROM intelligence_events ie2
                    WHERE ie2.mint = ie.mint AND ie2.mcap_usd IS NOT NULL
                    ORDER BY ie2.recorded_at DESC LIMIT 1) as mcap_usd,
                   MIN(created_at) as created_at,
                   SUM(CASE WHEN event_type = 'token_scanned' THEN 5 ELSE 1 END) as event_count
            FROM intelligence_events ie
            WHERE mint IS NOT NULL AND mint != ''
              AND recorded_at > ?
            GROUP BY mint
            ORDER BY event_count DESC, mcap_usd DESC NULLS LAST, MAX(ROWID) DESC
            LIMIT ?
        """
        cursor = await db.execute(sql, (cutoff_ts, limit))
        rows = await cursor.fetchall()
        col_names = [d[0] for d in cursor.description]
        results = [dict(zip(col_names, row)) for row in rows]

        # Enrich with LIVE mcap + image from DexScreener (batch call)
        # Pick the pair with the HIGHEST LIQUIDITY for each token — avoids
        # dead/fake pairs with inflated mcap but zero liquidity.
        live_mcap_map: dict[str, float] = {}
        _best_liq: dict[str, float] = {}           # track best liquidity per mint
        live_image_map: dict[str, str] = {}
        try:
            from .data_sources._clients import get_dex_client
            dex = get_dex_client()
            # Fetch pairs for each mint concurrently (DexScreener CSV in URL
            # works but breaks Redis cache keying). Cap at 10 concurrent.
            _sem = asyncio.Semaphore(10)
            async def _fetch_one(mint: str) -> list[dict]:
                async with _sem:
                    try:
                        return await asyncio.wait_for(
                            dex.get_token_pairs_with_fallback(mint), timeout=6.0
                        )
                    except Exception:
                        return []
            mint_list = [r["mint"] for r in results[:30]]
            pair_lists = await asyncio.gather(*[_fetch_one(m) for m in mint_list])
            for pairs in pair_lists:
                for pair in pairs:
                    ba = pair.get("baseToken", {}).get("address", "")
                    mc = pair.get("marketCap") or pair.get("fdv")
                    liq = (pair.get("liquidity") or {}).get("usd") or 0
                    if ba and mc and isinstance(mc, (int, float)):
                        prev_liq = _best_liq.get(ba, -1)
                        if liq > prev_liq:
                            live_mcap_map[ba] = mc
                            _best_liq[ba] = liq
                    # Extract image URI from DexScreener info
                    if ba and ba not in live_image_map:
                        info = pair.get("info", {}) or {}
                        img_url = info.get("imageUrl") or ""
                        if not img_url:
                            img_url = (info.get("header") or info.get("icon") or "")
                        if img_url:
                            live_image_map[ba] = img_url
        except Exception as exc:
            logger.warning("[top-tokens] DexScreener enrichment failed: %s", exc)

        tokens_list = []
        for r in results:
            mint_addr = r["mint"]
            mcap = live_mcap_map.get(mint_addr) or r.get("mcap_usd")
            tokens_list.append(TopToken(
                mint=mint_addr,
                name=r.get("name", "") or "",
                symbol=r.get("symbol", "") or "",
                narrative=r.get("narrative"),
                mcap_usd=mcap,
                event_count=r.get("event_count", 1),
                created_at=r.get("created_at"),
                image_uri=live_image_map.get(mint_addr),
            ))

        _top_tokens_cache = (now_mono, tokens_list)
        return tokens_list

    except Exception as exc:
        logger.exception("get_top_tokens failed: %s", exc)
        return []


_top_tokens_cache: tuple[float, list] | None = None


# ---------------------------------------------------------------------------
# /stats/brief  — 2-sentence intelligence summary
# ---------------------------------------------------------------------------
@app.get(
    "/stats/brief",
    tags=["intelligence"],
    summary="Personalized intelligence briefing (falls back to global if unauthenticated)",
)
@limiter.limit("60/minute")
async def get_stats_brief(request: Request) -> dict:
    """Personalized daily briefing based on user's watchlist, alerts, and global stats.

    When X-API-Key is provided: personalized briefing with watchlist risk deltas.
    When unauthenticated: global platform summary.
    """
    from datetime import datetime, timezone  # noqa: PLC0415

    stats: GlobalStats = await get_global_stats(request)

    # ── Global summary (always included) ─────────────────────────
    nar_suffix = ""
    if stats.top_narratives:
        top_nar = stats.top_narratives[0].narrative.upper()
        if top_nar not in ("MISC", "OTHER", ""):
            nar_suffix = f" Top narrative: {top_nar}."

    global_line = (
        f"{stats.tokens_rugged_24h} rug pull(s) in 24h "
        f"({stats.rug_rate_24h_pct:.1f}% rate) across {stats.tokens_scanned_24h:,} tokens."
        f"{nar_suffix}"
    )

    # ── Personalized section (if authenticated) ──────────────────
    api_key = request.headers.get("X-API-Key", "")
    personal_lines: list[str] = []
    watched_mints: list[str] = []

    if api_key:
        try:
            from .data_sources._clients import cache as _cache  # noqa: PLC0415
            user = await verify_api_key(_cache, api_key)
            if user:
                user_id = user["id"]
                db = await _cache._get_conn()

                # 1. Get user's watched mints
                cursor = await db.execute(
                    "SELECT value FROM user_watches WHERE user_id = ? AND sub_type = 'mint'",
                    (user_id,),
                )
                watched_mints = [row[0] for row in await cursor.fetchall()]

                if watched_mints:
                    # 2. Check latest risk data for each watched mint
                    placeholders = ",".join("?" for _ in watched_mints)

                    # Get latest lineage data from cache for watched tokens
                    risk_changes: list[str] = []
                    for mint_addr in watched_mints[:10]:  # cap at 10 to avoid slow queries
                        try:
                            from .lineage_detector import get_cached_lineage_report
                            cached = await get_cached_lineage_report(mint_addr)
                            if cached:
                                name = getattr(getattr(cached, "query_token", None), "name", "") or mint_addr[:8]
                                symbol = getattr(getattr(cached, "query_token", None), "symbol", "") or "?"

                                # Check risk signals
                                dp = getattr(cached, "deployer_profile", None)
                                ins = getattr(cached, "insider_sell", None)
                                dc = getattr(cached, "death_clock", None)

                                if ins and getattr(ins, "deployer_exited", False):
                                    risk_changes.append(f"{symbol}: deployer exited (critical)")
                                elif dp and getattr(dp, "rug_rate_pct", 0) > 50:
                                    risk_changes.append(f"{symbol}: deployer rug rate {getattr(dp, 'rug_rate_pct', 0):.0f}%")
                                elif dc and getattr(dc, "risk_level", "") in ("high", "critical"):
                                    risk_changes.append(f"{symbol}: {getattr(dc, 'risk_level', '')} risk")
                        except Exception:
                            pass

                    personal_lines.append(f"Your watchlist: {len(watched_mints)} token(s) monitored.")

                    if risk_changes:
                        personal_lines.append("Alerts: " + " | ".join(risk_changes[:5]) + ".")
                    else:
                        personal_lines.append("No risk changes detected on your watched tokens.")

                # 3. Recent investigations
                cursor = await db.execute(
                    "SELECT COUNT(*) FROM investigations WHERE user_id = ?",
                    (user_id,),
                )
                inv_count = (await cursor.fetchone())[0]
                if inv_count > 0:
                    personal_lines.append(f"{inv_count} investigation(s) in your history.")

        except Exception as exc:
            logger.debug("[brief] personalization failed: %s", exc)

    # ── Structured sections (Feature 10) ────────────────────────
    sections: list[dict] = []

    if api_key and personal_lines:
        # Build structured watchlist alerts section
        watchlist_items: list[dict] = []
        for mint_addr in watched_mints[:10]:
            try:
                cached_tok = await get_cached_lineage_report(mint_addr)
                if not cached_tok:
                    continue
                qt = getattr(cached_tok, "query_token", None)
                name = getattr(qt, "name", "") or mint_addr[:8]
                symbol = getattr(qt, "symbol", "") or "?"
                dp2 = getattr(cached_tok, "deployer_profile", None)
                ins2 = getattr(cached_tok, "insider_sell", None)
                dc2 = getattr(cached_tok, "death_clock", None)
                risk_lev = getattr(dc2, "risk_level", "unknown") if dc2 else "unknown"
                severity = "critical" if (ins2 and getattr(ins2, "deployer_exited", False)) else risk_lev

                flags = []
                if ins2 and getattr(ins2, "deployer_exited", False):
                    flags.append("DEPLOYER_EXITED")
                if dp2 and getattr(dp2, "rug_rate_pct", 0) > 50:
                    flags.append(f"RUG_RATE_{getattr(dp2, 'rug_rate_pct', 0):.0f}%")
                if dc2 and risk_lev in ("high", "critical"):
                    flags.append(f"RISK_{risk_lev.upper()}")

                if flags:
                    watchlist_items.append({
                        "label": f"{symbol} — {name}",
                        "value": " | ".join(flags),
                        "severity": severity,
                        "mint": mint_addr,
                    })
            except Exception:
                pass

        if watchlist_items:
            sections.append({"type": "watchlist_alerts", "title": "Watchlist Alerts",
                             "items": watchlist_items})

        # Active campaigns (operators seen via cached lineage data)
        try:
            campaign_items: list[dict] = []
            seen_ops: set[str] = set()
            for mint_addr in watched_mints[:10]:
                cached_tok = await get_cached_lineage_report(mint_addr)
                if not cached_tok:
                    continue
                op2 = getattr(cached_tok, "operator_impact", None)
                if op2 and getattr(op2, "is_campaign_active", False):
                    fp = getattr(op2, "fingerprint", "")
                    if fp and fp not in seen_ops:
                        seen_ops.add(fp)
                        n_wallets = len(getattr(op2, "linked_wallets", []))
                        n_tokens = len(getattr(op2, "active_tokens", []))
                        rr = getattr(op2, "rug_rate_pct", 0)
                        campaign_items.append({
                            "label": f"Operator {fp[:8]}…",
                            "value": f"{n_wallets} wallets, {n_tokens} tokens, {rr:.0f}% rug",
                            "severity": "critical" if rr > 50 else "high",
                            "action": f"/operator/{fp}",
                        })
            if campaign_items:
                sections.append({"type": "active_campaigns", "title": "Active Campaigns",
                                 "items": campaign_items})
        except Exception:
            pass

    # Global market section — items follow {label, value} contract
    market_items: list[dict] = [
        {"label": "Rugs (24h)", "value": str(stats.tokens_rugged_24h), "severity": "high" if stats.tokens_rugged_24h > 0 else "info"},
        {"label": "Rug rate", "value": f"{stats.rug_rate_24h_pct:.1f}%", "severity": "critical" if stats.rug_rate_24h_pct > 5 else "info"},
        {"label": "Tokens scanned", "value": f"{stats.tokens_scanned_24h:,}"},
    ]
    if stats.top_narratives:
        market_items.append({"label": "Top narrative", "value": stats.top_narratives[0].narrative})
    sections.append({"type": "market_intel", "title": "Market Intelligence", "items": market_items})

    # ── Compose final briefing ───────────────────────────────────
    if personal_lines:
        text = " ".join(personal_lines) + " — " + global_line
    else:
        text = global_line

    # Include latest AI-generated daily briefing if available
    ai_briefing = None
    if api_key:
        try:
            from .briefing_service import get_latest_briefing  # noqa: PLC0415
            user2 = await verify_api_key(_cache, api_key)
            if user2:
                latest = await get_latest_briefing(_cache, user2["id"])
                if latest and latest.get("content"):
                    ai_briefing = latest["content"]
                    # Use the richer AI briefing as text when available
                    text = ai_briefing
        except Exception:
            pass

    return {"text": text, "generated_at": datetime.now(tz=timezone.utc).isoformat(),
            "sections": sections}


# ------------------------------------------------------------------
# Agent — preferences, status, history, feedback (agentic UX)
# ------------------------------------------------------------------

class _AgentPrefsBody(BaseModel):
    alertOnDeployerLaunch: bool = True
    alertOnHighRisk: bool = True
    autoInvestigate: bool = False
    dailyBriefing: bool = True
    briefingHour: int = 8
    riskThreshold: int = 70
    alertTypes: list[str] = ["deployer_exit", "bundle", "sol_extraction", "price_crash", "cartel", "operator_match", "deployer_rug"]
    solExtractionMin: float = 20.0
    sweepInterval: int = 2700
    investigationDepth: str = "standard"
    quietHoursStart: Optional[int] = None
    quietHoursEnd: Optional[int] = None
    walletMonitorEnabled: bool = False
    walletMonitorThreshold: int = 60
    walletMonitorInterval: int = 600


@app.post("/agent/prefs", tags=["agent"])
async def set_agent_prefs(request: Request, body: _AgentPrefsBody):
    """Save user's agent autonomy preferences."""
    user = await _get_current_user(request)
    from .data_sources._clients import cache as _cache  # noqa: PLC0415
    db = await _cache._get_conn()
    await db.execute(
        """INSERT OR REPLACE INTO agent_prefs
           (user_id, alert_deployer_launch, alert_high_risk,
            auto_investigate, daily_briefing, briefing_hour,
            risk_threshold, alert_types, sol_extraction_min,
            sweep_interval, investigation_depth,
            quiet_hours_start, quiet_hours_end,
            wallet_monitor_enabled, wallet_monitor_threshold, wallet_monitor_interval,
            updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (user["id"], int(body.alertOnDeployerLaunch), int(body.alertOnHighRisk),
         int(body.autoInvestigate), int(body.dailyBriefing), body.briefingHour,
         body.riskThreshold, json.dumps(body.alertTypes), body.solExtractionMin,
         body.sweepInterval, body.investigationDepth,
         body.quietHoursStart, body.quietHoursEnd,
         int(body.walletMonitorEnabled), body.walletMonitorThreshold, body.walletMonitorInterval,
         time.time()),
    )
    await db.commit()

    # Update OpenClaw crons if briefing/sweep settings changed
    from .cron_manager import ensure_briefing_cron, remove_briefing_cron, sync_all_user_crons  # noqa: PLC0415

    async def _update_crons():
        try:
            plan = user.get("plan", "free")
            if body.dailyBriefing:
                await ensure_briefing_cron(_cache, user["id"], body.briefingHour, plan)
            else:
                await remove_briefing_cron(_cache, user["id"])
            # Re-sync watch crons with potentially new sweepInterval
            await sync_all_user_crons(_cache, user["id"], plan)
        except Exception:
            logger.warning("[prefs] cron update failed for user=%s", user["id"], exc_info=True)

    asyncio.create_task(_update_crons(), name=f"prefs_cron_update_{user['id']}")

    return {"ok": True}


@app.get("/agent/prefs", tags=["agent"])
async def get_agent_prefs(request: Request):
    """Get user's agent autonomy preferences."""
    user = await _get_current_user(request)
    from .data_sources._clients import cache as _cache  # noqa: PLC0415
    db = await _cache._get_conn()
    cursor = await db.execute(
        "SELECT alert_deployer_launch, alert_high_risk, auto_investigate, "
        "daily_briefing, briefing_hour, risk_threshold, alert_types, "
        "sol_extraction_min, sweep_interval, investigation_depth, "
        "quiet_hours_start, quiet_hours_end, "
        "wallet_monitor_enabled, wallet_monitor_threshold, wallet_monitor_interval "
        "FROM agent_prefs WHERE user_id = ?",
        (user["id"],),
    )
    row = await cursor.fetchone()
    defaults = {
        "alertOnDeployerLaunch": True, "alertOnHighRisk": True,
        "autoInvestigate": False, "dailyBriefing": True, "briefingHour": 8,
        "riskThreshold": 70,
        "alertTypes": ["deployer_exit", "bundle", "sol_extraction", "price_crash", "cartel", "operator_match", "deployer_rug"],
        "solExtractionMin": 20.0,
        "sweepInterval": 2700,
        "investigationDepth": "standard",
        "quietHoursStart": None,
        "quietHoursEnd": None,
        "walletMonitorEnabled": False,
        "walletMonitorThreshold": 60,
        "walletMonitorInterval": 600,
    }
    if not row:
        return defaults
    alert_types = defaults["alertTypes"]
    try:
        alert_types = json.loads(row[6]) if row[6] else defaults["alertTypes"]
    except Exception:
        pass
    return {
        "alertOnDeployerLaunch": bool(row[0]), "alertOnHighRisk": bool(row[1]),
        "autoInvestigate": bool(row[2]), "dailyBriefing": bool(row[3]),
        "briefingHour": row[4],
        "riskThreshold": row[5] if row[5] is not None else 70,
        "alertTypes": alert_types,
        "solExtractionMin": row[7] if row[7] is not None else 20.0,
        "sweepInterval": row[8] if row[8] is not None else 2700,
        "investigationDepth": row[9] or "standard",
        "quietHoursStart": row[10],
        "quietHoursEnd": row[11],
        "walletMonitorEnabled": bool(row[12]) if row[12] is not None else False,
        "walletMonitorThreshold": row[13] if row[13] is not None else 60,
        "walletMonitorInterval": row[14] if row[14] is not None else 600,
    }


# ── Alert channel preferences ────────────────────────────────────────────────


class _AlertPrefsBody(BaseModel):
    channels: dict  # e.g. {"push": true, "telegram": false, "discord": true}


@app.post("/alert-prefs", tags=["agent"])
async def set_alert_prefs(request: Request, body: _AlertPrefsBody):
    """Save user's notification channel preferences."""
    user = await _get_current_user(request)
    from .data_sources._clients import cache as _cache  # noqa: PLC0415
    db = await _cache._get_conn()
    for channel, enabled in body.channels.items():
        if channel not in ("push", "telegram", "discord", "whatsapp"):
            continue
        await db.execute(
            """INSERT OR REPLACE INTO alert_prefs (user_id, channel, enabled, config_json)
               VALUES (?, ?, ?, COALESCE(
                   (SELECT config_json FROM alert_prefs WHERE user_id = ? AND channel = ?),
                   NULL
               ))""",
            (user["id"], channel, int(bool(enabled)), user["id"], channel),
        )
    await db.commit()
    return {"ok": True}


@app.get("/alert-prefs", tags=["agent"])
async def get_alert_prefs(request: Request):
    """Get user's notification channel preferences."""
    user = await _get_current_user(request)
    from .data_sources._clients import cache as _cache  # noqa: PLC0415
    db = await _cache._get_conn()
    cursor = await db.execute(
        "SELECT channel, enabled FROM alert_prefs WHERE user_id = ?",
        (user["id"],),
    )
    rows = await cursor.fetchall()
    channels = {"push": True, "telegram": False, "discord": False, "whatsapp": False}
    for channel, enabled in rows:
        channels[channel] = bool(enabled)
    return {"channels": channels}


@app.get("/agent/status", tags=["agent"])
async def get_agent_status(request: Request):
    """Return real-time agent status for the Agent tab."""
    user = await _get_current_user(request)
    from .data_sources._clients import cache as _cache  # noqa: PLC0415
    db = await _cache._get_conn()

    # Count watches
    cursor = await db.execute(
        "SELECT COUNT(*) FROM user_watches WHERE user_id = ?", (user["id"],)
    )
    watch_count = (await cursor.fetchone())[0]

    # Last sweep time
    cursor = await db.execute(
        "SELECT MAX(scanned_at) FROM watch_snapshots ws "
        "JOIN user_watches uw ON ws.watch_id = uw.id WHERE uw.user_id = ?",
        (user["id"],),
    )
    row = await cursor.fetchone()
    last_sweep = int(row[0] * 1000) if row and row[0] else None

    # Investigations today
    today_start = time.time() - 86400
    cursor = await db.execute(
        "SELECT COUNT(*) FROM investigations WHERE user_id = ? AND created_at > ?",
        (user["id"], today_start),
    )
    today_count = (await cursor.fetchone())[0]

    # Total investigations
    cursor = await db.execute(
        "SELECT COUNT(*) FROM investigations WHERE user_id = ?", (user["id"],),
    )
    total_count = (await cursor.fetchone())[0]

    # Agent prefs
    cursor = await db.execute(
        "SELECT auto_investigate, daily_briefing, briefing_hour FROM agent_prefs WHERE user_id = ?",
        (user["id"],),
    )
    prefs_row = await cursor.fetchone()

    return {
        "watching": watch_count,
        "last_sweep": last_sweep,
        "investigations_today": today_count,
        "total_investigations": total_count,
        "auto_investigate": bool(prefs_row[0]) if prefs_row else False,
        "daily_briefing": bool(prefs_row[1]) if prefs_row else True,
        "briefing_hour": prefs_row[2] if prefs_row else 8,
    }


@app.get("/agent/history", tags=["agent"])
async def get_investigation_history(
    request: Request,
    since: Optional[float] = Query(None, description="UNIX timestamp (seconds) — return only investigations after this time"),
    limit: int = Query(50, ge=1, le=200),
):
    """Return user's investigation history (server-side memory).

    Pass ``since`` (UNIX seconds) to fetch only new investigations since the
    client's last sync — used for catch-up after the app was offline.
    """
    import json as _json  # noqa: PLC0415
    user = await _get_current_user(request)
    from .data_sources._clients import cache as _cache  # noqa: PLC0415
    db = await _cache._get_conn()

    if since is not None:
        cursor = await db.execute(
            "SELECT mint, name, symbol, risk_score, verdict_summary, "
            "key_findings, model, turns_used, tokens_used, created_at "
            "FROM investigations WHERE user_id = ? AND created_at > ? "
            "ORDER BY created_at DESC LIMIT ?",
            (user["id"], since, limit),
        )
    else:
        cursor = await db.execute(
            "SELECT mint, name, symbol, risk_score, verdict_summary, "
            "key_findings, model, turns_used, tokens_used, created_at "
            "FROM investigations WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
            (user["id"], limit),
        )

    rows = await cursor.fetchall()
    results = []
    for r in rows:
        findings = r[5]
        try:
            findings = _json.loads(findings) if findings else []
        except Exception:
            findings = []
        results.append({
            "mint": r[0], "name": r[1], "symbol": r[2],
            "riskScore": r[3], "verdict": r[4],
            "keyFindings": findings, "model": r[6],
            "turnsUsed": r[7], "tokensUsed": r[8],
            "timestamp": int((r[9] or 0) * 1000),
        })
    return results


@app.get("/agent/flags", tags=["agent"])
async def get_sweep_flags(
    request: Request,
    mint: Optional[str] = Query(None, description="Filter by mint address"),
    since: Optional[float] = Query(None, description="UNIX timestamp (seconds) — return only flags after this time"),
    limit: int = Query(50, ge=1, le=200),
):
    """Return intelligence flags generated by the watchlist sweep.

    Pass ``since`` (UNIX seconds) to fetch only new flags since the client's
    last sync — used for catch-up after the app was offline.
    """
    user = await _get_current_user(request)
    from .data_sources._clients import cache as _cache  # noqa: PLC0415
    db = await _cache._get_conn()

    # Build WHERE clause dynamically based on filters
    conditions = ["sf.user_id = ?", "sf.flag_type != '_SNAPSHOT'"]
    params: list = [user["id"]]

    # Only show flags for tokens still in the watchlist (ignore deleted watches)
    if not mint:
        conditions.append(
            "sf.mint IN (SELECT value FROM user_watches WHERE user_id = ? AND sub_type = 'mint')"
        )
        params.append(user["id"])

    if mint:
        conditions.append("sf.mint = ?")
        params.append(mint)
    if since is not None:
        conditions.append("sf.created_at > ?")
        params.append(since)

    where = " AND ".join(conditions)

    if mint:
        # Single-token mode: simple chronological
        params.append(limit)
        cursor = await db.execute(
            f"SELECT sf.id, sf.mint, sf.flag_type, sf.severity, sf.title, sf.detail, sf.created_at, sf.read "
            f"FROM sweep_flags sf WHERE {where} "
            f"ORDER BY sf.created_at DESC LIMIT ?",
            tuple(params),
        )
    else:
        # Multi-token mode: use ROW_NUMBER to cap flags per token
        per_token = max(5, limit // 7)
        cursor = await db.execute(
            f"SELECT id, mint, flag_type, severity, title, detail, created_at, read FROM ("
            f"  SELECT *, ROW_NUMBER() OVER (PARTITION BY mint ORDER BY created_at DESC) as rn"
            f"  FROM sweep_flags sf WHERE {where} AND sf.flag_type != '_REFERENCE'"
            f") WHERE rn <= ? ORDER BY created_at DESC LIMIT ?",
            tuple(params) + (per_token, limit),
        )

    rows = await cursor.fetchall()
    import json as _json
    flags = []
    for r in rows:
        detail = r[5]
        try:
            detail = _json.loads(detail) if detail else {}
        except Exception:
            detail = {}
        flags.append({
            "id": r[0],
            "mint": r[1],
            "flagType": r[2],
            "severity": r[3],
            "title": r[4],
            "detail": detail,
            "createdAt": r[6],
            "read": bool(r[7]),
        })

    # In multi-token mode, balance flags across tokens so no single token dominates
    if not mint and len(flags) > limit:
        from collections import defaultdict
        by_mint: dict[str, list] = defaultdict(list)
        for f in flags:
            by_mint[f["mint"]].append(f)
        # Round-robin: take flags from each token in turn
        balanced: list[dict] = []
        max_per_token = max(3, limit // max(len(by_mint), 1))
        for m_flags in by_mint.values():
            balanced.extend(m_flags[:max_per_token])
        # Sort by time, trim to limit
        balanced.sort(key=lambda f: f["createdAt"], reverse=True)
        flags = balanced[:limit]

    # Signal to client whether more flags exist beyond current page
    _has_more = len(flags) >= limit
    return {"flags": flags, "has_more": _has_more}


@app.post("/agent/flags/{flag_id}/read", tags=["agent"])
async def mark_flag_read(flag_id: int, request: Request):
    """Mark a sweep flag as read."""
    user = await _get_current_user(request)
    from .data_sources._clients import cache as _cache  # noqa: PLC0415
    db = await _cache._get_conn()
    await db.execute(
        "UPDATE sweep_flags SET read = 1 WHERE id = ? AND user_id = ?",
        (flag_id, user["id"]),
    )
    await db.commit()
    return {"ok": True}


@app.get("/agent/watch-timeline/{mint}", tags=["agent"])
async def get_watch_timeline(mint: str, request: Request):
    """Return full timeline for a watched token: reference, snapshots, flags, investigation."""
    user = await _get_current_user(request)
    uid = user["id"]
    from .data_sources._clients import cache as _cache  # noqa: PLC0415
    db = await _cache._get_conn()

    # 1. Get watch_id
    cursor = await db.execute(
        "SELECT id, created_at FROM user_watches WHERE user_id = ? AND sub_type = 'mint' AND value = ?",
        (uid, mint),
    )
    watch_row = await cursor.fetchone()
    if not watch_row:
        raise HTTPException(status_code=404, detail="Token not in your watchlist")
    watch_id = watch_row[0]

    # 2. Reference snapshot (_REFERENCE flag)
    cursor = await db.execute(
        "SELECT detail, created_at FROM sweep_flags WHERE watch_id = ? AND flag_type = '_REFERENCE' "
        "ORDER BY created_at ASC LIMIT 1",
        (watch_id,),
    )
    ref_row = await cursor.fetchone()
    reference = None
    if ref_row:
        try:
            rd = json.loads(ref_row[0])
            reference = {
                "price_usd": rd.get("price_usd"),
                "liq_usd": rd.get("liq_usd"),
                "risk_score": rd.get("heuristic_score") or rd.get("risk_score", 0),
                "created_at": ref_row[1],
            }
        except Exception:
            pass

    # 3. Latest snapshot (_SNAPSHOT flag)
    cursor = await db.execute(
        "SELECT detail FROM sweep_flags WHERE watch_id = ? AND flag_type = '_SNAPSHOT' "
        "ORDER BY created_at DESC LIMIT 1",
        (watch_id,),
    )
    snap_row = await cursor.fetchone()
    current = None
    if snap_row:
        try:
            sd = json.loads(snap_row[0])
            current = {
                "price_usd": sd.get("price_usd"),
                "liq_usd": sd.get("liq_usd"),
                "risk_score": sd.get("heuristic_score") or sd.get("risk_score", 0),
            }
        except Exception:
            pass

    # 4. Deltas
    deltas = None
    if reference and current:
        ref_p = reference.get("price_usd") or 0
        cur_p = current.get("price_usd") or 0
        ref_l = reference.get("liq_usd") or 0
        cur_l = current.get("liq_usd") or 0
        deltas = {
            "price_pct": round((cur_p - ref_p) / ref_p * 100, 1) if ref_p > 0 else None,
            "liq_pct": round((cur_l - ref_l) / ref_l * 100, 1) if ref_l > 0 else None,
            "risk_delta": (current.get("risk_score") or 0) - (reference.get("risk_score") or 0),
        }

    # 5. Historical snapshots (for sparkline)
    cursor = await db.execute(
        "SELECT risk_score, risk_level, scanned_at FROM watch_snapshots "
        "WHERE watch_id = ? ORDER BY scanned_at ASC",
        (watch_id,),
    )
    snapshot_rows = await cursor.fetchall()
    snapshots = [
        {"risk_score": r[0] or 0, "risk_level": r[1] or "unknown", "scanned_at": r[2]}
        for r in snapshot_rows
    ]

    # 6. Sweep flags (excluding internal)
    cursor = await db.execute(
        "SELECT id, flag_type, severity, title, detail, created_at, read FROM sweep_flags "
        "WHERE watch_id = ? AND flag_type NOT IN ('_SNAPSHOT', '_REFERENCE') "
        "ORDER BY created_at DESC",
        (watch_id,),
    )
    flag_rows = await cursor.fetchall()
    flags = []
    for fr in flag_rows:
        detail = {}
        try:
            detail = json.loads(fr[4]) if fr[4] else {}
        except Exception:
            pass
        flags.append({
            "id": fr[0], "flagType": fr[1], "severity": fr[2],
            "title": fr[3], "detail": detail,
            "createdAt": fr[5], "read": bool(fr[6]),
        })

    # 7. Latest investigation
    cursor = await db.execute(
        "SELECT risk_score, verdict_summary, key_findings, created_at FROM investigations "
        "WHERE user_id = ? AND mint = ? ORDER BY created_at DESC LIMIT 1",
        (uid, mint),
    )
    inv_row = await cursor.fetchone()
    last_investigation = None
    if inv_row:
        kf = []
        try:
            kf = json.loads(inv_row[2]) if inv_row[2] else []
        except Exception:
            pass
        last_investigation = {
            "risk_score": inv_row[0] or 0,
            "verdict": inv_row[1] or "",
            "key_findings": kf,
            "timestamp": int(inv_row[3] * 1000) if inv_row[3] else None,
        }

    # 8. Build narrative from deltas + flags
    narrative = None
    if deltas:
        parts = []
        if deltas.get("price_pct") is not None:
            parts.append(f"Price {deltas['price_pct']:+.0f}% since first watched")
        if deltas.get("liq_pct") is not None and (deltas["liq_pct"] or 0) <= -20:
            parts.append(f"Liquidity {deltas['liq_pct']:+.0f}%")
        # Highlight top flag
        critical_flags = [f for f in flags if f["severity"] == "critical"]
        if critical_flags:
            narrative_flags = [f["title"] for f in critical_flags[:2]]
            parts.extend(narrative_flags)
        if parts:
            narrative = " — ".join(parts)

    return {
        "mint": mint,
        "watch_id": watch_id,
        "reference": reference,
        "current": current,
        "deltas": deltas,
        "snapshots": snapshots,
        "flags": flags,
        "last_investigation": last_investigation,
        "narrative": narrative,
    }


@app.get("/agent/insights", tags=["agent"])
async def get_agent_insights(request: Request):
    """Cross-token intelligence for user's watchlist — shared deployers, cartel links."""
    user = await _get_current_user(request)
    uid = user["id"]
    from .data_sources._clients import cache as _cache  # noqa: PLC0415
    db = await _cache._get_conn()

    # 1. Get watched mints
    cursor = await db.execute(
        "SELECT id, value FROM user_watches WHERE user_id = ? AND sub_type = 'mint'",
        (uid,),
    )
    watch_rows = await cursor.fetchall()
    if not watch_rows:
        return {"insights": []}

    mints = [r[1] for r in watch_rows]
    placeholders = ",".join("?" * len(mints))

    insights: list[dict] = []

    # 2. Shared deployer detection
    try:
        cursor = await db.execute(
            f"SELECT deployer, GROUP_CONCAT(mint) as mints, COUNT(*) as cnt "
            f"FROM investigation_episodes WHERE mint IN ({placeholders}) "
            f"AND deployer IS NOT NULL AND deployer != '' AND is_latest = 1 "
            f"GROUP BY deployer HAVING cnt > 1",
            tuple(mints),
        )
        shared_rows = await cursor.fetchall()
        for sr in shared_rows:
            deployer = sr[0]
            linked_mints = sr[1].split(",") if sr[1] else []
            # Get deployer stats
            c2 = await db.execute(
                "SELECT total_rugs, total_tokens, avg_risk_score FROM entity_knowledge "
                "WHERE entity_type = 'deployer' AND entity_id = ?",
                (deployer,),
            )
            ek_row = await c2.fetchone()
            rug_count = ek_row[0] if ek_row else 0
            total_tokens = ek_row[1] if ek_row else 0
            rug_rate = round(rug_count / total_tokens * 100) if total_tokens > 0 else 0

            short_addr = f"{deployer[:4]}...{deployer[-4:]}" if len(deployer) > 8 else deployer
            severity = "critical" if rug_count > 0 else "warning"
            insights.append({
                "type": "shared_deployer",
                "severity": severity,
                "title": f"{len(linked_mints)} watched tokens share deployer {short_addr}",
                "detail": {
                    "deployer": deployer,
                    "mints": linked_mints,
                    "rug_count": rug_count,
                    "rug_rate": rug_rate,
                    "avg_risk": round(ek_row[2]) if ek_row and ek_row[2] else None,
                },
            })
    except Exception as exc:
        logger.debug("[insights] shared deployer query failed: %s", exc)

    # 3. Cartel/community links
    try:
        cursor = await db.execute(
            f"SELECT community_id, GROUP_CONCAT(mint) as mints, COUNT(*) as cnt "
            f"FROM investigation_episodes WHERE mint IN ({placeholders}) "
            f"AND community_id IS NOT NULL AND community_id != '' AND is_latest = 1 "
            f"GROUP BY community_id HAVING cnt > 1",
            tuple(mints),
        )
        cartel_rows = await cursor.fetchall()
        for cr in cartel_rows:
            community_id = cr[0]
            linked_mints = cr[1].split(",") if cr[1] else []
            insights.append({
                "type": "cartel_activity",
                "severity": "warning",
                "title": f"Cartel network active — {len(linked_mints)} of your tokens linked",
                "detail": {
                    "community_id": community_id,
                    "mints": linked_mints,
                },
            })
    except Exception as exc:
        logger.debug("[insights] cartel query failed: %s", exc)

    # Sort: critical first, then by type
    severity_order = {"critical": 0, "warning": 1, "info": 2}
    insights.sort(key=lambda x: severity_order.get(x.get("severity", "info"), 2))

    return {"insights": insights}


@app.post("/agent/feedback", tags=["agent"])
async def submit_feedback(request: Request):
    """Store verdict feedback (accurate/incorrect) for learning.

    This is the entry point for the calibration loop:
    1. Store feedback in investigation_feedback
    2. Propagate user_rating back to the investigation_episodes row
    3. Trigger calibration rule generation from accumulated feedback
    """
    user = await _get_current_user(request)
    body = await request.json()
    mint = body.get("mint", "")
    rating = body.get("rating", "")
    if rating not in ("accurate", "incorrect"):
        raise HTTPException(status_code=422, detail="rating must be 'accurate' or 'incorrect'")
    from .data_sources._clients import cache as _cache  # noqa: PLC0415
    db = await _cache._get_conn()
    await db.execute(
        "INSERT INTO investigation_feedback (user_id, mint, risk_score, rating, note, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (user["id"], mint, body.get("risk_score"), rating, body.get("note", ""), time.time()),
    )
    # Propagate rating back to the episode so build_memory_brief() can use it
    await db.execute(
        "UPDATE investigation_episodes SET user_rating = ?, user_note = ? WHERE mint = ? AND is_latest = 1",
        (rating, body.get("note", ""), mint),
    )
    await db.commit()

    # Trigger calibration rule generation in background (fire-and-forget)
    from .memory_service import generate_calibration_rules
    asyncio.create_task(generate_calibration_rules())

    return {"ok": True}


# ------------------------------------------------------------------
# Feature 8 — Alert Enrichment endpoint
# ------------------------------------------------------------------

class _AlertEnrichBody(BaseModel):
    id: str = ""
    type: str = ""
    title: str = ""
    message: str = ""
    mint: str = ""
    risk_score: Optional[int] = None


@app.post("/alerts/enrich", tags=["intelligence"])
@limiter.limit("20/minute")
async def enrich_alert_endpoint(request: Request, body: _AlertEnrichBody):
    """Enrich an alert with AI summary, deployer context, related tokens, and recommended actions."""
    from .data_sources._clients import cache as _cache  # noqa: PLC0415

    alert_dict = body.model_dump()
    mint = body.mint

    enriched_data: dict = {"summary": "", "relatedTokens": [], "riskDelta": 0,
                           "deployerHistory": None, "recommendedAction": None}
    actions: list[dict] = []

    # 1. Fetch deployer context if mint is provided
    deployer_ctx = ""
    if mint:
        try:
            cached = await get_cached_lineage_report(mint)
            if cached:
                dp = getattr(cached, "deployer_profile", None)
                op = getattr(cached, "operator_impact", None)
                ins = getattr(cached, "insider_sell", None)
                dc = getattr(cached, "death_clock", None)

                if dp:
                    deployer_ctx = (
                        f"Deployer {getattr(dp, 'address', '?')[:8]}… — "
                        f"{getattr(dp, 'total_tokens_launched', '?')} tokens, "
                        f"{getattr(dp, 'confirmed_rug_count', '?')} rugs, "
                        f"{getattr(dp, 'rug_rate_pct', 0):.0f}% rug rate"
                    )
                    enriched_data["deployerHistory"] = deployer_ctx

                # Risk delta from death clock
                if dc and getattr(dc, "rug_probability_pct", None) is not None:
                    enriched_data["riskDelta"] = int(getattr(dc, "rug_probability_pct", 0))

                # Related tokens from operator
                if op and getattr(op, "active_tokens", None):
                    enriched_data["relatedTokens"] = list(getattr(op, "active_tokens", []))[:5]

                # Generate actions
                actions.append({"label": "Investigate", "action": "lineage.navigate",
                                "params": {"path": f"/investigate/{mint}"}})
                if dp:
                    addr = getattr(dp, "address", "")
                    if addr:
                        actions.append({"label": "View Deployer", "action": "lineage.navigate",
                                        "params": {"path": f"/deployer/{addr}"}})
                if op and getattr(op, "fingerprint", ""):
                    actions.append({"label": "Hunt Operator", "action": "lineage.navigate",
                                    "params": {"path": f"/operator/{getattr(op, 'fingerprint', '')}"}})
        except Exception as exc:
            logger.debug("[enrich] context fetch failed: %s", exc)

    # 2. AI enrichment (best-effort)
    try:
        from .alert_service import enrich_alert
        ai_result = await enrich_alert({**alert_dict, "deployer_context": deployer_ctx})
        if ai_result.get("summary"):
            enriched_data["summary"] = ai_result["summary"]
        if ai_result.get("recommended_action"):
            enriched_data["recommendedAction"] = ai_result["recommended_action"]
    except Exception:
        if deployer_ctx:
            enriched_data["summary"] = f"Alert on token with known deployer. {deployer_ctx}."

    # Fallback summary
    if not enriched_data["summary"]:
        enriched_data["summary"] = body.message or body.title or "Alert received."

    return {"enrichedData": enriched_data, "actions": actions}


# ------------------------------------------------------------------
# Wallet Monitoring — multi-wallet risk scanning
# ------------------------------------------------------------------


class _WalletAddBody(BaseModel):
    address: str
    label: Optional[str] = None
    source: str = "external"


@app.get("/wallet/list", tags=["wallet"])
async def list_monitored_wallets(request: Request):
    """List all wallets the user has registered for monitoring."""
    user = await _get_current_user(request)
    from .data_sources._clients import cache as _cache  # noqa: PLC0415
    db = await _cache._get_conn()
    cursor = await db.execute(
        "SELECT id, address, label, source, enabled, created_at "
        "FROM monitored_wallets WHERE user_id = ? ORDER BY created_at",
        (user["id"],),
    )
    rows = await cursor.fetchall()
    return {
        "wallets": [
            {"id": r[0], "address": r[1], "label": r[2], "source": r[3],
             "enabled": bool(r[4]), "created_at": r[5]}
            for r in rows
        ]
    }


@app.post("/wallet/add", tags=["wallet"])
async def add_monitored_wallet(request: Request, body: _WalletAddBody):
    """Add a wallet address for monitoring (embedded or external)."""
    user = await _get_current_user(request)
    from .data_sources._clients import cache as _cache  # noqa: PLC0415
    db = await _cache._get_conn()

    # Validate address (Base58, 32-44 chars)
    addr = body.address.strip()
    if not (32 <= len(addr) <= 44) or not all(c in "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz" for c in addr):
        raise HTTPException(400, "Invalid Solana address")

    # Max 5 wallets per user
    cursor = await db.execute(
        "SELECT COUNT(*) FROM monitored_wallets WHERE user_id = ?", (user["id"],)
    )
    count = (await cursor.fetchone())[0]
    if count >= 5:
        raise HTTPException(400, "Maximum 5 monitored wallets")

    try:
        await db.execute(
            "INSERT INTO monitored_wallets (user_id, address, label, source, enabled, created_at) "
            "VALUES (?, ?, ?, ?, 1, ?)",
            (user["id"], addr, body.label, body.source, time.time()),
        )
        # Auto-enable wallet monitoring in agent_prefs (create row if missing)
        await db.execute(
            """INSERT INTO agent_prefs (user_id, wallet_monitor_enabled, updated_at)
               VALUES (?, 1, ?)
               ON CONFLICT(user_id) DO UPDATE SET wallet_monitor_enabled = 1, updated_at = ?""",
            (user["id"], time.time(), time.time()),
        )
        await db.commit()
    except Exception:
        raise HTTPException(409, "Wallet already monitored")

    return {"ok": True, "address": addr}


@app.delete("/wallet/remove/{wallet_id}", tags=["wallet"])
async def remove_monitored_wallet(wallet_id: int, request: Request):
    """Remove a wallet from monitoring and delete its holdings."""
    user = await _get_current_user(request)
    from .data_sources._clients import cache as _cache  # noqa: PLC0415
    db = await _cache._get_conn()

    # Get address before deleting (for holdings cleanup)
    cursor = await db.execute(
        "SELECT address FROM monitored_wallets WHERE id = ? AND user_id = ?",
        (wallet_id, user["id"]),
    )
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(404, "Wallet not found")

    await db.execute("DELETE FROM monitored_wallets WHERE id = ? AND user_id = ?", (wallet_id, user["id"]))
    await db.execute("DELETE FROM wallet_holdings WHERE user_id = ? AND wallet_address = ?", (user["id"], row[0]))
    await db.commit()
    return {"ok": True}


@app.get("/wallet/holdings", tags=["wallet"])
async def get_wallet_holdings(
    request: Request,
    address: Optional[str] = Query(None, description="Filter by specific wallet address"),
):
    """Return tracked holdings with risk scores across all monitored wallets."""
    user = await _get_current_user(request)
    from .data_sources._clients import cache as _cache  # noqa: PLC0415
    db = await _cache._get_conn()
    # Force WAL checkpoint read so we see latest writes from background sweep
    try:
        await db.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    except Exception:
        pass

    _cols = (
        "wallet_address, mint, token_name, token_symbol, image_uri, "
        "ui_amount, risk_score, risk_level, liquidity_usd, price_usd, last_scanned, "
        "risk_flags, prev_risk_score, status, narrative"
    )
    if address:
        cursor = await db.execute(
            f"SELECT {_cols} FROM wallet_holdings WHERE user_id = ? AND wallet_address = ? "
            "ORDER BY risk_score DESC NULLS LAST",
            (user["id"], address),
        )
    else:
        cursor = await db.execute(
            f"SELECT {_cols} FROM wallet_holdings WHERE user_id = ? "
            "ORDER BY risk_score DESC NULLS LAST",
            (user["id"],),
        )

    rows = await cursor.fetchall()
    holdings = []
    total_usd = 0.0
    risky_usd = 0.0
    risk_dist = {"low": 0, "medium": 0, "high": 0, "critical": 0, "unknown": 0}
    for r in rows:
        score = r[6] or 0
        price = r[9] or 0
        liq = r[8] or 0
        amount = r[5] or 0
        usd_value = round(amount * price, 2) if price > 0 else None
        total_usd += usd_value or 0
        risk_level_raw = r[7] or "unknown"

        # Risk distribution — tokens with no market data go to "unknown"
        has_market_data = liq > 0 or price > 0 or (score > 0 and risk_level_raw != "unknown")
        if not has_market_data:
            risk_dist["unknown"] += 1
        elif score >= 75:
            risk_dist["critical"] += 1
            risky_usd += usd_value or 0
        elif score >= 50:
            risk_dist["high"] += 1
            risky_usd += usd_value or 0
        elif score >= 25:
            risk_dist["medium"] += 1
            risky_usd += usd_value or 0
        else:
            risk_dist["low"] += 1

        # Parse risk_flags JSON
        _flags_raw = r[11]
        try:
            _flags = json.loads(_flags_raw) if _flags_raw else []
        except Exception:
            _flags = []

        holdings.append({
            "wallet_address": r[0], "mint": r[1], "token_name": r[2],
            "token_symbol": r[3], "image_uri": r[4], "ui_amount": amount,
            "risk_score": r[6], "risk_level": r[7], "liquidity_usd": r[8],
            "price_usd": price, "usd_value": usd_value,
            "risk_flags": _flags,
            "prev_risk_score": r[12],
            "status": r[13] or "held",
            "last_scanned": r[10],
            "narrative": r[14],
        })

    total_risky = risk_dist["high"] + risk_dist["critical"]

    # Enrich empty risk_flags from investigations table (fallback for WAL read lag)
    for h in holdings:
        if not h["risk_flags"] and h["risk_score"] and h["risk_score"] > 0:
            try:
                _inv_cur = await db.execute(
                    "SELECT verdict_summary, key_findings FROM investigations "
                    "WHERE mint = ? ORDER BY created_at DESC LIMIT 1",
                    (h["mint"],),
                )
                _inv_row = await _inv_cur.fetchone()
                if _inv_row:
                    _enriched: list[str] = []
                    if _inv_row[0]:
                        _enriched.append(_inv_row[0])
                    # Robust key_findings parse
                    _raw_kf = _inv_row[1] or ""
                    try:
                        _kf = json.loads(_raw_kf)
                        if isinstance(_kf, list):
                            _enriched.extend(_kf[:2])
                    except Exception:
                        try:
                            _last_q = _raw_kf.rfind('"')
                            if _last_q > 0:
                                _kf = json.loads(_raw_kf[:_last_q + 1] + "]")
                                if isinstance(_kf, list):
                                    _enriched.extend(_kf[:2])
                        except Exception:
                            pass
                    h["risk_flags"] = _enriched
            except Exception:
                pass

    # Fetch risk history for sparklines (last 10 per mint)
    if holdings:
        _mint_list = [h["mint"] for h in holdings]
        _ph = ",".join("?" for _ in _mint_list)
        hist_cursor = await db.execute(
            f"SELECT mint, risk_score, scanned_at FROM wallet_risk_history "
            f"WHERE user_id = ? AND mint IN ({_ph}) "
            f"ORDER BY scanned_at ASC",
            [user["id"]] + _mint_list,
        )
        hist_rows = await hist_cursor.fetchall()
        # Group by mint
        _hist_map: dict[str, list] = {}
        for hr in hist_rows:
            _hist_map.setdefault(hr[0], []).append({"score": hr[1], "ts": hr[2]})
        # Attach (keep last 10 per mint)
        for h in holdings:
            h["risk_history"] = (_hist_map.get(h["mint"]) or [])[-10:]

    # Last sweep time
    cursor2 = await db.execute(
        "SELECT MAX(created_at) FROM wallet_monitor_log WHERE user_id = ?",
        (user["id"],),
    )
    last_row = await cursor2.fetchone()
    last_sweep = last_row[0] if last_row and last_row[0] else None

    return {
        "holdings": holdings,
        "total_holdings": len(holdings),
        "total_risky": total_risky,
        "last_sweep": int(last_sweep * 1000) if last_sweep else None,
        "portfolio_usd": round(total_usd, 2),
        "risky_usd": round(risky_usd, 2),
        "risk_distribution": risk_dist,
    }


@app.post("/wallet/monitor/scan", tags=["wallet"])
async def trigger_wallet_scan(request: Request):
    """Trigger an immediate scan of all monitored wallets. Returns results."""
    user = await _get_current_user(request)
    from .data_sources._clients import cache as _cache  # noqa: PLC0415
    db = await _cache._get_conn()

    # Get user's threshold
    cursor = await db.execute(
        "SELECT wallet_monitor_threshold FROM agent_prefs WHERE user_id = ?",
        (user["id"],),
    )
    pref_row = await cursor.fetchone()
    threshold = pref_row[0] if pref_row and pref_row[0] else 60

    # Get all enabled wallets
    cursor2 = await db.execute(
        "SELECT address FROM monitored_wallets WHERE user_id = ? AND enabled = 1",
        (user["id"],),
    )
    wallets = [r[0] for r in await cursor2.fetchall()]

    if not wallets:
        return {"holdings_count": 0, "risky_count": 0, "alerts_sent": 0, "wallets_scanned": 0}

    from .wallet_monitor_service import run_wallet_monitor_sweep
    total_h, total_r, total_a = 0, 0, 0
    for addr in wallets:
        try:
            result = await run_wallet_monitor_sweep(user["id"], addr, threshold, _cache)
            total_h += result["holdings_count"]
            total_r += result["risky_count"]
            total_a += result["alerts_sent"]
        except Exception as exc:
            logger.warning("[wallet/scan] failed for %s: %s", addr[:12], exc)

    # Log sweep
    await db.execute(
        "INSERT INTO wallet_monitor_log "
        "(user_id, holdings_count, risky_count, alerts_sent, duration_ms, created_at) "
        "VALUES (?, ?, ?, ?, 0, ?)",
        (user["id"], total_h, total_r, total_a, time.time()),
    )
    await db.commit()

    return {
        "holdings_count": total_h,
        "risky_count": total_r,
        "alerts_sent": total_a,
        "wallets_scanned": len(wallets),
    }


@app.get("/wallet/monitor/status", tags=["wallet"])
async def get_wallet_monitor_status(request: Request):
    """Return wallet monitoring status: last sweep, next, counts."""
    user = await _get_current_user(request)
    from .data_sources._clients import cache as _cache  # noqa: PLC0415
    db = await _cache._get_conn()

    # Prefs
    cursor = await db.execute(
        "SELECT wallet_monitor_enabled, wallet_monitor_threshold, wallet_monitor_interval "
        "FROM agent_prefs WHERE user_id = ?",
        (user["id"],),
    )
    pref = await cursor.fetchone()
    enabled = bool(pref[0]) if pref else False
    threshold = pref[1] if pref else 60
    interval = pref[2] if pref else 600

    # Wallets count
    cursor2 = await db.execute(
        "SELECT COUNT(*) FROM monitored_wallets WHERE user_id = ? AND enabled = 1",
        (user["id"],),
    )
    wallet_count = (await cursor2.fetchone())[0]

    # Holdings count
    cursor3 = await db.execute(
        "SELECT COUNT(*) FROM wallet_holdings WHERE user_id = ?",
        (user["id"],),
    )
    holdings_count = (await cursor3.fetchone())[0]

    # Last sweep
    cursor4 = await db.execute(
        "SELECT MAX(created_at), risky_count FROM wallet_monitor_log WHERE user_id = ? "
        "ORDER BY created_at DESC LIMIT 1",
        (user["id"],),
    )
    log_row = await cursor4.fetchone()
    last_sweep = log_row[0] if log_row and log_row[0] else None
    risky_count = log_row[1] if log_row else 0

    next_in = max(0, int(interval - (time.time() - last_sweep))) if last_sweep else 0

    return {
        "enabled": enabled,
        "wallet_count": wallet_count,
        "holdings_count": holdings_count,
        "risky_count": risky_count,
        "threshold": threshold,
        "interval": interval,
        "last_sweep": int(last_sweep * 1000) if last_sweep else None,
        "next_sweep_in_seconds": next_in,
    }


# ------------------------------------------------------------------
# Feature 9 — Agent Memory Surface endpoint
# ------------------------------------------------------------------


@app.get("/agent/memory/entities", tags=["agent"])
@limiter.limit("30/minute")
async def list_memory_entities(request: Request):
    """List all entities (deployers/operators) the agent has learned about.

    Returns entity profiles from entity_knowledge + user-specific episode counts.
    """
    user = await _get_current_user(request)
    from .data_sources._clients import cache as _cache  # noqa: PLC0415
    db = await _cache._get_conn()

    # Get all known entities with meaningful data
    cursor = await db.execute(
        "SELECT entity_type, entity_id, total_tokens, total_rugs, "
        "total_extracted_sol, avg_risk_score, preferred_narratives, "
        "typical_rug_pattern, launch_velocity, first_seen, last_seen, "
        "sample_count, confidence "
        "FROM entity_knowledge "
        "WHERE sample_count >= 1 "
        "ORDER BY last_seen DESC LIMIT 50"
    )
    rows = await cursor.fetchall()

    # Get user's investigation count per entity (deployer)
    cursor2 = await db.execute(
        "SELECT DISTINCT ie.deployer, COUNT(*) as cnt "
        "FROM investigation_episodes ie "
        "INNER JOIN investigations inv ON ie.mint = inv.mint AND inv.user_id = ? "
        "WHERE ie.deployer IS NOT NULL AND ie.is_latest = 1 "
        "GROUP BY ie.deployer",
        (user["id"],),
    )
    user_deployer_counts = {r[0]: r[1] for r in await cursor2.fetchall()}

    # Active calibration rules count
    cursor3 = await db.execute(
        "SELECT COUNT(*) FROM calibration_rules WHERE active = 1"
    )
    active_rules = (await cursor3.fetchone())[0]

    # Total episodes
    cursor4 = await db.execute("SELECT COUNT(*) FROM investigation_episodes")
    total_episodes = (await cursor4.fetchone())[0]

    entities = []
    for r in rows:
        narratives = []
        try:
            narratives = json.loads(r[6]) if r[6] else []
        except Exception:
            pass
        entities.append({
            "entity_type": r[0],
            "entity_id": r[1],
            "total_tokens": r[2],
            "total_rugs": r[3],
            "total_extracted_sol": r[4] or 0,
            "avg_risk_score": round(r[5] or 0, 1),
            "preferred_narratives": narratives,
            "typical_rug_pattern": r[7],
            "launch_velocity": r[8],
            "first_seen": r[9],
            "last_seen": r[10],
            "sample_count": r[11],
            "confidence": r[12] or "low",
            "user_investigations": user_deployer_counts.get(r[1], 0),
        })

    return {
        "entities": entities,
        "total_entities": len(entities),
        "total_episodes": total_episodes,
        "active_rules": active_rules,
    }


@app.get("/agent/memory", tags=["agent"])
@limiter.limit("30/minute")
async def get_agent_memory(
    request: Request,
    mint: Optional[str] = Query(None),
    entity_type: Optional[str] = Query(None),
    entity_id: Optional[str] = Query(None),
):
    """Surface the agent's memory for a token, deployer, or operator.

    Returns entity knowledge, past episodes, calibration rules, and memory depth.
    """
    user = await _get_current_user(request)
    from .data_sources._clients import cache as _cache  # noqa: PLC0415
    from .cache import SQLiteCache
    from .memory_service import recall_entity, build_memory_brief

    result: dict = {"memory_depth": "none", "entity_memory": None,
                    "prior_episodes": 0, "calibration_rules": [],
                    "memory_brief": None, "timeline": []}

    if not isinstance(_cache, SQLiteCache):
        return result

    db = await _cache._get_conn()

    # Resolve entity from mint if entity_type not provided
    if mint and not entity_type:
        try:
            cached = await get_cached_lineage_report(mint)
            if cached:
                dp = getattr(cached, "deployer_profile", None)
                if dp:
                    entity_type = "deployer"
                    entity_id = getattr(dp, "address", "")
        except Exception:
            pass

    # Recall entity knowledge
    if entity_type and entity_id:
        try:
            recalled = await recall_entity(entity_type, entity_id)
            episodes = recalled.get("episodes", [])
            timeline = recalled.get("timeline", [])

            # Structure entity_memory to match mobile contract
            result["entity_memory"] = {
                "entity_type": entity_type,
                "entity_id": entity_id,
                "profile": recalled.get("profile"),
                "episodes": episodes,
                "timeline": timeline,
            }
            result["prior_episodes"] = len(episodes)
            result["timeline"] = timeline

            ep_count = len(episodes)
            result["memory_depth"] = "full" if ep_count > 10 else "partial" if ep_count > 0 else "none"
        except Exception as exc:
            logger.debug("[memory] recall failed: %s", exc)

    # Build memory brief
    if mint:
        try:
            deployer = entity_id if entity_type == "deployer" else None
            operator_fp = entity_id if entity_type == "operator" else None
            brief = await build_memory_brief(mint, deployer=deployer, operator_fp=operator_fp)
            if brief and brief.strip():
                result["memory_brief"] = brief
        except Exception as exc:
            logger.debug("[memory] brief failed: %s", exc)

    # Active calibration rules — map DB schema to mobile contract {rule_type, entity_type, adjustment, reason}
    try:
        import json as _json
        cursor = await db.execute(
            "SELECT rule_type, condition_json, adjustment, sample_count, confidence "
            "FROM calibration_rules WHERE active = 1 AND sample_count >= 3 AND confidence >= 0.7",
        )
        rules = await cursor.fetchall()
        calib_list = []
        for r in rules:
            cond = {}
            try:
                cond = _json.loads(r[1]) if r[1] else {}
            except Exception:
                pass
            calib_list.append({
                "rule_type": r[0],
                "entity_type": cond.get("entity_type", r[0]),
                "adjustment": f"{'+' if r[2] > 0 else ''}{r[2]:.0f} pts" if r[2] else "",
                "reason": cond.get("reason", cond.get("description", f"{r[3]} samples, {r[4]:.0%} confidence")),
            })
        result["calibration_rules"] = calib_list
    except Exception:
        pass

    return result


# ------------------------------------------------------------------
# Agent — background loops (watchlist sweep + briefing + auto-investigate)
# ------------------------------------------------------------------

_watchlist_sweep_task: Optional[asyncio.Task] = None
_briefing_task: Optional[asyncio.Task] = None


async def _watchlist_sweep_loop():
    """Rescan watched tokens every 2 hours and alert on risk escalation."""
    from .watchlist_monitor_service import run_single_rescan, SWEEP_INTERVAL_SECONDS
    from .data_sources._clients import cache as _cache  # noqa: PLC0415
    # Sweep loop runs every 30min. Per-user sweep_interval is respected
    # by checking when each user's last sweep was.
    _LOOP_INTERVAL = 900  # 15 min check cycle (was 30 min)
    first_run = True
    while True:
        # Sleep in short chunks so the watchdog sees heartbeats
        _sleep_total = 60 if first_run else _LOOP_INTERVAL
        _slept = 0
        while _slept < _sleep_total:
            _chunk = min(120, _sleep_total - _slept)
            await asyncio.sleep(_chunk)
            _heartbeat("sweep")
            _slept += _chunk
        first_run = False
        try:
            # Use read pool for these SELECT queries (don't block the writer)
            rdb = await _cache._get_read_conn() if hasattr(_cache, '_get_read_conn') else await _cache._get_conn()
            cursor = await rdb.execute(
                "SELECT uw.id, uw.user_id, uw.value, "
                "COALESCE(ap.sweep_interval, 2700) as sweep_interval, "
                "COALESCE(u.plan, 'free') as plan "
                "FROM user_watches uw "
                "LEFT JOIN agent_prefs ap ON uw.user_id = ap.user_id "
                "LEFT JOIN users u ON uw.user_id = u.id "
                "WHERE uw.sub_type IN ('mint', 'deployer')"
            )
            watches = await cursor.fetchall()

            # Skip watches that have active OpenClaw crons (managed by cron_manager)
            cron_cursor = await rdb.execute(
                "SELECT name FROM user_crons WHERE enabled = 1 AND name LIKE 'lineage:watchlist:%'"
            )
            _cron_managed = set()
            for (cn,) in await cron_cursor.fetchall():
                parts = cn.split(":")
                if len(parts) >= 3:
                    try:
                        _cron_managed.add(int(parts[2]))
                    except ValueError:
                        pass

            # Filter: only sweep users whose last sweep was > sweep_interval ago
            now = time.time()
            logger.info("[sweep] %d watches found, %d cron-managed (skipped)", len(watches), len(_cron_managed))
            for _wi, (watch_id, user_id, _mint_val, user_sweep_interval, user_plan) in enumerate(watches):
                if watch_id in _cron_managed:
                    continue  # managed by OpenClaw cron — skip
                # Check last sweep for this specific watch
                cursor2 = await rdb.execute(
                    "SELECT MAX(scanned_at) FROM watch_snapshots WHERE watch_id = ?",
                    (watch_id,),
                )
                last_sweep_row = await cursor2.fetchone()
                last_sweep = last_sweep_row[0] if last_sweep_row and last_sweep_row[0] else 0
                if now - last_sweep < user_sweep_interval:
                    continue  # too soon for this user's preference
                logger.info("[sweep] rescanning watch=%d user=%d mint=%s (last=%ds ago)", watch_id, user_id, _mint_val[:12], int(now - last_sweep))
                if _wi > 0:
                    await asyncio.sleep(15)  # stagger rescans — 15s avoids RPC saturation
                _heartbeat("sweep")  # keep watchdog alive between watches
                try:
                    result = await run_single_rescan(watch_id, user_id, _cache, plan=user_plan)
                    if not result:
                        continue

                    # Broadcast critical/warning flags as WebSocket + FCM alerts
                    for flag in result.get("flags", []):
                        if flag["severity"] in ("critical", "warning"):
                            try:
                                from .alert_service import _broadcast_web_alert, _send_fcm_push
                                _flag_title = f"{'🔴' if flag['severity'] == 'critical' else '⚠️'} {flag['title']}"
                                # Extract token metadata from flag detail
                                _fd = {}
                                try:
                                    _fd = json.loads(flag.get("detail", "{}")) if isinstance(flag.get("detail"), str) else (flag.get("detail") or {})
                                except Exception:
                                    pass
                                await _broadcast_web_alert({
                                    "type": "sweep_flag",
                                    "alert_type": flag["flag_type"],
                                    "title": _flag_title,
                                    "message": flag["title"],
                                    "body": flag["title"],
                                    "mint": result["mint"],
                                    "token_name": _fd.get("token_name") or _fd.get("name") or result["mint"][:8],
                                    "image_uri": _fd.get("image_uri") or None,
                                    "risk_score": result.get("new_score", 0),
                                    "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                                    "id": f"sweep-{result['mint'][:8]}-{flag['flag_type']}-{int(time.time())}",
                                    "read": False,
                                }, user_id=user_id)
                                # Direct FCM push to this user (even if not a mint watcher)
                                _user_cursor = await rdb.execute(
                                    "SELECT fcm_token FROM users WHERE id = ? AND fcm_token IS NOT NULL",
                                    (user_id,),
                                )
                                _user_row = await _user_cursor.fetchone()
                                if _user_row and _user_row[0]:
                                    asyncio.create_task(_send_fcm_push(
                                        _user_row[0],
                                        title=_flag_title,
                                        body=flag["title"],
                                        data={
                                            "type": "sweep_flag",
                                            "mint": result["mint"],
                                            "flag_type": flag["flag_type"],
                                            "urgency": "high" if flag["severity"] == "critical" else "normal",
                                        },
                                    ))
                            except Exception as _bcast_exc:
                                logger.warning("[sweep] flag broadcast failed for watch %d: %s", watch_id, _bcast_exc)

                    if result.get("escalated"):
                        # Auto-investigate if user enabled it
                        cursor2 = await rdb.execute(
                            "SELECT auto_investigate FROM agent_prefs WHERE user_id = ?",
                            (user_id,),
                        )
                        pref = await cursor2.fetchone()
                        if pref and pref[0]:
                            asyncio.create_task(
                                _auto_investigate_token(result["mint"], user_id, _cache)
                            )
                except Exception as exc:
                    logger.warning("[sweep] watch %d failed: %s", watch_id, exc)
        except Exception as exc:
            logger.exception("[sweep] loop error: %s", exc)


async def _auto_investigate_token(mint: str, user_id: int, cache):
    """Run auto-investigation and store result in investigations table."""
    try:
        from .investigate_service import run_investigation
        from .subscription_tiers import get_limits

        db = await cache._get_conn()
        cursor = await db.execute("SELECT plan FROM users WHERE id = ?", (user_id,))
        row = await cursor.fetchone()
        tier = get_limits(row[0] if row else "free")

        verdict = None
        async for event in run_investigation(mint, tier=tier, cache=cache, user_id=user_id):
            ev_type = event.get("event", "")
            if ev_type == "verdict":
                import json as _json
                verdict = _json.loads(event["data"]) if isinstance(event["data"], str) else event.get("data")

        if verdict:
            await _store_investigation(cache, user_id, mint, verdict)
            await _notify_investigation_complete(user_id, mint, verdict)
            logger.info("[auto-investigate] completed %s for user %d — score %s",
                        mint[:12], user_id, verdict.get("risk_score"))
    except Exception as exc:
        logger.exception("[auto-investigate] failed %s for user %d: %s", mint[:12], user_id, exc)


async def _store_investigation(cache, user_id: int, mint: str, verdict: dict):
    """Persist an investigation verdict to the investigations table."""
    import json as _json  # noqa: PLC0415
    try:
        db = await cache._get_conn()
        key_findings = verdict.get("key_findings", [])
        if isinstance(key_findings, list):
            key_findings = _json.dumps(key_findings)

        # Extract name/symbol from narrative or verdict fields
        name = verdict.get("name") or ""
        symbol = verdict.get("symbol") or ""

        # Retry up to 3 times on database locked
        for _attempt in range(3):
            try:
                await db.execute(
                    "INSERT INTO investigations "
                    "(user_id, mint, name, symbol, risk_score, verdict_summary, "
                    "key_findings, model, turns_used, tokens_used, created_at) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (user_id, mint, name, symbol,
                     verdict.get("risk_score"), verdict.get("verdict_summary"),
                     key_findings, verdict.get("model"),
                     verdict.get("turns_used", 0), verdict.get("tokens_used", 0),
                     time.time()),
                )
                await db.commit()
                logger.info("[store_investigation] saved for user=%d mint=%s score=%s",
                            user_id, mint[:12], verdict.get("risk_score"))
                return
            except Exception as db_exc:
                if "locked" in str(db_exc).lower() and _attempt < 2:
                    await asyncio.sleep(0.5 * (_attempt + 1))
                    continue
                raise
    except Exception as exc:
        logger.error("[store_investigation] FAILED for user=%d mint=%s: %s", user_id, mint[:12], exc)


async def _notify_investigation_complete(user_id: int, mint: str, verdict: dict):
    """Send FCM push + WebSocket alert when a background investigation completes."""
    try:
        from .alert_service import _send_fcm_push, _broadcast_web_alert
        from .data_sources._clients import cache as _cache

        risk = verdict.get("risk_score", 0)
        name = verdict.get("name") or mint[:8]
        symbol = verdict.get("symbol") or ""
        label = f"{name} ({symbol})" if symbol else name
        summary = verdict.get("verdict_summary", "")[:120]

        if risk >= 70:
            emoji = "🔴"
        elif risk >= 40:
            emoji = "🟡"
        else:
            emoji = "🟢"

        title = f"{emoji} Investigation Complete — {label}"
        body = f"Risk {risk}/100 · {summary}" if summary else f"Risk score: {risk}/100"

        # 1. WebSocket broadcast (if user is still connected)
        await _broadcast_web_alert({
            "type": "investigation_complete",
            "title": title,
            "body": body,
            "mint": mint,
            "token_name": name,
            "image_uri": verdict.get("image_uri"),
            "risk_score": risk,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "id": f"inv-{mint[:8]}-{int(time.time())}",
            "read": False,
        }, user_id=user_id)

        # 2. Direct FCM push to this specific user (not just watchers)
        db = await _cache._get_conn()
        cursor = await db.execute(
            "SELECT fcm_token FROM users WHERE id = ? AND fcm_token IS NOT NULL",
            (user_id,),
        )
        row = await cursor.fetchone()
        if row and row[0]:
            await _send_fcm_push(
                row[0],
                title=title,
                body=body,
                data={
                    "type": "investigation_complete",
                    "mint": mint,
                    "risk_score": str(risk),
                    "urgency": "high" if risk >= 70 else "normal",
                },
            )
    except Exception as exc:
        logger.debug("[notify_investigation] failed for user=%d mint=%s: %s", user_id, mint[:12], exc)


def _schedule_watchlist_sweep():
    global _watchlist_sweep_task
    _watchlist_sweep_task = asyncio.create_task(_watchlist_sweep_loop())
    logger.info("Watchlist sweep scheduled (every 45min)")


def _cancel_watchlist_sweep():
    global _watchlist_sweep_task
    if _watchlist_sweep_task:
        _watchlist_sweep_task.cancel()


# ── Market Pulse (fast price check between full sweeps) ────────────────────
_market_pulse_task: Optional[asyncio.Task] = None


async def _market_pulse_loop():
    """Lightweight price check every 10 min — triggers urgent rescan on drops."""
    from .watchlist_monitor_service import run_market_pulse, PULSE_INTERVAL_SECONDS
    from .data_sources._clients import cache as _cache  # noqa: PLC0415

    await asyncio.sleep(120)  # wait 2 min after startup before first pulse
    while True:
        _heartbeat("pulse")
        try:
            triggered = await run_market_pulse(_cache)
            if triggered:
                # Broadcast pulse-triggered alerts via WebSocket
                for t in triggered:
                    try:
                        from .alert_service import _broadcast_web_alert, _send_fcm_push
                        # Try to get token name/image from latest flag detail
                        _pulse_name = t["mint"][:8]
                        _pulse_image = None
                        try:
                            _pc = await db.execute(
                                "SELECT detail FROM sweep_flags WHERE mint = ? AND flag_type NOT IN ('_SNAPSHOT','_REFERENCE') "
                                "ORDER BY created_at DESC LIMIT 1", (t["mint"],))
                            _pr = await _pc.fetchone()
                            if _pr:
                                _pd = json.loads(_pr[0]) if _pr[0] else {}
                                _pulse_name = _pd.get("token_name") or _pd.get("name") or _pulse_name
                                _pulse_image = _pd.get("image_uri")
                        except Exception:
                            pass
                        await _broadcast_web_alert({
                            "type": "pulse_alert",
                            "alert_type": "price_movement",
                            "title": f"⚡ {t['trigger']}",
                            "message": t["trigger"],
                            "body": f"Price: ${t['now_price']:.6f}",
                            "mint": t["mint"],
                            "token_name": _pulse_name,
                            "image_uri": _pulse_image,
                            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                            "id": f"pulse-{t['mint'][:8]}-{int(time.time())}",
                            "read": False,
                        }, user_id=t["user_id"])
                        # Direct FCM push
                        db = await _cache._get_conn()
                        _user_cursor = await db.execute(
                            "SELECT fcm_token FROM users WHERE id = ? AND fcm_token IS NOT NULL",
                            (t["user_id"],),
                        )
                        _user_row = await _user_cursor.fetchone()
                        if _user_row and _user_row[0]:
                            asyncio.create_task(_send_fcm_push(
                                _user_row[0],
                                title=f"⚡ {t['trigger']}",
                                body=f"Price: ${t['now_price']:.6f}",
                                data={
                                    "type": "pulse_alert",
                                    "mint": t["mint"],
                                    "urgency": "high",
                                },
                            ))
                    except Exception:
                        pass
        except Exception as exc:
            logger.warning("[pulse-loop] error: %s", exc)

        await asyncio.sleep(PULSE_INTERVAL_SECONDS)


def _schedule_market_pulse():
    global _market_pulse_task
    _market_pulse_task = asyncio.create_task(_market_pulse_loop())
    logger.info("Market pulse scheduled (every 10min)")


def _cancel_market_pulse():
    global _market_pulse_task
    if _market_pulse_task:
        _market_pulse_task.cancel()


def _schedule_briefing_loop():
    global _briefing_task
    from .briefing_service import schedule_briefing_sweep  # noqa: PLC0415
    from .data_sources._clients import cache as _cache  # noqa: PLC0415
    _briefing_task = asyncio.create_task(schedule_briefing_sweep(_cache))
    logger.info("Briefing sweep scheduled (daily at %d:00 UTC)", 8)


def _cancel_briefing_loop():
    global _briefing_task
    if _briefing_task:
        _briefing_task.cancel()


_wallet_monitor_task: Optional[asyncio.Task] = None


def _schedule_wallet_monitor():
    global _wallet_monitor_task
    from .wallet_monitor_service import wallet_monitor_loop  # noqa: PLC0415
    from .data_sources._clients import cache as _cache  # noqa: PLC0415
    _wallet_monitor_task = asyncio.create_task(wallet_monitor_loop(_cache))
    logger.info("Wallet monitor scheduled (check every 2min)")


def _cancel_wallet_monitor():
    global _wallet_monitor_task
    if _wallet_monitor_task:
        _wallet_monitor_task.cancel()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "lineage_agent.api:app",
        host=API_HOST,
        port=API_PORT,
        reload=True,
    )