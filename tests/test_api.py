"""Integration tests for the FastAPI REST API.

These tests use FastAPI's TestClient with mocked external services
(DexScreener + Solana RPC) so they don't require network access.
"""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient, ASGITransport

from lineage_agent.api import app
from lineage_agent.models import LineageResult, TokenMetadata, TokenSearchResult


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


# ------------------------------------------------------------------
# Health endpoint
# ------------------------------------------------------------------


@pytest.mark.anyio
async def test_health(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


# ------------------------------------------------------------------
# Root redirect
# ------------------------------------------------------------------


@pytest.mark.anyio
async def test_root_redirects(client):
    resp = await client.get("/", follow_redirects=False)
    assert resp.status_code == 307
    assert "/docs" in resp.headers.get("location", "")


# ------------------------------------------------------------------
# Lineage endpoint
# ------------------------------------------------------------------


@pytest.mark.anyio
async def test_lineage_invalid_mint(client):
    resp = await client.get("/lineage", params={"mint": "short"})
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_lineage_success(client):
    fake_result = LineageResult(
        mint="DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
        query_token=TokenMetadata(
            mint="DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
            name="Bonk",
            symbol="BONK",
        ),
        root=TokenMetadata(
            mint="DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
            name="Bonk",
            symbol="BONK",
        ),
        confidence=0.85,
        derivatives=[],
        family_size=1,
    )

    with patch(
        "lineage_agent.api.detect_lineage",
        new_callable=AsyncMock,
        return_value=fake_result,
    ):
        resp = await client.get(
            "/lineage",
            params={
                "mint": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"
            },
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["confidence"] == 0.85
    assert data["root"]["name"] == "Bonk"


@pytest.mark.anyio
async def test_lineage_internal_error(client):
    with patch(
        "lineage_agent.api.detect_lineage",
        new_callable=AsyncMock,
        side_effect=RuntimeError("boom"),
    ):
        resp = await client.get(
            "/lineage",
            params={
                "mint": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"
            },
        )
    assert resp.status_code == 500
    assert "boom" in resp.json()["detail"]


# ------------------------------------------------------------------
# Search endpoint
# ------------------------------------------------------------------


@pytest.mark.anyio
async def test_search_empty_query(client):
    resp = await client.get("/search", params={"q": ""})
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_search_success(client):
    fake_results = [
        TokenSearchResult(
            mint="MINT_A",
            name="BonkInu",
            symbol="BINU",
        ),
    ]

    with patch(
        "lineage_agent.api.search_tokens",
        new_callable=AsyncMock,
        return_value=fake_results,
    ):
        resp = await client.get("/search", params={"q": "bonk"})
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["name"] == "BonkInu"
