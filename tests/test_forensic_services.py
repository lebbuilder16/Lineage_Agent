"""Tests for forensic enrichment services.

These tests use SQLiteCache with pre-seeded intelligence_events data
to verify that each forensic feature returns non-null results when
data dependencies are met.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock

import pytest

from lineage_agent.cache import SQLiteCache
from lineage_agent.constants import estimate_extraction_rate
from lineage_agent.models import (
    BundleExtractionReport,
    EvidenceLevel,
    LifecycleStage,
    MarketSurface,
    RugMechanism,
    SolFlowReport,
    TokenMetadata,
)


@pytest.fixture
async def cache(tmp_path, monkeypatch):
    """Provide a seeded SQLiteCache and patch _clients to use it."""
    db = str(tmp_path / "forensic_test.db")
    c = SQLiteCache(db_path=db, default_ttl=3600)

    # Patch the _clients module to use our test cache
    import lineage_agent.data_sources._clients as clients_mod
    monkeypatch.setattr(clients_mod, "cache", c)

    yield c


# ── helpers ───────────────────────────────────────────────────────────────────

_DEPLOYER_A = "DeployerAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA111"
_DEPLOYER_B = "DeployerBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB222"
_NOW = datetime.now(tz=timezone.utc)


async def _seed_tokens(
    cache: SQLiteCache,
    deployer: str,
    count: int,
    *,
    rug_count: int = 0,
    rug_mechanism: str = "dex_liquidity_rug",
    evidence_level: str = "strong",
):
    """Insert count token_created events, optionally marking some as rugged."""
    # Use a hash of the deployer to guarantee unique mint IDs
    deployer_tag = hashlib.sha256(deployer.encode()).hexdigest()[:10]
    for i in range(count):
        mint = f"Mint{deployer_tag}_{i:03d}_{'X' * (44 - 17 - len(deployer_tag))}"
        created = _NOW - timedelta(days=count - i)
        await cache.insert_event(
            event_type="token_created",
            mint=mint,
            deployer=deployer,
            name=f"Token{i}",
            symbol=f"TK{i}",
            narrative="meme",
            mcap_usd=10_000 + i * 1000,
            liq_usd=5_000 + i * 500,
            created_at=created.isoformat(),
        )
        if i < rug_count:
            rugged_at = created + timedelta(hours=12 + i * 6)
            await cache.insert_event(
                event_type="token_rugged",
                mint=mint,
                deployer=deployer,
                liq_usd=0,
                mcap_usd=10_000 + i * 1000,
                rugged_at=rugged_at.isoformat(),
                created_at=created.isoformat(),
                rug_mechanism=rug_mechanism,
                evidence_level=evidence_level,
            )


# ── Death Clock ───────────────────────────────────────────────────────────────

class TestDeathClock:
    @pytest.mark.asyncio
    async def test_returns_insufficient_data_with_zero_rugs(self, cache):
        """With 0 rug events, death clock should return insufficient_data."""
        await _seed_tokens(cache, _DEPLOYER_A, 5, rug_count=0)
        from lineage_agent.death_clock import compute_death_clock
        result = await compute_death_clock(_DEPLOYER_A, _NOW)
        assert result is not None
        assert result.risk_level == "insufficient_data"
        assert result.historical_rug_count == 0

    @pytest.mark.asyncio
    async def test_returns_forecast_with_two_rugs(self, cache):
        """With ≥2 rug events, death clock should produce a real forecast."""
        await _seed_tokens(cache, _DEPLOYER_A, 5, rug_count=3)
        from lineage_agent.death_clock import compute_death_clock
        result = await compute_death_clock(_DEPLOYER_A, _NOW)
        assert result is not None
        assert result.historical_rug_count == 3
        assert result.risk_level != "insufficient_data"
        assert result.median_rug_hours > 0

    @pytest.mark.asyncio
    async def test_returns_none_for_empty_deployer(self, cache):
        from lineage_agent.death_clock import compute_death_clock
        result = await compute_death_clock("", _NOW)
        assert result is None

    @pytest.mark.asyncio
    async def test_normalizes_legacy_dex_rug_before_forecast(self, cache):
        mint = "LegacyDexRugMint" + "L" * 28
        created_at = (_NOW - timedelta(days=2)).isoformat()
        rugged_at = (_NOW - timedelta(days=1, hours=12)).isoformat()
        await cache.insert_event(
            event_type="token_created",
            mint=mint,
            deployer=_DEPLOYER_A,
            created_at=created_at,
            lifecycle_stage="dex_listed",
            market_surface="dex_pool_observed",
        )
        await cache.insert_event(
            event_type="token_rugged",
            mint=mint,
            deployer=_DEPLOYER_A,
            created_at=created_at,
            rugged_at=rugged_at,
        )

        from lineage_agent.death_clock import compute_death_clock
        result = await compute_death_clock(_DEPLOYER_A, _NOW)
        rugged_rows = await cache.query_events(
            where="event_type = 'token_rugged' AND mint = ?",
            params=(mint,),
        )

        assert result is not None
        assert rugged_rows[0]["rug_mechanism"] == RugMechanism.DEX_LIQUIDITY_RUG.value
        assert rugged_rows[0]["analysis_version"] == "rug-normalize-v1"


# ── Factory Rhythm ────────────────────────────────────────────────────────────

class TestFactoryRhythm:
    @pytest.mark.asyncio
    async def test_returns_none_with_two_tokens(self, cache):
        """Fewer than 3 tokens → None."""
        await _seed_tokens(cache, _DEPLOYER_A, 2)
        from lineage_agent.factory_service import analyze_factory_rhythm
        result = await analyze_factory_rhythm(_DEPLOYER_A)
        assert result is None

    @pytest.mark.asyncio
    async def test_returns_report_with_five_tokens(self, cache):
        """≥3 tokens → should return a FactoryRhythmReport."""
        await _seed_tokens(cache, _DEPLOYER_A, 5)
        from lineage_agent.factory_service import analyze_factory_rhythm
        result = await analyze_factory_rhythm(_DEPLOYER_A)
        assert result is not None
        assert result.tokens_launched == 5
        assert result.median_interval_hours > 0
        assert 0.0 <= result.regularity_score <= 1.0

    @pytest.mark.asyncio
    async def test_returns_none_for_empty_deployer(self, cache):
        from lineage_agent.factory_service import analyze_factory_rhythm
        result = await analyze_factory_rhythm("")
        assert result is None


# ── Deployer Profile ──────────────────────────────────────────────────────────

class TestDeployerProfile:
    @pytest.mark.asyncio
    async def test_returns_profile_with_seeded_tokens(self, cache):
        await _seed_tokens(cache, _DEPLOYER_A, 4, rug_count=2)
        from lineage_agent.deployer_service import compute_deployer_profile
        result = await compute_deployer_profile(_DEPLOYER_A)
        assert result is not None
        assert result.address == _DEPLOYER_A
        assert result.total_tokens_launched == 4
        assert result.rug_count == 2
        assert result.confirmed_rug_count == 2
        assert result.rug_rate_pct == pytest.approx(50.0)
        assert result.confidence in ("high", "medium", "low")

    @pytest.mark.asyncio
    async def test_unproven_abandonment_does_not_increment_confirmed_rug_count(self, cache):
        deployer = _DEPLOYER_A + "LEGACY"
        await _seed_tokens(
            cache,
            deployer,
            4,
            rug_count=2,
            rug_mechanism="unproven_abandonment",
            evidence_level="weak",
        )
        from lineage_agent.deployer_service import compute_deployer_profile
        result = await compute_deployer_profile(deployer)
        assert result is not None
        assert result.rug_count == 2
        assert result.confirmed_rug_count == 0

    @pytest.mark.asyncio
    async def test_returns_none_for_unknown_deployer(self, cache):
        from lineage_agent.deployer_service import compute_deployer_profile
        result = await compute_deployer_profile("UnknownWallet" + "X" * 30)
        # No tokens in DB for this deployer → returns None (no profile to build)
        assert result is None

    @pytest.mark.asyncio
    async def test_legacy_pre_dex_rug_normalizes_to_unknown_not_confirmed(self, cache):
        deployer = _DEPLOYER_A + "PREDEX"
        mint = "LegacyPreDexMint" + "Z" * 29
        created_at = (_NOW - timedelta(days=1)).isoformat()
        await cache.insert_event(
            event_type="token_created",
            mint=mint,
            deployer=deployer,
            created_at=created_at,
            launch_platform="moonshot",
            lifecycle_stage="launchpad_curve_only",
            market_surface="launchpad_curve_only",
        )
        await cache.insert_event(
            event_type="token_rugged",
            mint=mint,
            deployer=deployer,
            created_at=created_at,
            rugged_at=_NOW.isoformat(),
        )

        from lineage_agent.deployer_service import compute_deployer_profile
        result = await compute_deployer_profile(deployer)
        rugged_rows = await cache.query_events(
            where="event_type = 'token_rugged' AND mint = ?",
            params=(mint,),
        )

        assert result is not None
        assert result.rug_count == 1
        assert result.confirmed_rug_count == 0
        assert rugged_rows[0]["rug_mechanism"] == RugMechanism.UNKNOWN.value
        assert "legacy_rug_pre_dex_context" in json.loads(rugged_rows[0]["reason_codes"])


# ── Operator Impact ───────────────────────────────────────────────────────────

class TestOperatorImpact:
    @pytest.mark.asyncio
    async def test_returns_report_with_seeded_data(self, cache):
        """Operator impact should aggregate across linked wallets."""
        await _seed_tokens(cache, _DEPLOYER_A, 3, rug_count=1)
        await _seed_tokens(cache, _DEPLOYER_B, 2, rug_count=1)
        from lineage_agent.operator_impact_service import compute_operator_impact
        result = await compute_operator_impact(
            "abcdef1234567890",
            [_DEPLOYER_A, _DEPLOYER_B],
        )
        assert result is not None
        assert result.total_tokens_launched == 5
        assert result.total_rug_count == 2
        assert result.total_confirmed_rug_count == 2
        assert result.rug_rate_pct == pytest.approx(40.0)
        assert result.linked_wallets == [_DEPLOYER_A, _DEPLOYER_B]

    @pytest.mark.asyncio
    async def test_operator_impact_filters_non_confirmed_damage_from_extraction_estimate(self, cache):
        await _seed_tokens(cache, _DEPLOYER_A, 2, rug_count=1)
        await _seed_tokens(
            cache,
            _DEPLOYER_B,
            2,
            rug_count=1,
            rug_mechanism="unproven_abandonment",
            evidence_level="weak",
        )
        from lineage_agent.operator_impact_service import compute_operator_impact
        result = await compute_operator_impact("abcdef1234567890", [_DEPLOYER_A, _DEPLOYER_B])
        assert result is not None
        assert result.total_rug_count == 2
        assert result.total_confirmed_rug_count == 1
        assert result.estimated_extracted_usd > 0

    @pytest.mark.asyncio
    async def test_returns_none_for_empty_wallets(self, cache):
        from lineage_agent.operator_impact_service import compute_operator_impact
        result = await compute_operator_impact("abcdef1234567890", [])
        assert result is None


# ── Rug Detector ─────────────────────────────────────────────────────────────

class TestRugDetector:
    @pytest.mark.asyncio
    async def test_rug_sweep_skips_launchpad_curve_only_tokens(self, cache, monkeypatch):
        mint = "MoonshotMint" + "X" * 32
        await cache.insert_event(
            event_type="token_created",
            mint=mint,
            deployer=_DEPLOYER_A,
            liq_usd=5_000,
            created_at=_NOW.isoformat(),
            launch_platform="moonshot",
            lifecycle_stage="launchpad_curve_only",
            market_surface="launchpad_curve_only",
        )

        fake_dex = type("FakeDex", (), {"get_token_pairs_with_fallback": AsyncMock(return_value=[])})()
        monkeypatch.setattr("lineage_agent.rug_detector.get_dex_client", lambda: fake_dex)

        from lineage_agent.rug_detector import _run_rug_sweep
        result = await _run_rug_sweep()
        rugged_rows = await cache.query_events(
            where="event_type = 'token_rugged' AND mint = ?",
            params=(mint,),
        )

        assert result == 0
        assert rugged_rows == []

    @pytest.mark.asyncio
    async def test_rug_sweep_records_dex_liquidity_rug_for_dex_context(self, cache, monkeypatch):
        mint = "DexMint" + "Y" * 37
        await cache.insert_event(
            event_type="token_created",
            mint=mint,
            deployer=_DEPLOYER_A,
            liq_usd=5_000,
            created_at=_NOW.isoformat(),
            lifecycle_stage="dex_listed",
            market_surface="dex_pool_observed",
        )

        fake_dex = type("FakeDex", (), {"get_token_pairs_with_fallback": AsyncMock(return_value=[])})()
        monkeypatch.setattr("lineage_agent.rug_detector.get_dex_client", lambda: fake_dex)

        from lineage_agent.rug_detector import _run_rug_sweep
        result = await _run_rug_sweep()
        rugged_rows = await cache.query_events(
            where="event_type = 'token_rugged' AND mint = ?",
            params=(mint,),
        )

        assert result == 1
        assert rugged_rows[0]["rug_mechanism"] == "dex_liquidity_rug"
        assert rugged_rows[0]["evidence_level"] == "strong"

    @pytest.mark.asyncio
    async def test_persist_pre_dex_extraction_rug_inserts_confirmed_bundle_case(self, cache):
        mint = "PreDexMint" + "P" * 34
        token_meta = TokenMetadata(
            mint=mint,
            deployer=_DEPLOYER_A,
            launch_platform="moonshot",
            lifecycle_stage=LifecycleStage.LAUNCHPAD_CURVE_ONLY,
            market_surface=MarketSurface.LAUNCHPAD_CURVE_ONLY,
            reason_codes=["moonshot_authority"],
            evidence_level=EvidenceLevel.STRONG,
            created_at=_NOW,
        )
        bundle_report = BundleExtractionReport(
            mint=mint,
            deployer=_DEPLOYER_A,
            overall_verdict="confirmed_team_extraction",
        )
        sol_flow = SolFlowReport(
            mint=mint,
            deployer=_DEPLOYER_A,
            total_extracted_sol=12.5,
            analysis_timestamp=_NOW,
        )

        from lineage_agent.rug_detector import persist_pre_dex_extraction_rug
        changed = await persist_pre_dex_extraction_rug(mint, _DEPLOYER_A, token_meta, bundle_report, sol_flow)
        rugged_rows = await cache.query_events(
            where="event_type = 'token_rugged' AND mint = ?",
            params=(mint,),
        )

        assert changed is True
        assert len(rugged_rows) == 1
        assert rugged_rows[0]["rug_mechanism"] == RugMechanism.PRE_DEX_EXTRACTION_RUG.value
        assert rugged_rows[0]["evidence_level"] == EvidenceLevel.STRONG.value
        assert set(json.loads(rugged_rows[0]["reason_codes"])) >= {
            "moonshot_authority",
            "bundle_confirmed_team_extraction",
            "sol_flow_extraction_detected",
        }

    @pytest.mark.asyncio
    async def test_persist_pre_dex_extraction_rug_upgrades_existing_suspected_row(self, cache):
        mint = "UpgradeMint" + "U" * 33
        await cache.insert_event(
            event_type="token_rugged",
            mint=mint,
            deployer=_DEPLOYER_A,
            rugged_at=_NOW.isoformat(),
            created_at=_NOW.isoformat(),
            rug_mechanism=RugMechanism.PRE_DEX_EXTRACTION_RUG.value,
            evidence_level=EvidenceLevel.MODERATE.value,
            reason_codes=json.dumps(["bundle_suspected_team_extraction"]),
        )
        token_meta = TokenMetadata(
            mint=mint,
            deployer=_DEPLOYER_A,
            launch_platform="pumpfun",
            lifecycle_stage=LifecycleStage.LAUNCHPAD_CURVE_ONLY,
            market_surface=MarketSurface.LAUNCHPAD_CURVE_ONLY,
            evidence_level=EvidenceLevel.STRONG,
        )
        bundle_report = BundleExtractionReport(
            mint=mint,
            deployer=_DEPLOYER_A,
            overall_verdict="confirmed_team_extraction",
        )

        from lineage_agent.rug_detector import persist_pre_dex_extraction_rug
        changed = await persist_pre_dex_extraction_rug(mint, _DEPLOYER_A, token_meta, bundle_report, None)
        rugged_rows = await cache.query_events(
            where="event_type = 'token_rugged' AND mint = ?",
            params=(mint,),
        )

        assert changed is True
        assert len(rugged_rows) == 1
        assert rugged_rows[0]["evidence_level"] == EvidenceLevel.STRONG.value
        assert rugged_rows[0]["rug_mechanism"] == RugMechanism.PRE_DEX_EXTRACTION_RUG.value
        assert "bundle_confirmed_team_extraction" in json.loads(rugged_rows[0]["reason_codes"])

    @pytest.mark.asyncio
    async def test_persist_pre_dex_extraction_rug_upgrades_sol_only_to_suspected_at_same_evidence(self, cache):
        mint = "UpgradeSourceMint" + "S" * 27
        await cache.insert_event(
            event_type="token_rugged",
            mint=mint,
            deployer=_DEPLOYER_A,
            rugged_at=_NOW.isoformat(),
            created_at=_NOW.isoformat(),
            rug_mechanism=RugMechanism.PRE_DEX_EXTRACTION_RUG.value,
            evidence_level=EvidenceLevel.MODERATE.value,
            reason_codes=json.dumps(["sol_flow_only_extraction_detected", "team_link_unproven"]),
        )
        token_meta = TokenMetadata(
            mint=mint,
            deployer=_DEPLOYER_A,
            launch_platform="pumpfun",
            lifecycle_stage=LifecycleStage.LAUNCHPAD_CURVE_ONLY,
            market_surface=MarketSurface.LAUNCHPAD_CURVE_ONLY,
            evidence_level=EvidenceLevel.STRONG,
        )
        bundle_report = BundleExtractionReport(
            mint=mint,
            deployer=_DEPLOYER_A,
            overall_verdict="suspected_team_extraction",
        )

        from lineage_agent.rug_detector import persist_pre_dex_extraction_rug
        changed = await persist_pre_dex_extraction_rug(mint, _DEPLOYER_A, token_meta, bundle_report, None)
        rugged_rows = await cache.query_events(
            where="event_type = 'token_rugged' AND mint = ?",
            params=(mint,),
        )

        assert changed is True
        reasons = set(json.loads(rugged_rows[0]["reason_codes"]))
        assert rugged_rows[0]["evidence_level"] == EvidenceLevel.MODERATE.value
        assert "bundle_suspected_team_extraction" in reasons
        assert "sol_flow_only_extraction_detected" in reasons

    @pytest.mark.asyncio
    async def test_persist_pre_dex_extraction_rug_marks_sol_only_case_without_team_link(self, cache):
        mint = "SolOnlyMint" + "Q" * 33
        token_meta = TokenMetadata(
            mint=mint,
            deployer=_DEPLOYER_A,
            launch_platform="moonshot",
            lifecycle_stage=LifecycleStage.LAUNCHPAD_CURVE_ONLY,
            market_surface=MarketSurface.LAUNCHPAD_CURVE_ONLY,
            evidence_level=EvidenceLevel.STRONG,
        )
        sol_flow = SolFlowReport(
            mint=mint,
            deployer=_DEPLOYER_A,
            total_extracted_sol=3.25,
            extraction_context="confirmed_extraction",
            analysis_timestamp=_NOW,
        )

        from lineage_agent.rug_detector import persist_pre_dex_extraction_rug
        changed = await persist_pre_dex_extraction_rug(mint, _DEPLOYER_A, token_meta, None, sol_flow)
        rugged_rows = await cache.query_events(
            where="event_type = 'token_rugged' AND mint = ?",
            params=(mint,),
        )

        assert changed is True
        reasons = set(json.loads(rugged_rows[0]["reason_codes"]))
        assert rugged_rows[0]["rug_mechanism"] == RugMechanism.PRE_DEX_EXTRACTION_RUG.value
        assert rugged_rows[0]["evidence_level"] == EvidenceLevel.WEAK.value
        assert "sol_flow_only_extraction_detected" in reasons
        assert "team_link_unproven" in reasons
        assert "bundle_suspected_team_extraction" not in reasons

    @pytest.mark.asyncio
    async def test_persist_pre_dex_extraction_rug_does_not_overwrite_dex_liquidity_rug(self, cache):
        mint = "DexProtectedMint" + "D" * 28
        await cache.insert_event(
            event_type="token_rugged",
            mint=mint,
            deployer=_DEPLOYER_A,
            rugged_at=_NOW.isoformat(),
            created_at=_NOW.isoformat(),
            rug_mechanism=RugMechanism.DEX_LIQUIDITY_RUG.value,
            evidence_level=EvidenceLevel.STRONG.value,
        )
        token_meta = TokenMetadata(
            mint=mint,
            deployer=_DEPLOYER_A,
            launch_platform="moonshot",
            lifecycle_stage=LifecycleStage.LAUNCHPAD_CURVE_ONLY,
            market_surface=MarketSurface.LAUNCHPAD_CURVE_ONLY,
            evidence_level=EvidenceLevel.STRONG,
        )
        bundle_report = BundleExtractionReport(
            mint=mint,
            deployer=_DEPLOYER_A,
            overall_verdict="confirmed_team_extraction",
        )

        from lineage_agent.rug_detector import persist_pre_dex_extraction_rug
        changed = await persist_pre_dex_extraction_rug(mint, _DEPLOYER_A, token_meta, bundle_report, None)
        rugged_rows = await cache.query_events(
            where="event_type = 'token_rugged' AND mint = ?",
            params=(mint,),
        )

        assert changed is False
        assert rugged_rows[0]["rug_mechanism"] == RugMechanism.DEX_LIQUIDITY_RUG.value
        assert rugged_rows[0]["evidence_level"] == EvidenceLevel.STRONG.value


# ── SOL Flow (DB read path) ──────────────────────────────────────────────────

class TestSolFlowReport:
    @pytest.mark.asyncio
    async def test_returns_none_when_no_flows(self, cache):
        from lineage_agent.sol_flow_service import get_sol_flow_report
        result = await get_sol_flow_report("SomeMint" + "X" * 36)
        assert result is None

    @pytest.mark.asyncio
    async def test_returns_report_with_seeded_flows(self, cache):
        """Pre-seed sol_flows table and verify report is built."""
        mint = "FlowMint" + "X" * 36
        flows = [
            {
                "mint": mint,
                "from_address": _DEPLOYER_A,
                "to_address": _DEPLOYER_B,
                "amount_lamports": 5_000_000_000,
                "signature": "sig1" + "X" * 80,
                "slot": 100000,
                "block_time": int(_NOW.timestamp()),
                "hop": 0,
            }
        ]
        await cache.sol_flow_insert_batch(flows)
        from lineage_agent.sol_flow_service import get_sol_flow_report
        result = await get_sol_flow_report(mint)
        assert result is not None
        assert result.mint == mint
        assert len(result.flows) == 1
        assert result.flows[0].amount_sol == pytest.approx(5.0)
        assert result.total_extracted_sol == pytest.approx(5.0)

    @pytest.mark.asyncio
    async def test_force_refresh_clears_seeded_flows(self, cache):
        mint = "FlowRefreshMint" + "Y" * 29
        flows = [
            {
                "mint": mint,
                "from_address": _DEPLOYER_A,
                "to_address": _DEPLOYER_B,
                "amount_lamports": 2_000_000_000,
                "signature": "sig-refresh-1" + "X" * 70,
                "slot": 100123,
                "block_time": int(_NOW.timestamp()),
                "hop": 0,
            }
        ]
        await cache.sol_flow_insert_batch(flows)

        from lineage_agent.sol_flow_service import get_sol_flow_report
        refreshed = await get_sol_flow_report(mint, force_refresh=True)
        rows = await cache.sol_flows_query(mint)

        assert refreshed is None
        assert rows == []


# ── Cartel Report (DB read path) ─────────────────────────────────────────────

class TestCartelReport:
    @pytest.mark.asyncio
    async def test_returns_none_for_empty_deployer(self, cache):
        from lineage_agent.cartel_service import compute_cartel_report
        result = await compute_cartel_report("SomeMint", "")
        assert result is None

    @pytest.mark.asyncio
    async def test_returns_report_with_seeded_edges(self, cache):
        """Pre-seed cartel_edges and verify community detection works."""
        # Build a small cartel: A-B, B-C via DNA match
        wallets = [
            "CartelWalletA" + "X" * 30,
            "CartelWalletB" + "X" * 30,
            "CartelWalletC" + "X" * 30,
        ]
        for i in range(len(wallets) - 1):
            await cache.cartel_edge_upsert(
                wallet_a=wallets[i],
                wallet_b=wallets[i + 1],
                signal_type="dna_match",
                signal_strength=0.85,
                evidence={"shared_fp": "abcdef"},
            )
        # Also seed some token events so the community report is rich
        for w in wallets:
            await _seed_tokens(cache, w, 3, rug_count=1)

        from lineage_agent.cartel_service import compute_cartel_report
        result = await compute_cartel_report("SomeMint", wallets[0])
        assert result is not None
        if result.deployer_community is not None:
            c = result.deployer_community
            assert len(c.wallets) >= 2
            assert c.total_tokens_launched >= 3
            assert c.confidence in ("high", "medium", "low")

    @pytest.mark.asyncio
    async def test_counts_only_confirmed_rugs_for_community(self, cache):
        wallet_a = "CartelConfirmedA" + "X" * 28
        wallet_b = "CartelConfirmedB" + "X" * 28
        mint_a = "CartelMintA" + "X" * 31
        mint_b = "CartelMintB" + "X" * 31

        await cache.cartel_edge_upsert(
            wallet_a=wallet_a,
            wallet_b=wallet_b,
            signal_type="dna_match",
            signal_strength=0.95,
            evidence={"fingerprint": "abc"},
        )
        await cache.insert_event(
            event_type="token_created",
            mint=mint_a,
            deployer=wallet_a,
            name="A",
            symbol="A",
            narrative="meme",
            mcap_usd=10_000,
            created_at=_NOW.isoformat(),
        )
        await cache.insert_event(
            event_type="token_created",
            mint=mint_b,
            deployer=wallet_b,
            name="B",
            symbol="B",
            narrative="meme",
            mcap_usd=20_000,
            created_at=_NOW.isoformat(),
        )
        await cache.insert_event(
            event_type="token_rugged",
            mint=mint_a,
            deployer=wallet_a,
            rugged_at=_NOW.isoformat(),
            mcap_usd=10_000,
            rug_mechanism=RugMechanism.DEX_LIQUIDITY_RUG.value,
            evidence_level=EvidenceLevel.STRONG.value,
        )
        await cache.insert_event(
            event_type="token_rugged",
            mint=mint_b,
            deployer=wallet_b,
            rugged_at=_NOW.isoformat(),
            mcap_usd=20_000,
            rug_mechanism=RugMechanism.UNPROVEN_ABANDONMENT.value,
            evidence_level=EvidenceLevel.WEAK.value,
        )

        from lineage_agent.cartel_service import compute_cartel_report
        result = await compute_cartel_report(mint_a, wallet_a)

        assert result is not None
        assert result.deployer_community is not None
        community = result.deployer_community
        assert community.total_rugs == 1
        assert community.estimated_extracted_usd == pytest.approx(
            10_000 * estimate_extraction_rate(10_000),
            rel=0.001,
        )


# ── Operator Fingerprint (unit logic) ────────────────────────────────────────

class TestOperatorFingerprint:
    @pytest.mark.asyncio
    async def test_returns_none_with_empty_input(self, cache):
        from lineage_agent.metadata_dna_service import build_operator_fingerprint
        result = await build_operator_fingerprint([])
        assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_with_single_entry(self, cache):
        from lineage_agent.metadata_dna_service import build_operator_fingerprint
        result = await build_operator_fingerprint([
            ("mint1", _DEPLOYER_A, "https://arweave.net/abc123"),
        ])
        assert result is None  # need ≥ 2 entries

    @pytest.mark.asyncio
    async def test_linked_wallet_tokens_do_not_mark_unproven_rugs_as_confirmed(self, cache, monkeypatch):
        wallet_a = "DNAWalletA" + "X" * 33
        wallet_b = "DNAWalletB" + "X" * 33
        mint_a = "DNAMintA" + "X" * 35
        mint_b = "DNAMintB" + "X" * 35

        await cache.insert_event(
            event_type="token_created",
            mint=mint_a,
            deployer=wallet_a,
            name="TokenA",
            symbol="TA",
            narrative="meme",
            mcap_usd=10_000,
            created_at=_NOW.isoformat(),
        )
        await cache.insert_event(
            event_type="token_created",
            mint=mint_b,
            deployer=wallet_b,
            name="TokenB",
            symbol="TB",
            narrative="meme",
            mcap_usd=12_000,
            created_at=_NOW.isoformat(),
        )
        await cache.insert_event(
            event_type="token_rugged",
            mint=mint_a,
            deployer=wallet_a,
            rugged_at=_NOW.isoformat(),
            rug_mechanism=RugMechanism.UNPROVEN_ABANDONMENT.value,
            evidence_level=EvidenceLevel.WEAK.value,
        )
        await cache.insert_event(
            event_type="token_rugged",
            mint=mint_b,
            deployer=wallet_b,
            rugged_at=_NOW.isoformat(),
            rug_mechanism=RugMechanism.DEX_LIQUIDITY_RUG.value,
            evidence_level=EvidenceLevel.STRONG.value,
        )

        async def _fake_fp(mint: str, uri: str):
            return ("shared-fp", "shared description")

        monkeypatch.setattr("lineage_agent.metadata_dna_service._get_fingerprint", _fake_fp)

        from lineage_agent.metadata_dna_service import build_operator_fingerprint
        result = await build_operator_fingerprint([
            (mint_a, wallet_a, "https://arweave.net/a"),
            (mint_b, wallet_b, "https://arweave.net/b"),
        ])

        assert result is not None
        tokens_a = result.linked_wallet_tokens[wallet_a]
        tokens_b = result.linked_wallet_tokens[wallet_b]
        assert tokens_a[0].rug_mechanism == RugMechanism.UNPROVEN_ABANDONMENT.value
        assert tokens_a[0].rugged_at is None
        assert tokens_b[0].rug_mechanism == RugMechanism.DEX_LIQUIDITY_RUG.value
        assert tokens_b[0].rugged_at is not None
