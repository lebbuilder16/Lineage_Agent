"""
Simple in-memory cache with TTL for the Meme Lineage Agent.

Avoids hammering external APIs (DexScreener, Solana RPC) with identical
requests within a short time window.
"""

from __future__ import annotations

import time
from typing import Any, Optional


class TTLCache:
    """Thread-safe-ish TTL cache backed by a plain ``dict``.

    Not designed for multi-process environments – suitable for a single
    FastAPI / Uvicorn worker.
    """

    def __init__(self, default_ttl: int = 300) -> None:
        self._store: dict[str, tuple[float, Any]] = {}
        self._default_ttl = default_ttl

    def get(self, key: str) -> Optional[Any]:
        """Return the cached value or ``None`` if missing / expired."""
        entry = self._store.get(key)
        if entry is None:
            return None
        expires_at, value = entry
        if time.monotonic() > expires_at:
            del self._store[key]
            return None
        return value

    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        """Store *value* under *key* with the given TTL in seconds."""
        actual_ttl = ttl if ttl is not None else self._default_ttl
        self._store[key] = (time.monotonic() + actual_ttl, value)

    def invalidate(self, key: str) -> None:
        """Remove a specific key."""
        self._store.pop(key, None)

    def clear(self) -> None:
        """Drop all cached entries."""
        self._store.clear()

    def __contains__(self, key: str) -> bool:
        return self.get(key) is not None

    def __len__(self) -> int:
        # Purge expired entries first
        now = time.monotonic()
        expired = [k for k, (exp, _) in self._store.items() if now > exp]
        for k in expired:
            del self._store[k]
        return len(self._store)
