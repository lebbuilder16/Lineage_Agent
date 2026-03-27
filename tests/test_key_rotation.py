"""Tests for API key rotation (Phase 0D).

Uses an in-memory aiosqlite DB so there are no file-system side effects.
"""

from __future__ import annotations

from unittest.mock import MagicMock

import aiosqlite
import pytest

from lineage_agent.auth_service import (
    create_or_get_user,
    regenerate_api_key,
    verify_api_key,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
async def mem_db():
    """In-memory SQLite DB with the users schema."""
    async with aiosqlite.connect(":memory:") as db:
        await db.execute("""
            CREATE TABLE users (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                privy_id         TEXT UNIQUE NOT NULL,
                email            TEXT,
                wallet_address   TEXT,
                plan             TEXT NOT NULL DEFAULT 'free',
                api_key          TEXT UNIQUE NOT NULL,
                created_at       REAL NOT NULL,
                fcm_token        TEXT,
                notification_prefs TEXT,
                username         TEXT,
                display_name     TEXT,
                avatar_url       TEXT
            )
        """)
        await db.commit()
        yield db


@pytest.fixture
def fake_cache(mem_db):
    """Minimal SQLiteCache stub backed by the in-memory DB."""
    cache = MagicMock()

    async def _get_conn():
        return mem_db

    cache._get_conn = _get_conn
    return cache


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestRegenerateApiKey:
    @pytest.mark.asyncio
    async def test_returns_new_key_different_from_old(self, fake_cache):
        """regenerate_api_key should return a fresh key that differs from the original."""
        user = await create_or_get_user(fake_cache, privy_id="did:privy:rotate1")
        old_key = user["api_key"]

        new_key = await regenerate_api_key(fake_cache, user["id"])

        assert new_key is not None
        assert new_key != old_key
        assert new_key.startswith("lin_")

    @pytest.mark.asyncio
    async def test_old_key_no_longer_valid(self, fake_cache):
        """After rotation the old key must not authenticate."""
        user = await create_or_get_user(fake_cache, privy_id="did:privy:rotate2")
        old_key = user["api_key"]

        new_key = await regenerate_api_key(fake_cache, user["id"])

        # Old key should fail verification
        result_old = await verify_api_key(fake_cache, old_key)
        assert result_old is None

        # New key should succeed
        result_new = await verify_api_key(fake_cache, new_key)
        assert result_new is not None
        assert result_new["id"] == user["id"]

    @pytest.mark.asyncio
    async def test_nonexistent_user_returns_key(self, fake_cache):
        """Rotating a non-existent user id still returns a key (UPDATE affects 0 rows)."""
        result = await regenerate_api_key(fake_cache, user_id=99999)
        # The function generates a key and runs UPDATE; it doesn't check rowcount.
        # This is acceptable — the key is returned but not usable.
        assert result is not None
