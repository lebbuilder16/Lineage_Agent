"""Unit tests for the TTL cache."""

from __future__ import annotations

import time

import pytest

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

    def test_invalidate_prefix(self):
        cache = TTLCache(default_ttl=60)
        cache.set("ai:v3:one", 1)
        cache.set("ai:v3:two", 2)
        cache.set("ai:forensic-v2:three", 3)

        removed = cache.invalidate_prefix("ai:v3:")

        assert removed == 2
        assert cache.get("ai:v3:one") is None
        assert cache.get("ai:v3:two") is None
        assert cache.get("ai:forensic-v2:three") == 3

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

    def test_len_purges_expired(self):
        cache = TTLCache(default_ttl=0)
        cache.set("a", 1, ttl=0)
        cache.set("b", 2, ttl=60)
        time.sleep(0.01)
        assert len(cache) == 1  # "a" expired, "b" remains

    def test_eviction_on_max_entries(self):
        cache = TTLCache(default_ttl=60, max_entries=2)
        cache.set("k1", 1)
        cache.set("k2", 2)
        cache.set("k3", 3)  # triggers eviction of k1 (oldest)
        assert cache.get("k1") is None
        assert cache.get("k3") == 3

    def test_eviction_removes_expired_first(self):
        cache = TTLCache(default_ttl=60, max_entries=2)
        cache.set("old", 1, ttl=0)
        time.sleep(0.01)
        cache.set("new1", 2)
        cache.set("new2", 3)  # "old" is expired, gets evicted first
        assert cache.get("old") is None
        assert cache.get("new1") == 2
        assert cache.get("new2") == 3


class TestTTLCacheStubs:
    """Cover the no-op stubs for SQL-backed methods."""

    @pytest.fixture
    def cache(self):
        return TTLCache(default_ttl=60)

    @pytest.mark.asyncio
    async def test_insert_event_noop(self, cache):
        await cache.insert_event(mint="x", event_type="rug")

    @pytest.mark.asyncio
    async def test_query_events_empty(self, cache):
        assert await cache.query_events("1=1") == []

    @pytest.mark.asyncio
    async def test_update_event_noop(self, cache):
        await cache.update_event("1=1", (), status="done")

    @pytest.mark.asyncio
    async def test_operator_mapping_upsert_noop(self, cache):
        await cache.operator_mapping_upsert("fp1", "wallet1")

    @pytest.mark.asyncio
    async def test_operator_mapping_query_empty(self, cache):
        assert await cache.operator_mapping_query("fp1") == []

    @pytest.mark.asyncio
    async def test_operator_mapping_query_by_wallet_empty(self, cache):
        assert await cache.operator_mapping_query_by_wallet("w1") == []

    @pytest.mark.asyncio
    async def test_operator_mapping_query_all_empty(self, cache):
        assert await cache.operator_mapping_query_all() == []

    @pytest.mark.asyncio
    async def test_sol_flow_insert_batch_noop(self, cache):
        await cache.sol_flow_insert_batch([{"from": "a", "to": "b"}])

    @pytest.mark.asyncio
    async def test_sol_flows_query_empty(self, cache):
        assert await cache.sol_flows_query("mint1") == []

    @pytest.mark.asyncio
    async def test_sol_flows_delete_noop(self, cache):
        assert await cache.sol_flows_delete("mint1") is None

    @pytest.mark.asyncio
    async def test_sol_flows_query_by_from_empty(self, cache):
        assert await cache.sol_flows_query_by_from("addr1") == []

    @pytest.mark.asyncio
    async def test_cartel_edge_upsert_noop(self, cache):
        await cache.cartel_edge_upsert("wa", "wb", "co_deploy", 0.9, {})

    @pytest.mark.asyncio
    async def test_cartel_edges_query_empty(self, cache):
        assert await cache.cartel_edges_query("w1") == []

    @pytest.mark.asyncio
    async def test_cartel_edges_query_all_empty(self, cache):
        assert await cache.cartel_edges_query_all() == []

    @pytest.mark.asyncio
    async def test_bundle_report_insert_noop(self, cache):
        await cache.bundle_report_insert("mint", "deployer", "{}")

    @pytest.mark.asyncio
    async def test_bundle_report_query_none(self, cache):
        assert await cache.bundle_report_query("mint") is None

    @pytest.mark.asyncio
    async def test_bundle_report_delete_noop(self, cache):
        assert await cache.bundle_report_delete("mint") is None

    @pytest.mark.asyncio
    async def test_community_lookup_upsert_noop(self, cache):
        await cache.community_lookup_upsert("comm1", "wallet1")

    @pytest.mark.asyncio
    async def test_community_lookup_query_none(self, cache):
        assert await cache.community_lookup_query("comm1") is None
