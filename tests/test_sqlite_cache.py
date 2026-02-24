"""Tests for SQLiteCache — async SQLite-backed cache with TTL."""

from __future__ import annotations


import pytest

from lineage_agent.cache import SQLiteCache


@pytest.fixture
async def cache(tmp_path):
    db = str(tmp_path / "test_cache.db")
    c = SQLiteCache(db_path=db, default_ttl=10)
    yield c


class TestSQLiteCache:

    @pytest.mark.asyncio
    async def test_get_miss(self, cache):
        result = await cache.get("nonexistent")
        assert result is None

    @pytest.mark.asyncio
    async def test_set_and_get(self, cache):
        await cache.set("key1", {"hello": "world"})
        result = await cache.get("key1")
        assert result == {"hello": "world"}

    @pytest.mark.asyncio
    async def test_set_overwrite(self, cache):
        await cache.set("key1", "v1")
        await cache.set("key1", "v2")
        assert await cache.get("key1") == "v2"

    @pytest.mark.asyncio
    async def test_invalidate(self, cache):
        await cache.set("key1", "value")
        await cache.invalidate("key1")
        assert await cache.get("key1") is None

    @pytest.mark.asyncio
    async def test_clear(self, cache):
        await cache.set("a", 1)
        await cache.set("b", 2)
        await cache.clear()
        assert await cache.get("a") is None
        assert await cache.get("b") is None

    @pytest.mark.asyncio
    async def test_expired_entry(self, tmp_path):
        """Entries past TTL should return None."""
        c = SQLiteCache(db_path=str(tmp_path / "exp.db"), default_ttl=0)
        await c.set("key", "val", ttl=0)
        # TTL=0 means already expired on next read
        import time
        time.sleep(0.05)
        assert await c.get("key") is None

    @pytest.mark.asyncio
    async def test_purge_expired(self, tmp_path):
        c = SQLiteCache(db_path=str(tmp_path / "purge.db"), default_ttl=0)
        await c.set("a", 1, ttl=0)
        await c.set("b", 2, ttl=0)
        import time
        time.sleep(0.05)
        removed = await c.purge_expired()
        assert removed >= 2

    @pytest.mark.asyncio
    async def test_custom_ttl(self, cache):
        await cache.set("short", "value", ttl=3600)
        assert await cache.get("short") == "value"

    @pytest.mark.asyncio
    async def test_json_serialization_types(self, cache):
        """Various JSON-serializable types should round-trip."""
        await cache.set("int", 42)
        await cache.set("list", [1, 2, 3])
        await cache.set("nested", {"a": {"b": [1]}})
        assert await cache.get("int") == 42
        assert await cache.get("list") == [1, 2, 3]
        assert await cache.get("nested") == {"a": {"b": [1]}}

    @pytest.mark.asyncio
    async def test_invalidate_nonexistent(self, cache):
        """Invalidating a non-existent key should not raise."""
        await cache.invalidate("ghost")  # should not raise
