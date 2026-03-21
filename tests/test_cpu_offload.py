"""Tests for CPU offload and cache improvements."""
import pytest
from unittest.mock import patch, MagicMock
import asyncio


class TestImagePhashThreading:
    """Verify image hashing is offloaded to thread pool."""

    @pytest.mark.asyncio
    async def test_compute_phash_uses_thread(self):
        """_compute_phash_sync should be callable in a thread."""
        from lineage_agent.similarity import _compute_phash_sync
        # Should not raise when called — actual image bytes needed for full test
        # Just verify the function exists and is not async
        assert not asyncio.iscoroutinefunction(_compute_phash_sync)

    def test_factory_phash_sync_is_not_coroutine(self):
        """_compute_phash_bytes_sync in factory_service must be a plain sync function."""
        from lineage_agent.factory_service import _compute_phash_bytes_sync
        assert not asyncio.iscoroutinefunction(_compute_phash_bytes_sync)

    @pytest.mark.asyncio
    async def test_factory_compute_phash_offloads_to_thread(self):
        """_compute_phash in factory_service should use asyncio.to_thread."""
        calls = []

        async def mock_to_thread(fn, *args, **kwargs):
            calls.append(fn)
            return "0123456789abcdef"

        with patch("lineage_agent.factory_service.asyncio.to_thread", side_effect=mock_to_thread):
            import httpx
            from unittest.mock import AsyncMock
            mock_client = AsyncMock()
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_resp.content = b"fake-image-bytes"
            mock_client.get = AsyncMock(return_value=mock_resp)

            with patch("lineage_agent.factory_service.get_img_client", return_value=mock_client):
                from lineage_agent.factory_service import _compute_phash
                await _compute_phash("http://example.com/img.png")

        assert len(calls) == 1, "asyncio.to_thread should be called once for pHash computation"
        from lineage_agent.factory_service import _compute_phash_bytes_sync
        assert calls[0] is _compute_phash_bytes_sync


class TestCacheTTLs:
    """Verify updated cache TTL values."""

    def test_lineage_ttl_increased(self):
        from config import CACHE_TTL_LINEAGE_SECONDS
        assert CACHE_TTL_LINEAGE_SECONDS >= 600, "Lineage TTL should be >= 10 min"

    def test_lineage_stale_ttl_increased(self):
        from config import CACHE_STALE_TTL_LINEAGE_SECONDS
        assert CACHE_STALE_TTL_LINEAGE_SECONDS >= 3600, "Lineage stale TTL should be >= 1 hour"

    def test_deployer_ttl_is_long(self):
        from config import CACHE_TTL_DEPLOYER_SECONDS
        assert CACHE_TTL_DEPLOYER_SECONDS >= 86400, "Deployer TTL should be >= 24 hours"

    def test_rpc_deployer_ttl_exists(self):
        from config import CACHE_TTL_RPC_DEPLOYER_SECONDS
        assert CACHE_TTL_RPC_DEPLOYER_SECONDS >= 86400

    def test_rpc_asset_ttl_exists(self):
        from config import CACHE_TTL_RPC_ASSET_SECONDS
        assert CACHE_TTL_RPC_ASSET_SECONDS >= 3600
