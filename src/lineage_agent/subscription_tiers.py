"""Subscription tier definitions — single source of truth.

Every gate, limit, and feature flag for the Lineage Agent subscription
system is derived from the constants in this module.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from enum import Enum
from typing import Dict, List


# ---------------------------------------------------------------------------
# Tier enum
# ---------------------------------------------------------------------------

class PlanTier(str, Enum):
    FREE = "free"
    PRO = "pro"
    PRO_PLUS = "pro_plus"
    WHALE = "whale"


# ---------------------------------------------------------------------------
# Tier ordering (lowest to highest)
# ---------------------------------------------------------------------------

TIER_ORDER: List[PlanTier] = [
    PlanTier.FREE,
    PlanTier.PRO,
    PlanTier.PRO_PLUS,
    PlanTier.WHALE,
]


# ---------------------------------------------------------------------------
# Limits dataclass
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class TierLimits:
    # Scanning
    scans_per_day: float          # math.inf for unlimited
    history_days: int

    # AI chat
    has_ai_chat: bool
    ai_chat_model: str            # "" when disabled
    ai_chat_daily_limit: float    # math.inf for unlimited, 0 when disabled

    # Watchlist & briefings
    max_watchlist: int
    max_briefings: int

    # Alert channels
    alert_channels: List[str]

    # Feature flags — forensic modules
    has_sol_flow: bool
    has_bundle_tracker: bool
    has_insider_sell: bool
    has_deployer_profiler: bool
    has_cartel_detection: bool
    has_operator_impact: bool
    has_compare: bool

    # Export / batch / API
    has_export: bool
    batch_scan_max: int
    has_api_access: bool

    # Death-clock
    death_clock_full: bool

    # Agent investigation
    has_agent: bool
    agent_daily_limit: float      # math.inf for unlimited, 0 when disabled


# ---------------------------------------------------------------------------
# Tier definitions
# ---------------------------------------------------------------------------

TIER_LIMITS: Dict[PlanTier, TierLimits] = {
    PlanTier.FREE: TierLimits(
        scans_per_day=5,
        history_days=7,
        has_ai_chat=False,
        ai_chat_model="",
        ai_chat_daily_limit=0,
        max_watchlist=0,
        max_briefings=0,
        alert_channels=["in_app"],
        has_sol_flow=False,
        has_bundle_tracker=False,
        has_insider_sell=False,
        has_deployer_profiler=False,
        has_cartel_detection=False,
        has_operator_impact=False,
        has_compare=False,
        has_export=False,
        batch_scan_max=0,
        has_api_access=False,
        death_clock_full=False,
        has_agent=False,
        agent_daily_limit=0,
    ),
    PlanTier.PRO: TierLimits(
        scans_per_day=math.inf,
        history_days=30,
        has_ai_chat=True,
        ai_chat_model="haiku",
        ai_chat_daily_limit=20,
        max_watchlist=10,
        max_briefings=1,
        alert_channels=["in_app"],
        has_sol_flow=True,
        has_bundle_tracker=True,
        has_insider_sell=True,
        has_deployer_profiler=True,
        has_cartel_detection=False,
        has_operator_impact=False,
        has_compare=False,
        has_export=False,
        batch_scan_max=0,
        has_api_access=False,
        death_clock_full=True,
        has_agent=False,
        agent_daily_limit=0,
    ),
    PlanTier.PRO_PLUS: TierLimits(
        scans_per_day=math.inf,
        history_days=90,
        has_ai_chat=True,
        ai_chat_model="sonnet",
        ai_chat_daily_limit=math.inf,
        max_watchlist=50,
        max_briefings=1,
        alert_channels=["in_app", "telegram", "discord"],
        has_sol_flow=True,
        has_bundle_tracker=True,
        has_insider_sell=True,
        has_deployer_profiler=True,
        has_cartel_detection=True,
        has_operator_impact=True,
        has_compare=True,
        has_export=True,
        batch_scan_max=0,
        has_api_access=False,
        death_clock_full=True,
        has_agent=True,
        agent_daily_limit=10,
    ),
    PlanTier.WHALE: TierLimits(
        scans_per_day=math.inf,
        history_days=math.inf,
        has_ai_chat=True,
        ai_chat_model="sonnet",
        ai_chat_daily_limit=math.inf,
        max_watchlist=200,
        max_briefings=3,
        alert_channels=["in_app", "telegram", "discord"],
        has_sol_flow=True,
        has_bundle_tracker=True,
        has_insider_sell=True,
        has_deployer_profiler=True,
        has_cartel_detection=True,
        has_operator_impact=True,
        has_compare=True,
        has_export=True,
        batch_scan_max=50,
        has_api_access=True,
        death_clock_full=True,
        has_agent=True,
        agent_daily_limit=math.inf,
    ),
}


# ---------------------------------------------------------------------------
# Public helper
# ---------------------------------------------------------------------------

def get_limits(plan: str) -> TierLimits:
    """Return the ``TierLimits`` for *plan*.

    Accepts either the ``PlanTier`` enum value string (e.g. ``"pro_plus"``)
    or the enum member itself.  Falls back to ``FREE`` for any unrecognised
    value.
    """
    try:
        tier = PlanTier(plan) if not isinstance(plan, PlanTier) else plan
    except ValueError:
        tier = PlanTier.FREE
    return TIER_LIMITS[tier]
