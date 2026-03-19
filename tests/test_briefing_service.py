"""Tests for briefing_service — store/retrieve briefings with in-memory SQLite."""
from __future__ import annotations

import asyncio
import time

import aiosqlite
import pytest


# ---------------------------------------------------------------------------
# Minimal cache stub backed by in-memory SQLite
# ---------------------------------------------------------------------------

class _FakeCache:
    def __init__(self, db):
        self._db = db

    async def _get_conn(self):
        return self._db


async def _make_cache():
    db = await aiosqlite.connect(":memory:")
    await db.execute("PRAGMA foreign_keys=ON")
    await db.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            privy_id TEXT UNIQUE NOT NULL,
            email TEXT,
            wallet_address TEXT,
            plan TEXT NOT NULL DEFAULT 'free',
            api_key TEXT UNIQUE NOT NULL,
            created_at REAL NOT NULL
        )
        """
    )
    await db.execute(
        """
        CREATE TABLE IF NOT EXISTS user_watches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            sub_type TEXT NOT NULL,
            value TEXT NOT NULL,
            created_at REAL NOT NULL
        )
        """
    )
    await db.execute(
        """
        CREATE TABLE IF NOT EXISTS briefings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            content TEXT NOT NULL,
            created_at REAL NOT NULL
        )
        """
    )
    await db.execute(
        "CREATE INDEX IF NOT EXISTS idx_briefings_user ON briefings(user_id, created_at)"
    )
    await db.commit()
    return _FakeCache(db), db


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_store_and_get_latest_briefing():
    cache, db = await _make_cache()
    # Create a user
    await db.execute(
        "INSERT INTO users (privy_id, api_key, created_at) VALUES (?, ?, ?)",
        ("privy_1", "lin_abc", time.time()),
    )
    await db.commit()

    from lineage_agent.briefing_service import get_latest_briefing, store_briefing

    # No briefing yet
    result = await get_latest_briefing(cache, 1)
    assert result is None

    # Store one
    await store_briefing(cache, 1, "Morning briefing content")
    result = await get_latest_briefing(cache, 1)
    assert result is not None
    assert result["content"] == "Morning briefing content"
    assert "id" in result
    assert "created_at" in result

    # Store another — latest should be the newer one
    await store_briefing(cache, 1, "Second briefing")
    result = await get_latest_briefing(cache, 1)
    assert result["content"] == "Second briefing"

    await db.close()


@pytest.mark.asyncio
async def test_get_briefing_history_order_and_limit():
    cache, db = await _make_cache()
    await db.execute(
        "INSERT INTO users (privy_id, api_key, created_at) VALUES (?, ?, ?)",
        ("privy_2", "lin_def", time.time()),
    )
    await db.commit()

    from lineage_agent.briefing_service import get_briefing_history, store_briefing

    # Insert 5 briefings with distinct timestamps
    for i in range(5):
        await db.execute(
            "INSERT INTO briefings (user_id, content, created_at) VALUES (?, ?, ?)",
            (1, f"Briefing {i}", time.time() + i),
        )
    await db.commit()

    # Default limit (7) — should get all 5
    history = await get_briefing_history(cache, 1)
    assert len(history) == 5
    # Most recent first
    assert history[0]["content"] == "Briefing 4"
    assert history[-1]["content"] == "Briefing 0"

    # Limited to 3
    history = await get_briefing_history(cache, 1, limit=3)
    assert len(history) == 3
    assert history[0]["content"] == "Briefing 4"

    await db.close()
