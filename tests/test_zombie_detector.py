"""Tests for zombie_detector module."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from lineage_agent.models import (
    DerivativeInfo,
    LineageResult,
    SimilarityEvidence,
    TokenMetadata,
)
from lineage_agent.zombie_detector import detect_resurrection, _is_dead


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


def _token(
    mint: str,
    deployer: str = "DeployerA",
    liquidity_usd: float | None = 50_000.0,
    age_hours: float = 48.0,
) -> TokenMetadata:
    """Helper to create a TokenMetadata fixture."""
    return TokenMetadata(
        mint=mint,
        name=f"Token_{mint[:6]}",
        symbol="TKN",
        deployer=deployer,
        created_at=_now() - timedelta(hours=age_hours),
        liquidity_usd=liquidity_usd,
        market_cap_usd=(liquidity_usd * 4) if liquidity_usd else None,
    )


def _derivative(
    mint: str,
    deployer: str = "DeployerA",
    liquidity_usd: float | None = 50_000.0,
    age_hours: float = 24.0,
    image_score: float = 0.95,
    deployer_score: float = 1.0,
) -> DerivativeInfo:
    return DerivativeInfo(
        mint=mint,
        name=f"Token_{mint[:6]}",
        symbol="TKN",
        deployer=deployer,
        created_at=_now() - timedelta(hours=age_hours),
        liquidity_usd=liquidity_usd,
        market_cap_usd=(liquidity_usd * 4) if liquidity_usd else None,
        evidence=SimilarityEvidence(
            image_score=image_score,
            deployer_score=deployer_score,
            composite_score=0.85,
        ),
    )


# ---------------------------------------------------------------------------
# _is_dead
# ---------------------------------------------------------------------------

class TestIsDead:
    def test_high_liq_not_dead(self):
        assert _is_dead(5_000.0, _now() - timedelta(hours=48), _now()) is False

    def test_zero_liq_old_token(self):
        assert _is_dead(50.0, _now() - timedelta(hours=48), _now()) is True

    def test_zero_liq_too_new(self):
        # Created only 12 hours ago — not dead yet
        assert _is_dead(50.0, _now() - timedelta(hours=12), _now()) is False

    def test_none_liq_not_dead(self):
        assert _is_dead(None, _now() - timedelta(hours=48), _now()) is False

    def test_none_created_at_but_dead_liq(self):
        # No creation date but liquidity is dead → considered dead
        assert _is_dead(10.0, None, _now()) is True


# ---------------------------------------------------------------------------
# detect_resurrection
# ---------------------------------------------------------------------------

class TestDetectResurrection:
    def test_no_root_returns_none(self):
        result = LineageResult(mint="MINT_A", root=None)
        assert detect_resurrection(result) is None

    def test_single_live_token_no_alert(self):
        """Only a root with healthy liquidity → no zombie."""
        root = _token("MINT_ROOT", liquidity_usd=80_000.0, age_hours=48)
        result = LineageResult(mint="MINT_ROOT", root=root)
        alert = detect_resurrection(result)
        assert alert is None

    def test_confirmed_zombie_same_deployer_high_image(self):
        """Dead root + alive derivative with same deployer + high image score → confirmed."""
        root = _token("MINT_DEAD", liquidity_usd=20.0, age_hours=72)
        derivative = _derivative(
            "MINT_ALIVE",
            deployer="DeployerA",
            liquidity_usd=60_000.0,
            age_hours=12,
            image_score=0.95,
            deployer_score=1.0,
        )
        result = LineageResult(
            mint="MINT_DEAD",
            root=root,
            derivatives=[derivative],
        )
        alert = detect_resurrection(result)
        assert alert is not None
        assert alert.confidence == "confirmed"
        assert alert.resurrection_mint == "MINT_ALIVE"
        assert alert.same_deployer is True

    def test_probable_zombie_different_deployer_very_high_image(self):
        """Dead root + alive derivative different deployer, image ≥ 0.92 → probable."""
        root = _token("MINT_DEAD2", liquidity_usd=10.0, age_hours=100)
        derivative = _derivative(
            "MINT_ALIVE2",
            deployer="DeployerB",
            liquidity_usd=30_000.0,
            age_hours=6,
            image_score=0.95,
            deployer_score=0.0,
        )
        result = LineageResult(
            mint="MINT_DEAD2",
            root=root,
            derivatives=[derivative],
        )
        alert = detect_resurrection(result)
        assert alert is not None
        assert alert.confidence == "probable"
        assert alert.same_deployer is False

    def test_no_zombie_both_alive(self):
        """Both tokens alive → no resurrection."""
        root = _token("MINT_A", liquidity_usd=80_000.0, age_hours=48)
        derivative = _derivative(
            "MINT_B",
            liquidity_usd=40_000.0,
            age_hours=24,
            image_score=0.99,
            deployer_score=1.0,
        )
        result = LineageResult(
            mint="MINT_A",
            root=root,
            derivatives=[derivative],
        )
        alert = detect_resurrection(result)
        assert alert is None

    def test_no_zombie_both_dead(self):
        """Both tokens dead → no resurrection (nothing to resurrect into)."""
        root = _token("MINT_DEAD_A", liquidity_usd=5.0, age_hours=120)
        derivative = _derivative(
            "MINT_DEAD_B",
            liquidity_usd=8.0,
            age_hours=72,
            image_score=0.99,
            deployer_score=1.0,
        )
        result = LineageResult(
            mint="MINT_DEAD_A",
            root=root,
            derivatives=[derivative],
        )
        alert = detect_resurrection(result)
        assert alert is None

    def test_low_image_same_deployer_returns_probable(self):
        """Same deployer but image score between 0.60 and 0.72 → probable."""
        root = _token("MINT_DEADX", liquidity_usd=3.0, age_hours=96)
        derivative = _derivative(
            "MINT_ALIVEX",
            deployer="DeployerA",
            liquidity_usd=25_000.0,
            age_hours=8,
            image_score=0.65,
            deployer_score=1.0,
        )
        result = LineageResult(
            mint="MINT_DEADX",
            root=root,
            derivatives=[derivative],
        )
        alert = detect_resurrection(result)
        assert alert is not None
        assert alert.confidence == "probable"
