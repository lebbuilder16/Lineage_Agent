"""
Async Circuit Breaker for external HTTP dependencies.

States
------
CLOSED   — Normal operation. Requests pass through. Failures are counted.
OPEN     — Circuit tripped. Requests fail-fast without touching the service.
HALF_OPEN — Recovery probe. One request is allowed; success → CLOSED,
             failure → back to OPEN.

Usage
-----
    from lineage_agent.circuit_breaker import CircuitBreaker, CircuitOpenError

    dex_cb = CircuitBreaker("dexscreener", failure_threshold=5, recovery_timeout=30)

    try:
        result = await dex_cb.call(async_http_get, client, url)
    except CircuitOpenError:
        return None  # fast-fail path
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass
from enum import Enum
from typing import Any, Awaitable, Callable, Optional

logger = logging.getLogger(__name__)


class CircuitState(str, Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitOpenError(Exception):
    """Raised when a call is attempted against an open circuit."""

    def __init__(self, name: str) -> None:
        super().__init__(f"Circuit '{name}' is OPEN – request blocked")
        self.circuit_name = name


@dataclass
class CircuitBreakerStats:
    total_calls: int = 0
    successful_calls: int = 0
    failed_calls: int = 0
    rejected_calls: int = 0  # fast-fails when OPEN

    @property
    def failure_rate(self) -> float:
        if self.total_calls == 0:
            return 0.0
        return self.failed_calls / self.total_calls


class CircuitBreaker:
    """Async circuit breaker with automatic state transitions.

    Parameters
    ----------
    name:
        Human-readable name for logging/metrics.
    failure_threshold:
        Number of consecutive failures before opening the circuit.
    recovery_timeout:
        Seconds to wait in OPEN state before attempting a recovery probe.
    success_threshold:
        Consecutive successes needed in HALF_OPEN to close the circuit.
    """

    def __init__(
        self,
        name: str,
        *,
        failure_threshold: int = 5,
        recovery_timeout: float = 30.0,
        success_threshold: int = 2,
    ) -> None:
        self.name = name
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.success_threshold = success_threshold

        self._state = CircuitState.CLOSED
        self._failure_count = 0
        self._success_count = 0
        self._last_failure_time: Optional[float] = None
        self._lock = asyncio.Lock()
        self.stats = CircuitBreakerStats()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    @property
    def state(self) -> CircuitState:
        return self._state

    @property
    def is_closed(self) -> bool:
        return self._state == CircuitState.CLOSED

    async def call(
        self,
        func: Callable[..., Awaitable[Any]],
        *args: Any,
        **kwargs: Any,
    ) -> Any:
        """Execute *func* through the circuit breaker.

        Raises ``CircuitOpenError`` when the circuit is OPEN.
        """
        async with self._lock:
            state = self._check_state()

        if state == CircuitState.OPEN:
            self.stats.rejected_calls += 1
            raise CircuitOpenError(self.name)

        self.stats.total_calls += 1
        try:
            result = await func(*args, **kwargs)
            await self._on_success()
            return result
        except Exception as exc:
            await self._on_failure(exc)
            raise

    # ------------------------------------------------------------------
    # State machine
    # ------------------------------------------------------------------

    def _check_state(self) -> CircuitState:
        """Re-evaluate state transitions based on current conditions."""
        if self._state == CircuitState.OPEN:
            elapsed = time.monotonic() - (self._last_failure_time or 0)
            if elapsed >= self.recovery_timeout:
                self._transition(CircuitState.HALF_OPEN)
        return self._state

    async def _on_success(self) -> None:
        async with self._lock:
            self.stats.successful_calls += 1
            if self._state == CircuitState.HALF_OPEN:
                self._success_count += 1
                if self._success_count >= self.success_threshold:
                    self._failure_count = 0
                    self._success_count = 0
                    self._transition(CircuitState.CLOSED)
            elif self._state == CircuitState.CLOSED:
                # Reset failure streak on any success
                self._failure_count = 0

    async def _on_failure(self, exc: Exception) -> None:
        async with self._lock:
            self.stats.failed_calls += 1
            self._last_failure_time = time.monotonic()
            self._failure_count += 1
            self._success_count = 0

            if self._state == CircuitState.HALF_OPEN:
                self._transition(CircuitState.OPEN)
            elif self._state == CircuitState.CLOSED:
                if self._failure_count >= self.failure_threshold:
                    self._transition(CircuitState.OPEN)

    def _transition(self, new_state: CircuitState) -> None:
        if new_state != self._state:
            logger.warning(
                "CircuitBreaker '%s': %s → %s (failures=%d)",
                self.name,
                self._state.value,
                new_state.value,
                self._failure_count,
            )
            self._state = new_state

    # ------------------------------------------------------------------
    # Diagnostics
    # ------------------------------------------------------------------

    def status(self) -> dict[str, Any]:
        """Return a serialisable status dict for the health endpoint."""
        return {
            "state": self._state.value,
            "failure_count": self._failure_count,
            "total_calls": self.stats.total_calls,
            "failed_calls": self.stats.failed_calls,
            "rejected_calls": self.stats.rejected_calls,
            "failure_rate": round(self.stats.failure_rate, 3),
            "recovery_timeout_s": self.recovery_timeout,
        }


# ---------------------------------------------------------------------------
# Registry – all breakers are registered here for health reporting
# ---------------------------------------------------------------------------
_registry: dict[str, CircuitBreaker] = {}


def register(cb: CircuitBreaker) -> CircuitBreaker:
    """Register a circuit breaker in the global registry."""
    _registry[cb.name] = cb
    return cb


def get_all_statuses() -> dict[str, dict[str, Any]]:
    """Return status of every registered circuit breaker."""
    return {name: cb.status() for name, cb in _registry.items()}
