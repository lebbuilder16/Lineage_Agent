"""Unit tests for the circuit breaker module."""

from __future__ import annotations

import pytest

from lineage_agent.circuit_breaker import (
    CircuitBreaker,
    CircuitOpenError,
    CircuitState,
    get_all_statuses,
    register,
)


class TestCircuitBreakerStatus:
    def test_status_returns_dict(self):
        cb = CircuitBreaker("test", failure_threshold=3, recovery_timeout=10)
        s = cb.status()
        assert s["state"] == "closed"
        assert s["failure_count"] == 0
        assert s["total_calls"] == 0
        assert s["failed_calls"] == 0
        assert s["rejected_calls"] == 0
        assert s["failure_rate"] == 0.0
        assert s["recovery_timeout_s"] == 10

    @pytest.mark.asyncio
    async def test_status_after_failure(self):
        cb = CircuitBreaker("test_fail", failure_threshold=5)

        async def boom():
            raise RuntimeError("fail")

        with pytest.raises(RuntimeError):
            await cb.call(boom)

        s = cb.status()
        assert s["failed_calls"] == 1
        assert s["total_calls"] == 1
        assert s["failure_rate"] == 1.0


class TestRegistry:
    def test_register_and_get_statuses(self):
        cb = CircuitBreaker("reg_test", failure_threshold=3)
        register(cb)
        statuses = get_all_statuses()
        assert "reg_test" in statuses
        assert statuses["reg_test"]["state"] == "closed"


class TestCircuitBreakerOpenError:
    @pytest.mark.asyncio
    async def test_open_circuit_raises(self):
        cb = CircuitBreaker("err_test", failure_threshold=1, recovery_timeout=999)

        async def fail():
            raise RuntimeError("x")

        with pytest.raises(RuntimeError):
            await cb.call(fail)

        with pytest.raises(CircuitOpenError):
            await cb.call(fail)

    def test_initial_state_is_closed(self):
        cb = CircuitBreaker("init")
        assert cb.state == CircuitState.CLOSED
        assert cb.is_closed is True

    @pytest.mark.asyncio
    async def test_recovery_half_open_to_closed(self):
        cb = CircuitBreaker(
            "recovery", failure_threshold=1,
            recovery_timeout=0, success_threshold=1,
        )

        async def fail():
            raise RuntimeError("x")

        async def ok():
            return 42

        # Trip the breaker
        with pytest.raises(RuntimeError):
            await cb.call(fail)
        assert cb.state == CircuitState.OPEN

        # recovery_timeout=0 → immediately transitions to HALF_OPEN
        result = await cb.call(ok)
        assert result == 42
        assert cb.state == CircuitState.CLOSED
