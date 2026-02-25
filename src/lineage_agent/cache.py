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

    def __init__(self, default_ttl: int = 300, max_entries: int = 10_000) -> None:
        self._store: dict[str, tuple[float, Any]] = {}
        self._default_ttl = default_ttl
        self._max_entries = max_entries

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
        # Enforce max entries
        if len(self._store) > self._max_entries:
            # Evict expired first
            now = time.monotonic()
            expired = [k for k, (exp, _) in self._store.items() if now > exp]
            for k in expired:
                del self._store[k]
            # If still over, evict oldest
            if len(self._store) > self._max_entries:
                sorted_keys = sorted(self._store, key=lambda k: self._store[k][0])
                for k in sorted_keys[: len(self._store) - self._max_entries]:
                    del self._store[k]

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

    # Stubs for intelligence_events (no-ops when SQLite is not enabled)
    async def insert_event(self, **kwargs: Any) -> None:  # noqa: D102
        pass

    async def query_events(
        self,
        where: str,
        params: tuple = (),
        columns: str = "*",
        limit: int = 1000,
    ) -> list[dict]:  # noqa: D102
        return []

    async def update_event(self, where: str, params: tuple, **set_kwargs: Any) -> None:  # noqa: D102
        pass


# ---------------------------------------------------------------------------
# SQLite persistent cache
# ---------------------------------------------------------------------------

class SQLiteCache:
    """Async SQLite-backed cache with TTL.

    Values are serialised as JSON. Uses a persistent connection
    (created lazily on first access) to avoid per-operation overhead.
    Falls back gracefully if the DB is unavailable.
    """

    def __init__(
        self,
        db_path: str = "data/cache.db",
        default_ttl: int = 300,
        max_entries: int = 10_000,
    ) -> None:
        self._db_path = db_path
        self._default_ttl = default_ttl
        self._max_entries = max_entries
        self._conn: Any = None  # aiosqlite.Connection
        self._initialised = False

    async def _get_conn(self) -> Any:
        """Return (and lazily create) a persistent aiosqlite connection."""
        import aiosqlite
        import os

        if self._conn is not None:
            try:
                # Quick check – if the connection is still alive
                await self._conn.execute("SELECT 1")
                if not self._initialised:
                    await self._init_schema(self._conn)
                return self._conn
            except Exception:
                # Connection broken – recreate
                self._conn = None

        os.makedirs(os.path.dirname(self._db_path) or ".", exist_ok=True)
        self._conn = await aiosqlite.connect(self._db_path)
        await self._conn.execute("PRAGMA journal_mode=WAL")
        await self._init_schema(self._conn)
        return self._conn

    async def _init_schema(self, db: Any) -> None:
        if self._initialised:
            return
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
        # Intelligence events — persistent forensic observations, never expire
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS intelligence_events (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type  TEXT NOT NULL,
                mint        TEXT,
                deployer    TEXT,
                name        TEXT,
                symbol      TEXT,
                narrative   TEXT,
                mcap_usd    REAL,
                liq_usd     REAL,
                created_at  TEXT,
                rugged_at   TEXT,
                extra_json  TEXT,
                recorded_at REAL NOT NULL
            )
            """
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_ie_deployer ON intelligence_events(deployer)"
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_ie_narrative ON intelligence_events(narrative)"
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_ie_type ON intelligence_events(event_type)"
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_ie_mint ON intelligence_events(mint)"
        )
        await db.commit()
        self._initialised = True

    async def get(self, key: str) -> Optional[Any]:
        try:
            db = await self._get_conn()
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
            db = await self._get_conn()
            actual_ttl = ttl if ttl is not None else self._default_ttl
            expires_at = time.time() + actual_ttl
            # Serialize Pydantic models properly via model_dump()
            if hasattr(value, "model_dump"):
                serializable = value.model_dump(mode="json")
            elif isinstance(value, list) and value and hasattr(value[0], "model_dump"):
                serializable = [v.model_dump(mode="json") for v in value]
            else:
                serializable = value
            value_json = json.dumps(serializable, default=str)
            await db.execute(
                "INSERT OR REPLACE INTO cache (key, value, expires_at) VALUES (?, ?, ?)",
                (key, value_json, expires_at),
            )
            await db.commit()
            # Enforce max entries (evict oldest expired first, then oldest)
            cursor = await db.execute("SELECT COUNT(*) FROM cache")
            (count,) = await cursor.fetchone()
            if count > self._max_entries:
                await self.purge_expired()
                # If still over limit, evict oldest entries
                cursor2 = await db.execute("SELECT COUNT(*) FROM cache")
                (count2,) = await cursor2.fetchone()
                if count2 > self._max_entries:
                    overage = count2 - self._max_entries
                    await db.execute(
                        "DELETE FROM cache WHERE key IN "
                        "(SELECT key FROM cache ORDER BY expires_at ASC LIMIT ?)",
                        (overage,),
                    )
                    await db.commit()
        except Exception:
            logger.warning("SQLite cache set failed for %s", key, exc_info=True)

    async def invalidate(self, key: str) -> None:
        try:
            db = await self._get_conn()
            await db.execute("DELETE FROM cache WHERE key = ?", (key,))
            await db.commit()
        except Exception:
            logger.warning("SQLite cache invalidate failed for %s", key, exc_info=True)

    async def clear(self) -> None:
        try:
            db = await self._get_conn()
            await db.execute("DELETE FROM cache")
            await db.commit()
        except Exception:
            logger.warning("SQLite cache clear failed", exc_info=True)

    async def purge_expired(self) -> int:
        """Delete expired entries. Returns number of rows removed."""
        try:
            db = await self._get_conn()
            cursor = await db.execute(
                "DELETE FROM cache WHERE expires_at < ?", (time.time(),)
            )
            await db.commit()
            return cursor.rowcount
        except Exception:
            logger.warning("SQLite cache purge failed", exc_info=True)
            return 0

    async def close(self) -> None:
        """Close the persistent connection."""
        if self._conn is not None:
            try:
                await self._conn.close()
            except Exception:
                pass
            self._conn = None
            self._initialised = False

    # ------------------------------------------------------------------
    # Intelligence events helpers (forensic data store — no TTL)
    # ------------------------------------------------------------------

    async def insert_event(self, **kwargs: Any) -> None:
        """Insert a row into intelligence_events."""
        try:
            db = await self._get_conn()
            cols = list(kwargs.keys()) + ["recorded_at"]
            placeholders = ", ".join("?" for _ in cols)
            col_names = ", ".join(cols)
            values = list(kwargs.values()) + [time.time()]
            await db.execute(
                f"INSERT INTO intelligence_events ({col_names}) VALUES ({placeholders})",
                values,
            )
            await db.commit()
        except Exception:
            logger.warning("intelligence_events insert failed", exc_info=True)

    async def query_events(
        self,
        where: str,
        params: tuple = (),
        columns: str = "*",
        limit: int = 1000,
    ) -> list[dict]:
        """Query intelligence_events and return list of dicts."""
        try:
            db = await self._get_conn()
            sql = f"SELECT {columns} FROM intelligence_events WHERE {where} LIMIT {limit}"
            cursor = await db.execute(sql, params)
            rows = await cursor.fetchall()
            col_names = [d[0] for d in cursor.description]
            return [dict(zip(col_names, row)) for row in rows]
        except Exception:
            logger.warning("intelligence_events query failed: %s", where, exc_info=True)
            return []

    async def update_event(self, where: str, params: tuple, **set_kwargs: Any) -> None:
        """Update rows in intelligence_events."""
        try:
            db = await self._get_conn()
            set_clause = ", ".join(f"{k} = ?" for k in set_kwargs)
            values = list(set_kwargs.values()) + list(params)
            await db.execute(
                f"UPDATE intelligence_events SET {set_clause} WHERE {where}",
                values,
            )
            await db.commit()
        except Exception:
            logger.warning("intelligence_events update failed", exc_info=True)
