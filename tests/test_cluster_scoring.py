"""Unit tests for lineage_agent.cluster_scoring_service.

Covers:
- compute_cluster_score public API (timeout, empty deployer, exceptions)
- _build_cluster_score: community detection, stats aggregation, risk scoring
- _compute_risk: risk score computation logic
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, patch

import pytest

from lineage_agent.cluster_scoring_service import (
    compute_cluster_score,
    _build_cluster_score,
    _compute_risk,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _edge(wallet_a: str, wallet_b: str, signal: str = "dna_match",
          strength: float = 0.9) -> dict:
    return {
        "wallet_a": wallet_a,
        "wallet_b": wallet_b,
        "signal_type": signal,
        "signal_strength": strength,
        "evidence_json": "{}",
    }


def _created_row(mint: str, deployer: str, narrative: str = "meme") -> dict:
    return {
        "mint": mint,
        "deployer": deployer,
        "narrative": narrative,
        "mcap_usd": 10000,
        "created_at": "2024-01-01T12:00:00+00:00",
    }


def _rug_row(mint: str, mechanism: str = "dex_liquidity_rug",
             evidence: str = "strong") -> dict:
    return {
        "mint": mint,
        "rug_mechanism": mechanism,
        "evidence_level": evidence,
    }


# ---------------------------------------------------------------------------
# compute_cluster_score — public API
# ---------------------------------------------------------------------------

class TestComputeClusterScoreAPI:
    async def test_empty_deployer_returns_none(self):
        result = await compute_cluster_score("MINT", "")
        assert result is None

    async def test_none_deployer_returns_none(self):
        result = await compute_cluster_score("MINT", None)  # type: ignore
        assert result is None

    async def test_exception_returns_none(self):
        with patch(
            "lineage_agent.cluster_scoring_service._build_cluster_score",
            side_effect=RuntimeError("db error"),
        ):
            result = await compute_cluster_score("MINT", "DEPLOYER")
        assert result is None

    async def test_timeout_returns_none(self):
        async def _slow(*a, **kw):
            await asyncio.sleep(9999)

        with patch(
            "lineage_agent.cluster_scoring_service._build_cluster_score",
            new=_slow,
        ):
            with patch("lineage_agent.cluster_scoring_service._CLUSTER_TIMEOUT", 0.001):
                result = await compute_cluster_score("MINT", "DEPLOYER")
        assert result is None


# ---------------------------------------------------------------------------
# _build_cluster_score — no edges
# ---------------------------------------------------------------------------

class TestBuildClusterScoreNoEdges:
    async def test_no_edges_returns_none(self):
        with patch(
            "lineage_agent.cluster_scoring_service.cartel_edges_query",
            new_callable=AsyncMock,
            return_value=[],
        ):
            result = await _build_cluster_score("MINT", "DEPLOYER")
        assert result is None


# ---------------------------------------------------------------------------
# _build_cluster_score — with community
# ---------------------------------------------------------------------------

class TestBuildClusterScoreWithCommunity:
    async def test_two_wallet_community_no_rugs(self):
        """Two wallets linked, multiple tokens, no rugs → low risk."""
        edges = [_edge("D1", "D2", "dna_match")]
        created = [
            _created_row("M1", "D1"),
            _created_row("M2", "D1"),
            _created_row("M3", "D2"),
        ]

        call_count = {"n": 0}

        async def fake_event_query(where, **kw):
            call_count["n"] += 1
            if "token_created" in where:
                return created
            return []  # no rugs

        with (
            patch("lineage_agent.cluster_scoring_service.cartel_edges_query",
                  new_callable=AsyncMock, return_value=edges),
            patch("lineage_agent.cluster_scoring_service.event_query", new=fake_event_query),
            patch("lineage_agent.cluster_scoring_service.normalize_legacy_rug_events",
                  new_callable=AsyncMock),
        ):
            result = await _build_cluster_score("M1", "D1")

        assert result is not None
        assert result.community_size == 2
        assert result.total_tokens_launched == 3
        assert result.community_rug_count == 0
        assert result.risk_level == "low"

    async def test_community_with_rugs(self):
        """Community with 80% rug rate → critical."""
        edges = [
            _edge("D1", "D2", "dna_match"),
            _edge("D1", "D3", "sol_transfer"),
        ]
        created = [
            _created_row("CURRENT", "D1"),  # current token
            _created_row("M1", "D1"),
            _created_row("M2", "D2"),
            _created_row("M3", "D2"),
            _created_row("M4", "D3"),
            _created_row("M5", "D3"),
        ]
        rugs = [
            _rug_row("M1"),
            _rug_row("M2"),
            _rug_row("M3"),
            _rug_row("M4"),
        ]

        call_count = {"n": 0}

        async def fake_event_query(where, **kw):
            call_count["n"] += 1
            if "token_created" in where:
                return created
            if "token_rugged" in where:
                return rugs
            return []

        with (
            patch("lineage_agent.cluster_scoring_service.cartel_edges_query",
                  new_callable=AsyncMock, return_value=edges),
            patch("lineage_agent.cluster_scoring_service.event_query", new=fake_event_query),
            patch("lineage_agent.cluster_scoring_service.normalize_legacy_rug_events",
                  new_callable=AsyncMock),
        ):
            result = await _build_cluster_score("CURRENT", "D1")

        assert result is not None
        assert result.community_size == 3
        assert result.community_rug_count == 4
        assert result.community_rug_rate_pct == 80.0  # 4/5 siblings
        assert result.risk_level == "critical"
        assert result.risk_score >= 75
        assert "dna_match" in result.signal_types
        assert "sol_transfer" in result.signal_types

    async def test_current_token_excluded_from_rug_rate(self):
        """Current scanned token should not count in sibling rug stats."""
        edges = [_edge("D1", "D2")]
        created = [
            _created_row("CURRENT", "D1"),
            _created_row("M1", "D2"),
        ]
        rugs = [_rug_row("M1")]

        call_count = {"n": 0}

        async def fake_event_query(where, **kw):
            call_count["n"] += 1
            if "token_created" in where:
                return created
            if "token_rugged" in where:
                return rugs
            return []

        with (
            patch("lineage_agent.cluster_scoring_service.cartel_edges_query",
                  new_callable=AsyncMock, return_value=edges),
            patch("lineage_agent.cluster_scoring_service.event_query", new=fake_event_query),
            patch("lineage_agent.cluster_scoring_service.normalize_legacy_rug_events",
                  new_callable=AsyncMock),
        ):
            result = await _build_cluster_score("CURRENT", "D1")

        assert result.community_rug_count == 1
        # Only 1 sibling (M1), and it rugged → 100%
        assert result.community_rug_rate_pct == 100.0

    async def test_dead_tokens_counted_separately(self):
        """Dead tokens increase negative rate but not rug rate."""
        edges = [_edge("D1", "D2")]
        created = [
            _created_row("CURRENT", "D1"),
            _created_row("M1", "D1"),
            _created_row("M2", "D2"),
        ]
        rugs = [
            _rug_row("M1", mechanism="dex_liquidity_rug"),
            _rug_row("M2", mechanism="dead_token"),
        ]

        call_count = {"n": 0}

        async def fake_event_query(where, **kw):
            call_count["n"] += 1
            if "token_created" in where:
                return created
            if "token_rugged" in where:
                return rugs
            return []

        with (
            patch("lineage_agent.cluster_scoring_service.cartel_edges_query",
                  new_callable=AsyncMock, return_value=edges),
            patch("lineage_agent.cluster_scoring_service.event_query", new=fake_event_query),
            patch("lineage_agent.cluster_scoring_service.normalize_legacy_rug_events",
                  new_callable=AsyncMock),
        ):
            result = await _build_cluster_score("CURRENT", "D1")

        assert result.community_rug_count == 1
        assert result.community_dead_count == 1
        assert result.community_rug_rate_pct == 50.0  # 1/2
        assert result.community_negative_rate_pct == 100.0  # 2/2

    async def test_deployer_token_count(self):
        """deployer_token_count reflects only this deployer's tokens."""
        edges = [_edge("D1", "D2")]
        created = [
            _created_row("M1", "D1"),
            _created_row("M2", "D1"),
            _created_row("M3", "D1"),
            _created_row("M4", "D2"),
        ]

        async def fake_event_query(where, **kw):
            if "token_created" in where:
                return created
            return []

        with (
            patch("lineage_agent.cluster_scoring_service.cartel_edges_query",
                  new_callable=AsyncMock, return_value=edges),
            patch("lineage_agent.cluster_scoring_service.event_query", new=fake_event_query),
            patch("lineage_agent.cluster_scoring_service.normalize_legacy_rug_events",
                  new_callable=AsyncMock),
        ):
            result = await _build_cluster_score("M1", "D1")

        assert result.deployer_token_count == 3
        assert result.total_tokens_launched == 4

    async def test_bfs_finds_transitive_community(self):
        """BFS should find wallets connected transitively: D1-D2-D3."""
        edges = [
            _edge("D1", "D2"),
            _edge("D2", "D3"),
        ]
        created = [
            _created_row("M1", "D1"),
            _created_row("M2", "D2"),
            _created_row("M3", "D3"),
        ]

        async def fake_event_query(where, **kw):
            if "token_created" in where:
                return created
            return []

        with (
            patch("lineage_agent.cluster_scoring_service.cartel_edges_query",
                  new_callable=AsyncMock, return_value=edges),
            patch("lineage_agent.cluster_scoring_service.event_query", new=fake_event_query),
            patch("lineage_agent.cluster_scoring_service.normalize_legacy_rug_events",
                  new_callable=AsyncMock),
        ):
            result = await _build_cluster_score("M1", "D1")

        assert result.community_size == 3

    async def test_top_narratives(self):
        edges = [_edge("D1", "D2")]
        created = [
            _created_row("M1", "D1", "meme"),
            _created_row("M2", "D1", "meme"),
            _created_row("M3", "D2", "ai"),
            _created_row("M4", "D2", "meme"),
        ]

        async def fake_event_query(where, **kw):
            if "token_created" in where:
                return created
            return []

        with (
            patch("lineage_agent.cluster_scoring_service.cartel_edges_query",
                  new_callable=AsyncMock, return_value=edges),
            patch("lineage_agent.cluster_scoring_service.event_query", new=fake_event_query),
            patch("lineage_agent.cluster_scoring_service.normalize_legacy_rug_events",
                  new_callable=AsyncMock),
        ):
            result = await _build_cluster_score("M1", "D1")

        assert result.top_narratives[0] == "meme"


# ---------------------------------------------------------------------------
# _compute_risk — pure function
# ---------------------------------------------------------------------------

class TestComputeRisk:
    def test_zero_rugs_low_risk(self):
        score = _compute_risk(
            community_size=2, total_tokens=5,
            rug_rate=0.0, negative_rate=0.0, total_rugs=0,
            edges_rows=[_edge("A", "B")],
        )
        assert score < 25

    def test_high_rug_rate_high_score(self):
        score = _compute_risk(
            community_size=3, total_tokens=10,
            rug_rate=80.0, negative_rate=90.0, total_rugs=8,
            edges_rows=[_edge("A", "B", "dna"), _edge("A", "C", "sol")],
        )
        assert score >= 75

    def test_signal_diversity_boosts_score(self):
        base = _compute_risk(
            community_size=2, total_tokens=5,
            rug_rate=50.0, negative_rate=50.0, total_rugs=3,
            edges_rows=[_edge("A", "B", "dna_match")],
        )
        diverse = _compute_risk(
            community_size=2, total_tokens=5,
            rug_rate=50.0, negative_rate=50.0, total_rugs=3,
            edges_rows=[
                _edge("A", "B", "dna_match"),
                _edge("A", "B", "sol_transfer"),
                _edge("A", "B", "timing_sync"),
                _edge("A", "B", "phash_cluster"),
            ],
        )
        assert diverse > base

    def test_large_community_boosts_score(self):
        small = _compute_risk(
            community_size=2, total_tokens=5,
            rug_rate=50.0, negative_rate=50.0, total_rugs=3,
            edges_rows=[_edge("A", "B")],
        )
        large = _compute_risk(
            community_size=5, total_tokens=20,
            rug_rate=50.0, negative_rate=50.0, total_rugs=3,
            edges_rows=[_edge("A", "B")],
        )
        assert large > small

    def test_max_score_capped_at_100(self):
        score = _compute_risk(
            community_size=10, total_tokens=50,
            rug_rate=100.0, negative_rate=100.0, total_rugs=50,
            edges_rows=[
                _edge("A", "B", "dna"),
                _edge("A", "C", "sol"),
                _edge("A", "D", "timing"),
                _edge("A", "E", "phash"),
            ],
        )
        assert score == 100

    def test_risk_levels(self):
        """Verify thresholds: <25=low, 25-49=medium, 50-74=high, ≥75=critical."""
        low = _compute_risk(
            community_size=2, total_tokens=3,
            rug_rate=0.0, negative_rate=0.0, total_rugs=0,
            edges_rows=[_edge("A", "B")],
        )
        assert low < 25
