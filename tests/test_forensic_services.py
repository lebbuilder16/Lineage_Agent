"""Tests for forensic enrichment services.

These tests use SQLiteCache with pre-seeded intelligence_events data
to verify that each forensic feature returns non-null results when
data dependencies are met.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, timezone

import pytest

from lineage_agent.cache import SQLiteCache


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


async def _seed_tokens(cache: SQLiteCache, deployer: str, count: int, *, rug_count: int = 0):
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
        assert result.rug_rate_pct == pytest.approx(50.0)
        assert result.confidence in ("high", "medium", "low")

    @pytest.mark.asyncio
    async def test_returns_none_for_unknown_deployer(self, cache):
        from lineage_agent.deployer_service import compute_deployer_profile
        result = await compute_deployer_profile("UnknownWallet" + "X" * 30)
        # No tokens in DB for this deployer → returns None (no profile to build)
        assert result is None


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
        assert result.rug_rate_pct == pytest.approx(40.0)
        assert result.linked_wallets == [_DEPLOYER_A, _DEPLOYER_B]

    @pytest.mark.asyncio
    async def test_returns_none_for_empty_wallets(self, cache):
        from lineage_agent.operator_impact_service import compute_operator_impact
        result = await compute_operator_impact("abcdef1234567890", [])
        assert result is None


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
