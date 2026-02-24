"""
REST API for the Meme Lineage Agent using FastAPI.

Endpoints
---------
GET /health              - Health check
GET /lineage?mint=<MINT> - Full lineage detection for a token
GET /search?q=<QUERY>    - Search for tokens by name / symbol
"""

from __future__ import annotations

import logging
import os
import sys

# Ensure ``src/`` is on the path so ``config`` can be found
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from config import API_HOST, API_PORT, CORS_ORIGINS
from .lineage_detector import detect_lineage, search_tokens
from .models import LineageResult, TokenSearchResult

logger = logging.getLogger(__name__)

app = FastAPI(
    title="Meme Lineage Agent API",
    description="Detect memecoin lineage on Solana - find the root token and its clones.",
    version="1.0.0",
)

# CORS (so the Next.js frontend can call from localhost:3000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
async def get_lineage(
    mint: str = Query(..., description="Solana mint address of the token"),
) -> LineageResult:
    """Return full lineage information for the given token mint."""
    if not mint or len(mint) < 30:
        raise HTTPException(status_code=400, detail="Invalid mint address")
    try:
        return await detect_lineage(mint)
    except Exception as exc:
        logger.exception("Lineage detection failed for %s", mint)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get(
    "/search",
    response_model=list[TokenSearchResult],
    tags=["search"],
)
async def search(
    q: str = Query(..., description="Token name or symbol to search"),
) -> list[TokenSearchResult]:
    """Search Solana tokens by name or symbol via DexScreener."""
    if not q:
        raise HTTPException(status_code=400, detail="Query string required")
    try:
        return await search_tokens(q)
    except Exception as exc:
        logger.exception("Token search failed for '%s'", q)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


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
