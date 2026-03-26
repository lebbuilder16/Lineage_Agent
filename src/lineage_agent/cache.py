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

from config import FORENSIC_CACHE_VERSION

logger = logging.getLogger(__name__)

_AI_CACHE_PREFIX = f"ai:{FORENSIC_CACHE_VERSION}"


def _current_ai_cache_key(mint: str) -> str:
    return f"{_AI_CACHE_PREFIX}:{mint}"


def _legacy_ai_cache_key(mint: str) -> str:
    return f"ai:v3:{mint}"


class CacheResult:
    """Wrapper returned by stale-aware cache reads."""

    __slots__ = ("value", "fresh")

    def __init__(self, value: Any, fresh: bool = True):
        self.value = value
        self.fresh = fresh

    def __bool__(self) -> bool:
        return self.value is not None


class TTLCache:
    """Thread-safe-ish TTL cache backed by a plain ``dict``.

    Supports stale-while-revalidate: entries between ``expires_at`` and
    ``hard_expires_at`` are returned with ``fresh=False``.

    Not designed for multi-process environments – suitable for a single
    FastAPI / Uvicorn worker.
    """

    def __init__(self, default_ttl: int = 300, max_entries: int = 10_000) -> None:
        # store: key → (expires_at, hard_expires_at, value)
        self._store: dict[str, tuple[float, float, Any]] = {}
        self._default_ttl = default_ttl
        self._max_entries = max_entries

    def get(self, key: str) -> Optional[Any]:
        """Return the cached value or ``None`` if hard-expired / missing.

        Compatible with existing callers — returns the raw value.
        Use ``get_swr`` for stale-while-revalidate semantics.
        """
        entry = self._store.get(key)
        if entry is None:
            return None
        _expires_at, hard_expires_at, value = entry
        if time.monotonic() > hard_expires_at:
            del self._store[key]
            return None
        return value

    def get_swr(self, key: str) -> Optional[CacheResult]:
        """Return a CacheResult with ``fresh`` flag, or None if hard-expired.

        - ``fresh=True``  → within soft TTL, no refresh needed.
        - ``fresh=False`` → stale but usable, caller should refresh in background.
        - ``None``        → hard-expired or missing, must recompute.
        """
        entry = self._store.get(key)
        if entry is None:
            return None
        expires_at, hard_expires_at, value = entry
        now = time.monotonic()
        if now > hard_expires_at:
            del self._store[key]
            return None
        return CacheResult(value, fresh=(now <= expires_at))

    def set(self, key: str, value: Any, ttl: Optional[int] = None, stale_ttl: Optional[int] = None) -> None:
        """Store *value* under *key* with soft and hard TTLs.

        *ttl*: seconds until the entry is considered stale (soft TTL).
        *stale_ttl*: seconds until the entry is hard-deleted.
                     Defaults to ``ttl`` (no stale window) for backward compat.
        """
        actual_ttl = ttl if ttl is not None else self._default_ttl
        actual_stale = stale_ttl if stale_ttl is not None else actual_ttl
        now = time.monotonic()
        self._store[key] = (now + actual_ttl, now + actual_stale, value)
        # Enforce max entries
        if len(self._store) > self._max_entries:
            cur = time.monotonic()
            expired = [k for k, (_, he, _v) in self._store.items() if cur > he]
            for k in expired:
                del self._store[k]
            if len(self._store) > self._max_entries:
                sorted_keys = sorted(self._store, key=lambda k: self._store[k][1])
                for k in sorted_keys[: len(self._store) - self._max_entries]:
                    del self._store[k]

    def invalidate(self, key: str) -> None:
        """Remove a specific key."""
        self._store.pop(key, None)

    def invalidate_prefix(self, prefix: str) -> int:
        """Remove all keys that start with ``prefix`` and return the count."""
        matching_keys = [key for key in self._store if key.startswith(prefix)]
        for key in matching_keys:
            self._store.pop(key, None)
        return len(matching_keys)

    def clear(self) -> None:
        """Drop all cached entries."""
        self._store.clear()

    def __contains__(self, key: str) -> bool:
        return self.get(key) is not None

    def __len__(self) -> int:
        now = time.monotonic()
        expired = [k for k, (_, he, _v) in self._store.items() if now > he]
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

    # Stubs for operator_mappings (no-ops without SQLite)
    async def operator_mapping_upsert(self, fingerprint: str, wallet: str) -> None:
        pass

    async def operator_mapping_query(self, fingerprint: str) -> list[dict]:
        return []

    async def operator_mapping_query_by_wallet(self, wallet: str) -> list[dict]:
        return []

    async def operator_mapping_query_all(self) -> list[dict]:
        return []

    # Stubs for sol_flows (no-ops without SQLite)
    async def sol_flow_insert_batch(self, flows: list[dict]) -> None:
        pass

    async def sol_flows_query(self, mint: str) -> list[dict]:
        return []

    async def sol_flows_delete(self, mint: str) -> None:
        return None

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

    # Stubs for bundle_reports (no-ops without SQLite)
    async def bundle_report_insert(
        self, mint: str, deployer: str, report_json: str,
    ) -> None:
        pass

    async def bundle_report_query(self, mint: str, max_age_seconds: float = 86400.0) -> Optional[str]:
        return None

    async def bundle_report_delete(self, mint: str) -> None:
        return None

    # Stubs for community_lookup (no-ops without SQLite)
    async def community_lookup_upsert(self, community_id: str, sample_wallet: str) -> None:
        pass

    async def community_lookup_query(self, community_id: str) -> Optional[str]:
        return None

    # Stubs for alert subscriptions (no-ops without SQLite)
    async def subscribe_alert(self, chat_id: int, sub_type: str, value: str) -> bool:
        return False

    async def unsubscribe_alert(self, chat_id: int, sub_id: int) -> bool:
        return False

    async def list_subscriptions(self, chat_id: int) -> list:
        return []

    async def query_subscriptions(self, sub_type: str, value: str) -> list:
        return []

    async def all_subscriptions(self) -> list:
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
            await self._conn.execute("PRAGMA busy_timeout=15000")
            await self._conn.execute("PRAGMA synchronous=NORMAL")
            await self._conn.execute("PRAGMA wal_autocheckpoint=1000")
            await self._conn.execute("PRAGMA foreign_keys=ON")
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
        # SWR migration: add stale_at column (soft TTL boundary)
        try:
            await db.execute("ALTER TABLE cache ADD COLUMN stale_at REAL")
        except Exception:
            pass  # column already exists
        # Intelligence events — persistent forensic observations, never expire
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS intelligence_events (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type   TEXT NOT NULL,
                mint         TEXT,
                deployer     TEXT,
                name         TEXT,
                symbol       TEXT,
                narrative    TEXT,
                mcap_usd     REAL,
                liq_usd      REAL,
                created_at   TEXT,
                rugged_at    TEXT,
                rug_mechanism TEXT,
                launch_platform TEXT,
                lifecycle_stage TEXT,
                market_surface TEXT,
                evidence_level TEXT,
                reason_codes  TEXT,
                analysis_version TEXT,
                policy_version TEXT,
                extra_json   TEXT,
                metadata_uri TEXT DEFAULT '',
                recorded_at  REAL NOT NULL
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
        # Migrate: add metadata_uri column for Operator Fingerprint enrichment
        try:
            await db.execute(
                "ALTER TABLE intelligence_events ADD COLUMN metadata_uri TEXT DEFAULT ''"
            )
        except Exception:
            pass  # Column already exists — safe to ignore
        for _stmt in (
            "ALTER TABLE intelligence_events ADD COLUMN rug_mechanism TEXT",
            "ALTER TABLE intelligence_events ADD COLUMN launch_platform TEXT",
            "ALTER TABLE intelligence_events ADD COLUMN lifecycle_stage TEXT",
            "ALTER TABLE intelligence_events ADD COLUMN market_surface TEXT",
            "ALTER TABLE intelligence_events ADD COLUMN evidence_level TEXT",
            "ALTER TABLE intelligence_events ADD COLUMN reason_codes TEXT",
            "ALTER TABLE intelligence_events ADD COLUMN analysis_version TEXT",
            "ALTER TABLE intelligence_events ADD COLUMN policy_version TEXT",
        ):
            try:
                await db.execute(_stmt)
            except Exception:
                pass
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_ie_platform ON intelligence_events(launch_platform)"
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_ie_stage ON intelligence_events(lifecycle_stage)"
        )

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

        # sol_flows schema migrations (safe ADD COLUMN — ignored if column already exists)
        for _col_sql in [
            "ALTER TABLE sol_flows ADD COLUMN from_label TEXT",
            "ALTER TABLE sol_flows ADD COLUMN to_label TEXT",
            "ALTER TABLE sol_flows ADD COLUMN entity_type TEXT",
        ]:
            try:
                await db.execute(_col_sql)
            except Exception:
                pass  # column already exists — skip

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

        # bundle_reports: cached results of bundle wallet analysis
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS bundle_reports (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                mint        TEXT NOT NULL UNIQUE,
                deployer    TEXT NOT NULL,
                report_json TEXT NOT NULL,
                recorded_at REAL NOT NULL
            )
            """
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_br_deployer ON bundle_reports(deployer)"
        )

        # community_lookup: O(1) lookup from community_id to a sample wallet
        # Populated during cartel_sweep; avoids O(n) iteration in the API endpoint.
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS community_lookup (
                community_id TEXT PRIMARY KEY,
                sample_wallet TEXT NOT NULL,
                updated_at   REAL NOT NULL
            )
            """
        )

        # pHash index for faster cartel pHash cluster signal queries
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_ie_phash ON intelligence_events(phash)"
        )

        # ---------------------------------------------------------------
        # Phase 1 — user accounts & web watchlist
        # ---------------------------------------------------------------
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                privy_id       TEXT UNIQUE NOT NULL,
                email          TEXT,
                wallet_address TEXT,
                plan           TEXT NOT NULL DEFAULT 'free',
                api_key        TEXT UNIQUE NOT NULL,
                created_at     REAL NOT NULL
            )
            """
        )
        await db.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_privy ON users(privy_id)"
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_users_wallet ON users(wallet_address)"
        )
        await db.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_apikey ON users(api_key)"
        )

        # user_watches: web-side alert subscriptions linked to a user account
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS user_watches (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                sub_type   TEXT NOT NULL,
                value      TEXT NOT NULL,
                created_at REAL NOT NULL
            )
            """
        )
        await db.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_uw_unique "
            "ON user_watches(user_id, sub_type, value)"
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_uw_user ON user_watches(user_id)"
        )

        # ---------------------------------------------------------------
        # Phase 0D / Phase 1 — subscriptions, usage counters, webhooks
        # ---------------------------------------------------------------
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS subscriptions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
                rc_customer_id TEXT,
                plan TEXT NOT NULL DEFAULT 'free',
                product_id TEXT,
                expires_at REAL,
                is_active INTEGER NOT NULL DEFAULT 1,
                store TEXT,
                payment_method TEXT,
                tx_signature TEXT,
                updated_at REAL NOT NULL
            )
            """
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_sub_rc ON subscriptions(rc_customer_id)"
        )

        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS usage_counters (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                counter_key TEXT NOT NULL,
                date_key TEXT NOT NULL,
                count INTEGER NOT NULL DEFAULT 0,
                updated_at REAL NOT NULL,
                UNIQUE(user_id, counter_key, date_key)
            )
            """
        )

        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS user_webhooks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                url TEXT NOT NULL,
                events_filter TEXT,
                secret TEXT,
                enabled INTEGER NOT NULL DEFAULT 1,
                created_at REAL NOT NULL
            )
            """
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_uwh_user ON user_webhooks(user_id)"
        )

        # alert_prefs: per-user alert channel routing preferences
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS alert_prefs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                channel TEXT NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 1,
                config_json TEXT,
                UNIQUE(user_id, channel)
            )
            """
        )

        # ---------------------------------------------------------------
        # Phase 3 — briefings
        # ---------------------------------------------------------------
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS briefings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                content TEXT NOT NULL,
                created_at REAL NOT NULL
            )
            """
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_briefings_user ON briefings(user_id, created_at)"
        )

        # ---------------------------------------------------------------
        # Phase 4 — watch snapshots (watchlist monitor)
        # ---------------------------------------------------------------
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS watch_snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                watch_id INTEGER NOT NULL,
                mint TEXT NOT NULL,
                risk_level TEXT,
                risk_score REAL DEFAULT 0,
                scanned_at REAL NOT NULL
            )
            """
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_ws_watch ON watch_snapshots(watch_id, scanned_at)"
        )

        # ---------------------------------------------------------------
        # Sweep intelligence flags
        # ---------------------------------------------------------------
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS sweep_flags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                watch_id INTEGER NOT NULL,
                mint TEXT NOT NULL,
                user_id INTEGER NOT NULL,
                flag_type TEXT NOT NULL,
                severity TEXT NOT NULL DEFAULT 'info',
                title TEXT NOT NULL,
                detail TEXT,
                created_at REAL NOT NULL,
                read INTEGER DEFAULT 0
            )
            """
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_sf_user ON sweep_flags(user_id, created_at DESC)"
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_sf_mint ON sweep_flags(mint, created_at DESC)"
        )

        # ---------------------------------------------------------------
        # Phase 5 — agent preferences (agentic UX)
        # ---------------------------------------------------------------
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS agent_prefs (
                user_id INTEGER PRIMARY KEY,
                alert_deployer_launch INTEGER NOT NULL DEFAULT 1,
                alert_high_risk INTEGER NOT NULL DEFAULT 1,
                auto_investigate INTEGER NOT NULL DEFAULT 0,
                daily_briefing INTEGER NOT NULL DEFAULT 1,
                briefing_hour INTEGER NOT NULL DEFAULT 8,
                risk_threshold INTEGER NOT NULL DEFAULT 70,
                alert_types TEXT NOT NULL DEFAULT '["deployer_exit","bundle","sol_extraction","price_crash","cartel","operator_match","deployer_rug"]',
                sol_extraction_min REAL NOT NULL DEFAULT 20.0,
                sweep_interval INTEGER NOT NULL DEFAULT 7200,
                investigation_depth TEXT NOT NULL DEFAULT 'standard',
                quiet_hours_start INTEGER DEFAULT NULL,
                quiet_hours_end INTEGER DEFAULT NULL,
                updated_at REAL
            )
            """
        )
        # Migrate existing agent_prefs tables (add new columns if missing)
        for col, defn in [
            ("risk_threshold", "INTEGER NOT NULL DEFAULT 70"),
            ("alert_types", "TEXT NOT NULL DEFAULT '[]'"),
            ("sol_extraction_min", "REAL NOT NULL DEFAULT 20.0"),
            ("sweep_interval", "INTEGER NOT NULL DEFAULT 7200"),
            ("investigation_depth", "TEXT NOT NULL DEFAULT 'standard'"),
            ("quiet_hours_start", "INTEGER DEFAULT NULL"),
            ("quiet_hours_end", "INTEGER DEFAULT NULL"),
        ]:
            try:
                await db.execute(f"ALTER TABLE agent_prefs ADD COLUMN {col} {defn}")
            except Exception:
                pass  # column already exists

        # Phase 6 — investigation history (server-side memory)
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS investigations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                mint TEXT NOT NULL,
                name TEXT,
                symbol TEXT,
                risk_score INTEGER,
                verdict_summary TEXT,
                key_findings TEXT,
                model TEXT,
                turns_used INTEGER DEFAULT 0,
                tokens_used INTEGER DEFAULT 0,
                created_at REAL NOT NULL
            )
            """
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_inv_user ON investigations(user_id, created_at)"
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_inv_mint ON investigations(mint)"
        )

        # Phase 7 — investigation feedback
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS investigation_feedback (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                mint TEXT NOT NULL,
                risk_score INTEGER,
                rating TEXT NOT NULL,
                note TEXT,
                created_at REAL NOT NULL
            )
            """
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_fb_mint ON investigation_feedback(mint)"
        )

        # ── Agent Memory System (4 layers) ────────────────────────────────
        # Layer 1: Episodic memory — full verdict + signal snapshot per investigation
        await db.execute("""
            CREATE TABLE IF NOT EXISTS investigation_episodes (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                mint             TEXT NOT NULL,
                deployer         TEXT,
                operator_fp      TEXT,
                campaign_id      TEXT,
                community_id     TEXT,
                risk_score       INTEGER NOT NULL,
                confidence       TEXT NOT NULL DEFAULT 'medium',
                rug_pattern      TEXT,
                verdict_summary  TEXT NOT NULL,
                conviction_chain TEXT,
                key_findings     TEXT,
                signals_json     TEXT NOT NULL DEFAULT '{}',
                user_rating      TEXT,
                user_note        TEXT,
                model            TEXT,
                created_at       REAL NOT NULL
            )
        """)
        await db.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_ep_mint ON investigation_episodes(mint)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_ep_deployer ON investigation_episodes(deployer)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_ep_operator ON investigation_episodes(operator_fp)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_ep_campaign ON investigation_episodes(campaign_id)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_ep_community ON investigation_episodes(community_id)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_ep_created ON investigation_episodes(created_at)")

        # Layer 2: Semantic memory — cumulative entity profiles
        await db.execute("""
            CREATE TABLE IF NOT EXISTS entity_knowledge (
                id                  INTEGER PRIMARY KEY AUTOINCREMENT,
                entity_type         TEXT NOT NULL,
                entity_id           TEXT NOT NULL,
                total_tokens        INTEGER NOT NULL DEFAULT 0,
                total_rugs          INTEGER NOT NULL DEFAULT 0,
                total_extracted_sol REAL DEFAULT 0,
                avg_risk_score      REAL DEFAULT 0,
                preferred_narratives TEXT,
                typical_rug_pattern  TEXT,
                launch_velocity     REAL,
                acceleration        REAL,
                first_seen          REAL,
                last_seen           REAL,
                sample_count        INTEGER NOT NULL DEFAULT 0,
                confidence          TEXT DEFAULT 'low',
                updated_at          REAL NOT NULL
            )
        """)
        await db.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_ek_type_id ON entity_knowledge(entity_type, entity_id)")

        # Layer 3: Procedural memory — learned calibration rules from feedback
        await db.execute("""
            CREATE TABLE IF NOT EXISTS calibration_rules (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                rule_type      TEXT NOT NULL,
                condition_json TEXT NOT NULL,
                adjustment     REAL NOT NULL,
                sample_count   INTEGER NOT NULL DEFAULT 1,
                confidence     REAL NOT NULL DEFAULT 0.5,
                source_episodes TEXT,
                active         INTEGER NOT NULL DEFAULT 1,
                created_at     REAL NOT NULL,
                updated_at     REAL NOT NULL
            )
        """)
        await db.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_cr_type_cond ON calibration_rules(rule_type, condition_json)")

        # Layer 4: Temporal memory — campaign event timeline
        await db.execute("""
            CREATE TABLE IF NOT EXISTS campaign_timelines (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                entity_type   TEXT NOT NULL,
                entity_id     TEXT NOT NULL,
                event_type    TEXT NOT NULL,
                mint          TEXT,
                event_at      REAL NOT NULL,
                risk_score    INTEGER,
                extracted_sol REAL
            )
        """)
        await db.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_ct_unique ON campaign_timelines(entity_type, entity_id, event_type, mint)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_ct_entity ON campaign_timelines(entity_type, entity_id)")

        # Safe column migrations
        for col_sql in [
            "ALTER TABLE users ADD COLUMN rc_customer_id TEXT",
            "ALTER TABLE users ADD COLUMN discord_webhook_url TEXT",
            "ALTER TABLE users ADD COLUMN username TEXT",
            "ALTER TABLE users ADD COLUMN display_name TEXT",
            "ALTER TABLE users ADD COLUMN avatar_url TEXT",
            "ALTER TABLE users ADD COLUMN fcm_token TEXT",
        ]:
            try:
                await db.execute(col_sql)
            except Exception:
                pass  # column already exists

        # ── Wallet monitoring tables ──────────────────────────────────
        await db.execute("""
            CREATE TABLE IF NOT EXISTS monitored_wallets (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id     INTEGER NOT NULL,
                address     TEXT NOT NULL,
                label       TEXT,
                source      TEXT NOT NULL DEFAULT 'external',
                enabled     INTEGER NOT NULL DEFAULT 1,
                created_at  REAL NOT NULL,
                UNIQUE(user_id, address)
            )
        """)
        await db.execute("CREATE INDEX IF NOT EXISTS idx_mw_user ON monitored_wallets(user_id)")

        await db.execute("""
            CREATE TABLE IF NOT EXISTS wallet_holdings (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id        INTEGER NOT NULL,
                wallet_address TEXT NOT NULL,
                mint           TEXT NOT NULL,
                token_name     TEXT,
                token_symbol   TEXT,
                image_uri      TEXT,
                ui_amount      REAL NOT NULL DEFAULT 0,
                decimals       INTEGER DEFAULT 0,
                risk_score     INTEGER,
                risk_level     TEXT,
                liquidity_usd  REAL,
                price_usd      REAL,
                last_scanned   REAL,
                first_seen     REAL NOT NULL,
                updated_at     REAL NOT NULL,
                UNIQUE(user_id, wallet_address, mint)
            )
        """)
        await db.execute("CREATE INDEX IF NOT EXISTS idx_wh_user ON wallet_holdings(user_id)")

        await db.execute("""
            CREATE TABLE IF NOT EXISTS wallet_monitor_log (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id         INTEGER NOT NULL,
                holdings_count  INTEGER NOT NULL DEFAULT 0,
                risky_count     INTEGER NOT NULL DEFAULT 0,
                alerts_sent     INTEGER NOT NULL DEFAULT 0,
                duration_ms     REAL,
                created_at      REAL NOT NULL
            )
        """)
        await db.execute("CREATE INDEX IF NOT EXISTS idx_wml_user ON wallet_monitor_log(user_id, created_at DESC)")

        # Wallet holdings migrations (add columns if missing)
        for col, defn in [
            ("risk_flags", "TEXT"),           # JSON array of flag strings
            ("prev_risk_score", "INTEGER"),   # score from previous scan (for delta)
            ("status", "TEXT DEFAULT 'held'"),  # 'new' | 'held' | 'risk_up' | 'risk_down'
        ]:
            try:
                await db.execute(f"ALTER TABLE wallet_holdings ADD COLUMN {col} {defn}")
            except Exception:
                pass

        # Risk score history for sparklines
        await db.execute("""
            CREATE TABLE IF NOT EXISTS wallet_risk_history (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id    INTEGER NOT NULL,
                mint       TEXT NOT NULL,
                risk_score INTEGER NOT NULL,
                scanned_at REAL NOT NULL
            )
        """)
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_wrh_user_mint "
            "ON wallet_risk_history(user_id, mint, scanned_at DESC)"
        )

        # Wallet monitor columns in agent_prefs
        for col, defn in [
            ("wallet_monitor_enabled", "INTEGER NOT NULL DEFAULT 0"),
            ("wallet_monitor_threshold", "INTEGER NOT NULL DEFAULT 60"),
            ("wallet_monitor_interval", "INTEGER NOT NULL DEFAULT 600"),
        ]:
            try:
                await db.execute(f"ALTER TABLE agent_prefs ADD COLUMN {col} {defn}")
            except Exception:
                pass

        await db.commit()
        self._initialised = True

    async def get(self, key: str) -> Optional[Any]:
        """Return cached value or None. Serves stale data (within hard TTL)."""
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

    async def get_swr(self, key: str) -> Optional[CacheResult]:
        """Stale-while-revalidate read.

        Returns CacheResult(value, fresh=True/False) or None if hard-expired.
        - fresh=True:  within soft TTL (stale_at), no refresh needed.
        - fresh=False: between stale_at and expires_at (hard TTL), usable but needs refresh.
        - None:        past hard TTL or missing.
        """
        try:
            db = await self._get_conn()
            cursor = await db.execute(
                "SELECT value, stale_at, expires_at FROM cache WHERE key = ?", (key,)
            )
            row = await cursor.fetchone()
            if row is None:
                return None
            value_json, stale_at, expires_at = row
            now = time.time()
            if now > expires_at:
                await self.invalidate(key)
                return None
            fresh = stale_at is None or now <= stale_at
            return CacheResult(json.loads(value_json), fresh=fresh)
        except Exception:
            logger.warning("SQLite cache get_swr failed for %s", key, exc_info=True)
            return None

    async def set(self, key: str, value: Any, ttl: Optional[int] = None, stale_ttl: Optional[int] = None) -> None:
        """Store value with soft TTL (stale_at) and hard TTL (expires_at).

        *ttl*: seconds until the entry is considered stale.
        *stale_ttl*: seconds until the entry is hard-deleted.
                     Defaults to ``ttl`` for backward compatibility.
        """
        try:
            db = await self._get_conn()
            actual_ttl = ttl if ttl is not None else self._default_ttl
            actual_stale = stale_ttl if stale_ttl is not None else actual_ttl
            now = time.time()
            stale_at = now + actual_ttl
            expires_at = now + actual_stale
            # Serialize Pydantic models properly via model_dump()
            if hasattr(value, "model_dump"):
                serializable = value.model_dump(mode="json")
            elif isinstance(value, list) and value and hasattr(value[0], "model_dump"):
                serializable = [v.model_dump(mode="json") for v in value]
            else:
                serializable = value
            value_json = json.dumps(serializable, default=str)
            await db.execute(
                "INSERT OR REPLACE INTO cache (key, value, stale_at, expires_at) VALUES (?, ?, ?, ?)",
                (key, value_json, stale_at, expires_at),
            )
            await db.commit()
            # Enforce max entries (evict oldest expired first, then oldest)
            cursor = await db.execute("SELECT COUNT(*) FROM cache")
            (count,) = await cursor.fetchone()
            if count > self._max_entries:
                await self.purge_expired()
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

    async def invalidate_prefix(self, prefix: str) -> int:
        """Delete all cache keys that start with ``prefix`` and return the count."""
        try:
            db = await self._get_conn()
            cursor = await db.execute(
                "DELETE FROM cache WHERE key LIKE ?",
                (f"{prefix}%",),
            )
            await db.commit()
            return cursor.rowcount or 0
        except Exception:
            logger.warning("SQLite cache prefix invalidate failed for %s", prefix, exc_info=True)
            return 0

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
        "rugged_at", "rug_mechanism", "launch_platform", "lifecycle_stage", "market_surface",
        "evidence_level", "reason_codes", "analysis_version", "policy_version",
        "extra_json", "phash", "metadata_uri",
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
            # Auto-fill created_at if caller didn't provide it
            if "created_at" not in safe or not safe["created_at"]:
                from datetime import datetime, timezone as _tz
                safe["created_at"] = datetime.now(tz=_tz.utc).isoformat()
            cols = list(safe.keys()) + ["recorded_at"]
            placeholders = ", ".join("?" for _ in cols)
            col_names = ", ".join(cols)
            values = list(safe.values()) + [time.time()]
            await db.execute(
                f"INSERT OR REPLACE INTO intelligence_events ({col_names}) VALUES ({placeholders})",
                values,
            )
            await db.commit()

            # P0-C: invalidate stale AI analysis whenever a token is confirmed rugged
            mint_val = kwargs.get("mint")
            if kwargs.get("event_type") == "token_rugged" and mint_val:
                await self.invalidate(_current_ai_cache_key(mint_val))
                await self.invalidate(_legacy_ai_cache_key(mint_val))
                logger.debug("[cache] invalidated AI cache for %s after token_rugged event", mint_val[:12])

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

    async def operator_mapping_query_by_wallet(self, wallet: str) -> list[dict]:
        """Return all fingerprints + co-wallets linked to *wallet*."""
        try:
            db = await self._get_conn()
            # Two-step: find fingerprints for this wallet, then all wallets sharing them
            cursor = await db.execute(
                "SELECT DISTINCT fingerprint FROM operator_mappings WHERE wallet = ?",
                (wallet,),
            )
            fps = [row[0] for row in await cursor.fetchall()]
            if not fps:
                return []
            placeholders = ",".join("?" for _ in fps)
            cursor2 = await db.execute(
                f"SELECT fingerprint, wallet FROM operator_mappings WHERE fingerprint IN ({placeholders})",
                tuple(fps),
            )
            rows = await cursor2.fetchall()
            cols = [d[0] for d in cursor2.description]
            return [dict(zip(cols, row)) for row in rows]
        except Exception:
            logger.warning("operator_mapping_query_by_wallet failed", exc_info=True)
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

    async def sol_flows_delete(self, mint: str) -> None:
        """Delete all SOL flow edges for a mint address."""
        try:
            db = await self._get_conn()
            await db.execute("DELETE FROM sol_flows WHERE mint = ?", (mint,))
            await db.commit()
        except Exception:
            logger.warning("sol_flows_delete failed for %s", mint, exc_info=True)

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

    # ------------------------------------------------------------------
    # Bundle reports
    # ------------------------------------------------------------------

    async def bundle_report_insert(
        self, mint: str, deployer: str, report_json: str,
    ) -> None:
        """Persist a bundle analysis result. Replaces existing entry for the same mint."""
        try:
            db = await self._get_conn()
            await db.execute(
                "INSERT OR REPLACE INTO bundle_reports "
                "(mint, deployer, report_json, recorded_at) VALUES (?, ?, ?, ?)",
                (mint, deployer, report_json, time.time()),
            )
            await db.commit()
        except Exception:
            logger.warning("bundle_report_insert failed for %s", mint, exc_info=True)

    async def bundle_report_query(self, mint: str, max_age_seconds: float = 86400.0) -> Optional[str]:
        """Return the cached bundle report JSON for *mint*, or None if stale/missing.

        Args:
            mint: Token mint address.
            max_age_seconds: Maximum age of cached report (default 24h).
        """
        try:
            db = await self._get_conn()
            cursor = await db.execute(
                "SELECT report_json, recorded_at FROM bundle_reports WHERE mint = ?",
                (mint,),
            )
            row = await cursor.fetchone()
            if row is None:
                return None
            report_json, recorded_at = row
            if time.time() - recorded_at > max_age_seconds:
                return None  # stale
            return report_json
        except Exception:
            logger.warning("bundle_report_query failed for %s", mint, exc_info=True)
            return None

    async def bundle_report_delete(self, mint: str) -> None:
        """Delete a cached bundle report for *mint*."""
        try:
            db = await self._get_conn()
            await db.execute("DELETE FROM bundle_reports WHERE mint = ?", (mint,))
            await db.commit()
        except Exception:
            logger.warning("bundle_report_delete failed for %s", mint, exc_info=True)

    # ------------------------------------------------------------------
    # Community lookup (cartel community_id → sample wallet)
    # ------------------------------------------------------------------

    async def community_lookup_upsert(self, community_id: str, sample_wallet: str) -> None:
        """Insert or update a community_id → sample_wallet mapping."""
        try:
            db = await self._get_conn()
            await db.execute(
                "INSERT OR REPLACE INTO community_lookup "
                "(community_id, sample_wallet, updated_at) VALUES (?, ?, ?)",
                (community_id, sample_wallet, time.time()),
            )
            await db.commit()
        except Exception:
            logger.warning("community_lookup_upsert failed for %s", community_id, exc_info=True)

    async def community_lookup_query(self, community_id: str) -> Optional[str]:
        """Return the sample wallet for a community_id, or None."""
        try:
            db = await self._get_conn()
            cursor = await db.execute(
                "SELECT sample_wallet FROM community_lookup WHERE community_id = ?",
                (community_id,),
            )
            row = await cursor.fetchone()
            return row[0] if row else None
        except Exception:
            logger.warning("community_lookup_query failed for %s", community_id, exc_info=True)
            return None

    # ------------------------------------------------------------------
    # Alert subscription stubs
    # ------------------------------------------------------------------

    async def subscribe_alert(self, chat_id: int, sub_type: str, value: str) -> bool:
        """Register an alert subscription. Returns False (stub)."""
        return False

    async def unsubscribe_alert(self, chat_id: int, sub_id: int) -> bool:
        """Remove an alert subscription. Returns False (stub)."""
        return False

    async def list_subscriptions(self, chat_id: int) -> list:
        """Return subscriptions for a Telegram chat. Returns [] (stub)."""
        return []

    async def query_subscriptions(self, sub_type: str, value: str) -> list:
        """Return subscriptions matching type+value. Returns [] (stub)."""
        return []

    async def all_subscriptions(self) -> list:
        """Return all active subscriptions. Returns [] (stub)."""
        return []
