"""
PostgreSQL backend using asyncpg.

Activated when DATABASE_URL environment variable is set to a postgres:// URL.
Provides the same interface as SqliteBackend but with PostgreSQL semantics:
- $1, $2, ... placeholders (not ?)
- Connection pool (not single persistent connection)
- JSONB support for evidence_json, config_json columns
- Native async with no write locks
"""
from __future__ import annotations

import logging
from typing import Any, Optional

from .backend import DatabaseBackend

logger = logging.getLogger(__name__)


class PostgresBackend(DatabaseBackend):
    """asyncpg-based PostgreSQL backend."""

    def __init__(self, dsn: str) -> None:
        self._dsn = dsn
        self._pool = None

    async def init(self) -> None:
        try:
            import asyncpg
        except ImportError:
            raise ImportError(
                "asyncpg is required for PostgreSQL backend. "
                "Install it with: pip install asyncpg"
            )

        self._pool = await asyncpg.create_pool(
            self._dsn,
            min_size=2,
            max_size=15,
            command_timeout=30,
        )
        await self._init_schema()
        logger.info("[pg] connection pool created (min=2, max=15)")

    async def close(self) -> None:
        if self._pool:
            await self._pool.close()
            self._pool = None

    async def execute(self, sql: str, params: tuple = ()) -> Any:
        async with self._pool.acquire() as conn:
            return await conn.execute(sql, *params)

    async def executemany(self, sql: str, params_list: list[tuple]) -> None:
        async with self._pool.acquire() as conn:
            await conn.executemany(sql, params_list)

    async def fetchone(self, sql: str, params: tuple = ()) -> Optional[dict]:
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(sql, *params)
            return dict(row) if row else None

    async def fetchall(self, sql: str, params: tuple = ()) -> list[dict]:
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(sql, *params)
            return [dict(r) for r in rows]

    async def commit(self) -> None:
        pass  # asyncpg uses autocommit by default

    def placeholder(self, index: int) -> str:
        return f"${index}"

    @property
    def dialect(self) -> str:
        return "postgresql"

    # ── Schema initialization ─────────────────────────────────────────────

    async def _init_schema(self) -> None:
        """Create all tables if they don't exist."""
        async with self._pool.acquire() as conn:
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS cache (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    expires_at DOUBLE PRECISION,
                    stale_at DOUBLE PRECISION
                )
            """)

            await conn.execute("""
                CREATE TABLE IF NOT EXISTS intelligence_events (
                    id BIGSERIAL PRIMARY KEY,
                    event_type TEXT NOT NULL,
                    mint TEXT,
                    deployer TEXT,
                    name TEXT,
                    symbol TEXT,
                    narrative TEXT,
                    mcap_usd DOUBLE PRECISION,
                    liq_usd DOUBLE PRECISION,
                    created_at TEXT,
                    rugged_at TEXT,
                    extra_json TEXT,
                    recorded_at DOUBLE PRECISION,
                    phash TEXT,
                    metadata_uri TEXT,
                    rug_mechanism TEXT,
                    launch_platform TEXT,
                    lifecycle_stage TEXT,
                    market_surface TEXT,
                    evidence_level TEXT,
                    reason_codes TEXT,
                    analysis_version TEXT,
                    policy_version TEXT,
                    UNIQUE (event_type, mint)
                )
            """)

            await conn.execute("""
                CREATE TABLE IF NOT EXISTS operator_mappings (
                    id BIGSERIAL PRIMARY KEY,
                    fingerprint TEXT NOT NULL,
                    wallet TEXT NOT NULL,
                    recorded_at DOUBLE PRECISION,
                    UNIQUE (fingerprint, wallet)
                )
            """)

            await conn.execute("""
                CREATE TABLE IF NOT EXISTS sol_flows (
                    id BIGSERIAL PRIMARY KEY,
                    mint TEXT NOT NULL,
                    from_address TEXT NOT NULL,
                    to_address TEXT NOT NULL,
                    amount_lamports BIGINT,
                    signature TEXT,
                    slot BIGINT,
                    block_time TEXT,
                    hop INTEGER DEFAULT 0,
                    recorded_at DOUBLE PRECISION,
                    from_label TEXT,
                    to_label TEXT,
                    entity_type TEXT,
                    UNIQUE (signature, from_address, to_address)
                )
            """)

            await conn.execute("""
                CREATE TABLE IF NOT EXISTS cartel_edges (
                    id BIGSERIAL PRIMARY KEY,
                    wallet_a TEXT NOT NULL,
                    wallet_b TEXT NOT NULL,
                    signal_type TEXT NOT NULL,
                    signal_strength DOUBLE PRECISION DEFAULT 1.0,
                    evidence_json TEXT,
                    first_seen DOUBLE PRECISION,
                    last_seen DOUBLE PRECISION,
                    UNIQUE (wallet_a, wallet_b, signal_type)
                )
            """)

            await conn.execute("""
                CREATE TABLE IF NOT EXISTS bundle_reports (
                    id BIGSERIAL PRIMARY KEY,
                    mint TEXT NOT NULL UNIQUE,
                    deployer TEXT,
                    report_json TEXT,
                    recorded_at DOUBLE PRECISION
                )
            """)

            await conn.execute("""
                CREATE TABLE IF NOT EXISTS community_lookup (
                    community_id TEXT PRIMARY KEY,
                    sample_wallet TEXT,
                    updated_at DOUBLE PRECISION
                )
            """)

            await conn.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id BIGSERIAL PRIMARY KEY,
                    privy_id TEXT UNIQUE NOT NULL,
                    email TEXT,
                    wallet_address TEXT,
                    plan TEXT DEFAULT 'free',
                    api_key TEXT UNIQUE NOT NULL,
                    created_at DOUBLE PRECISION,
                    rc_customer_id TEXT,
                    discord_webhook_url TEXT,
                    username TEXT,
                    display_name TEXT,
                    avatar_url TEXT,
                    fcm_token TEXT
                )
            """)

            await conn.execute("""
                CREATE TABLE IF NOT EXISTS user_watches (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    sub_type TEXT NOT NULL,
                    value TEXT NOT NULL,
                    created_at DOUBLE PRECISION,
                    UNIQUE (user_id, sub_type, value)
                )
            """)

            await conn.execute("""
                CREATE TABLE IF NOT EXISTS subscriptions (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    rc_customer_id TEXT,
                    plan TEXT,
                    product_id TEXT,
                    expires_at TEXT,
                    is_active BOOLEAN DEFAULT FALSE,
                    store TEXT,
                    payment_method TEXT,
                    tx_signature TEXT,
                    updated_at DOUBLE PRECISION
                )
            """)

            await conn.execute("""
                CREATE TABLE IF NOT EXISTS usage_counters (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL,
                    counter_key TEXT NOT NULL,
                    date_key TEXT NOT NULL,
                    count INTEGER DEFAULT 0,
                    updated_at DOUBLE PRECISION,
                    UNIQUE (user_id, counter_key, date_key)
                )
            """)

            await conn.execute("""
                CREATE TABLE IF NOT EXISTS user_webhooks (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    url TEXT NOT NULL,
                    events_filter TEXT,
                    secret TEXT,
                    enabled BOOLEAN DEFAULT TRUE,
                    created_at DOUBLE PRECISION
                )
            """)

            await conn.execute("""
                CREATE TABLE IF NOT EXISTS alert_prefs (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL,
                    channel TEXT NOT NULL,
                    enabled BOOLEAN DEFAULT TRUE,
                    config_json TEXT
                )
            """)

            await conn.execute("""
                CREATE TABLE IF NOT EXISTS briefings (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL,
                    content TEXT,
                    created_at DOUBLE PRECISION
                )
            """)

            await conn.execute("""
                CREATE TABLE IF NOT EXISTS watch_snapshots (
                    id BIGSERIAL PRIMARY KEY,
                    watch_id BIGINT,
                    mint TEXT,
                    risk_level TEXT,
                    risk_score INTEGER,
                    scanned_at DOUBLE PRECISION
                )
            """)

            await conn.execute("""
                CREATE TABLE IF NOT EXISTS agent_prefs (
                    user_id BIGINT PRIMARY KEY,
                    alert_deployer_launch BOOLEAN DEFAULT TRUE,
                    alert_high_risk BOOLEAN DEFAULT TRUE,
                    auto_investigate BOOLEAN DEFAULT FALSE,
                    daily_briefing BOOLEAN DEFAULT TRUE,
                    briefing_hour INTEGER DEFAULT 8,
                    updated_at DOUBLE PRECISION,
                    risk_threshold INTEGER DEFAULT 70,
                    alert_types TEXT DEFAULT 'deployer_exit,bundle,sol_extraction,price_crash,cartel,operator_match,deployer_rug',
                    sol_extraction_min REAL DEFAULT 20,
                    sweep_interval INTEGER DEFAULT 7200,
                    investigation_depth TEXT DEFAULT 'standard',
                    quiet_hours_start INTEGER,
                    quiet_hours_end INTEGER
                )
            """)

            await conn.execute("""
                CREATE TABLE IF NOT EXISTS investigations (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT,
                    mint TEXT,
                    name TEXT,
                    symbol TEXT,
                    risk_score INTEGER,
                    verdict_summary TEXT,
                    key_findings TEXT,
                    model TEXT,
                    turns_used INTEGER DEFAULT 0,
                    tokens_used INTEGER DEFAULT 0,
                    created_at DOUBLE PRECISION
                )
            """)

            await conn.execute("""
                CREATE TABLE IF NOT EXISTS investigation_feedback (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT,
                    mint TEXT,
                    risk_score INTEGER,
                    rating TEXT,
                    note TEXT,
                    created_at DOUBLE PRECISION
                )
            """)

            await conn.execute("""
                CREATE TABLE IF NOT EXISTS sweep_flags (
                    id BIGSERIAL PRIMARY KEY,
                    watch_id BIGINT,
                    mint TEXT,
                    user_id BIGINT,
                    flag_type TEXT,
                    severity TEXT,
                    title TEXT,
                    detail TEXT,
                    created_at DOUBLE PRECISION,
                    read BOOLEAN DEFAULT FALSE
                )
            """)

            # Key indexes
            await conn.execute("CREATE INDEX IF NOT EXISTS idx_cache_expires ON cache (expires_at)")
            await conn.execute("CREATE INDEX IF NOT EXISTS idx_ie_deployer ON intelligence_events (deployer)")
            await conn.execute("CREATE INDEX IF NOT EXISTS idx_ie_mint ON intelligence_events (mint)")
            await conn.execute("CREATE INDEX IF NOT EXISTS idx_sf_mint ON sol_flows (mint)")
            await conn.execute("CREATE INDEX IF NOT EXISTS idx_ce_wallets ON cartel_edges (wallet_a, wallet_b)")
            await conn.execute("CREATE INDEX IF NOT EXISTS idx_users_apikey ON users (api_key)")
            await conn.execute("CREATE INDEX IF NOT EXISTS idx_uw_user ON user_watches (user_id)")

            logger.info("[pg] schema initialized (19 tables)")
