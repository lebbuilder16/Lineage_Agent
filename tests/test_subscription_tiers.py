"""Tests for subscription_tiers — the single source of truth for tier limits."""

import math

import pytest

from lineage_agent.subscription_tiers import (
    TIER_LIMITS,
    TIER_ORDER,
    PlanTier,
    TierLimits,
    get_limits,
)


class TestGetLimitsReturnsCorrectTier:
    """get_limits should return the matching TierLimits for every known plan."""

    @pytest.mark.parametrize("tier", list(PlanTier))
    def test_get_limits_returns_correct_tier(self, tier: PlanTier) -> None:
        limits = get_limits(tier.value)
        assert limits is TIER_LIMITS[tier]

    def test_accepts_enum_directly(self) -> None:
        assert get_limits(PlanTier.PRO) is TIER_LIMITS[PlanTier.PRO]


class TestGetLimitsUnknownDefaultsToFree:
    """Unknown or garbage plan strings must fall back to FREE."""

    @pytest.mark.parametrize("bad_input", [
        "gold", "premium", "", "FREE", "Pro", "unknown_tier",
        "pro_plus", "whale",  # legacy tier names also fall back to free
    ])
    def test_get_limits_unknown_defaults_to_free(self, bad_input: str) -> None:
        assert get_limits(bad_input) is TIER_LIMITS[PlanTier.FREE]


class TestTierOrdering:
    """TIER_ORDER must list tiers from lowest to highest privilege."""

    def test_tier_ordering(self) -> None:
        assert TIER_ORDER == [
            PlanTier.FREE,
            PlanTier.PRO,
            PlanTier.ELITE,
        ]

    def test_watchlist_increases_with_tier(self) -> None:
        watchlists = [TIER_LIMITS[t].max_watchlist for t in TIER_ORDER]
        assert watchlists == sorted(watchlists)


class TestAllTiersDefined:
    """Every PlanTier member must have an entry in TIER_LIMITS."""

    def test_all_tiers_defined(self) -> None:
        for tier in PlanTier:
            assert tier in TIER_LIMITS, f"{tier} missing from TIER_LIMITS"

    def test_no_extra_keys(self) -> None:
        assert set(TIER_LIMITS.keys()) == set(PlanTier)

    def test_exactly_three_tiers(self) -> None:
        assert len(PlanTier) == 3


class TestFreeTierRestrictions:
    """FREE tier must be the most restrictive (with deployer + death clock as teasers)."""

    def test_free_tier_restrictions(self) -> None:
        free = TIER_LIMITS[PlanTier.FREE]
        assert free.scans_per_day == 3
        assert free.history_days == 7
        assert free.has_ai_chat is False
        assert free.max_watchlist == 1
        assert free.max_briefings == 0
        assert free.alert_channels == ["in_app"]
        assert free.has_sol_flow is False
        assert free.has_bundle_tracker is False
        assert free.has_insider_sell is False
        assert free.has_cartel_detection is False
        assert free.has_operator_impact is False
        assert free.has_compare is False
        assert free.has_export is False
        assert free.batch_scan_max == 0
        assert free.has_api_access is False
        assert free.has_agent is False
        assert free.has_ai_verdict is False

    def test_free_has_deployer_and_death_clock(self) -> None:
        """Deployer profiler and death clock are free teasers."""
        free = TIER_LIMITS[PlanTier.FREE]
        assert free.has_deployer_profiler is True
        assert free.death_clock_full is True


class TestProTier:
    """PRO tier — all forensic modules, Haiku AI, no agent."""

    def test_pro_limits(self) -> None:
        pro = TIER_LIMITS[PlanTier.PRO]
        assert pro.scans_per_day == 15
        assert pro.history_days == 90
        assert pro.has_ai_chat is True
        assert pro.ai_chat_model == "haiku"
        assert pro.ai_chat_daily_limit == 10
        assert pro.max_watchlist == 3
        assert pro.max_briefings == 1
        assert pro.has_sol_flow is True
        assert pro.has_bundle_tracker is True
        assert pro.has_insider_sell is True
        assert pro.has_deployer_profiler is True
        assert pro.has_cartel_detection is True
        assert pro.has_operator_impact is True
        assert pro.has_compare is True
        assert pro.has_export is True
        assert pro.has_ai_verdict is True
        assert pro.has_agent is False
        assert pro.has_api_access is False
        assert pro.batch_scan_max == 0


class TestEliteHasEverything:
    """ELITE tier must have all features enabled and the highest limits."""

    def test_elite_has_everything(self) -> None:
        elite = TIER_LIMITS[PlanTier.ELITE]
        assert elite.scans_per_day == 50
        assert elite.history_days == 365
        assert elite.has_ai_chat is True
        assert elite.ai_chat_model == "haiku"
        assert elite.ai_chat_daily_limit == 40
        assert elite.max_watchlist == 4
        assert elite.max_briefings == 3
        assert "telegram" in elite.alert_channels
        assert "discord" in elite.alert_channels
        assert elite.has_sol_flow is True
        assert elite.has_bundle_tracker is True
        assert elite.has_insider_sell is True
        assert elite.has_deployer_profiler is True
        assert elite.has_cartel_detection is True
        assert elite.has_operator_impact is True
        assert elite.has_compare is True
        assert elite.has_export is True
        assert elite.batch_scan_max == 10
        assert elite.has_api_access is True
        assert elite.death_clock_full is True
        assert elite.has_agent is True
        assert elite.agent_daily_limit == 12
        assert elite.has_ai_verdict is True
        assert elite.investigate_daily_limit == 50
        assert elite.investigate_chat_daily_limit == 40
