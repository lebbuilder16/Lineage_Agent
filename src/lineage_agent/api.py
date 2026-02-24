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

from fastapi import FastAPI, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from starlette.middleware.base import BaseHTTPMiddleware

from config import (
    API_HOST,
    API_PORT,
    CORS_ORIGINS,
    RATE_LIMIT_LINEAGE,
    RATE_LIMIT_SEARCH,
    SOLANA_RPC_ENDPOINT,
)
from .lineage_detector import (
    close_clients,
    detect_lineage,
    init_clients,
    search_tokens,
)
from .logging_config import generate_request_id, request_id_ctx, setup_logging
from .models import BatchLineageRequest, BatchLineageResponse, LineageResult, TokenSearchResult

# Initialise structured logging early
setup_logging()
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Base58 validation regex (Solana addresses are 32-44 base58 chars)
# ---------------------------------------------------------------------------
_BASE58_RE = re.compile(r"^[1-9A-HJ-NP-Za-km-z]{32,44}$")


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

    logger.info("Starting up – initialising HTTP clients …")
    await init_clients()
    yield
    logger.info("Shutting down – closing HTTP clients …")
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

# CORS (so the Next.js frontend can call from localhost:3000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
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
    """Simple health check."""
    return {"status": "ok"}


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
        return await detect_lineage(mint)
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

        result = await detect_lineage(mint, progress_cb=_ws_progress)
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
