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
                    sweep_interval INTEGER DEFAULT 2700,
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

            await conn.execute("""
                CREATE TABLE IF NOT EXISTS user_crons (
                    id          TEXT PRIMARY KEY,
                    user_id     BIGINT NOT NULL,
                    name        TEXT NOT NULL,
                    schedule    TEXT NOT NULL,
                    payload     TEXT NOT NULL DEFAULT '{}',
                    delivery    TEXT NOT NULL DEFAULT '{}',
                    enabled     BOOLEAN NOT NULL DEFAULT TRUE,
                    last_run    TEXT,
                    next_run    TEXT,
                    created_at  DOUBLE PRECISION NOT NULL
                )
            """)

            # ── Missing tables (Phase 3 parity with SQLite) ──────────────

            await conn.execute("""
                CREATE TABLE IF NOT EXISTS investigation_episodes (
                    id BIGSERIAL PRIMARY KEY,
                    mint TEXT NOT NULL,
                    deployer TEXT,
                    operator_fp TEXT,
                    campaign_id TEXT,
                    community_id TEXT,
                    risk_score INTEGER NOT NULL DEFAULT 0,
                    verdict_summary TEXT,
                    key_findings TEXT,
                    rug_pattern TEXT,
                    model TEXT,
                    turns_used INTEGER DEFAULT 0,
                    tokens_used INTEGER DEFAULT 0,
                    signals_json TEXT,
                    user_id BIGINT,
                    user_rating TEXT,
                    user_note TEXT,
                    created_at DOUBLE PRECISION NOT NULL,
                    is_latest BOOLEAN DEFAULT TRUE,
                    episode_number INTEGER DEFAULT 1,
                    outcome TEXT,
                    outcome_checked_at DOUBLE PRECISION
                )
            """)

            await conn.execute("""
                CREATE TABLE IF NOT EXISTS entity_knowledge (
                    id BIGSERIAL PRIMARY KEY,
                    entity_type TEXT NOT NULL,
                    entity_id TEXT NOT NULL,
                    total_tokens INTEGER NOT NULL DEFAULT 0,
                    total_rugs INTEGER NOT NULL DEFAULT 0,
                    avg_risk_score DOUBLE PRECISION,
                    patterns_json TEXT,
                    first_seen DOUBLE PRECISION,
                    last_seen DOUBLE PRECISION,
                    summary TEXT,
                    UNIQUE (entity_type, entity_id)
                )
            """)

            await conn.execute("""
                CREATE TABLE IF NOT EXISTS calibration_rules (
                    id BIGSERIAL PRIMARY KEY,
                    rule_type TEXT NOT NULL,
                    condition_json TEXT NOT NULL,
                    adjustment DOUBLE PRECISION NOT NULL,
                    sample_count INTEGER NOT NULL DEFAULT 1,
                    confidence DOUBLE PRECISION NOT NULL DEFAULT 0.5,
                    source TEXT DEFAULT 'outcome',
                    created_at DOUBLE PRECISION NOT NULL
                )
            """)

            await conn.execute("""
                CREATE TABLE IF NOT EXISTS campaign_timelines (
                    id BIGSERIAL PRIMARY KEY,
                    entity_type TEXT NOT NULL,
                    entity_id TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    mint TEXT,
                    event_at DOUBLE PRECISION NOT NULL,
                    risk_score INTEGER,
                    details_json TEXT,
                    created_at DOUBLE PRECISION NOT NULL
                )
            """)

            await conn.execute("""
                CREATE TABLE IF NOT EXISTS anomaly_alerts (
                    id BIGSERIAL PRIMARY KEY,
                    entity_type TEXT NOT NULL,
                    entity_id TEXT NOT NULL,
                    anomaly_type TEXT NOT NULL,
                    severity TEXT NOT NULL DEFAULT 'medium',
                    baseline_value DOUBLE PRECISION,
                    observed_value DOUBLE PRECISION,
                    deviation_pct DOUBLE PRECISION,
                    details_json TEXT,
                    created_at DOUBLE PRECISION NOT NULL,
                    resolved BOOLEAN DEFAULT FALSE
                )
            """)

            await conn.execute("""
                CREATE TABLE IF NOT EXISTS entity_links (
                    id BIGSERIAL PRIMARY KEY,
                    entity_a_type TEXT NOT NULL,
                    entity_a_id TEXT NOT NULL,
                    entity_b_type TEXT NOT NULL,
                    entity_b_id TEXT NOT NULL,
                    link_type TEXT NOT NULL,
                    strength DOUBLE PRECISION DEFAULT 1.0,
                    evidence_json TEXT,
                    created_at DOUBLE PRECISION NOT NULL,
                    UNIQUE (entity_a_type, entity_a_id, entity_b_type, entity_b_id, link_type)
                )
            """)

            await conn.execute("""
                CREATE TABLE IF NOT EXISTS narrative_clusters (
                    id BIGSERIAL PRIMARY KEY,
                    narrative_key TEXT NOT NULL,
                    deployer_count INTEGER NOT NULL,
                    token_count INTEGER NOT NULL,
                    deployers_json TEXT NOT NULL,
                    mints_json TEXT NOT NULL DEFAULT '[]',
                    confidence DOUBLE PRECISION DEFAULT 0.5,
                    created_at DOUBLE PRECISION NOT NULL
                )
            """)

            await conn.execute("""
                CREATE TABLE IF NOT EXISTS monitored_wallets (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL,
                    address TEXT NOT NULL,
                    label TEXT,
                    source TEXT NOT NULL DEFAULT 'external',
                    enabled BOOLEAN DEFAULT TRUE,
                    created_at DOUBLE PRECISION NOT NULL,
                    UNIQUE (user_id, address)
                )
            """)

            await conn.execute("""
                CREATE TABLE IF NOT EXISTS wallet_holdings (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL,
                    wallet_address TEXT NOT NULL,
                    mint TEXT NOT NULL,
                    token_name TEXT,
                    token_symbol TEXT,
                    image_uri TEXT,
                    balance DOUBLE PRECISION DEFAULT 0,
                    value_usd DOUBLE PRECISION DEFAULT 0,
                    risk_score INTEGER,
                    risk_level TEXT,
                    updated_at DOUBLE PRECISION NOT NULL,
                    UNIQUE (user_id, wallet_address, mint)
                )
            """)

            await conn.execute("""
                CREATE TABLE IF NOT EXISTS wallet_risk_history (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL,
                    mint TEXT NOT NULL,
                    risk_score INTEGER NOT NULL,
                    scanned_at DOUBLE PRECISION NOT NULL
                )
            """)

            await conn.execute("""
                CREATE TABLE IF NOT EXISTS wallet_monitor_log (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL,
                    holdings_count INTEGER NOT NULL DEFAULT 0,
                    risky_count INTEGER NOT NULL DEFAULT 0,
                    alerts_sent INTEGER NOT NULL DEFAULT 0,
                    duration_ms DOUBLE PRECISION,
                    created_at DOUBLE PRECISION NOT NULL
                )
            """)

            await conn.execute("""
                CREATE TABLE IF NOT EXISTS pending_notifications (
                    id BIGSERIAL PRIMARY KEY,
                    fcm_token TEXT NOT NULL,
                    title TEXT NOT NULL,
                    body TEXT NOT NULL DEFAULT '',
                    data_json TEXT NOT NULL DEFAULT '{}',
                    attempts INTEGER NOT NULL DEFAULT 0,
                    created_at DOUBLE PRECISION NOT NULL
                )
            """)

            await conn.execute("""
                CREATE TABLE IF NOT EXISTS token_fingerprints (
                    mint TEXT PRIMARY KEY,
                    fingerprint TEXT NOT NULL,
                    campaign_tags TEXT,
                    desc_norm TEXT,
                    upload_service TEXT,
                    entropy DOUBLE PRECISION,
                    computed_at DOUBLE PRECISION NOT NULL
                )
            """)

            await conn.execute("""
                CREATE TABLE IF NOT EXISTS flag_feedback (
                    id BIGSERIAL PRIMARY KEY,
                    flag_id BIGINT NOT NULL,
                    user_id BIGINT NOT NULL,
                    rating TEXT NOT NULL,
                    snooze_until DOUBLE PRECISION,
                    created_at DOUBLE PRECISION NOT NULL,
                    UNIQUE (flag_id, user_id)
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
            await conn.execute("CREATE INDEX IF NOT EXISTS idx_uc_user ON user_crons (user_id, name)")
            await conn.execute("CREATE INDEX IF NOT EXISTS idx_ep_mint ON investigation_episodes (mint)")
            await conn.execute("CREATE INDEX IF NOT EXISTS idx_ep_deployer ON investigation_episodes (deployer)")
            await conn.execute("CREATE INDEX IF NOT EXISTS idx_ek_entity ON entity_knowledge (entity_type, entity_id)")
            await conn.execute("CREATE INDEX IF NOT EXISTS idx_ff_user ON flag_feedback (user_id, created_at DESC)")
            await conn.execute("CREATE INDEX IF NOT EXISTS idx_mw_user ON monitored_wallets (user_id)")
            await conn.execute("CREATE INDEX IF NOT EXISTS idx_wrh_user ON wallet_risk_history (user_id, mint)")

            logger.info("[pg] schema initialized (34 tables)")
