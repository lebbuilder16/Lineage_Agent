"""Integration tests for the FastAPI REST API.

These tests use FastAPI's TestClient with mocked external services
(DexScreener + Solana RPC) so they don't require network access.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient, ASGITransport
from starlette.testclient import TestClient

from lineage_agent.api import app
from lineage_agent.models import LineageResult, TokenMetadata, TokenSearchResult

_WS_MINT = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"


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
    body = resp.json()
    assert body["status"] == "ok"
    assert "uptime_seconds" in body


@pytest.mark.anyio
async def test_admin_health(client):
    resp = await client.get("/admin/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert "uptime_seconds" in body
    assert "circuit_breakers" in body
    assert "dexscreener" in body["circuit_breakers"]
    assert "solana_rpc" in body["circuit_breakers"]
    assert "jupiter" in body["circuit_breakers"]


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
    # Too short
    resp = await client.get("/lineage", params={"mint": "short"})
    assert resp.status_code == 400
    assert "base58" in resp.json()["detail"].lower()


@pytest.mark.anyio
async def test_lineage_invalid_mint_non_base58(client):
    """Non-base58 chars (0, O, I, l) should be rejected."""
    resp = await client.get(
        "/lineage",
        params={"mint": "0OIl" + "A" * 40},  # contains invalid base58 chars
    )
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
    # Internal error details should NOT leak to the client
    assert resp.json()["detail"] == "Internal server error"
    assert "boom" not in resp.json()["detail"]


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


@pytest.mark.anyio
async def test_search_query_too_long(client):
    """Query strings over 100 chars should be rejected."""
    resp = await client.get("/search", params={"q": "x" * 101})
    assert resp.status_code == 400
    assert "100" in resp.json()["detail"]


@pytest.mark.anyio
async def test_search_pagination(client):
    """Limit and offset params should slice the result set."""
    fake_results = [
        TokenSearchResult(mint=f"MINT_{i}", name=f"Token{i}", symbol=f"T{i}")
        for i in range(10)
    ]

    with patch(
        "lineage_agent.api.search_tokens",
        new_callable=AsyncMock,
        return_value=fake_results,
    ):
        # offset=3, limit=2 → items 3 and 4
        resp = await client.get("/search", params={"q": "tok", "limit": 2, "offset": 3})
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    assert data[0]["name"] == "Token3"
    assert data[1]["name"] == "Token4"


@pytest.mark.anyio
async def test_search_pagination_defaults(client):
    """Default limit=20, offset=0."""
    fake_results = [
        TokenSearchResult(mint=f"M{i}", name=f"T{i}", symbol=f"S{i}")
        for i in range(25)
    ]

    with patch(
        "lineage_agent.api.search_tokens",
        new_callable=AsyncMock,
        return_value=fake_results,
    ):
        resp = await client.get("/search", params={"q": "test"})
    assert resp.status_code == 200
    assert len(resp.json()) == 20  # default limit


# ------------------------------------------------------------------
# POST /lineage/batch
# ------------------------------------------------------------------

_MINT_A = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"
_MINT_B = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"


@pytest.mark.anyio
async def test_batch_lineage_success(client):
    """Batch endpoint returns results for each mint."""

    async def _mock_detect(mint):
        return LineageResult(
            mint=mint,
            root=TokenMetadata(mint=mint, name=mint[:4]),
            confidence=0.9,
            derivatives=[],
            family_size=1,
        )

    with patch(
        "lineage_agent.api.detect_lineage",
        new_callable=AsyncMock,
        side_effect=_mock_detect,
    ):
        resp = await client.post("/lineage/batch", json={"mints": [_MINT_A, _MINT_B]})
    assert resp.status_code == 200
    data = resp.json()
    assert _MINT_A in data["results"]
    assert _MINT_B in data["results"]


@pytest.mark.anyio
async def test_batch_lineage_invalid_mint(client):
    """Invalid mint in batch should return 400."""
    resp = await client.post("/lineage/batch", json={"mints": ["0OIlBad"]})
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_batch_lineage_empty(client):
    """Empty mints array should be rejected by Pydantic."""
    resp = await client.post("/lineage/batch", json={"mints": []})
    assert resp.status_code == 422


@pytest.mark.anyio
async def test_batch_lineage_too_many(client):
    """More than 10 mints should be rejected."""
    mints = [_MINT_A] * 11
    resp = await client.post("/lineage/batch", json={"mints": mints})
    assert resp.status_code == 422


@pytest.mark.anyio
async def test_batch_lineage_partial_failure(client):
    """When one mint fails, others should still succeed."""
    call_count = 0

    async def _mock_detect(mint):
        nonlocal call_count
        call_count += 1
        if mint == _MINT_B:
            raise RuntimeError("RPC down")
        return LineageResult(
            mint=mint,
            root=TokenMetadata(mint=mint, name="OK"),
            confidence=1.0,
            derivatives=[],
            family_size=1,
        )

    with patch(
        "lineage_agent.api.detect_lineage",
        new_callable=AsyncMock,
        side_effect=_mock_detect,
    ):
        resp = await client.post("/lineage/batch", json={"mints": [_MINT_A, _MINT_B]})
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data["results"][_MINT_A], dict)
    assert data["results"][_MINT_B] == "Internal server error"


# ------------------------------------------------------------------
# WebSocket /ws/lineage
# ------------------------------------------------------------------


def test_ws_lineage_success():
    """WebSocket should stream progress then deliver result."""
    fake = LineageResult(
        mint=_WS_MINT,
        root=TokenMetadata(mint=_WS_MINT, name="Root"),
        confidence=0.95,
        derivatives=[],
        family_size=1,
    )

    with patch(
        "lineage_agent.api.detect_lineage",
        new_callable=AsyncMock,
        return_value=fake,
    ):
        sync_client = TestClient(app)
        with sync_client.websocket_connect("/ws/lineage") as ws:
            ws.send_json({"mint": _WS_MINT})
            msgs = []
            while True:
                msg = ws.receive_json()
                msgs.append(msg)
                if msg.get("done"):
                    break
    # At least: start progress + metadata progress + complete + done
    assert len(msgs) >= 2
    assert msgs[-1]["done"] is True
    assert msgs[-1]["result"]["mint"] == _WS_MINT


def test_ws_lineage_invalid_mint():
    """WebSocket should reject invalid mints gracefully."""
    sync_client = TestClient(app)
    with sync_client.websocket_connect("/ws/lineage") as ws:
        ws.send_json({"mint": "0OIlBAD"})
        msg = ws.receive_json()
    assert msg["done"] is True
    assert "Invalid" in msg["error"]


def test_ws_lineage_error():
    """WebSocket should send error on detect_lineage failure."""
    with patch(
        "lineage_agent.api.detect_lineage",
        new_callable=AsyncMock,
        side_effect=RuntimeError("boom"),
    ):
        sync_client = TestClient(app)
        with sync_client.websocket_connect("/ws/lineage") as ws:
            ws.send_json({"mint": _WS_MINT})
            msgs = []
            while True:
                msg = ws.receive_json()
                msgs.append(msg)
                if msg.get("done"):
                    break
    assert msgs[-1]["done"] is True
    assert "error" in msgs[-1]
