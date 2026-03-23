"""
SQLite backend — wraps the existing SQLiteCache for backward compatibility.

This is the default backend when DATABASE_URL is not set.
All existing code continues to work unchanged via the SQLiteCache singleton.
"""
from __future__ import annotations

from typing import Any, Optional

from .backend import DatabaseBackend


class SqliteBackend(DatabaseBackend):
    """Thin adapter over the existing SQLiteCache."""

    def __init__(self) -> None:
        self._cache = None

    async def init(self) -> None:
        from ..data_sources._clients import cache as _cache
        self._cache = _cache
        # SQLiteCache initializes itself on first _get_conn() call

    async def close(self) -> None:
        if self._cache:
            await self._cache.close()

    async def _conn(self):
        return await self._cache._get_conn()

    async def execute(self, sql: str, params: tuple = ()) -> Any:
        db = await self._conn()
        cursor = await db.execute(sql, params)
        await db.commit()
        return cursor

    async def executemany(self, sql: str, params_list: list[tuple]) -> None:
        db = await self._conn()
        await db.executemany(sql, params_list)
        await db.commit()

    async def fetchone(self, sql: str, params: tuple = ()) -> Optional[dict]:
        db = await self._conn()
        cursor = await db.execute(sql, params)
        row = await cursor.fetchone()
        if row is None:
            return None
        cols = [d[0] for d in cursor.description]
        return dict(zip(cols, row))

    async def fetchall(self, sql: str, params: tuple = ()) -> list[dict]:
        db = await self._conn()
        cursor = await db.execute(sql, params)
        rows = await cursor.fetchall()
        cols = [d[0] for d in cursor.description]
        return [dict(zip(cols, row)) for row in rows]

    async def commit(self) -> None:
        db = await self._conn()
        await db.commit()

    def placeholder(self, index: int) -> str:
        return "?"

    @property
    def dialect(self) -> str:
        return "sqlite"
