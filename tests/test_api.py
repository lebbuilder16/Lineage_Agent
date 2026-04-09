"""Integration tests for the FastAPI REST API.

These tests use FastAPI's TestClient with mocked external services
(DexScreener + Solana RPC) so they don't require network access.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient, ASGITransport
from starlette.testclient import TestClient

from lineage_agent.api import app
from lineage_agent.models import LineageResult, TokenMetadata, TokenSearchResult

_WS_MINT = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


# ------------------------------------------------------------------
# Health endpoint
# ------------------------------------------------------------------


@pytest.mark.anyio
async def test_health(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert "uptime_seconds" in body


@pytest.mark.anyio
async def test_admin_health(client):
    resp = await client.get("/admin/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert "uptime_seconds" in body
    assert "circuit_breakers" in body
    assert "dexscreener" in body["circuit_breakers"]
    assert "solana_rpc" in body["circuit_breakers"]
    assert "jupiter" in body["circuit_breakers"]


# ------------------------------------------------------------------
# Root redirect
# ------------------------------------------------------------------


@pytest.mark.anyio
async def test_root_redirects(client):
    resp = await client.get("/", follow_redirects=False)
    assert resp.status_code == 307
    assert "/docs" in resp.headers.get("location", "")


# ------------------------------------------------------------------
# Lineage endpoint
# ------------------------------------------------------------------


@pytest.mark.anyio
async def test_lineage_invalid_mint(client):
    # Too short
    resp = await client.get("/lineage", params={"mint": "short"})
    assert resp.status_code == 400
    assert "base58" in resp.json()["detail"].lower()


@pytest.mark.anyio
async def test_lineage_invalid_mint_non_base58(client):
    """Non-base58 chars (0, O, I, l) should be rejected."""
    resp = await client.get(
        "/lineage",
        params={"mint": "0OIl" + "A" * 40},  # contains invalid base58 chars
    )
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_lineage_success(client):
    fake_result = LineageResult(
        mint="DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
        query_token=TokenMetadata(
            mint="DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
            name="Bonk",
            symbol="BONK",
        ),
        root=TokenMetadata(
            mint="DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
            name="Bonk",
            symbol="BONK",
        ),
        confidence=0.85,
        derivatives=[],
        family_size=1,
    )

    with patch(
        "lineage_agent.api.detect_lineage",
        new_callable=AsyncMock,
        return_value=fake_result,
    ):
        resp = await client.get(
            "/lineage",
            params={
                "mint": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"
            },
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["confidence"] == 0.85
    assert data["root"]["name"] == "Bonk"


@pytest.mark.anyio
async def test_lineage_internal_error(client):
    with patch(
        "lineage_agent.api.detect_lineage",
        new_callable=AsyncMock,
        side_effect=RuntimeError("boom"),
    ):
        resp = await client.get(
            "/lineage",
            params={
                "mint": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"
            },
        )
    assert resp.status_code == 500
    # Internal error details should NOT leak to the client
    assert resp.json()["detail"] == "Internal server error"
    assert "boom" not in resp.json()["detail"]


# ------------------------------------------------------------------
# Search endpoint
# ------------------------------------------------------------------


@pytest.mark.anyio
async def test_search_empty_query(client):
    resp = await client.get("/search", params={"q": ""})
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_search_success(client):
    fake_results = [
        TokenSearchResult(
            mint="MINT_A",
            name="BonkInu",
            symbol="BINU",
        ),
    ]

    with patch(
        "lineage_agent.api.search_tokens",
        new_callable=AsyncMock,
        return_value=fake_results,
    ):
        resp = await client.get("/search", params={"q": "bonk"})
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["name"] == "BonkInu"


@pytest.mark.anyio
async def test_search_query_too_long(client):
    """Query strings over 100 chars should be rejected."""
    resp = await client.get("/search", params={"q": "x" * 101})
    assert resp.status_code == 400
    assert "100" in resp.json()["detail"]


@pytest.mark.anyio
async def test_search_pagination(client):
    """Limit and offset params should slice the result set."""
    fake_results = [
        TokenSearchResult(mint=f"MINT_{i}", name=f"Token{i}", symbol=f"T{i}")
        for i in range(10)
    ]

    with patch(
        "lineage_agent.api.search_tokens",
        new_callable=AsyncMock,
        return_value=fake_results,
    ):
        # offset=3, limit=2 → items 3 and 4
        resp = await client.get("/search", params={"q": "tok", "limit": 2, "offset": 3})
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    assert data[0]["name"] == "Token3"
    assert data[1]["name"] == "Token4"


@pytest.mark.anyio
async def test_search_pagination_defaults(client):
    """Default limit=20, offset=0."""
    fake_results = [
        TokenSearchResult(mint=f"M{i}", name=f"T{i}", symbol=f"S{i}")
        for i in range(25)
    ]

    with patch(
        "lineage_agent.api.search_tokens",
        new_callable=AsyncMock,
        return_value=fake_results,
    ):
        resp = await client.get("/search", params={"q": "test"})
    assert resp.status_code == 200
    assert len(resp.json()) == 20  # default limit


# ------------------------------------------------------------------
# POST /lineage/batch
# ------------------------------------------------------------------

_MINT_A = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"
_MINT_B = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"


@pytest.mark.anyio
async def test_batch_lineage_success(client):
    """Batch endpoint returns results for each mint."""

    async def _mock_detect(mint):
        return LineageResult(
            mint=mint,
            root=TokenMetadata(mint=mint, name=mint[:4]),
            confidence=0.9,
            derivatives=[],
            family_size=1,
        )

    with patch(
        "lineage_agent.api.detect_lineage",
        new_callable=AsyncMock,
        side_effect=_mock_detect,
    ):
        resp = await client.post("/lineage/batch", json={"mints": [_MINT_A, _MINT_B]})
    assert resp.status_code == 200
    data = resp.json()
    assert _MINT_A in data["results"]
    assert _MINT_B in data["results"]


@pytest.mark.anyio
async def test_batch_lineage_invalid_mint(client):
    """Invalid mint in batch should return 400."""
    resp = await client.post("/lineage/batch", json={"mints": ["0OIlBad"]})
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_batch_lineage_empty(client):
    """Empty mints array should be rejected by Pydantic."""
    resp = await client.post("/lineage/batch", json={"mints": []})
    assert resp.status_code == 422


@pytest.mark.anyio
async def test_batch_lineage_too_many(client):
    """More than 10 mints should be rejected."""
    mints = [_MINT_A] * 11
    resp = await client.post("/lineage/batch", json={"mints": mints})
    assert resp.status_code == 422


@pytest.mark.anyio
async def test_batch_lineage_partial_failure(client):
    """When one mint fails, others should still succeed."""
    call_count = 0

    async def _mock_detect(mint):
        nonlocal call_count
        call_count += 1
        if mint == _MINT_B:
            raise RuntimeError("RPC down")
        return LineageResult(
            mint=mint,
            root=TokenMetadata(mint=mint, name="OK"),
            confidence=1.0,
            derivatives=[],
            family_size=1,
        )

    with patch(
        "lineage_agent.api.detect_lineage",
        new_callable=AsyncMock,
        side_effect=_mock_detect,
    ):
        resp = await client.post("/lineage/batch", json={"mints": [_MINT_A, _MINT_B]})
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data["results"][_MINT_A], dict)
    assert data["results"][_MINT_B] == "Internal server error"


# ------------------------------------------------------------------
# WebSocket /ws/lineage
# ------------------------------------------------------------------


def test_ws_lineage_success():
    """WebSocket should stream progress then deliver result."""
    fake = LineageResult(
        mint=_WS_MINT,
        root=TokenMetadata(mint=_WS_MINT, name="Root"),
        confidence=0.95,
        derivatives=[],
        family_size=1,
    )

    with patch(
        "lineage_agent.api.detect_lineage",
        new_callable=AsyncMock,
        return_value=fake,
    ):
        sync_client = TestClient(app)
        with sync_client.websocket_connect("/ws/lineage") as ws:
            ws.send_json({"mint": _WS_MINT})
            msgs = []
            while True:
                msg = ws.receive_json()
                msgs.append(msg)
                if msg.get("done"):
                    break
    # At least: start progress + metadata progress + complete + done
    assert len(msgs) >= 2
    assert msgs[-1]["done"] is True
    assert msgs[-1]["result"]["mint"] == _WS_MINT


def test_ws_lineage_invalid_mint():
    """WebSocket should reject invalid mints gracefully."""
    sync_client = TestClient(app)
    with sync_client.websocket_connect("/ws/lineage") as ws:
        ws.send_json({"mint": "0OIlBAD"})
        msg = ws.receive_json()
    assert msg["done"] is True
    assert "Invalid" in msg["error"]


def test_ws_lineage_error():
    """WebSocket should send error on detect_lineage failure."""
    with patch(
        "lineage_agent.api.detect_lineage",
        new_callable=AsyncMock,
        side_effect=RuntimeError("boom"),
    ):
        sync_client = TestClient(app)
        with sync_client.websocket_connect("/ws/lineage") as ws:
            ws.send_json({"mint": _WS_MINT})
            msgs = []
            while True:
                msg = ws.receive_json()
                msgs.append(msg)
                if msg.get("done"):
                    break
    assert msgs[-1]["done"] is True
    assert "error" in msgs[-1]


# ------------------------------------------------------------------
# WebSocket: force_refresh flag + scanned_at (stale-cache fix)
# ------------------------------------------------------------------

def test_ws_lineage_force_refresh_passed_to_detect_lineage():
    """WS handler must read force_refresh from the JSON payload and
    forward it to detect_lineage as force_refresh=True."""
    from datetime import datetime, timezone
    from lineage_agent.models import LineageResult, TokenMetadata

    fake_result = LineageResult(
        mint=_WS_MINT,
        query_token=TokenMetadata(mint=_WS_MINT, name="T", symbol="T"),
        root=TokenMetadata(mint=_WS_MINT, name="T", symbol="T"),
        confidence=1.0,
        derivatives=[],
        family_size=1,
        scanned_at=datetime.now(timezone.utc),
    )
    mock_detect = AsyncMock(return_value=fake_result)

    with patch("lineage_agent.api.detect_lineage", mock_detect):
        sync_client = TestClient(app)
        with sync_client.websocket_connect("/ws/lineage") as ws:
            ws.send_json({"mint": _WS_MINT, "force_refresh": True})
            msgs = []
            while True:
                msg = ws.receive_json()
                msgs.append(msg)
                if msg.get("done"):
                    break

    assert msgs[-1]["done"] is True
    assert "result" in msgs[-1]
    # detect_lineage must have been called with force_refresh=True
    mock_detect.assert_called_once()
    _, kwargs = mock_detect.call_args
    assert kwargs.get("force_refresh") is True


def test_ws_lineage_no_force_refresh_defaults_false():
    """When force_refresh is omitted from the payload, defaults to False."""
    from datetime import datetime, timezone
    from lineage_agent.models import LineageResult, TokenMetadata

    fake_result = LineageResult(
        mint=_WS_MINT,
        query_token=TokenMetadata(mint=_WS_MINT, name="T", symbol="T"),
        root=TokenMetadata(mint=_WS_MINT, name="T", symbol="T"),
        confidence=1.0,
        derivatives=[],
        family_size=1,
        scanned_at=datetime.now(timezone.utc),
    )
    mock_detect = AsyncMock(return_value=fake_result)

    with patch("lineage_agent.api.detect_lineage", mock_detect):
        sync_client = TestClient(app)
        with sync_client.websocket_connect("/ws/lineage") as ws:
            ws.send_json({"mint": _WS_MINT})  # no force_refresh key
            msgs = []
            while True:
                msg = ws.receive_json()
                msgs.append(msg)
                if msg.get("done"):
                    break

    mock_detect.assert_called_once()
    _, kwargs = mock_detect.call_args
    assert kwargs.get("force_refresh") is False


def test_ws_lineage_result_contains_scanned_at():
    """The final WS result message exposes scanned_at when set."""
    from datetime import datetime, timezone
    from lineage_agent.models import LineageResult, TokenMetadata

    stamp = datetime(2026, 3, 7, 12, 0, 0, tzinfo=timezone.utc)
    fake_result = LineageResult(
        mint=_WS_MINT,
        query_token=TokenMetadata(mint=_WS_MINT, name="T", symbol="T"),
        root=TokenMetadata(mint=_WS_MINT, name="T", symbol="T"),
        confidence=1.0,
        derivatives=[],
        family_size=1,
        scanned_at=stamp,
    )

    with patch("lineage_agent.api.detect_lineage", new_callable=AsyncMock, return_value=fake_result):
        sync_client = TestClient(app)
        with sync_client.websocket_connect("/ws/lineage") as ws:
            ws.send_json({"mint": _WS_MINT})
            msgs = []
            while True:
                msg = ws.receive_json()
                msgs.append(msg)
                if msg.get("done"):
                    break

    final = msgs[-1]
    assert final["done"] is True
    assert "result" in final
    # scanned_at must be present and parseable as ISO-8601
    scanned_at_str = final["result"].get("scanned_at")
    assert scanned_at_str is not None
    assert "2026-03-07" in scanned_at_str


@pytest.mark.anyio
async def test_analyze_force_refresh_is_forwarded_to_detect_lineage(client):
    fake_lineage = LineageResult(
        mint=_WS_MINT,
        query_token=TokenMetadata(mint=_WS_MINT, name="Token", symbol="TKN"),
        root=TokenMetadata(mint=_WS_MINT, name="Token", symbol="TKN"),
        confidence=0.9,
        derivatives=[],
        family_size=1,
    )
    mock_detect = AsyncMock(return_value=fake_lineage)

    with patch("lineage_agent.api.detect_lineage", mock_detect), patch(
        "lineage_agent.api.get_sol_flow_report",
        new_callable=AsyncMock,
        return_value=None,
    ), patch(
        "lineage_agent.bundle_tracker_service.get_cached_bundle_report",
        new_callable=AsyncMock,
        return_value=None,
    ), patch(
        "lineage_agent.ai_analyst.analyze_token",
        new_callable=AsyncMock,
        return_value={"risk_score": 12, "confidence": "low", "key_findings": []},
    ), patch(
        "lineage_agent.ai_analyst._build_unified_response",
        return_value={"mint": _WS_MINT, "risk_score": 12},
    ):
        resp = await client.get(f"/analyze/{_WS_MINT}", params={"force_refresh": True})

    assert resp.status_code == 200
    _, kwargs = mock_detect.call_args
    assert kwargs.get("force_refresh") is True


@pytest.mark.anyio
async def test_analyze_force_refresh_recomputes_bundle_and_sol_flow(client):
    fake_lineage = LineageResult(
        mint=_WS_MINT,
        query_token=TokenMetadata(
            mint=_WS_MINT,
            name="Token",
            symbol="TKN",
            deployer="D" * 44,
            launch_platform="moonshot",
            lifecycle_stage="migration_pending",
            market_surface="conflicting",
        ),
        root=TokenMetadata(mint=_WS_MINT, name="Token", symbol="TKN", deployer="D" * 44),
        confidence=0.9,
        derivatives=[],
        family_size=1,
    )
    fake_bundle = MagicMock()
    fake_bundle.overall_verdict = "confirmed_team_extraction"
    fake_bundle.confirmed_team_wallets = ["W" * 44]
    fake_bundle.suspected_team_wallets = []
    fake_bundle.coordinated_dump_wallets = []
    fake_sol = MagicMock()

    with patch("lineage_agent.api.detect_lineage", new_callable=AsyncMock, return_value=fake_lineage) as mock_detect, patch(
        "lineage_agent.api._load_analyze_supporting_reports",
        new_callable=AsyncMock,
        return_value=(fake_bundle, fake_sol),
    ) as mock_support, patch(
        "lineage_agent.ai_analyst.analyze_token",
        new_callable=AsyncMock,
        return_value={"risk_score": 12, "confidence": "low", "key_findings": []},
    ), patch(
        "lineage_agent.ai_analyst._build_unified_response",
        return_value={"mint": _WS_MINT, "risk_score": 12},
    ):
        resp = await client.get(f"/analyze/{_WS_MINT}", params={"force_refresh": True})

    assert resp.status_code == 200
    mock_detect.assert_awaited_once()
    mock_support.assert_awaited_once()
    support_args, support_kwargs = mock_support.call_args
    assert support_args[0] == _WS_MINT
    assert support_kwargs["force_refresh"] is True


@pytest.mark.anyio
async def test_purge_legacy_forensic_cache_namespaces_uses_prefix_deletes():
    with patch(
        "lineage_agent.api.cache_delete_prefix",
        new=AsyncMock(side_effect=[2, 3]),
    ) as mock_delete:
        from lineage_agent.api import _purge_legacy_forensic_cache_namespaces
        await _purge_legacy_forensic_cache_namespaces()

    assert mock_delete.await_args_list[0].args[0] == "ai:v3:"
    assert mock_delete.await_args_list[1].args[0] == "lineage:v4:"


# ------------------------------------------------------------------
# /deployer/{address}
# ------------------------------------------------------------------

_VALID_ADDR = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"


@pytest.mark.anyio
async def test_deployer_invalid_address(client):
    resp = await client.get("/deployer/short")
    assert resp.status_code == 400
    assert "Invalid Solana address" in resp.json()["detail"]


@pytest.mark.anyio
async def test_deployer_not_found_returns_404(client):
    with patch(
        "lineage_agent.api.compute_deployer_profile",
        new_callable=AsyncMock,
        return_value=None,
    ):
        resp = await client.get(f"/deployer/{_VALID_ADDR}")
    assert resp.status_code == 404


@pytest.mark.anyio
async def test_deployer_internal_error_returns_500(client):
    with patch(
        "lineage_agent.api.compute_deployer_profile",
        new_callable=AsyncMock,
        side_effect=RuntimeError("db error"),
    ):
        resp = await client.get(f"/deployer/{_VALID_ADDR}")
    assert resp.status_code == 500


# ------------------------------------------------------------------
# /operator/{fingerprint}
# ------------------------------------------------------------------

@pytest.mark.anyio
async def test_operator_invalid_fingerprint_returns_400(client):
    resp = await client.get("/operator/NOTAHEX")
    assert resp.status_code == 400
    assert "fingerprint" in resp.json()["detail"].lower()


@pytest.mark.anyio
async def test_operator_not_found_returns_404(client):
    with patch(
        "lineage_agent.api.operator_mapping_query",
        new_callable=AsyncMock,
        return_value=[],
    ):
        resp = await client.get("/operator/abcdef1234567890")
    assert resp.status_code == 404


# ------------------------------------------------------------------
# /lineage/{mint}/sol-trace
# ------------------------------------------------------------------

@pytest.mark.anyio
async def test_sol_trace_invalid_mint_returns_400(client):
    resp = await client.get("/lineage/short/sol-trace")
    assert resp.status_code == 400
    assert "Invalid Solana mint" in resp.json()["detail"]


@pytest.mark.anyio
async def test_sol_trace_no_deployer_returns_404(client):
    with (
        patch("lineage_agent.data_sources._clients.sol_flows_query", new_callable=AsyncMock, return_value=[]),
        patch("lineage_agent.data_sources._clients.event_query", new_callable=AsyncMock, return_value=[]),
        patch("lineage_agent.api._resolve_deployer", new_callable=AsyncMock, return_value=""),
    ):
        resp = await client.get(f"/lineage/{_VALID_ADDR}/sol-trace")
    assert resp.status_code == 404


# ------------------------------------------------------------------
# /lineage/{mint}/bundle
# ------------------------------------------------------------------

@pytest.mark.anyio
async def test_lineage_bundle_invalid_mint_returns_400(client):
    resp = await client.get("/lineage/bad/bundle")
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_lineage_bundle_not_found_returns_404(client):
    with patch(
        "lineage_agent.bundle_tracker_service.get_cached_bundle_report",
        new_callable=AsyncMock,
        return_value=None,
    ):
        resp = await client.get(f"/lineage/{_VALID_ADDR}/bundle")
    assert resp.status_code == 404


@pytest.mark.anyio
async def test_lineage_bundle_internal_error_returns_500(client):
    with patch(
        "lineage_agent.bundle_tracker_service.get_cached_bundle_report",
        new_callable=AsyncMock,
        side_effect=RuntimeError("db error"),
    ):
        resp = await client.get(f"/lineage/{_VALID_ADDR}/bundle")
    assert resp.status_code == 500


# ------------------------------------------------------------------
# /cartel/search
# ------------------------------------------------------------------

@pytest.mark.anyio
async def test_cartel_search_invalid_deployer_returns_400(client):
    resp = await client.get("/cartel/search", params={"deployer": "xyz"})
    assert resp.status_code == 400


# ------------------------------------------------------------------
# /cartel/{community_id}
# ------------------------------------------------------------------

@pytest.mark.anyio
async def test_cartel_community_invalid_id_returns_400(client):
    resp = await client.get("/cartel/NOTAVALIDID12")
    assert resp.status_code == 400
    assert "community_id" in resp.json()["detail"].lower()


@pytest.mark.anyio
async def test_cartel_community_no_data_returns_404(client):
    with (
        patch("lineage_agent.data_sources._clients.community_lookup_query", new_callable=AsyncMock, return_value=None),
        patch("lineage_agent.data_sources._clients.cartel_edges_query_all", new_callable=AsyncMock, return_value=[]),
    ):
        resp = await client.get("/cartel/abcdef123456")
    assert resp.status_code == 404


# ------------------------------------------------------------------
# /cartel/{deployer}/financial
# ------------------------------------------------------------------

@pytest.mark.anyio
async def test_cartel_financial_invalid_address_returns_400(client):
    resp = await client.get("/cartel/bad/financial")
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_cartel_financial_timeout_returns_504(client):
    import asyncio as _asyncio

    with (
        patch("lineage_agent.api.build_financial_edges", new_callable=AsyncMock,
              side_effect=_asyncio.TimeoutError()),
    ):
        resp = await client.get(f"/cartel/{_VALID_ADDR}/financial")
    assert resp.status_code == 504


@pytest.mark.anyio
async def test_cartel_financial_success_returns_200(client):
    with (
        patch("lineage_agent.api.build_financial_edges", new_callable=AsyncMock, return_value=0),
        patch("lineage_agent.data_sources._clients.cartel_edges_query", new_callable=AsyncMock, return_value=[]),
    ):
        resp = await client.get(f"/cartel/{_VALID_ADDR}/financial")
    assert resp.status_code == 200
    body = resp.json()
    assert body["deployer"] == _VALID_ADDR
    assert body["financial_score"] == 0


# ------------------------------------------------------------------
# /bundle/{mint}
# ------------------------------------------------------------------

@pytest.mark.anyio
async def test_bundle_invalid_mint_returns_400(client):
    resp = await client.get("/bundle/short")
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_bundle_no_deployer_returns_404(client):
    with (
        patch("lineage_agent.api._resolve_deployer", new_callable=AsyncMock, return_value=""),
    ):
        resp = await client.get(f"/bundle/{_VALID_ADDR}")
    assert resp.status_code == 404


# ------------------------------------------------------------------
# /lineage/{mint}/graph
# ------------------------------------------------------------------

@pytest.mark.anyio
async def test_lineage_graph_invalid_mint_returns_400(client):
    resp = await client.get("/lineage/bad/graph")
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_lineage_graph_success_returns_200(client):
    from lineage_agent.models import LineageResult, TokenMetadata

    fake_result = LineageResult(
        mint=_WS_MINT,
        query_token=TokenMetadata(
            mint=_WS_MINT,
            name="BONK",
            symbol="BONK",
        ),
        root=None,
        derivatives=[],
        family_size=1,
        generation_count=0,
        scanned_at=None,
    )

    with patch("lineage_agent.api.detect_lineage", new_callable=AsyncMock, return_value=fake_result):
        resp = await client.get(f"/lineage/{_WS_MINT}/graph")

    assert resp.status_code == 200
    body = resp.json()
    assert body["mint"] == _WS_MINT
    assert "nodes" in body
    assert "edges" in body


# ------------------------------------------------------------------
# /analyze/{mint}/stream (invalid mint only — full AI integration is expensive)
# ------------------------------------------------------------------

@pytest.mark.anyio
async def test_stream_analyze_invalid_mint_returns_400(client):
    resp = await client.get("/analyze/short/stream")
    assert resp.status_code == 400


# ------------------------------------------------------------------
# Helius webhook endpoint
# ------------------------------------------------------------------

@pytest.mark.anyio
async def test_helius_webhook_disabled_without_secret(client):
    """With HELIUS_WEBHOOK_SECRET unset (default in tests), route returns 503."""
    resp = await client.post(
        "/agent/webhook/helius",
        content=b"[]",
        headers={"Authorization": "irrelevant"},
    )
    assert resp.status_code == 503
    assert "disabled" in resp.json()["error"].lower()


@pytest.mark.anyio
async def test_helius_webhook_valid_signature_dispatches(client):
    """Happy path: shared-secret Authorization header → 200 and rescan dispatched.

    Helius Enhanced Webhooks send the configured ``authHeader`` value
    verbatim in the Authorization header, so verification is a bearer
    token match — not an HMAC over the body.
    """
    import json as _json
    import asyncio as _asyncio

    secret = "test-api-secret"
    events = [{
        "type": "SWAP",
        "source": "RAYDIUM",
        "signature": "abc",
        "tokenTransfers": [{
            "fromUserAccount": "A", "toUserAccount": "B",
            "mint": _WS_MINT, "tokenAmount": 1.0,
        }],
        "nativeTransfers": [],
    }]
    body = _json.dumps(events).encode()

    mock_rescan = AsyncMock(return_value={"skipped": False})
    with (
        patch("lineage_agent.webhook_helius._config.HELIUS_WEBHOOK_SECRET", secret),
        patch(
            "lineage_agent.watchlist_monitor_service.trigger_immediate_rescan",
            mock_rescan,
        ),
    ):
        resp = await client.post(
            "/agent/webhook/helius",
            content=body,
            headers={"Authorization": secret},
        )

    assert resp.status_code == 200, resp.text
    payload = resp.json()
    assert payload["status"] == "ok"
    assert payload["mints"] == 1

    await _asyncio.sleep(0)  # let the background task execute
    assert mock_rescan.await_count == 1


@pytest.mark.anyio
async def test_helius_webhook_bad_signature_rejected(client):
    secret = "test-api-secret"
    with patch("lineage_agent.webhook_helius._config.HELIUS_WEBHOOK_SECRET", secret):
        resp = await client.post(
            "/agent/webhook/helius",
            content=b"[]",
            headers={"Authorization": "deadbeef"},
        )
    assert resp.status_code == 401


# ------------------------------------------------------------------
# Internal helper: _schedule_cartel_sweep / _cancel_cartel_sweep
# ------------------------------------------------------------------

@pytest.mark.anyio
async def test_schedule_and_cancel_cartel_sweep():
    import asyncio as _asyncio
    from lineage_agent import api as _api

    # Patch the loop so it cancels immediately
    async def _instant_loop():
        await _asyncio.sleep(9999)

    old_task = _api._cartel_sweep_task
    try:
        with patch("lineage_agent.api._cartel_sweep_loop", new=_instant_loop):
            _api._schedule_cartel_sweep()
            assert _api._cartel_sweep_task is not None
            assert not _api._cartel_sweep_task.done()
            _api._cancel_cartel_sweep()
            await _asyncio.sleep(0)  # let cancel propagate
    finally:
        _api._cartel_sweep_task = old_task
