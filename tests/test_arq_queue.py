"""Tests for the arq background task queue (Feature 2)."""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


# ---------------------------------------------------------------------------
# enqueue_task — Redis available
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_enqueue_task_returns_true_when_redis_available():
    """enqueue_task returns True and calls pool.enqueue_job when Redis is up."""
    mock_pool = AsyncMock()
    mock_pool.enqueue_job = AsyncMock()

    with patch("lineage_agent.task_queue._get_pool", return_value=mock_pool):
        from lineage_agent.task_queue import enqueue_task, task_analyze_bundle
        result = await enqueue_task(task_analyze_bundle, "MINT111", "DEPLOYER111")

    assert result is True
    mock_pool.enqueue_job.assert_called_once_with("task_analyze_bundle", "MINT111", "DEPLOYER111")


@pytest.mark.asyncio
async def test_enqueue_task_returns_false_when_redis_unavailable():
    """enqueue_task returns False (not raises) when Redis is not configured."""
    with patch("lineage_agent.task_queue._get_pool", return_value=None):
        from lineage_agent.task_queue import enqueue_task, task_analyze_bundle
        result = await enqueue_task(task_analyze_bundle, "MINT222", "DEPLOYER222")

    assert result is False


@pytest.mark.asyncio
async def test_enqueue_task_returns_false_on_enqueue_error(caplog):
    """If enqueue_job itself raises, enqueue_task returns False and logs a warning."""
    import logging
    mock_pool = AsyncMock()
    mock_pool.enqueue_job = AsyncMock(side_effect=ConnectionError("Redis down"))

    with patch("lineage_agent.task_queue._get_pool", return_value=mock_pool), \
         caplog.at_level(logging.WARNING, logger="lineage_agent.task_queue"):
        from lineage_agent.task_queue import enqueue_task, task_analyze_bundle
        result = await enqueue_task(task_analyze_bundle, "MINT333", "DEPLOYER333")

    assert result is False
    assert "enqueue failed" in caplog.text


# ---------------------------------------------------------------------------
# _get_pool — ARQ_REDIS_URL not set
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_pool_returns_none_without_redis_url():
    """When ARQ_REDIS_URL is empty the pool is never created."""
    import lineage_agent.task_queue as tq
    # Reset global pool to force re-evaluation
    tq._pool = None
    with patch("lineage_agent.task_queue.ARQ_REDIS_URL", "", create=True), \
         patch("config.ARQ_REDIS_URL", ""):
        pool = await tq._get_pool()
    assert pool is None


# ---------------------------------------------------------------------------
# Worker task — task_analyze_bundle
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_task_analyze_bundle_calls_analyze_bundle():
    mock_analyze = AsyncMock()
    with patch("lineage_agent.bundle_tracker_service.analyze_bundle", mock_analyze), \
         patch("lineage_agent.task_queue.task_analyze_bundle.__module__", "lineage_agent.task_queue"):
        from lineage_agent.task_queue import task_analyze_bundle
        await task_analyze_bundle({}, "MINTABC", "DEPLOYERXYZ", sol_price=150.0)
    mock_analyze.assert_called_once_with("MINTABC", "DEPLOYERXYZ", 150.0)


@pytest.mark.asyncio
async def test_task_trace_sol_flow_calls_trace():
    mock_trace = AsyncMock()
    with patch("lineage_agent.sol_flow_service.trace_sol_flow", mock_trace):
        from lineage_agent.task_queue import task_trace_sol_flow
        await task_trace_sol_flow({}, "MINT999", "DEPLOYER999", bundle_seeds=["SEED1"])
    mock_trace.assert_called_once_with("MINT999", "DEPLOYER999", extra_seed_wallets=["SEED1"])


# ---------------------------------------------------------------------------
# WorkerSettings
# ---------------------------------------------------------------------------

def test_worker_settings_has_required_functions():
    from lineage_agent.task_queue import WorkerSettings, task_analyze_bundle, task_trace_sol_flow
    assert task_analyze_bundle in WorkerSettings.functions
    assert task_trace_sol_flow in WorkerSettings.functions
