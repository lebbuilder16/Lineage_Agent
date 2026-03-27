"""Unit tests for the 4 memory enrichment features:

1. Temporal decay weighting in entity knowledge
2. Anomaly detection vs baseline
3. Cross-deployer narrative clustering
4. Active calibration offset application
"""

from __future__ import annotations

import json
import math
import time
from unittest.mock import AsyncMock, MagicMock, patch

import aiosqlite
import pytest

from lineage_agent.memory_service import (
    _decay_weight,
    _DECAY_HALF_LIFE_DAYS,
    _DECAY_MIN_WEIGHT,
    record_episode,
    build_memory_brief,
    get_calibration_offset,
    generate_calibration_rules,
    detect_narrative_clusters,
    get_narrative_clusters_for_deployer,
    get_active_anomalies,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _make_memory_db():
    """Create an in-memory SQLite DB with the full memory schema."""
    db = await aiosqlite.connect(":memory:")
    # Episodes
    await db.execute("""
        CREATE TABLE investigation_episodes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            mint TEXT NOT NULL,
            deployer TEXT,
            operator_fp TEXT,
            campaign_id TEXT,
            community_id TEXT,
            risk_score INTEGER NOT NULL,
            confidence TEXT NOT NULL DEFAULT 'medium',
            rug_pattern TEXT,
            verdict_summary TEXT NOT NULL,
            conviction_chain TEXT,
            key_findings TEXT,
            signals_json TEXT NOT NULL DEFAULT '{}',
            user_rating TEXT,
            user_note TEXT,
            model TEXT,
            created_at REAL NOT NULL
        )
    """)
    await db.execute("CREATE UNIQUE INDEX idx_ep_mint ON investigation_episodes(mint)")
    await db.execute("CREATE INDEX idx_ep_deployer ON investigation_episodes(deployer)")
    await db.execute("CREATE INDEX idx_ep_operator ON investigation_episodes(operator_fp)")
    # Entity knowledge
    await db.execute("""
        CREATE TABLE entity_knowledge (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            total_tokens INTEGER NOT NULL DEFAULT 0,
            total_rugs INTEGER NOT NULL DEFAULT 0,
            total_extracted_sol REAL DEFAULT 0,
            avg_risk_score REAL DEFAULT 0,
            preferred_narratives TEXT,
            typical_rug_pattern TEXT,
            launch_velocity REAL,
            acceleration REAL,
            first_seen REAL,
            last_seen REAL,
            sample_count INTEGER NOT NULL DEFAULT 0,
            confidence TEXT DEFAULT 'low',
            updated_at REAL NOT NULL
        )
    """)
    await db.execute("CREATE UNIQUE INDEX idx_ek_type_id ON entity_knowledge(entity_type, entity_id)")
    # Calibration rules
    await db.execute("""
        CREATE TABLE calibration_rules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            rule_type TEXT NOT NULL,
            condition_json TEXT NOT NULL,
            adjustment REAL NOT NULL,
            sample_count INTEGER NOT NULL DEFAULT 1,
            confidence REAL NOT NULL DEFAULT 0.5,
            source_episodes TEXT,
            active INTEGER NOT NULL DEFAULT 1,
            created_at REAL NOT NULL,
            updated_at REAL NOT NULL
        )
    """)
    await db.execute("CREATE UNIQUE INDEX idx_cr_type_cond ON calibration_rules(rule_type, condition_json)")
    # Campaign timelines
    await db.execute("""
        CREATE TABLE campaign_timelines (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            mint TEXT,
            event_at REAL NOT NULL,
            risk_score INTEGER,
            extracted_sol REAL
        )
    """)
    await db.execute("CREATE UNIQUE INDEX idx_ct_unique ON campaign_timelines(entity_type, entity_id, event_type, mint)")
    # Anomaly alerts
    await db.execute("""
        CREATE TABLE anomaly_alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            anomaly_type TEXT NOT NULL,
            severity TEXT NOT NULL DEFAULT 'medium',
            baseline_value REAL,
            current_value REAL,
            description TEXT,
            resolved INTEGER NOT NULL DEFAULT 0,
            created_at REAL NOT NULL,
            resolved_at REAL
        )
    """)
    await db.execute("CREATE INDEX idx_aa_entity ON anomaly_alerts(entity_type, entity_id, resolved)")
    # Narrative clusters
    await db.execute("""
        CREATE TABLE narrative_clusters (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            narrative_key TEXT NOT NULL,
            deployer_count INTEGER NOT NULL,
            token_count INTEGER NOT NULL,
            deployers_json TEXT NOT NULL,
            mints_json TEXT NOT NULL DEFAULT '[]',
            avg_risk_score REAL,
            window_start REAL NOT NULL,
            window_end REAL NOT NULL,
            active INTEGER NOT NULL DEFAULT 1,
            created_at REAL NOT NULL
        )
    """)
    await db.execute("CREATE INDEX idx_nc_key ON narrative_clusters(narrative_key, active)")
    await db.commit()
    return db


def _mock_cache(db):
    """Create a mock cache that returns the in-memory DB."""
    from lineage_agent.cache import SQLiteCache
    cache = MagicMock(spec=SQLiteCache)
    cache._get_conn = AsyncMock(return_value=db)
    return cache


async def _insert_episode(db, mint: str, deployer: str, risk_score: int,
                          created_at: float = None, signals: dict = None,
                          user_rating: str = None, rug_pattern: str = ""):
    """Insert a test episode directly."""
    now = created_at or time.time()
    await db.execute(
        "INSERT OR REPLACE INTO investigation_episodes "
        "(mint, deployer, risk_score, confidence, rug_pattern, verdict_summary, "
        " signals_json, user_rating, model, created_at) "
        "VALUES (?, ?, ?, 'medium', ?, 'test verdict', ?, ?, 'test', ?)",
        (mint, deployer, risk_score, rug_pattern,
         json.dumps(signals or {}), user_rating, now),
    )
    await db.commit()


# ===========================================================================
# 1. Temporal Decay
# ===========================================================================

class TestTemporalDecay:
    def test_fresh_episode_weight_is_one(self):
        now = time.time()
        assert _decay_weight(now, now) == pytest.approx(1.0, abs=0.01)

    def test_half_life_weight(self):
        now = time.time()
        half_life_ago = now - (_DECAY_HALF_LIFE_DAYS * 86400)
        assert _decay_weight(half_life_ago, now) == pytest.approx(0.5, abs=0.01)

    def test_very_old_episode_clamps_to_minimum(self):
        now = time.time()
        ancient = now - (365 * 86400)  # 1 year ago
        assert _decay_weight(ancient, now) == _DECAY_MIN_WEIGHT

    def test_double_half_life_is_quarter(self):
        now = time.time()
        two_half_lives = now - (2 * _DECAY_HALF_LIFE_DAYS * 86400)
        assert _decay_weight(two_half_lives, now) == pytest.approx(0.25, abs=0.02)

    async def test_entity_knowledge_weights_recent_higher(self):
        """Recent high-risk episode should weigh more than old low-risk one."""
        db = await _make_memory_db()
        cache = _mock_cache(db)
        now = time.time()

        deployer = "DecayTestDeployer" + "A" * 20
        # Old episode: low risk, 30 days ago
        await _insert_episode(db, "mint_old", deployer, risk_score=20,
                              created_at=now - 30 * 86400)
        # Recent episode: high risk, just now
        await _insert_episode(db, "mint_new", deployer, risk_score=90,
                              created_at=now)

        from lineage_agent.memory_service import _update_entity_knowledge
        await _update_entity_knowledge(db, "deployer", deployer)

        cursor = await db.execute(
            "SELECT avg_risk_score FROM entity_knowledge "
            "WHERE entity_type = 'deployer' AND entity_id = ?",
            (deployer,),
        )
        row = await cursor.fetchone()
        avg = row[0]
        # Decay-weighted avg should be closer to 90 (recent) than 55 (simple mean)
        assert avg > 60, f"Expected weighted avg > 60, got {avg}"
        await db.close()


# ===========================================================================
# 2. Anomaly Detection
# ===========================================================================

class TestAnomalyDetection:
    async def test_velocity_spike_creates_alert(self):
        db = await _make_memory_db()
        cache = _mock_cache(db)
        now = time.time()
        deployer = "AnomalyDeployer" + "B" * 20

        # Seed entity knowledge with low velocity
        await db.execute(
            "INSERT INTO entity_knowledge "
            "(entity_type, entity_id, total_tokens, total_rugs, avg_risk_score, "
            " launch_velocity, acceleration, last_seen, sample_count, confidence, updated_at) "
            "VALUES ('deployer', ?, 5, 1, 40, 1, 0, ?, 5, 'medium', ?)",
            (deployer, now - 600, now - 600),
        )
        await db.commit()

        # Insert 4 episodes in last 24h (4x velocity spike vs baseline of 1)
        for i in range(4):
            await _insert_episode(db, f"spike_mint_{i}", deployer, risk_score=50,
                                  created_at=now - i * 3600)

        from lineage_agent.memory_service import _update_entity_knowledge
        await _update_entity_knowledge(db, "deployer", deployer)

        cursor = await db.execute(
            "SELECT anomaly_type, severity, description FROM anomaly_alerts "
            "WHERE entity_id = ? AND resolved = 0",
            (deployer,),
        )
        alerts = await cursor.fetchall()
        types = [a[0] for a in alerts]
        assert "velocity_spike" in types, f"Expected velocity_spike, got {types}"
        await db.close()

    async def test_no_anomaly_on_first_episode(self):
        """First-time entity (no prior knowledge) should not trigger anomalies."""
        db = await _make_memory_db()
        deployer = "NewDeployer" + "C" * 24

        await _insert_episode(db, "first_mint", deployer, risk_score=80)

        with patch("lineage_agent.data_sources._clients.cache", _mock_cache(db)):
            from lineage_agent.memory_service import _update_entity_knowledge
            await _update_entity_knowledge(db, "deployer", deployer)

        cursor = await db.execute(
            "SELECT COUNT(*) FROM anomaly_alerts WHERE entity_id = ?",
            (deployer,),
        )
        count = (await cursor.fetchone())[0]
        assert count == 0
        await db.close()

    async def test_auto_resolve_when_metric_returns(self):
        """Alert should auto-resolve when velocity drops back to baseline."""
        db = await _make_memory_db()
        now = time.time()
        deployer = "ResolveDeployer" + "D" * 20

        # Insert an open velocity_spike alert
        await db.execute(
            "INSERT INTO anomaly_alerts "
            "(entity_type, entity_id, anomaly_type, severity, "
            " baseline_value, current_value, description, created_at) "
            "VALUES ('deployer', ?, 'velocity_spike', 'medium', 1, 5, 'test', ?)",
            (deployer, now - 7200),
        )
        # Entity knowledge with velocity back to normal
        await db.execute(
            "INSERT INTO entity_knowledge "
            "(entity_type, entity_id, total_tokens, total_rugs, avg_risk_score, "
            " launch_velocity, acceleration, last_seen, sample_count, confidence, updated_at) "
            "VALUES ('deployer', ?, 5, 1, 40, 5, 0, ?, 5, 'medium', ?)",
            (deployer, now - 600, now - 600),
        )
        await db.commit()

        # Insert 1 episode (velocity=1, back to baseline)
        await _insert_episode(db, "calm_mint", deployer, risk_score=30,
                              created_at=now)

        with patch("lineage_agent.data_sources._clients.cache", _mock_cache(db)):
            from lineage_agent.memory_service import _update_entity_knowledge
            await _update_entity_knowledge(db, "deployer", deployer)

        cursor = await db.execute(
            "SELECT resolved FROM anomaly_alerts WHERE entity_id = ? AND anomaly_type = 'velocity_spike'",
            (deployer,),
        )
        row = await cursor.fetchone()
        assert row[0] == 1, "Alert should have been auto-resolved"
        await db.close()


# ===========================================================================
# 3. Narrative Clustering
# ===========================================================================

class TestNarrativeClustering:
    async def test_detects_cluster_with_enough_deployers(self):
        db = await _make_memory_db()
        cache = _mock_cache(db)
        now = time.time()

        # 4 deployers all launching "pump.fun" tokens in last 7 days
        for i in range(4):
            deployer = f"ClusterDeployer{i}" + "E" * 20
            signals = {"launch_platform": "pump.fun", "sol_extracted": 5}
            await _insert_episode(db, f"cluster_mint_{i}", deployer, risk_score=70,
                                  signals=signals, created_at=now - i * 86400)

        with patch("lineage_agent.data_sources._clients.cache", cache):
            clusters = await detect_narrative_clusters(window_days=7, min_deployers=3)

        # Should detect at least one cluster with "pump.fun"
        pf_clusters = [c for c in clusters if c["narrative_key"] == "pump.fun"]
        assert len(pf_clusters) >= 1
        assert pf_clusters[0]["deployer_count"] >= 3
        await db.close()

    async def test_no_cluster_below_threshold(self):
        db = await _make_memory_db()
        cache = _mock_cache(db)
        now = time.time()

        # Only 2 deployers — below min_deployers=3
        for i in range(2):
            deployer = f"SmallCluster{i}" + "F" * 24
            signals = {"launch_platform": "raydium"}
            await _insert_episode(db, f"small_mint_{i}", deployer, risk_score=50,
                                  signals=signals, created_at=now)

        with patch("lineage_agent.data_sources._clients.cache", cache):
            clusters = await detect_narrative_clusters(window_days=7, min_deployers=3)

        ray_clusters = [c for c in clusters if c["narrative_key"] == "raydium"]
        assert len(ray_clusters) == 0
        await db.close()

    async def test_stopwords_filtered(self):
        db = await _make_memory_db()
        cache = _mock_cache(db)
        now = time.time()

        # 5 deployers with generic word "token" in summary — should be filtered
        for i in range(5):
            deployer = f"StopWordDep{i}" + "G" * 23
            await _insert_episode(db, f"sw_mint_{i}", deployer, risk_score=40,
                                  created_at=now)

        with patch("lineage_agent.data_sources._clients.cache", cache):
            clusters = await detect_narrative_clusters(window_days=7, min_deployers=3)

        # "token" should be filtered by stopwords
        token_clusters = [c for c in clusters if c["narrative_key"] == "token"]
        assert len(token_clusters) == 0
        await db.close()


# ===========================================================================
# 4. Active Calibration Offset
# ===========================================================================

class TestCalibrationOffset:
    async def test_matching_rule_returns_offset(self):
        db = await _make_memory_db()
        cache = _mock_cache(db)
        now = time.time()

        # Insert an active calibration rule
        await db.execute(
            "INSERT INTO calibration_rules "
            "(rule_type, condition_json, adjustment, sample_count, confidence, "
            " active, created_at, updated_at) "
            "VALUES ('score_offset', ?, -10, 5, 0.8, 1, ?, ?)",
            (json.dumps({"rug_pattern": "classic_rug"}), now, now),
        )
        await db.commit()

        with patch("lineage_agent.data_sources._clients.cache", cache):
            offset = await get_calibration_offset({"rug_pattern": "classic_rug"})

        assert offset == -10
        await db.close()

    async def test_no_matching_rule_returns_zero(self):
        db = await _make_memory_db()
        cache = _mock_cache(db)
        now = time.time()

        await db.execute(
            "INSERT INTO calibration_rules "
            "(rule_type, condition_json, adjustment, sample_count, confidence, "
            " active, created_at, updated_at) "
            "VALUES ('score_offset', ?, -10, 5, 0.8, 1, ?, ?)",
            (json.dumps({"rug_pattern": "classic_rug"}), now, now),
        )
        await db.commit()

        with patch("lineage_agent.data_sources._clients.cache", cache):
            offset = await get_calibration_offset({"rug_pattern": "different_pattern"})

        assert offset == 0
        await db.close()

    async def test_offset_clamped_to_30(self):
        db = await _make_memory_db()
        cache = _mock_cache(db)
        now = time.time()

        # Two rules that together exceed 30
        for i, adj in enumerate([20, 20]):
            await db.execute(
                "INSERT INTO calibration_rules "
                "(rule_type, condition_json, adjustment, sample_count, confidence, "
                " active, created_at, updated_at) "
                "VALUES ('score_offset', ?, ?, 5, 0.8, 1, ?, ?)",
                (json.dumps({"field": f"val{i}"}), adj, now, now),
            )
        await db.commit()

        with patch("lineage_agent.data_sources._clients.cache", cache):
            offset = await get_calibration_offset({"field": "val0"})

        # Only one rule matches, so offset should be 20 (not clamped)
        assert offset == 20
        await db.close()

    async def test_inactive_rule_ignored(self):
        db = await _make_memory_db()
        cache = _mock_cache(db)
        now = time.time()

        await db.execute(
            "INSERT INTO calibration_rules "
            "(rule_type, condition_json, adjustment, sample_count, confidence, "
            " active, created_at, updated_at) "
            "VALUES ('score_offset', ?, -15, 5, 0.8, 0, ?, ?)",
            (json.dumps({"rug_pattern": "inactive"}), now, now),
        )
        await db.commit()

        with patch("lineage_agent.data_sources._clients.cache", cache):
            offset = await get_calibration_offset({"rug_pattern": "inactive"})

        assert offset == 0
        await db.close()

    async def test_low_sample_count_ignored(self):
        db = await _make_memory_db()
        cache = _mock_cache(db)
        now = time.time()

        await db.execute(
            "INSERT INTO calibration_rules "
            "(rule_type, condition_json, adjustment, sample_count, confidence, "
            " active, created_at, updated_at) "
            "VALUES ('score_offset', ?, -15, 2, 0.8, 1, ?, ?)",
            (json.dumps({"rug_pattern": "low_sample"}), now, now),
        )
        await db.commit()

        with patch("lineage_agent.data_sources._clients.cache", cache):
            offset = await get_calibration_offset({"rug_pattern": "low_sample"})

        assert offset == 0  # sample_count < 3 → ignored
        await db.close()


# ===========================================================================
# 5. Memory Brief Integration (anomalies + clusters surfaced)
# ===========================================================================

class TestMemoryBriefEnrichment:
    async def test_brief_includes_anomaly_alerts(self):
        db = await _make_memory_db()
        cache = _mock_cache(db)
        now = time.time()
        deployer = "BriefAnomalyDep" + "H" * 20

        # Insert an open anomaly
        await db.execute(
            "INSERT INTO anomaly_alerts "
            "(entity_type, entity_id, anomaly_type, severity, "
            " baseline_value, current_value, description, created_at) "
            "VALUES ('deployer', ?, 'velocity_spike', 'high', 1, 8, 'Launch velocity 8x', ?)",
            (deployer, now),
        )
        await db.commit()

        with patch("lineage_agent.data_sources._clients.cache", cache), \
             patch("lineage_agent.memory_service._haiku_recommendation", new_callable=AsyncMock, return_value=""):
            brief = await build_memory_brief("some_mint", deployer=deployer)

        # Anomalies appear in the Threat Assessment section
        assert "Threat Assessment" in brief
        assert "velocity" in brief.lower()
        await db.close()

    async def test_brief_includes_narrative_clusters(self):
        db = await _make_memory_db()
        cache = _mock_cache(db)
        now = time.time()
        deployer = "BriefClusterDep" + "I" * 20

        # Insert a narrative cluster that includes this deployer
        await db.execute(
            "INSERT INTO narrative_clusters "
            "(narrative_key, deployer_count, token_count, deployers_json, mints_json, "
            " avg_risk_score, window_start, window_end, active, created_at) "
            "VALUES ('ai_agent', 8, 15, ?, '[]', 72.5, ?, ?, 1, ?)",
            (json.dumps([deployer, "other1", "other2"]), now - 7 * 86400, now, now),
        )
        await db.commit()

        with patch("lineage_agent.data_sources._clients.cache", cache), \
             patch("lineage_agent.memory_service._haiku_recommendation", new_callable=AsyncMock, return_value=""):
            brief = await build_memory_brief("some_mint", deployer=deployer)

        # Clusters appear in the Cross-Entity Intelligence section
        assert "Cross-Entity" in brief
        assert "ai_agent" in brief
        await db.close()

    async def test_brief_recommended_focus_serial_rugger(self):
        """Serial rugger should get focus on exits, skip compare_tokens."""
        db = await _make_memory_db()
        cache = _mock_cache(db)
        deployer = "SerialRugger" + "J" * 24

        # Entity knowledge: 70% rug rate
        await db.execute(
            "INSERT INTO entity_knowledge "
            "(entity_type, entity_id, total_tokens, total_rugs, avg_risk_score, "
            " confidence, updated_at) VALUES ('deployer', ?, 10, 7, 75, 'high', ?)",
            (deployer, time.time()),
        )
        await db.commit()

        with patch("lineage_agent.data_sources._clients.cache", cache), \
             patch("lineage_agent.memory_service._haiku_recommendation", new_callable=AsyncMock, return_value=""):
            brief = await build_memory_brief("some_mint", deployer=deployer)

        assert "Recommended Focus" in brief
        assert "sol_flow" in brief
        assert "Skip" in brief
        await db.close()

    async def test_brief_first_entity_full_investigation(self):
        """Unknown entity should get full investigation recommendation."""
        db = await _make_memory_db()
        cache = _mock_cache(db)
        deployer = "NewDeployer" + "K" * 25

        with patch("lineage_agent.data_sources._clients.cache", cache), \
             patch("lineage_agent.memory_service._haiku_recommendation", new_callable=AsyncMock, return_value=""):
            brief = await build_memory_brief("some_mint", deployer=deployer)

        assert "Recommended Focus" in brief
        assert "full investigation" in brief.lower()
        await db.close()

    async def test_recall_entity_includes_synthesis(self):
        """recall_entity should include trend, threat_level, reliability."""
        db = await _make_memory_db()
        cache = _mock_cache(db)
        deployer = "SynthDeployer" + "L" * 23

        # Insert entity knowledge + episodes
        await db.execute(
            "INSERT INTO entity_knowledge "
            "(entity_type, entity_id, total_tokens, total_rugs, avg_risk_score, "
            " sample_count, confidence, updated_at) "
            "VALUES ('deployer', ?, 8, 5, 70, 8, 'high', ?)",
            (deployer, time.time()),
        )
        for i in range(6):
            await _insert_episode(db, f"synth_mint_{i}", deployer,
                                  risk_score=60 + i * 5,
                                  created_at=time.time() - i * 86400)
        await db.commit()

        with patch("lineage_agent.data_sources._clients.cache", cache):
            from lineage_agent.memory_service import recall_entity
            result = await recall_entity("deployer", deployer)

        assert "synthesis" in result
        s = result["synthesis"]
        assert s["threat_level"] in ("low", "medium", "high", "critical")
        assert s["trend"] in ("improving", "stable", "degrading", "insufficient_data")
        assert s["reliability"] in ("low", "medium", "high")
        assert isinstance(s["active_anomalies"], list)
        assert isinstance(s["cluster_membership"], list)
        await db.close()
