"""Unit tests for the TTL cache."""

from __future__ import annotations

import time


from lineage_agent.cache import TTLCache


class TestTTLCache:
    def test_set_and_get(self):
        cache = TTLCache(default_ttl=60)
        cache.set("key", "value")
        assert cache.get("key") == "value"

    def test_missing_key_returns_none(self):
        cache = TTLCache(default_ttl=60)
        assert cache.get("nonexistent") is None

    def test_expiration(self):
        cache = TTLCache(default_ttl=1)
        cache.set("key", "value", ttl=0)  # expires immediately
        # monotonic time might not advance enough; use 0 TTL
        time.sleep(0.01)
        assert cache.get("key") is None

    def test_custom_ttl(self):
        cache = TTLCache(default_ttl=0)
        cache.set("key", "value", ttl=60)
        assert cache.get("key") == "value"

    def test_invalidate(self):
        cache = TTLCache(default_ttl=60)
        cache.set("key", "value")
        cache.invalidate("key")
        assert cache.get("key") is None

    def test_invalidate_missing_key(self):
        cache = TTLCache(default_ttl=60)
        cache.invalidate("nonexistent")  # should not raise

    def test_clear(self):
        cache = TTLCache(default_ttl=60)
        cache.set("a", 1)
        cache.set("b", 2)
        cache.clear()
        assert cache.get("a") is None
        assert cache.get("b") is None

    def test_contains(self):
        cache = TTLCache(default_ttl=60)
        cache.set("key", "value")
        assert "key" in cache
        assert "missing" not in cache

    def test_overwrite(self):
        cache = TTLCache(default_ttl=60)
        cache.set("key", "old")
        cache.set("key", "new")
        assert cache.get("key") == "new"

    def test_stores_complex_objects(self):
        cache = TTLCache(default_ttl=60)
        data = {"list": [1, 2, 3], "nested": {"a": True}}
        cache.set("obj", data)
        assert cache.get("obj") == data
