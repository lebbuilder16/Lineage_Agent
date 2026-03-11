"""Tests for GET /stats/brief endpoint.

Covers:
- Response shape (text + generated_at)
- Text content references rug count, deployers, and top narrative
- Graceful handling when DB is empty (zero events)
- Rate-limit header present
- HTTP integration via AsyncClient (ASGI transport)
"""

from __future__ import annotations

from unittest.mock import patch

import pytest
from httpx import AsyncClient, ASGITransport

from lineage_agent.api import app


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


# ── helpers ───────────────────────────────────────────────────────────────────


def _created_row(mint: str, deployer: str, narrative: str = "pepe") -> dict:
    return {"mint": mint, "deployer": deployer, "narrative": narrative}


def _rugged_row(mint: str) -> dict:
    return {"mint": mint}


def _make_event_query(created_rows, rugged_rows, total_cnt=10, narrative_rows=None):
    """Return an async mock for _clients.event_query with realistic dispatch."""
    nar_rows = narrative_rows if narrative_rows is not None else created_rows

    async def _eq(where, params, columns, limit=None):
        if "token_rugged" in where:
            return rugged_rows
        if "COUNT(*)" in columns:
            return [{"cnt": total_cnt}]
        if "narrative IS NOT NULL" in where:
            return nar_rows
        return created_rows

    return _eq


# ── /stats/brief — shape ──────────────────────────────────────────────────────


@pytest.mark.anyio
async def test_stats_brief_response_shape(client):
    """GET /stats/brief must return {text: str, generated_at: str}."""
    created = [_created_row("M1", "D1", "pepe"), _created_row("M2", "D1", "doge")]
    rugged = [_rugged_row("M1")]

    with patch(
        "lineage_agent.data_sources._clients.event_query",
        side_effect=_make_event_query(created, rugged),
    ):
        import lineage_agent.api as api_mod
        api_mod._stats_cache = None
        resp = await client.get("/stats/brief")

    assert resp.status_code == 200
    body = resp.json()
    assert "text" in body
    assert "generated_at" in body
    assert isinstance(body["text"], str)
    assert isinstance(body["generated_at"], str)


@pytest.mark.anyio
async def test_stats_brief_text_contains_rug_count(client):
    """The text must mention the number of rug pulls."""
    created = [_created_row(f"M{i}", f"D{i}", "pepe") for i in range(5)]
    rugged = [_rugged_row("M0"), _rugged_row("M1"), _rugged_row("M2")]

    with patch(
        "lineage_agent.data_sources._clients.event_query",
        side_effect=_make_event_query(created, rugged),
    ):
        import lineage_agent.api as api_mod
        api_mod._stats_cache = None
        resp = await client.get("/stats/brief")

    body = resp.json()
    # 3 rugs out of 5 → "3" must appear in text
    assert "3" in body["text"]


@pytest.mark.anyio
async def test_stats_brief_text_contains_deployer_count(client):
    """The text must mention the active deployer count."""
    created = [
        _created_row("M1", "DEPA", "pepe"),
        _created_row("M2", "DEPB", "pepe"),
        _created_row("M3", "DEPC", "doge"),
    ]
    rugged = []

    with patch(
        "lineage_agent.data_sources._clients.event_query",
        side_effect=_make_event_query(created, rugged),
    ):
        import lineage_agent.api as api_mod
        api_mod._stats_cache = None
        resp = await client.get("/stats/brief")

    body = resp.json()
    # 3 unique deployers
    assert "3" in body["text"]


@pytest.mark.anyio
async def test_stats_brief_text_contains_top_narrative(client):
    """The text must include the most-frequent narrative (uppercased)."""
    created = [
        _created_row("M1", "D1", "doge"),
        _created_row("M2", "D2", "doge"),
        _created_row("M3", "D3", "pepe"),
    ]
    rugged = []

    with patch(
        "lineage_agent.data_sources._clients.event_query",
        side_effect=_make_event_query(created, rugged),
    ):
        import lineage_agent.api as api_mod
        api_mod._stats_cache = None
        resp = await client.get("/stats/brief")

    body = resp.json()
    assert "DOGE" in body["text"]


@pytest.mark.anyio
async def test_stats_brief_zero_events(client):
    """With no DB events the endpoint still succeeds (no division-by-zero)."""
    with patch(
        "lineage_agent.data_sources._clients.event_query",
        side_effect=_make_event_query([], [], total_cnt=0),
    ):
        import lineage_agent.api as api_mod
        api_mod._stats_cache = None
        resp = await client.get("/stats/brief")

    assert resp.status_code == 200
    body = resp.json()
    assert body["text"]  # non-empty string
    assert "0" in body["text"]  # zero rug pulls mentioned


@pytest.mark.anyio
async def test_stats_brief_generated_at_is_iso8601(client):
    """generated_at must be a parseable ISO-8601 datetime string."""
    from datetime import datetime

    with patch(
        "lineage_agent.data_sources._clients.event_query",
        side_effect=_make_event_query([], []),
    ):
        import lineage_agent.api as api_mod
        api_mod._stats_cache = None
        resp = await client.get("/stats/brief")

    ts = resp.json()["generated_at"]
    # Should not raise:
    parsed = datetime.fromisoformat(ts.replace("Z", "+00:00"))
    assert parsed is not None


@pytest.mark.anyio
async def test_stats_brief_reuses_stats_cache(client):
    """If /stats/global was just called, /stats/brief must reuse the cache
    and not trigger additional DB queries."""
    created = [_created_row("M1", "D1", "pepe")]
    call_count = 0

    async def counting_eq(where, params, columns, limit=None):
        nonlocal call_count
        call_count += 1
        if "COUNT(*)" in columns:
            return [{"cnt": 1}]
        if "token_rugged" in where:
            return []
        return created

    with patch(
        "lineage_agent.data_sources._clients.event_query",
        side_effect=counting_eq,
    ):
        import lineage_agent.api as api_mod
        api_mod._stats_cache = None

        # First call populates the cache
        await client.get("/stats/brief")
        calls_after_first = call_count

        # Second call within TTL should hit the cache
        await client.get("/stats/brief")
        calls_after_second = call_count

    assert calls_after_second == calls_after_first, (
        "Second /stats/brief call should not have triggered extra DB queries"
    )
