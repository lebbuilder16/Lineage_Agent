"""Tests for rug_response_service.handle_rug_event."""
from __future__ import annotations

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from lineage_agent.rug_response_service import handle_rug_event


@pytest.fixture
def base_alert():
    return {"title": "Rug detected", "mint": "So1abc", "body": "Token rugged"}


@pytest.mark.asyncio
async def test_handle_rug_event_with_lineage(base_alert):
    """When lineage data is available, enriched fields are populated."""
    deployer_profile = SimpleNamespace(rug_rate_pct=85.0, total_tokens_launched=12)
    community = SimpleNamespace(community_id="cartel_42", member_count=7)
    cartel_report = SimpleNamespace(deployer_community=community)
    sol_flow = SimpleNamespace(total_extracted_sol=150.5, hop_count=3)
    lineage = SimpleNamespace(
        deployer_profile=deployer_profile,
        cartel_report=cartel_report,
        sol_flow=sol_flow,
    )

    with patch(
        "lineage_agent.rug_response_service.get_cached_lineage_report",
        new_callable=AsyncMock,
        return_value=lineage,
    ), patch(
        "lineage_agent.rug_response_service.detect_lineage",
        new_callable=AsyncMock,
    ), patch(
        "lineage_agent.rug_response_service._get_client",
        side_effect=Exception("no API key"),
    ):
        result = await handle_rug_event("So1abc", base_alert, cache=None)

    assert result["deployer_rug_rate"] == 85.0
    assert result["deployer_total_tokens"] == 12
    assert result["cartel_id"] == "cartel_42"
    assert result["cartel_members"] == 7
    assert result["sol_extracted"] == 150.5
    assert result["extraction_hops"] == 3
    # AI summary should be None since we forced an exception
    assert result["ai_summary"] is None
    # Original alert fields preserved
    assert result["title"] == "Rug detected"


@pytest.mark.asyncio
async def test_handle_rug_event_no_lineage(base_alert):
    """When lineage is unavailable, the original alert is returned unchanged (plus ai_summary attempt)."""
    with patch(
        "lineage_agent.rug_response_service.get_cached_lineage_report",
        new_callable=AsyncMock,
        return_value=None,
    ), patch(
        "lineage_agent.rug_response_service.detect_lineage",
        new_callable=AsyncMock,
        side_effect=Exception("timeout"),
    ), patch(
        "lineage_agent.rug_response_service._get_client",
        side_effect=Exception("no API key"),
    ):
        result = await handle_rug_event("So1abc", base_alert, cache=None)

    # Should still have original fields
    assert result["title"] == "Rug detected"
    assert result["mint"] == "So1abc"
    # No enrichment fields added
    assert "deployer_rug_rate" not in result
    assert "cartel_id" not in result
