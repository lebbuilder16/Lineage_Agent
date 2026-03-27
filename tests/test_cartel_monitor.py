"""Tests for cartel monitoring CRUD endpoints."""
from __future__ import annotations

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import aiosqlite
import pytest

from lineage_agent.api import app

# Use httpx for async testing with FastAPI
from httpx import ASGITransport, AsyncClient


async def _setup_db(db):
    """Create minimal tables needed for cartel monitor tests."""
    await db.execute(
        "CREATE TABLE IF NOT EXISTS users ("
        "  id INTEGER PRIMARY KEY, email TEXT, tier TEXT DEFAULT 'free',"
        "  telegram_chat_id TEXT, discord_webhook_url TEXT, fcm_token TEXT"
        ")"
    )
    await db.execute(
        "CREATE TABLE IF NOT EXISTS user_watches ("
        "  id INTEGER PRIMARY KEY AUTOINCREMENT,"
        "  user_id INTEGER, sub_type TEXT, value TEXT"
        ")"
    )
    await db.execute(
        "INSERT OR IGNORE INTO users (id, email, tier) VALUES (1, 'test@test.com', 'pro')"
    )
    await db.commit()


@pytest.fixture
def mock_user():
    """Mock _get_current_user to return a test user."""
    user = {"id": 1, "email": "test@test.com", "tier": "pro"}
    with patch("lineage_agent.api._get_current_user", new_callable=AsyncMock, return_value=user) as m:
        yield m


@pytest.fixture
async def mock_cache():
    """Create an in-memory SQLite cache mock."""
    db = await aiosqlite.connect(":memory:")
    await _setup_db(db)

    cache = MagicMock()
    cache._get_conn = AsyncMock(return_value=db)

    with patch("lineage_agent.data_sources._clients.cache", cache):
        yield cache

    await db.close()


@pytest.mark.asyncio
@pytest.mark.skip(reason="cartel-monitors endpoints not yet implemented in api.py")
async def test_cartel_monitor_crud(mock_user, mock_cache):
    """Test add, list, delete flow for cartel monitors."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Add a cartel monitor
        resp = await client.post(
            "/auth/cartel-monitors",
            json={"cartel_id": "cartel_42"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "monitoring_started"
        assert data["cartel_id"] == "cartel_42"

        # Adding again should return already_monitoring
        resp = await client.post(
            "/auth/cartel-monitors",
            json={"cartel_id": "cartel_42"},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "already_monitoring"

        # List monitors
        resp = await client.get("/auth/cartel-monitors")
        assert resp.status_code == 200
        monitors = resp.json()
        assert len(monitors) == 1
        assert monitors[0]["cartel_id"] == "cartel_42"

        # Delete monitor
        resp = await client.delete("/auth/cartel-monitors/cartel_42")
        assert resp.status_code == 200
        assert resp.json()["status"] == "monitoring_stopped"

        # List should be empty now
        resp = await client.get("/auth/cartel-monitors")
        assert resp.status_code == 200
        assert resp.json() == []

        # Delete non-existent should 404
        resp = await client.delete("/auth/cartel-monitors/cartel_42")
        assert resp.status_code == 404


@pytest.mark.asyncio
@pytest.mark.skip(reason="cartel-monitors endpoints not yet implemented in api.py")
async def test_cartel_monitor_requires_cartel_id(mock_user, mock_cache):
    """Test that missing cartel_id returns 400."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/auth/cartel-monitors", json={})
        assert resp.status_code == 400
