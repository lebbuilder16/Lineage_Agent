"""Tests for the unified investigation service (tier-adaptive)."""

from __future__ import annotations

import math
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch, MagicMock

import pytest

from lineage_agent.investigate_service import run_investigation, _evt
from lineage_agent.subscription_tiers import get_limits, PlanTier, TIER_LIMITS


# ── Helpers ──────────────────────────────────────────────────────────────────


def _make_lineage():
    """Minimal fake LineageResult."""
    return SimpleNamespace(
        query_token=SimpleNamespace(
            name="TestToken",
            symbol="TEST",
            mint="7dmpjtmtkRNumctHAGbTrP4MQPHjX59M54aZAbvzpump",
            deployer="DeployerAddr1234567890123456789012345",
            market_cap_usd=100_000,
            liquidity_usd=50_000,
            created_at=None,
            lifecycle_stage=SimpleNamespace(value="dex_listed"),
            launch_platform="pumpfun",
        ),
        root=None,
        deployer_profile=SimpleNamespace(
            total_tokens_launched=12,
            confirmed_rug_count=5,
            rug_rate_pct=41.7,
        ),
        cartel_report=SimpleNamespace(community_id="c-001"),
        bundle_report=None,
        sol_flow=None,
        death_clock=None,
        insider_sell=None,
        operator_fingerprint=None,
        liquidity_arch=None,
        factory_rhythm=None,
        derivatives=[],
        family_size=1,
        query_is_root=True,
        is_bonding_curve=False,
        platform=None,
        confidence=0.9,
    )


def _make_forensic_report(lineage=None):
    """Build a fake ForensicReport that mimics the pipeline output."""
    from lineage_agent.forensic_pipeline import ForensicReport
    from types import SimpleNamespace as NS

    identity = NS(
        mint="7dmpjtmtkRNumctHAGbTrP4MQPHjX59M54aZAbvzpump",
        name="TestToken",
        symbol="TEST",
        deployer="DeployerAddr1234567890123456789012345",
        created_at=None,
        pairs=[],
    )
    report = ForensicReport(identity=identity)
    report.family_tree = lineage
    report.bundle_report = None
    report.sol_flow = None
    return report


def _make_ai_result():
    """Minimal fake AI verdict dict."""
    return {
        "risk_score": 78,
        "confidence": "high",
        "rug_pattern": "classic_rug",
        "verdict_summary": "High risk token with rug indicators.",
        "key_findings": ["Bundle detected", "Deployer exit"],
        "conviction_chain": ["A→B→C"],
    }


MINT = "7dmpjtmtkRNumctHAGbTrP4MQPHjX59M54aZAbvzpump"


async def _collect_events(gen) -> list[dict]:
    """Collect all events from an async generator."""
    events = []
    async for event in gen:
        events.append(event)
    return events


def _event_types(events: list[dict]) -> list[str]:
    """Extract event type strings."""
    return [e["event"] for e in events]


def _fake_pipeline_gen(report):
    """Create a fake run_forensic_pipeline async generator."""
    async def _fake_pipeline(mint, **kw):
        yield _evt("phase", {"phase": "scan", "status": "started"})
        yield _evt("step", {"step": "identity", "status": "done", "ms": 100})
        yield _evt("phase", {"phase": "scan", "status": "done"})
        yield {"event": "_report", "data": report}
    return _fake_pipeline


# ── Test: evt helper ─────────────────────────────────────────────────────────


class TestEvtHelper:
    def test_evt_produces_valid_sse_dict(self):
        result = _evt("step", {"step": "lineage", "status": "running"})
        assert result["event"] == "step"
        assert '"lineage"' in result["data"]


# ── Test: Free tier ──────────────────────────────────────────────────────────


class TestFreeTier:
    @pytest.mark.asyncio
    @patch("lineage_agent.forensic_pipeline.run_forensic_pipeline")
    async def test_free_gets_heuristic_only(self, mock_pipeline):
        """Free tier: scan steps + heuristic_complete, NO AI."""
        lineage = _make_lineage()
        report = _make_forensic_report(lineage)
        mock_pipeline.side_effect = _fake_pipeline_gen(report)

        tier = get_limits(PlanTier.FREE.value)
        events = await _collect_events(run_investigation(MINT, tier=tier, cache=None))

        types = _event_types(events)
        assert "heuristic_complete" in types
        assert "verdict" not in types
        assert "thinking" not in types
        # Done event present
        done_events = [e for e in events if e["event"] == "done"]
        assert len(done_events) == 1

    @pytest.mark.asyncio
    @patch("lineage_agent.forensic_pipeline.run_forensic_pipeline")
    async def test_free_done_has_chat_false(self, mock_pipeline):
        """Free tier done event must have chat_available=False."""
        report = _make_forensic_report(None)
        mock_pipeline.side_effect = _fake_pipeline_gen(report)

        tier = get_limits(PlanTier.FREE.value)
        events = await _collect_events(run_investigation(MINT, tier=tier, cache=None))

        done = next(e for e in events if e["event"] == "done")
        import json
        done_data = json.loads(done["data"])
        assert done_data["chat_available"] is False


# ── Test: Pro tier ───────────────────────────────────────────────────────────


class TestProTier:
    @pytest.mark.asyncio
    @patch("lineage_agent.forensic_pipeline.run_forensic_pipeline")
    async def test_pro_gets_ai_verdict(self, mock_pipeline):
        """Pro tier: scan + AI verdict (single-shot), no agent reasoning."""
        lineage = _make_lineage()
        report = _make_forensic_report(lineage)
        ai_result = _make_ai_result()
        mock_pipeline.side_effect = _fake_pipeline_gen(report)

        tier = get_limits(PlanTier.PRO.value)
        with patch("lineage_agent.investigate_service.asyncio.wait_for", new_callable=AsyncMock, return_value=ai_result):
            events = await _collect_events(run_investigation(MINT, tier=tier, cache=None))

        types = _event_types(events)
        assert "verdict" in types
        assert "thinking" not in types  # No agent reasoning
        assert "tool_call" not in types

    @pytest.mark.asyncio
    @patch("lineage_agent.forensic_pipeline.run_forensic_pipeline")
    async def test_pro_done_has_chat_true(self, mock_pipeline):
        """Pro tier done event must have chat_available=True."""
        ai_result = _make_ai_result()
        report = _make_forensic_report(None)
        mock_pipeline.side_effect = _fake_pipeline_gen(report)

        tier = get_limits(PlanTier.PRO.value)
        with patch("lineage_agent.investigate_service.asyncio.wait_for", new_callable=AsyncMock, return_value=ai_result):
            events = await _collect_events(run_investigation(MINT, tier=tier, cache=None))

        done = next(e for e in events if e["event"] == "done")
        import json
        done_data = json.loads(done["data"])
        assert done_data["chat_available"] is True


# ── Test: Pro+ tier ──────────────────────────────────────────────────────────


class TestProPlusTier:
    @pytest.mark.asyncio
    @patch("lineage_agent.forensic_pipeline.run_forensic_pipeline")
    async def test_pro_plus_uses_agent(self, mock_pipeline):
        """Pro+ tier: scan + full agent reasoning + verdict."""
        lineage = _make_lineage()
        report = _make_forensic_report(lineage)
        mock_pipeline.side_effect = _fake_pipeline_gen(report)

        verdict = _make_ai_result()

        async def _fake_agent(mint, cache, pre_scan=None, is_disconnected=None, session_id=None):
            yield {"event": "thinking", "data": {"turn": 1, "text": "Scanning..."}}
            yield {"event": "tool_call", "data": {"turn": 1, "tool": "scan_token", "input": {"mint": mint}, "call_id": "c1"}}
            yield {"event": "tool_result", "data": {"turn": 1, "tool": "scan_token", "call_id": "c1", "result": {}, "error": None, "duration_ms": 500}}
            yield {"event": "done", "data": {"verdict": verdict, "turns_used": 2, "tokens_used": 5000}}

        tier = get_limits(PlanTier.PRO_PLUS.value)
        with patch("lineage_agent.agent_service.run_agent", side_effect=_fake_agent):
            events = await _collect_events(run_investigation(MINT, tier=tier, cache=None))

        types = _event_types(events)
        assert "thinking" in types
        assert "tool_call" in types
        assert "tool_result" in types
        assert "verdict" in types
        # Agent phase markers
        phase_events = [e for e in events if e["event"] == "phase"]
        phase_phases = [e["data"] for e in phase_events]
        # Should have agent phase start/done
        assert any('"agent"' in p and '"started"' in p for p in phase_phases)
        assert any('"agent"' in p and '"done"' in p for p in phase_phases)


# ── Test: Error surfacing ────────────────────────────────────────────────────


class TestErrorSurfacing:
    @pytest.mark.asyncio
    @patch("lineage_agent.forensic_pipeline.run_forensic_pipeline")
    async def test_ai_timeout_surfaces_error(self, mock_pipeline):
        """AI timeout must surface an error event, not fail silently."""
        import asyncio

        report = _make_forensic_report(None)
        mock_pipeline.side_effect = _fake_pipeline_gen(report)

        tier = get_limits(PlanTier.PRO.value)
        with patch("lineage_agent.investigate_service.asyncio.wait_for", new_callable=AsyncMock, side_effect=asyncio.TimeoutError):
            events = await _collect_events(run_investigation(MINT, tier=tier, cache=None))

        types = _event_types(events)
        assert "error" in types
        error_event = next(e for e in events if e["event"] == "error")
        import json
        error_data = json.loads(error_event["data"])
        assert "timed out" in error_data["detail"].lower()

    @pytest.mark.asyncio
    @patch("lineage_agent.forensic_pipeline.run_forensic_pipeline")
    async def test_agent_exception_surfaces_error(self, mock_pipeline):
        """Agent exception must surface, not swallow."""
        lineage = _make_lineage()
        report = _make_forensic_report(lineage)
        mock_pipeline.side_effect = _fake_pipeline_gen(report)

        async def _failing_agent(mint, cache, pre_scan=None, is_disconnected=None, session_id=None):
            raise RuntimeError("Claude API down")
            yield  # make it a generator  # noqa: E501

        tier = get_limits(PlanTier.PRO_PLUS.value)
        with patch("lineage_agent.agent_service.run_agent", side_effect=_failing_agent):
            events = await _collect_events(run_investigation(MINT, tier=tier, cache=None))

        types = _event_types(events)
        assert "error" in types


# ── Test: Subscription tiers new fields ──────────────────────────────────────


class TestTierNewFields:
    def test_free_has_no_ai_verdict(self):
        tier = get_limits("free")
        assert tier.has_ai_verdict is False
        assert tier.investigate_daily_limit == 5
        assert tier.investigate_chat_daily_limit == 0

    def test_pro_has_ai_verdict_no_agent(self):
        tier = get_limits("pro")
        assert tier.has_ai_verdict is True
        assert tier.has_agent is False
        assert tier.investigate_chat_daily_limit == 20

    def test_pro_plus_has_agent_and_verdict(self):
        tier = get_limits("pro_plus")
        assert tier.has_ai_verdict is True
        assert tier.has_agent is True
        assert tier.investigate_daily_limit == math.inf
        assert tier.investigate_chat_daily_limit == math.inf

    def test_whale_all_unlimited(self):
        tier = get_limits("whale")
        assert tier.has_ai_verdict is True
        assert tier.has_agent is True
        assert tier.agent_daily_limit == math.inf
        assert tier.investigate_daily_limit == math.inf

    def test_unknown_plan_falls_back_to_free(self):
        tier = get_limits("unknown_garbage")
        assert tier.has_ai_verdict is False
        assert tier.has_agent is False

    def test_old_fields_preserved(self):
        """Backward compat: has_agent and agent_daily_limit still work."""
        tier = get_limits("pro_plus")
        assert tier.has_agent is True
        assert tier.agent_daily_limit == 10
