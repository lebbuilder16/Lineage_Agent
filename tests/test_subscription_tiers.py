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

    @pytest.mark.parametrize("bad_input", ["gold", "premium", "", "FREE", "Pro", "unknown_tier"])
    def test_get_limits_unknown_defaults_to_free(self, bad_input: str) -> None:
        assert get_limits(bad_input) is TIER_LIMITS[PlanTier.FREE]


class TestTierOrdering:
    """TIER_ORDER must list tiers from lowest to highest privilege."""

    def test_tier_ordering(self) -> None:
        assert TIER_ORDER == [
            PlanTier.FREE,
            PlanTier.PRO,
            PlanTier.PRO_PLUS,
            PlanTier.WHALE,
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


class TestFreeTierRestrictions:
    """FREE tier must be the most restrictive."""

    def test_free_tier_restrictions(self) -> None:
        free = TIER_LIMITS[PlanTier.FREE]
        assert free.scans_per_day == 5
        assert free.history_days == 7
        assert free.has_ai_chat is False
        assert free.max_watchlist == 0
        assert free.max_briefings == 0
        assert free.alert_channels == ["in_app"]
        assert free.has_sol_flow is False
        assert free.has_bundle_tracker is False
        assert free.has_insider_sell is False
        assert free.has_deployer_profiler is False
        assert free.has_cartel_detection is False
        assert free.has_operator_impact is False
        assert free.has_compare is False
        assert free.has_export is False
        assert free.batch_scan_max == 0
        assert free.has_api_access is False
        assert free.death_clock_full is False


class TestWhaleHasEverything:
    """WHALE tier must have all features enabled and the highest limits."""

    def test_whale_has_everything(self) -> None:
        whale = TIER_LIMITS[PlanTier.WHALE]
        assert whale.scans_per_day == math.inf
        assert whale.has_ai_chat is True
        assert whale.ai_chat_daily_limit == math.inf
        assert whale.max_watchlist == 200
        assert whale.max_briefings == 3
        assert "telegram" in whale.alert_channels
        assert "discord" in whale.alert_channels
        assert whale.has_sol_flow is True
        assert whale.has_bundle_tracker is True
        assert whale.has_insider_sell is True
        assert whale.has_deployer_profiler is True
        assert whale.has_cartel_detection is True
        assert whale.has_operator_impact is True
        assert whale.has_compare is True
        assert whale.has_export is True
        assert whale.batch_scan_max == 50
        assert whale.has_api_access is True
        assert whale.death_clock_full is True
