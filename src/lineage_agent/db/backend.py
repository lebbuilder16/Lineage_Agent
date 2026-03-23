"""
Abstract database backend interface.

Both SQLite and PostgreSQL implementations follow this contract.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Optional


class DatabaseBackend(ABC):
    """Unified async database interface."""

    @abstractmethod
    async def init(self) -> None:
        """Initialize schema, run migrations."""

    @abstractmethod
    async def close(self) -> None:
        """Gracefully close connections."""

    @abstractmethod
    async def execute(self, sql: str, params: tuple = ()) -> Any:
        """Execute a write query (INSERT, UPDATE, DELETE)."""

    @abstractmethod
    async def executemany(self, sql: str, params_list: list[tuple]) -> None:
        """Execute a batch of write queries."""

    @abstractmethod
    async def fetchone(self, sql: str, params: tuple = ()) -> Optional[dict]:
        """Fetch a single row as a dict, or None."""

    @abstractmethod
    async def fetchall(self, sql: str, params: tuple = ()) -> list[dict]:
        """Fetch all rows as a list of dicts."""

    @abstractmethod
    async def commit(self) -> None:
        """Commit the current transaction (no-op for autocommit backends)."""

    # ── SQL dialect helpers ────────────────────────────────────────────────

    def placeholder(self, index: int) -> str:
        """Return the parameter placeholder for this backend.

        SQLite uses ?, PostgreSQL uses $1, $2, ...
        """
        return "?"

    def placeholders(self, count: int) -> str:
        """Return comma-separated placeholders for *count* parameters."""
        return ", ".join(self.placeholder(i + 1) for i in range(count))

    def upsert(self, table: str, columns: list[str], conflict_cols: list[str], update_cols: list[str]) -> str:
        """Build a cross-dialect UPSERT statement."""
        cols = ", ".join(columns)
        vals = self.placeholders(len(columns))
        conflict = ", ".join(conflict_cols)
        updates = ", ".join(f"{c} = EXCLUDED.{c}" for c in update_cols)
        return f"INSERT INTO {table} ({cols}) VALUES ({vals}) ON CONFLICT ({conflict}) DO UPDATE SET {updates}"

    @property
    def dialect(self) -> str:
        """Return 'sqlite' or 'postgresql'."""
        return "sqlite"
