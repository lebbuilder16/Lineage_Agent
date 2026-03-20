"""Tests for agent pre-injection of scan artefacts."""
import pytest
import json
from unittest.mock import AsyncMock, patch, MagicMock

from lineage_agent.agent_service import (
    _build_agent_system_prompt,
    _summarize_scan_for_agent,
)


class TestBuildAgentSystemPrompt:
    def test_without_scan_summary(self):
        """Without pre-scan, prompt tells agent to call scan_token FIRST."""
        prompt = _build_agent_system_prompt(50)
        assert "scan_token FIRST" in prompt
        assert "Pre-collected" not in prompt

    def test_with_scan_summary(self):
        """With pre-scan, prompt includes data and tells agent NOT to scan."""
        scan_data = {
            "token": {"name": "TestToken", "symbol": "TEST"},
            "heuristic_score": 75,
            "flags": ["DEATH_CLOCK_HIGH_RISK"],
        }
        prompt = _build_agent_system_prompt(75, scan_summary=scan_data)
        assert "Pre-collected Forensic Data" in prompt
        assert "TestToken" in prompt
        assert "Do NOT call scan_token" in prompt
        assert "scan_token FIRST" not in prompt

    def test_scan_summary_truncated(self):
        """Large scan summaries are truncated to 6000 chars."""
        huge_scan = {"data": "x" * 10000}
        prompt = _build_agent_system_prompt(50, scan_summary=huge_scan)
        # The JSON dump in the prompt should be truncated
        assert len(prompt) < 15000  # reasonable bound


class TestSummarizeScanForAgent:
    def test_minimal_lineage(self):
        """Handles a minimal lineage result without crashing."""
        mock_lineage = MagicMock()
        mock_lineage.query_token = MagicMock()
        mock_lineage.query_token.name = "Test"
        mock_lineage.query_token.symbol = "TST"
        mock_lineage.query_token.mint = "abc123"
        mock_lineage.query_token.deployer = "dep456"
        mock_lineage.query_token.market_cap_usd = 1000.0
        mock_lineage.query_token.liquidity_usd = 500.0
        mock_lineage.query_token.created_at = None
        mock_lineage.query_token.lifecycle_stage = MagicMock(value="dex_listed")
        mock_lineage.query_token.launch_platform = "pumpfun"
        mock_lineage.death_clock = None
        mock_lineage.bundle_report = None
        mock_lineage.insider_sell = None
        mock_lineage.deployer_profile = None
        mock_lineage.operator_fingerprint = None
        mock_lineage.sol_flow = None
        mock_lineage.cartel_report = None
        mock_lineage.liquidity_arch = None
        mock_lineage.factory_rhythm = None
        mock_lineage.family_size = 1
        mock_lineage.confidence = 0.9

        result = _summarize_scan_for_agent(mock_lineage)
        assert result["token"]["name"] == "Test"
        assert result["token"]["symbol"] == "TST"
        assert isinstance(result["flags"], list)
