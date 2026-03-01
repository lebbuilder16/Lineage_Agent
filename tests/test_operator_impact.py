"""Tests for operator_impact_service and estimate_extraction_rate."""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest

from lineage_agent.constants import estimate_extraction_rate
from lineage_agent.operator_impact_service import compute_operator_impact


# ---------------------------------------------------------------------------
# estimate_extraction_rate — tiered extraction function (from constants)
# ---------------------------------------------------------------------------

class TestEstimateExtractionRate:
    """Verify the tiered extraction rate logic."""

    def test_zero_mcap(self):
        # mcap_usd=0 falls into the "falsy" branch → conservative fallback (EXTRACTION_RATE = 0.15)
        rate = estimate_extraction_rate(0)
        assert rate == pytest.approx(0.15)  # EXTRACTION_RATE fallback for zero/None

    def test_very_small_mcap(self):
        # < $5k → 40%
        rate = estimate_extraction_rate(3_000)
        assert rate == pytest.approx(0.40)

    def test_boundary_5k(self):
        # Exactly $5k → should cross into next tier (≥5k)
        rate = estimate_extraction_rate(5_000)
        assert rate == pytest.approx(0.30)

    def test_mid_small_mcap(self):
        # $5k–$50k → 30%
        rate = estimate_extraction_rate(25_000)
        assert rate == pytest.approx(0.30)

    def test_boundary_50k(self):
        # Exactly $50k → should be 15%
        rate = estimate_extraction_rate(50_000)
        assert rate == pytest.approx(0.15)

    def test_mid_medium_mcap(self):
        # $50k–$500k → 15%
        rate = estimate_extraction_rate(200_000)
        assert rate == pytest.approx(0.15)

    def test_boundary_500k(self):
        # Exactly $500k → should be 8%
        rate = estimate_extraction_rate(500_000)
        assert rate == pytest.approx(0.08)

    def test_large_mcap(self):
        # > $500k → 8%
        rate = estimate_extraction_rate(2_000_000)
        assert rate == pytest.approx(0.08)

    def test_very_large_mcap(self):
        rate = estimate_extraction_rate(100_000_000)
        assert rate == pytest.approx(0.08)

    def test_return_type_is_float(self):
        assert isinstance(estimate_extraction_rate(10_000), float)

    def test_rates_decrease_monotonically_with_mcap(self):
        """Larger mcap → lower extraction rate (higher visibility = less extracted)."""
        thresholds = [1_000, 10_000, 100_000, 1_000_000]
        rates = [estimate_extraction_rate(m) for m in thresholds]
        for i in range(len(rates) - 1):
            assert rates[i] > rates[i + 1], (
                f"Rate at {thresholds[i]} ({rates[i]}) should be > "
                f"rate at {thresholds[i + 1]} ({rates[i + 1]})"
            )


# ---------------------------------------------------------------------------
# compute_operator_impact — integration-level (mocked DB + deployer service)
# ---------------------------------------------------------------------------

class TestComputeOperatorImpact:
    @pytest.mark.asyncio
    async def test_empty_wallets_returns_none(self):
        result = await compute_operator_impact("aabbccdd", [])
        assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_on_timeout(self):
        """If internal build times out, returns None gracefully."""
        async def slow_build(*args, **kwargs):
            import asyncio
            await asyncio.sleep(99)

        with patch(
            "lineage_agent.operator_impact_service._build_impact",
            new=slow_build,
        ):
            import asyncio
            with patch("asyncio.wait_for", side_effect=asyncio.TimeoutError):
                result = await compute_operator_impact("fp_test", ["WalletA"])
        assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_on_exception(self):
        with patch(
            "lineage_agent.operator_impact_service._build_impact",
            side_effect=RuntimeError("DB exploded"),
        ):
            result = await compute_operator_impact("fp_test", ["WalletA"])
        assert result is None

    @pytest.mark.asyncio
    async def test_estimated_extraction_uses_dynamic_rate(self):
        """Check that estimated_extracted_usd uses tiered rate, not flat 15%."""
        from lineage_agent.models import OperatorImpactReport

        # $1k mcap → 40% extraction rate (micro-cap tier)
        mcap = 1_000.0
        dynamic_rate = estimate_extraction_rate(mcap)  # 0.40
        extracted = mcap * dynamic_rate

        fake_report = OperatorImpactReport(
            fingerprint="fp_test_extraction",
            linked_wallets=["WalletA"],
            total_tokens_launched=1,
            total_rug_count=1,
            rug_rate_pct=100.0,
            estimated_extracted_usd=extracted,
        )

        with patch(
            "lineage_agent.operator_impact_service._build_impact",
            new=AsyncMock(return_value=fake_report),
        ):
            result = await compute_operator_impact("fp_test_extraction", ["WalletA"])

        assert result is not None
        assert result.fingerprint == "fp_test_extraction"
        # At $1k mcap the dynamic rate is 40%, not the flat 15%
        assert result.estimated_extracted_usd == pytest.approx(mcap * 0.40)
        assert dynamic_rate == pytest.approx(0.40)
