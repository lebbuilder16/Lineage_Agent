"""
Hybrid cache for the Meme Lineage Agent.

Two tiers:
1. **In-memory TTL cache** — fast, single-process, used by default.
2. **SQLite persistent cache** (optional) — survives restarts, works
   across multiple Uvicorn workers.

Enable SQLite by setting ``CACHE_SQLITE_PATH`` in the environment
(e.g. ``data/cache.db``).
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any, Optional

logger = logging.getLogger(__name__)


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


# ---------------------------------------------------------------------------
# SQLite persistent cache
# ---------------------------------------------------------------------------

class SQLiteCache:
    """Async SQLite-backed cache with TTL.

    Values are serialised as JSON. Falls back gracefully if the DB is
    unavailable (logs a warning and acts like a miss).
    """

    def __init__(self, db_path: str = "data/cache.db", default_ttl: int = 300) -> None:
        self._db_path = db_path
        self._default_ttl = default_ttl
        self._initialised = False

    async def _ensure_table(self) -> None:
        if self._initialised:
            return
        import aiosqlite, os
        os.makedirs(os.path.dirname(self._db_path) or ".", exist_ok=True)
        async with aiosqlite.connect(self._db_path) as db:
            await db.execute(
                """
                CREATE TABLE IF NOT EXISTS cache (
                    key   TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    expires_at REAL NOT NULL
                )
                """
            )
            await db.execute(
                "CREATE INDEX IF NOT EXISTS idx_cache_expires ON cache(expires_at)"
            )
            await db.commit()
        self._initialised = True

    async def get(self, key: str) -> Optional[Any]:
        try:
            import aiosqlite
            await self._ensure_table()
            async with aiosqlite.connect(self._db_path) as db:
                cursor = await db.execute(
                    "SELECT value, expires_at FROM cache WHERE key = ?", (key,)
                )
                row = await cursor.fetchone()
            if row is None:
                return None
            value_json, expires_at = row
            if time.time() > expires_at:
                await self.invalidate(key)
                return None
            return json.loads(value_json)
        except Exception:
            logger.warning("SQLite cache get failed for %s", key, exc_info=True)
            return None

    async def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        try:
            import aiosqlite
            await self._ensure_table()
            actual_ttl = ttl if ttl is not None else self._default_ttl
            expires_at = time.time() + actual_ttl
            value_json = json.dumps(value, default=str)
            async with aiosqlite.connect(self._db_path) as db:
                await db.execute(
                    "INSERT OR REPLACE INTO cache (key, value, expires_at) VALUES (?, ?, ?)",
                    (key, value_json, expires_at),
                )
                await db.commit()
        except Exception:
            logger.warning("SQLite cache set failed for %s", key, exc_info=True)

    async def invalidate(self, key: str) -> None:
        try:
            import aiosqlite
            await self._ensure_table()
            async with aiosqlite.connect(self._db_path) as db:
                await db.execute("DELETE FROM cache WHERE key = ?", (key,))
                await db.commit()
        except Exception:
            logger.warning("SQLite cache invalidate failed for %s", key, exc_info=True)

    async def clear(self) -> None:
        try:
            import aiosqlite
            await self._ensure_table()
            async with aiosqlite.connect(self._db_path) as db:
                await db.execute("DELETE FROM cache")
                await db.commit()
        except Exception:
            logger.warning("SQLite cache clear failed", exc_info=True)

    async def purge_expired(self) -> int:
        """Delete expired entries. Returns number of rows removed."""
        try:
            import aiosqlite
            await self._ensure_table()
            async with aiosqlite.connect(self._db_path) as db:
                cursor = await db.execute(
                    "DELETE FROM cache WHERE expires_at < ?", (time.time(),)
                )
                await db.commit()
                return cursor.rowcount
        except Exception:
            logger.warning("SQLite cache purge failed", exc_info=True)
            return 0
