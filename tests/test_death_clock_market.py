"""Tests for Death Clock market signals (Feature 6)."""

from __future__ import annotations

import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, patch

from lineage_agent.models import DeathClockForecast, TokenMetadata
from lineage_agent.death_clock import compute_death_clock, _compute_market_signals


DEPLOYER = "DeathClockDeployer111111111111111111111111"
NOW = datetime.now(tz=timezone.utc)
CREATED_48H_AGO = NOW - timedelta(hours=48)
CREATED_2H_AGO = NOW - timedelta(hours=2)


def _make_meta(liq: float | None, mcap: float | None) -> TokenMetadata:
    return TokenMetadata(
        mint="MINTDEADCLK1111111111111111111111111111111",
        name="DeadToken",
        symbol="DEAD",
        deployer=DEPLOYER,
        created_at=CREATED_2H_AGO,
        liquidity_usd=liq,
        market_cap_usd=mcap,
    )


# ---------------------------------------------------------------------------
# _compute_market_signals — unit tests (pure function)
# ---------------------------------------------------------------------------

def test_compute_market_signals_returns_none_without_metadata():
    result = _compute_market_signals(None, "medium")
    assert result is None


def test_compute_market_signals_low_liquidity_boosts():
    """Liquidity below threshold triggers a boost of 1.0."""
    meta = _make_meta(liq=100.0, mcap=500_000.0)
    signals = _compute_market_signals(meta, "medium")
    assert signals is not None
    assert signals.adjusted_risk_boost >= 1.0


def test_compute_market_signals_low_liq_mcap_ratio_boosts():
    """Liq/mcap below 0.5% triggers an additional boost."""
    meta = _make_meta(liq=200.0, mcap=1_000_000.0)  # 0.02% ratio
    signals = _compute_market_signals(meta, "low")
    assert signals is not None
    assert signals.adjusted_risk_boost >= 1.0
    assert signals.liq_to_mcap_ratio == pytest.approx(0.0002, rel=1e-3)


def test_compute_market_signals_healthy_liquidity_no_boost():
    """Healthy liquidity (> $500, ratio > 0.5%) produces no boost."""
    meta = _make_meta(liq=50_000.0, mcap=5_000_000.0)  # 1% ratio
    signals = _compute_market_signals(meta, "low")
    assert signals is not None
    assert signals.adjusted_risk_boost == 0.0


def test_compute_market_signals_boost_capped_at_3():
    """Total boost never exceeds 3.0 regardless of how many signals fire."""
    meta = _make_meta(liq=50.0, mcap=500_000.0)  # triggers liq < 500 AND liq/mcap low
    signals = _compute_market_signals(meta, "low")
    assert signals is not None
    assert signals.adjusted_risk_boost <= 3.0


# ---------------------------------------------------------------------------
# compute_death_clock — integration tests with market signals injected
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_compute_death_clock_populates_market_signals_field():
    """When token_metadata is provided, market_signals is not None."""
    rug_rows = [
        {"created_at": (NOW - timedelta(hours=72)).isoformat(),
         "rugged_at":  (NOW - timedelta(hours=24)).isoformat()},
    ]
    meta = _make_meta(liq=5_000.0, mcap=500_000.0)

    with patch("lineage_agent.death_clock.event_query", new_callable=AsyncMock, return_value=rug_rows):
        result = await compute_death_clock(DEPLOYER, CREATED_48H_AGO, token_metadata=meta)

    assert result is not None
    assert result.market_signals is not None
    assert result.market_signals.liquidity_usd == 5_000.0


@pytest.mark.asyncio
async def test_compute_death_clock_no_metadata_market_signals_is_none():
    """Without token_metadata, market_signals field must be None."""
    rug_rows = [
        {"created_at": (NOW - timedelta(hours=72)).isoformat(),
         "rugged_at":  (NOW - timedelta(hours=24)).isoformat()},
    ]
    with patch("lineage_agent.death_clock.event_query", new_callable=AsyncMock, return_value=rug_rows):
        result = await compute_death_clock(DEPLOYER, CREATED_48H_AGO)

    assert result is not None
    assert result.market_signals is None


@pytest.mark.asyncio
async def test_compute_death_clock_backward_compatible_no_new_param():
    """compute_death_clock can be called without token_metadata (backwards compat)."""
    with patch("lineage_agent.death_clock.event_query", new_callable=AsyncMock, return_value=[]):
        result = await compute_death_clock(DEPLOYER, CREATED_2H_AGO)
    assert result is not None
    assert result.risk_level == "insufficient_data"
    assert result.market_signals is None


@pytest.mark.asyncio
async def test_compute_death_clock_returns_none_without_deployer():
    """Passing an empty deployer returns None immediately."""
    result = await compute_death_clock("", CREATED_2H_AGO)
    assert result is None


# ---------------------------------------------------------------------------
# DeathClockForecast model serialisation
# ---------------------------------------------------------------------------

def test_death_clock_forecast_serialises_market_signals():
    """DeathClockForecast with market_signals round-trips through JSON."""
    from lineage_agent.models import MarketSignals
    signals = MarketSignals(
        liquidity_usd=300.0,
        market_cap_usd=600_000.0,
        liq_to_mcap_ratio=0.0005,
        adjusted_risk_boost=2.0,
    )
    forecast = DeathClockForecast(
        deployer=DEPLOYER,
        historical_rug_count=3,
        median_rug_hours=48.0,
        stdev_rug_hours=12.0,
        elapsed_hours=24.0,
        risk_level="medium",
        market_signals=signals,
    )
    data = forecast.model_dump()
    assert data["market_signals"]["liquidity_usd"] == 300.0
    assert data["market_signals"]["adjusted_risk_boost"] == 2.0
