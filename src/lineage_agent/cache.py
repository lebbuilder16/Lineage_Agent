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
        logger.warning(
            "insert_event called on TTLCache (no-op) — set CACHE_BACKEND=sqlite to persist events"
        )

    async def query_events(
        self,
        where: str,
        params: tuple = (),
        columns: str = "*",
        limit: int = 1000,
        order_by: str = "",  # noqa: ARG002
    ) -> list[dict]:  # noqa: D102
        return []

    async def update_event(self, where: str, params: tuple, **set_kwargs: Any) -> None:  # noqa: D102
        pass

    # Stubs for alert subscriptions (no-ops without SQLite)
    async def subscribe_alert(self, chat_id: int, sub_type: str, value: str) -> bool:  # noqa: D102
        return False

    async def unsubscribe_alert(self, chat_id: int, sub_id: int) -> bool:  # noqa: D102
        return False

    async def list_subscriptions(self, chat_id: int) -> list[dict]:  # noqa: D102
        return []

    async def query_subscriptions(self, sub_type: str, value: str) -> list[dict]:  # noqa: D102
        return []

    async def all_subscriptions(self) -> list[dict]:  # noqa: D102
        return []

    # Stubs for operator_mappings (no-ops without SQLite)
    async def operator_mapping_upsert(self, fingerprint: str, wallet: str) -> None:
        pass

    async def operator_mapping_query(self, fingerprint: str) -> list[dict]:
        return []

    async def operator_mapping_query_all(self) -> list[dict]:
        return []

    # Stubs for sol_flows (no-ops without SQLite)
    async def sol_flow_insert_batch(self, flows: list[dict]) -> None:
        pass

    async def sol_flows_query(self, mint: str) -> list[dict]:
        return []

    async def sol_flows_query_by_from(self, from_address: str) -> list[dict]:
        return []

    # Stubs for cartel_edges (no-ops without SQLite)
    async def cartel_edge_upsert(
        self, wallet_a: str, wallet_b: str, signal_type: str,
        signal_strength: float, evidence: dict,
    ) -> None:
        pass

    async def cartel_edges_query(self, wallet: str) -> list[dict]:
        return []

    async def cartel_edges_query_all(self) -> list[dict]:
        return []


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
        self._conn_lock: Any = None  # asyncio.Lock, created lazily

    async def _get_conn(self) -> Any:
        """Return (and lazily create) a persistent aiosqlite connection."""
        import asyncio
        import aiosqlite
        import os

        if self._conn_lock is None:
            self._conn_lock = asyncio.Lock()

        async with self._conn_lock:
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
        # Deduplicate existing rows before enforcing uniqueness (migration safety)
        await db.execute(
            """
            DELETE FROM intelligence_events
            WHERE rowid NOT IN (
                SELECT MAX(rowid)
                FROM intelligence_events
                GROUP BY event_type, mint
            )
            """
        )
        # Enforce: at most one event per (event_type, mint) combination
        await db.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_ie_unique_type_mint "
            "ON intelligence_events(event_type, mint)"
        )
        # Migrate: add phash column for pHash cluster signal (safe, ignored if exists)
        try:
            await db.execute("ALTER TABLE intelligence_events ADD COLUMN phash TEXT")
        except Exception:
            pass  # Column already exists — safe to ignore

        # operator_mappings: maps DNA fingerprints → deployer wallets
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS operator_mappings (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                fingerprint TEXT NOT NULL,
                wallet      TEXT NOT NULL,
                recorded_at REAL NOT NULL
            )
            """
        )
        await db.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_om_unique "
            "ON operator_mappings(fingerprint, wallet)"
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_om_fp ON operator_mappings(fingerprint)"
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_om_wallet ON operator_mappings(wallet)"
        )

        # sol_flows: on-chain SOL capital flow edges (Follow The SOL)
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS sol_flows (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                mint            TEXT NOT NULL,
                from_address    TEXT NOT NULL,
                to_address      TEXT NOT NULL,
                amount_lamports INTEGER NOT NULL DEFAULT 0,
                signature       TEXT NOT NULL,
                slot            INTEGER,
                block_time      INTEGER,
                hop             INTEGER NOT NULL DEFAULT 0,
                recorded_at     REAL NOT NULL
            )
            """
        )
        await db.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_sf_unique "
            "ON sol_flows(signature, from_address, to_address)"
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_sf_mint ON sol_flows(mint)"
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_sf_from ON sol_flows(from_address)"
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_sf_to ON sol_flows(to_address)"
        )

        # cartel_edges: coordination signal edges between operator wallets
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS cartel_edges (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                wallet_a        TEXT NOT NULL,
                wallet_b        TEXT NOT NULL,
                signal_type     TEXT NOT NULL,
                signal_strength REAL NOT NULL DEFAULT 0.0,
                evidence_json   TEXT,
                first_seen      REAL NOT NULL,
                last_seen       REAL NOT NULL
            )
            """
        )
        await db.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_ce_unique "
            "ON cartel_edges(wallet_a, wallet_b, signal_type)"
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_ce_wallet_a ON cartel_edges(wallet_a)"
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_ce_wallet_b ON cartel_edges(wallet_b)"
        )

        await db.commit()
        self._initialised = True

    # ------------------------------------------------------------------
    # Alert subscriptions helpers
    # ------------------------------------------------------------------

    async def _ensure_alert_table(self) -> Any:
        """Return the DB connection, auto-creating the alert_subscriptions table."""
        db = await self._get_conn()
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS alert_subscriptions (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                chat_id     INTEGER NOT NULL,
                sub_type    TEXT NOT NULL,
                value       TEXT NOT NULL,
                created_at  REAL NOT NULL
            )
            """
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_alert_chat ON alert_subscriptions(chat_id)"
        )
        await db.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_alert_unique "
            "ON alert_subscriptions(chat_id, sub_type, value)"
        )
        await db.commit()
        return db

    async def subscribe_alert(self, chat_id: int, sub_type: str, value: str) -> bool:
        """Insert a subscription. Returns True if inserted, False if it already exists."""
        try:
            db = await self._ensure_alert_table()
            cursor = await db.execute(
                "INSERT OR IGNORE INTO alert_subscriptions "
                "(chat_id, sub_type, value, created_at) VALUES (?, ?, ?, ?)",
                (chat_id, sub_type, value, time.time()),
            )
            await db.commit()
            return cursor.rowcount == 1
        except Exception:
            logger.warning("subscribe_alert failed", exc_info=True)
            return False

    async def unsubscribe_alert(self, chat_id: int, sub_id: int) -> bool:
        """Delete a subscription by id (scoped to chat_id). Returns True if deleted."""
        try:
            db = await self._ensure_alert_table()
            cursor = await db.execute(
                "DELETE FROM alert_subscriptions WHERE id = ? AND chat_id = ?",
                (sub_id, chat_id),
            )
            await db.commit()
            return cursor.rowcount == 1
        except Exception:
            logger.warning("unsubscribe_alert failed", exc_info=True)
            return False

    async def list_subscriptions(self, chat_id: int) -> list[dict]:
        """Return all subscriptions for a chat_id as list of dicts."""
        try:
            db = await self._ensure_alert_table()
            cursor = await db.execute(
                "SELECT id, sub_type, value, created_at FROM alert_subscriptions "
                "WHERE chat_id = ? ORDER BY id",
                (chat_id,),
            )
            rows = await cursor.fetchall()
            cols = [d[0] for d in cursor.description]
            return [dict(zip(cols, row)) for row in rows]
        except Exception:
            logger.warning("list_subscriptions failed", exc_info=True)
            return []

    async def query_subscriptions(
        self, sub_type: str, value: str
    ) -> list[dict]:
        """Return all chat IDs subscribed to a specific (sub_type, value) pair."""
        try:
            db = await self._ensure_alert_table()
            cursor = await db.execute(
                "SELECT id, chat_id, sub_type, value FROM alert_subscriptions "
                "WHERE sub_type = ? AND value = ?",
                (sub_type, value),
            )
            rows = await cursor.fetchall()
            cols = [d[0] for d in cursor.description]
            return [dict(zip(cols, row)) for row in rows]
        except Exception:
            logger.warning("query_subscriptions failed", exc_info=True)
            return []

    async def all_subscriptions(self) -> list[dict]:
        """Return all active subscriptions (used by the alert sweep)."""
        try:
            db = await self._ensure_alert_table()
            cursor = await db.execute(
                "SELECT id, chat_id, sub_type, value FROM alert_subscriptions ORDER BY id"
            )
            rows = await cursor.fetchall()
            cols = [d[0] for d in cursor.description]
            return [dict(zip(cols, row)) for row in rows]
        except Exception:
            logger.warning("all_subscriptions failed", exc_info=True)
            return []

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

    # Column whitelist — prevents SQL injection from arbitrary kwargs
    _IE_ALLOWED_COLS: frozenset[str] = frozenset({
        "event_type", "mint", "deployer", "name", "symbol",
        "narrative", "mcap_usd", "liq_usd", "created_at",
        "rugged_at", "extra_json", "phash",
    })

    async def insert_event(self, **kwargs: Any) -> None:
        """Insert or replace a row in intelligence_events.

        Uses INSERT OR REPLACE so the UNIQUE(event_type, mint) index
        prevents duplicate entries — repeated analyses update rather
        than pollute the store.
        """
        try:
            db = await self._get_conn()
            # Filter to whitelisted columns only
            safe = {k: v for k, v in kwargs.items() if k in self._IE_ALLOWED_COLS}
            cols = list(safe.keys()) + ["recorded_at"]
            placeholders = ", ".join("?" for _ in cols)
            col_names = ", ".join(cols)
            values = list(safe.values()) + [time.time()]
            await db.execute(
                f"INSERT OR REPLACE INTO intelligence_events ({col_names}) VALUES ({placeholders})",
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
        order_by: str = "",
    ) -> list[dict]:
        """Query intelligence_events and return list of dicts."""
        try:
            db = await self._get_conn()
            sql = f"SELECT {columns} FROM intelligence_events WHERE {where}"
            if order_by:
                sql += f" ORDER BY {order_by}"
            sql += f" LIMIT {limit}"
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

    # ------------------------------------------------------------------
    # Operator mappings
    # ------------------------------------------------------------------

    async def operator_mapping_upsert(self, fingerprint: str, wallet: str) -> None:
        """Record that a wallet shares a DNA fingerprint. Idempotent."""
        try:
            db = await self._get_conn()
            await db.execute(
                "INSERT OR IGNORE INTO operator_mappings (fingerprint, wallet, recorded_at) "
                "VALUES (?, ?, ?)",
                (fingerprint, wallet, time.time()),
            )
            await db.commit()
        except Exception:
            logger.warning("operator_mapping_upsert failed", exc_info=True)

    async def operator_mapping_query(self, fingerprint: str) -> list[dict]:
        """Return all wallets linked to a fingerprint."""
        try:
            db = await self._get_conn()
            cursor = await db.execute(
                "SELECT fingerprint, wallet, recorded_at FROM operator_mappings "
                "WHERE fingerprint = ?",
                (fingerprint,),
            )
            rows = await cursor.fetchall()
            cols = [d[0] for d in cursor.description]
            return [dict(zip(cols, row)) for row in rows]
        except Exception:
            logger.warning("operator_mapping_query failed", exc_info=True)
            return []

    async def operator_mapping_query_all(self) -> list[dict]:
        """Return all (fingerprint, wallet) mappings."""
        try:
            db = await self._get_conn()
            cursor = await db.execute(
                "SELECT fingerprint, wallet FROM operator_mappings ORDER BY fingerprint"
            )
            rows = await cursor.fetchall()
            cols = [d[0] for d in cursor.description]
            return [dict(zip(cols, row)) for row in rows]
        except Exception:
            logger.warning("operator_mapping_query_all failed", exc_info=True)
            return []

    # ------------------------------------------------------------------
    # SOL flows
    # ------------------------------------------------------------------

    async def sol_flow_insert_batch(self, flows: list[dict]) -> None:
        """Batch-insert SOL flow edges. Silently ignores duplicates."""
        if not flows:
            return
        try:
            db = await self._get_conn()
            for flow in flows:
                await db.execute(
                    """
                    INSERT OR IGNORE INTO sol_flows
                      (mint, from_address, to_address, amount_lamports,
                       signature, slot, block_time, hop, recorded_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        flow.get("mint", ""),
                        flow.get("from_address", ""),
                        flow.get("to_address", ""),
                        flow.get("amount_lamports", 0),
                        flow.get("signature", ""),
                        flow.get("slot"),
                        flow.get("block_time"),
                        flow.get("hop", 0),
                        time.time(),
                    ),
                )
            await db.commit()
        except Exception:
            logger.warning("sol_flow_insert_batch failed", exc_info=True)

    async def sol_flows_query(self, mint: str) -> list[dict]:
        """Return all SOL flow edges for a mint address."""
        try:
            db = await self._get_conn()
            cursor = await db.execute(
                "SELECT * FROM sol_flows WHERE mint = ? ORDER BY hop, block_time",
                (mint,),
            )
            rows = await cursor.fetchall()
            cols = [d[0] for d in cursor.description]
            return [dict(zip(cols, row)) for row in rows]
        except Exception:
            logger.warning("sol_flows_query failed", exc_info=True)
            return []

    async def sol_flows_query_by_from(self, from_address: str) -> list[dict]:
        """Return all SOL flow edges originating from a wallet."""
        try:
            db = await self._get_conn()
            cursor = await db.execute(
                "SELECT * FROM sol_flows WHERE from_address = ? ORDER BY block_time",
                (from_address,),
            )
            rows = await cursor.fetchall()
            cols = [d[0] for d in cursor.description]
            return [dict(zip(cols, row)) for row in rows]
        except Exception:
            logger.warning("sol_flows_query_by_from failed", exc_info=True)
            return []

    # ------------------------------------------------------------------
    # Cartel edges
    # ------------------------------------------------------------------

    async def cartel_edge_upsert(
        self,
        wallet_a: str,
        wallet_b: str,
        signal_type: str,
        signal_strength: float,
        evidence: dict,
    ) -> None:
        """Upsert a cartel coordination edge. Normalises wallet pair order."""
        try:
            db = await self._get_conn()
            now = time.time()
            ev_json = json.dumps(evidence, default=str)
            # Normalise order so (A,B) == (B,A)
            w_a, w_b = (wallet_a, wallet_b) if wallet_a < wallet_b else (wallet_b, wallet_a)
            cursor = await db.execute(
                "SELECT id, signal_strength FROM cartel_edges "
                "WHERE wallet_a = ? AND wallet_b = ? AND signal_type = ?",
                (w_a, w_b, signal_type),
            )
            row = await cursor.fetchone()
            if row:
                new_strength = max(signal_strength, row[1])
                await db.execute(
                    "UPDATE cartel_edges SET signal_strength = ?, evidence_json = ?, last_seen = ? "
                    "WHERE wallet_a = ? AND wallet_b = ? AND signal_type = ?",
                    (new_strength, ev_json, now, w_a, w_b, signal_type),
                )
            else:
                await db.execute(
                    "INSERT INTO cartel_edges "
                    "(wallet_a, wallet_b, signal_type, signal_strength, evidence_json, first_seen, last_seen) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (w_a, w_b, signal_type, signal_strength, ev_json, now, now),
                )
            await db.commit()
        except Exception:
            logger.warning("cartel_edge_upsert failed", exc_info=True)

    async def cartel_edges_query(self, wallet: str) -> list[dict]:
        """Return all cartel edges involving a wallet (as either endpoint)."""
        try:
            db = await self._get_conn()
            cursor = await db.execute(
                "SELECT * FROM cartel_edges "
                "WHERE wallet_a = ? OR wallet_b = ? "
                "ORDER BY signal_strength DESC",
                (wallet, wallet),
            )
            rows = await cursor.fetchall()
            cols = [d[0] for d in cursor.description]
            return [dict(zip(cols, row)) for row in rows]
        except Exception:
            logger.warning("cartel_edges_query failed", exc_info=True)
            return []

    async def cartel_edges_query_all(self) -> list[dict]:
        """Return all cartel edges ordered by strength (for graph rendering)."""
        try:
            db = await self._get_conn()
            cursor = await db.execute(
                "SELECT * FROM cartel_edges ORDER BY signal_strength DESC LIMIT 5000"
            )
            rows = await cursor.fetchall()
            cols = [d[0] for d in cursor.description]
            return [dict(zip(cols, row)) for row in rows]
        except Exception:
            logger.warning("cartel_edges_query_all failed", exc_info=True)
            return []
