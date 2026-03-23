"""
Database abstraction layer.

Supports SQLite (existing, default) and PostgreSQL (via DATABASE_URL env var).
The active backend is selected at startup and exposed via get_backend().
"""
from __future__ import annotations

import os
import logging

logger = logging.getLogger(__name__)

_backend = None


def get_backend():
    """Return the active DatabaseBackend singleton."""
    global _backend
    if _backend is None:
        raise RuntimeError("Database backend not initialized — call init_backend() first")
    return _backend


async def init_backend():
    """Initialize the database backend based on environment variables.

    - If DATABASE_URL is set → PostgreSQL (asyncpg)
    - Otherwise → SQLite (aiosqlite), using existing SQLiteCache
    """
    global _backend
    db_url = os.environ.get("DATABASE_URL", "")

    if db_url.startswith("postgres"):
        from .postgres_backend import PostgresBackend
        _backend = PostgresBackend(db_url)
        await _backend.init()
        logger.info("[db] PostgreSQL backend initialized")
    else:
        from .sqlite_backend import SqliteBackend
        _backend = SqliteBackend()
        await _backend.init()
        logger.info("[db] SQLite backend initialized")

    return _backend


async def close_backend():
    """Gracefully close the database backend."""
    global _backend
    if _backend is not None:
        await _backend.close()
        _backend = None
