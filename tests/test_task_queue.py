"""Unit tests for lineage_agent.task_queue."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ─── enqueue_task ─────────────────────────────────────────────────────────────

class TestEnqueueTask:
    async def test_returns_false_when_no_redis_url(self):
        from lineage_agent.task_queue import enqueue_task

        async def _noop(*a, **kw):
            pass

        _noop.__name__ = "noop_task"

        with patch("lineage_agent.task_queue._get_pool", new_callable=AsyncMock, return_value=None):
            result = await enqueue_task(_noop, "arg1")

        assert result is False

    async def test_returns_true_on_success(self):
        from lineage_agent.task_queue import enqueue_task

        async def _noop(*a, **kw):
            pass

        _noop.__name__ = "noop_task"

        mock_pool = AsyncMock()
        mock_pool.enqueue_job = AsyncMock(return_value=None)

        with patch("lineage_agent.task_queue._get_pool", new_callable=AsyncMock, return_value=mock_pool):
            result = await enqueue_task(_noop, "arg1", kwarg1="val")

        assert result is True
        mock_pool.enqueue_job.assert_called_once_with("noop_task", "arg1", kwarg1="val")

    async def test_returns_false_on_pool_exception(self):
        from lineage_agent.task_queue import enqueue_task

        async def _noop(*a, **kw):
            pass

        _noop.__name__ = "noop_task"

        mock_pool = AsyncMock()
        mock_pool.enqueue_job = AsyncMock(side_effect=Exception("Redis down"))

        with patch("lineage_agent.task_queue._get_pool", new_callable=AsyncMock, return_value=mock_pool):
            result = await enqueue_task(_noop)

        assert result is False


# ─── _get_pool ────────────────────────────────────────────────────────────────

class TestGetPool:
    async def test_returns_none_when_no_arq_redis_url(self, monkeypatch):
        import lineage_agent.task_queue as tq

        # Reset global pool state
        monkeypatch.setattr(tq, "_pool", None)
        monkeypatch.setattr(tq, "_pool_lock", None)

        with patch("lineage_agent.task_queue.ARQ_REDIS_URL", "", create=True):
            # Patch the config import inside _get_pool
            with patch("lineage_agent.task_queue._get_pool.__globals__", new_callable=dict) if False else patch.object(
                tq, "_get_pool", wraps=tq._get_pool
            ):
                # Patch config module
                import sys
                fake_config = MagicMock()
                fake_config.ARQ_REDIS_URL = ""
                with patch.dict(sys.modules, {"config": fake_config}):
                    result = await tq._get_pool()

        assert result is None

    async def test_returns_cached_pool_if_set(self, monkeypatch):
        import lineage_agent.task_queue as tq

        fake_pool = MagicMock()
        monkeypatch.setattr(tq, "_pool", fake_pool)

        import sys
        fake_config = MagicMock()
        fake_config.ARQ_REDIS_URL = "redis://localhost:6379"
        with patch.dict(sys.modules, {"config": fake_config}):
            result = await tq._get_pool()

        assert result is fake_pool


# ─── task_analyze_bundle ──────────────────────────────────────────────────────

class TestTaskAnalyzeBundle:
    async def test_calls_analyze_bundle_on_success(self):
        from lineage_agent.task_queue import task_analyze_bundle

        mock_analyze = AsyncMock(return_value=None)
        with patch("lineage_agent.bundle_tracker_service.analyze_bundle", mock_analyze):
            await task_analyze_bundle({}, "MINT123456789012345678901234567890", "DEPLOYER123", 150.0)

        mock_analyze.assert_called_once()

    async def test_raises_on_failure(self):
        from lineage_agent.task_queue import task_analyze_bundle

        mock_analyze = AsyncMock(side_effect=RuntimeError("rpc failure"))
        with patch("lineage_agent.bundle_tracker_service.analyze_bundle", mock_analyze):
            with pytest.raises(RuntimeError, match="rpc failure"):
                await task_analyze_bundle({}, "MINT12345678901234567890123456789012", "DEP12345")


# ─── task_trace_sol_flow ──────────────────────────────────────────────────────

class TestTaskTraceSolFlow:
    async def test_calls_trace_sol_flow_on_success(self):
        from lineage_agent.task_queue import task_trace_sol_flow

        mock_trace = AsyncMock(return_value=None)
        with patch("lineage_agent.sol_flow_service.trace_sol_flow", mock_trace):
            await task_trace_sol_flow({}, "MINT12345678901234567890123456789012", "DEP12345",
                                      bundle_seeds=["W1", "W2"])

        mock_trace.assert_called_once()
        call_kwargs = mock_trace.call_args
        assert call_kwargs.kwargs.get("extra_seed_wallets") == ["W1", "W2"]

    async def test_no_seeds_defaults_to_empty_list(self):
        from lineage_agent.task_queue import task_trace_sol_flow

        mock_trace = AsyncMock(return_value=None)
        with patch("lineage_agent.sol_flow_service.trace_sol_flow", mock_trace):
            await task_trace_sol_flow({}, "MINT12345678901234567890123456789012", "DEP12345")

        mock_trace.assert_called_once()

    async def test_raises_on_failure(self):
        from lineage_agent.task_queue import task_trace_sol_flow

        mock_trace = AsyncMock(side_effect=ValueError("bad mint"))
        with patch("lineage_agent.sol_flow_service.trace_sol_flow", mock_trace):
            with pytest.raises(ValueError, match="bad mint"):
                await task_trace_sol_flow({}, "MINT12345678901234567890123456789012", "DEP12345")


# ─── task_refresh_wallet_labels ───────────────────────────────────────────────

class TestTaskRefreshWalletLabels:
    async def test_skips_when_no_csv_url(self):
        from lineage_agent.task_queue import task_refresh_wallet_labels

        import sys
        fake_config = MagicMock()
        fake_config.WALLET_LABELS_CSV_URL = ""
        with patch.dict(sys.modules, {"config": fake_config}):
            # Should return without calling refresh_dynamic_labels
            mock_refresh = AsyncMock(return_value=5)
            with patch("lineage_agent.wallet_labels.refresh_dynamic_labels", mock_refresh):
                await task_refresh_wallet_labels({})
        mock_refresh.assert_not_called()

    async def test_calls_refresh_when_url_set(self):
        from lineage_agent.task_queue import task_refresh_wallet_labels

        import sys
        fake_config = MagicMock()
        fake_config.WALLET_LABELS_CSV_URL = "https://example.com/labels.csv"
        with patch.dict(sys.modules, {"config": fake_config}):
            mock_refresh = AsyncMock(return_value=42)
            with patch("lineage_agent.wallet_labels.refresh_dynamic_labels", mock_refresh):
                await task_refresh_wallet_labels({})
        mock_refresh.assert_called_once_with("https://example.com/labels.csv")

    async def test_raises_on_failure(self):
        from lineage_agent.task_queue import task_refresh_wallet_labels

        import sys
        fake_config = MagicMock()
        fake_config.WALLET_LABELS_CSV_URL = "https://example.com/labels.csv"
        with patch.dict(sys.modules, {"config": fake_config}):
            mock_refresh = AsyncMock(side_effect=IOError("network error"))
            with patch("lineage_agent.wallet_labels.refresh_dynamic_labels", mock_refresh):
                with pytest.raises(IOError, match="network error"):
                    await task_refresh_wallet_labels({})


# ─── _get_lock ────────────────────────────────────────────────────────────────

class TestGetLock:
    def test_creates_lock_on_first_call(self, monkeypatch):
        import lineage_agent.task_queue as tq
        monkeypatch.setattr(tq, "_pool_lock", None)

        # Need to run in an event loop context since asyncio.Lock can only be
        # created inside a running loop in Python 3.10+
        async def _run():
            lock = tq._get_lock()
            assert isinstance(lock, asyncio.Lock)

        asyncio.get_event_loop().run_until_complete(_run())

    def test_returns_same_lock_on_second_call(self, monkeypatch):
        import lineage_agent.task_queue as tq
        monkeypatch.setattr(tq, "_pool_lock", None)

        async def _run():
            lock1 = tq._get_lock()
            lock2 = tq._get_lock()
            assert lock1 is lock2

        asyncio.get_event_loop().run_until_complete(_run())
