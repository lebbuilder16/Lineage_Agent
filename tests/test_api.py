"""Integration tests for the FastAPI REST API.

These tests use FastAPI's TestClient with mocked external services
(DexScreener + Solana RPC) so they don't require network access.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

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
# /admin/system endpoint
# ------------------------------------------------------------------

def _make_mock_psutil(
    cpu_pct: float = 20.0,
    mem_pct: float = 50.0,
    mem_total: int = 8 * 1024 ** 3,
    mem_used: int = 4 * 1024 ** 3,
    mem_available: int = 4 * 1024 ** 3,
    swap_total: int = 2 * 1024 ** 3,
    swap_used: int = 0,
    swap_pct: float = 0.0,
    disk_pct: float = 60.0,
    disk_total: int = 100 * 1024 ** 3,
    disk_used: int = 60 * 1024 ** 3,
    disk_free: int = 40 * 1024 ** 3,
    proc_rss: int = 200 * 1024 ** 2,
    num_fds: int = 50,
    num_threads: int = 8,
    boot_time: float = 1000.0,
    load_avg: tuple = (0.5, 0.4, 0.3),
):
    """Build a minimal psutil mock for _collect_system_stats tests."""
    import types

    mock = types.SimpleNamespace()

    mock.cpu_count = lambda logical=True: 4 if logical else 2
    mock.cpu_percent = lambda interval=None: cpu_pct
    mock.getloadavg = lambda: load_avg
    mock.virtual_memory = lambda: types.SimpleNamespace(
        total=mem_total, used=mem_used, available=mem_available, percent=mem_pct
    )
    mock.swap_memory = lambda: types.SimpleNamespace(
        total=swap_total, used=swap_used, percent=swap_pct
    )

    part = types.SimpleNamespace(mountpoint="/", fstype="ext4")
    mock.disk_partitions = lambda all=False: [part]
    mock.disk_usage = lambda mp: types.SimpleNamespace(
        total=disk_total, used=disk_used, free=disk_free, percent=disk_pct
    )

    proc_info = types.SimpleNamespace(rss=proc_rss)
    proc = types.SimpleNamespace(
        memory_info=lambda: proc_info,
        num_fds=lambda: num_fds,
        num_threads=lambda: num_threads,
    )
    mock.Process = lambda pid: proc
    mock.boot_time = lambda: boot_time
    mock.AccessDenied = PermissionError

    return mock


@pytest.mark.anyio
async def test_admin_system_returns_valid_schema(client):
    """GET /admin/system returns a valid SystemStats payload."""
    from lineage_agent.models import SystemStats

    resp = await client.get("/admin/system")
    assert resp.status_code == 200
    body = resp.json()
    # Validate via Pydantic model
    stats = SystemStats(**body)
    assert stats.cpu_count_logical >= 1
    assert 0.0 <= stats.cpu_usage_pct <= 100.0
    assert stats.memory_total_gb > 0
    assert isinstance(stats.disks, list)
    assert isinstance(stats.optimisations, list)
    assert len(stats.optimisations) >= 1
    assert stats.host_uptime_seconds >= 0


@pytest.mark.anyio
async def test_admin_system_healthy_machine_no_warnings(client):
    """A lightly-loaded machine should produce a single 'no action required' tip."""
    import lineage_agent.api as api_mod

    mock_psutil = _make_mock_psutil(cpu_pct=10.0, mem_pct=30.0, disk_pct=40.0)
    with patch("lineage_agent.api.psutil", mock_psutil):
        stats = api_mod._collect_system_stats()

    assert len(stats.optimisations) == 1
    assert "no immediate action" in stats.optimisations[0].lower()


def test_generate_optimisation_tips_high_cpu():
    """CPU ≥ 90% should generate a critical recommendation."""
    from lineage_agent.api import _generate_optimisation_tips
    from lineage_agent.models import DiskPartitionStats

    tips = _generate_optimisation_tips(
        cpu_pct=95.0, cpu_logical=4, load_1=0.5,
        mem_pct=30.0, mem_used_gb=2.0, mem_total_gb=8.0,
        swap_total_gb=0.0, swap_pct=0.0, swap_used_gb=0.0,
        disk_partitions=[], proc_mem_mb=200.0, open_fds=10,
    )
    assert any("cpu" in t.lower() or "critical" in t.lower() for t in tips)


def test_generate_optimisation_tips_high_memory():
    """Memory ≥ 90% should generate a recommendation."""
    from lineage_agent.api import _generate_optimisation_tips

    tips = _generate_optimisation_tips(
        cpu_pct=10.0, cpu_logical=4, load_1=0.5,
        mem_pct=92.0, mem_used_gb=7.0, mem_total_gb=8.0,
        swap_total_gb=0.0, swap_pct=0.0, swap_used_gb=0.0,
        disk_partitions=[], proc_mem_mb=200.0, open_fds=10,
    )
    assert any("memory" in t.lower() or "ram" in t.lower() for t in tips)


def test_generate_optimisation_tips_full_disk():
    """Disk ≥ 90% should generate a critical disk recommendation."""
    from lineage_agent.api import _generate_optimisation_tips
    from lineage_agent.models import DiskPartitionStats

    dp = DiskPartitionStats(mountpoint="/", total_gb=100.0, used_gb=92.0, free_gb=8.0, used_pct=92.0)
    tips = _generate_optimisation_tips(
        cpu_pct=10.0, cpu_logical=4, load_1=0.5,
        mem_pct=30.0, mem_used_gb=2.0, mem_total_gb=8.0,
        swap_total_gb=0.0, swap_pct=0.0, swap_used_gb=0.0,
        disk_partitions=[dp], proc_mem_mb=200.0, open_fds=10,
    )
    assert any("disk" in t.lower() or "full" in t.lower() for t in tips)


@pytest.mark.anyio
async def test_admin_system_endpoint_with_mocked_psutil(client):
    """GET /admin/system with mocked psutil returns valid SystemStats payload."""
    import lineage_agent.api as api_mod
    from lineage_agent.models import SystemStats

    mock_psutil = _make_mock_psutil(cpu_pct=45.0, mem_pct=60.0, disk_pct=50.0)
    with patch("lineage_agent.api.psutil", mock_psutil):
        resp = await client.get("/admin/system")

    assert resp.status_code == 200
    stats = SystemStats(**resp.json())
    assert stats.cpu_usage_pct == pytest.approx(45.0)
    assert stats.memory_used_pct == pytest.approx(60.0)
    assert len(stats.disks) == 1
    assert stats.disks[0].used_pct == pytest.approx(50.0)
    assert len(stats.optimisations) >= 1


@pytest.mark.anyio
async def test_admin_system_disk_partition_stats(client):
    """DiskPartitionStats fields are populated correctly."""
    import lineage_agent.api as api_mod

    _GB = 1024 ** 3
    mock_psutil = _make_mock_psutil(
        disk_total=100 * _GB,
        disk_used=60 * _GB,
        disk_free=40 * _GB,
        disk_pct=60.0,
    )
    with patch("lineage_agent.api.psutil", mock_psutil):
        stats = api_mod._collect_system_stats()

    assert len(stats.disks) == 1
    dp = stats.disks[0]
    assert dp.mountpoint == "/"
    assert dp.total_gb == pytest.approx(100.0, rel=0.01)
    assert dp.used_pct == pytest.approx(60.0, rel=0.01)
