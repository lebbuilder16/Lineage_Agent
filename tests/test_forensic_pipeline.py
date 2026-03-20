"""Tests for the forensic pipeline DAG."""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from dataclasses import dataclass

from lineage_agent.token_identity import TokenIdentity, resolve_token_identity
from lineage_agent.forensic_pipeline import (
    ForensicReport,
    run_forensic_pipeline,
    report_to_lineage_result,
)


@pytest.fixture
def mock_identity():
    return TokenIdentity(
        mint="TestMint123",
        name="TestToken",
        symbol="TEST",
        deployer="DeployerAddr123",
        pairs=[],
    )


class TestTokenIdentity:
    def test_dataclass_defaults(self):
        ti = TokenIdentity(mint="abc")
        assert ti.mint == "abc"
        assert ti.name == ""
        assert ti.deployer == ""
        assert ti.pairs == []

    def test_dataclass_with_values(self):
        ti = TokenIdentity(
            mint="abc",
            name="Token",
            symbol="TKN",
            deployer="DEP123",
        )
        assert ti.name == "Token"
        assert ti.deployer == "DEP123"


class TestForensicReport:
    def test_defaults(self, mock_identity):
        report = ForensicReport(identity=mock_identity)
        assert report.identity.mint == "TestMint123"
        assert report.deployer_profile is None
        assert report.timings == {}

    def test_with_results(self, mock_identity):
        report = ForensicReport(
            identity=mock_identity,
            deployer_profile={"rug_rate": 0.5},
            timings={"identity": 2000},
        )
        assert report.deployer_profile["rug_rate"] == 0.5
        assert report.timings["identity"] == 2000


class TestReportToLineageResult:
    def test_none_family_tree(self, mock_identity):
        report = ForensicReport(identity=mock_identity)
        assert report_to_lineage_result(report) is None

    def test_attaches_enrichments(self, mock_identity):
        mock_lr = MagicMock()
        report = ForensicReport(
            identity=mock_identity,
            family_tree=mock_lr,
            deployer_profile={"rug_rate": 0.5},
            death_clock={"probability": 80},
        )
        result = report_to_lineage_result(report)
        assert result.deployer_profile == {"rug_rate": 0.5}
        assert result.death_clock == {"probability": 80}

    def test_attaches_all_enrichments(self, mock_identity):
        mock_lr = MagicMock()
        report = ForensicReport(
            identity=mock_identity,
            family_tree=mock_lr,
            deployer_profile={"rug_rate": 0.5},
            death_clock={"probability": 80},
            factory_rhythm={"interval": 3600},
            operator_fingerprint={"fp": "abc123"},
            cartel_report={"edges": 5},
            sol_flow={"total": 100.0},
            bundle_report={"bundles": 3},
            insider_sell={"sells": 2},
            operator_impact={"damage": 50000},
            liquidity_arch={"arch": "v-shape"},
            zombie_alert={"revived": True},
        )
        result = report_to_lineage_result(report)
        assert result.deployer_profile == {"rug_rate": 0.5}
        assert result.death_clock == {"probability": 80}
        assert result.factory_rhythm == {"interval": 3600}
        assert result.operator_fingerprint == {"fp": "abc123"}
        assert result.cartel_report == {"edges": 5}
        assert result.sol_flow == {"total": 100.0}
        assert result.bundle_report == {"bundles": 3}
        assert result.insider_sell == {"sells": 2}
        assert result.operator_impact == {"damage": 50000}
        assert result.liquidity_arch == {"arch": "v-shape"}
        assert result.zombie_alert == {"revived": True}


class TestRunForensicPipeline:
    @pytest.mark.asyncio
    async def test_yields_identity_ready_event(self):
        """Pipeline yields identity_ready event after resolving token identity."""
        mock_id = TokenIdentity(
            mint="TestMint123",
            name="TestToken",
            symbol="TEST",
            deployer="Dep123",
            pairs=[],
        )

        with patch(
            "lineage_agent.forensic_pipeline.resolve_token_identity",
            new_callable=AsyncMock,
            return_value=mock_id,
        ), patch(
            "lineage_agent.forensic_pipeline.asyncio.gather",
            new_callable=AsyncMock,
            return_value=(None, {}, {}),
        ):
            events = []
            async for evt in run_forensic_pipeline("TestMint123"):
                if isinstance(evt.get("data"), str):
                    import json
                    evt_parsed = {"event": evt["event"], "data": json.loads(evt["data"])}
                else:
                    evt_parsed = evt
                events.append(evt_parsed)

            # Check identity_ready event exists
            id_events = [e for e in events if e["event"] == "identity_ready"]
            assert len(id_events) == 1
            assert id_events[0]["data"]["name"] == "TestToken"

    @pytest.mark.asyncio
    async def test_unknown_token_stops_early(self):
        """Unknown token (no name/symbol) should stop after identity."""
        mock_id = TokenIdentity(mint="Unknown123", pairs=[])

        with patch(
            "lineage_agent.forensic_pipeline.resolve_token_identity",
            new_callable=AsyncMock,
            return_value=mock_id,
        ):
            events = []
            async for evt in run_forensic_pipeline("Unknown123"):
                events.append(evt)

            # Should have phase scan done and _report
            event_types = [e["event"] for e in events]
            assert "phase" in event_types
            assert "_report" in event_types

    @pytest.mark.asyncio
    async def test_report_contains_identity(self):
        """The _report event should contain the resolved identity."""
        mock_id = TokenIdentity(
            mint="TestMint456",
            name="",
            symbol="",
            pairs=[],
        )

        with patch(
            "lineage_agent.forensic_pipeline.resolve_token_identity",
            new_callable=AsyncMock,
            return_value=mock_id,
        ):
            report = None
            async for evt in run_forensic_pipeline("TestMint456"):
                if evt.get("event") == "_report":
                    report = evt["data"]

            assert report is not None
            assert isinstance(report, ForensicReport)
            assert report.identity.mint == "TestMint456"

    @pytest.mark.asyncio
    async def test_step_events_emitted(self):
        """Pipeline emits step events for identity phase."""
        mock_id = TokenIdentity(
            mint="TestMint789",
            name="",
            symbol="",
            pairs=[],
        )

        with patch(
            "lineage_agent.forensic_pipeline.resolve_token_identity",
            new_callable=AsyncMock,
            return_value=mock_id,
        ):
            events = []
            async for evt in run_forensic_pipeline("TestMint789"):
                if isinstance(evt.get("data"), str):
                    import json
                    evt_parsed = {"event": evt["event"], "data": json.loads(evt["data"])}
                else:
                    evt_parsed = evt
                events.append(evt_parsed)

            step_events = [
                e for e in events
                if e["event"] == "step" and e["data"].get("step") == "identity"
            ]
            assert len(step_events) == 2  # running + done
            assert step_events[0]["data"]["status"] == "running"
            assert step_events[1]["data"]["status"] == "done"
            assert "ms" in step_events[1]["data"]
