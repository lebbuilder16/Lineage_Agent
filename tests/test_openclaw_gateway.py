"""Tests for the OpenClaw Gateway WebSocket proxy."""
from __future__ import annotations

import asyncio
import json
import time
import uuid

import aiosqlite
import pytest
import pytest_asyncio

from src.lineage_agent.openclaw_gateway import (
    OpenClawClient,
    _handle_connect,
    _handle_cron_add,
    _handle_cron_list,
    _handle_cron_remove,
    _handle_chat_send,
    forward_alert_to_openclaw,
    push_event_to_user,
    push_node_invoke,
    register_oc_client,
    unregister_oc_client,
    _oc_clients,
)


# ── Fixtures ────────────────────────────────────────────────────────────


class MockWebSocket:
    """Captures sent JSON frames for assertion."""

    def __init__(self):
        self.sent: list[dict] = []

    async def send_json(self, data: dict) -> None:
        self.sent.append(data)


class MockCache:
    """Wraps a real aiosqlite DB with the minimal interface needed by handlers."""

    def __init__(self, db: aiosqlite.Connection):
        self._db = db

    async def _get_conn(self):
        return self._db


@pytest_asyncio.fixture
async def db():
    conn = await aiosqlite.connect(":memory:")
    await conn.execute("""
        CREATE TABLE user_crons (
            id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            schedule TEXT NOT NULL,
            payload TEXT NOT NULL DEFAULT '{}',
            delivery TEXT NOT NULL DEFAULT '{}',
            enabled INTEGER NOT NULL DEFAULT 1,
            last_run TEXT,
            next_run TEXT,
            created_at REAL NOT NULL
        )
    """)
    await conn.execute("CREATE INDEX idx_uc_user ON user_crons(user_id, name)")
    await conn.commit()
    yield conn
    await conn.close()


@pytest.fixture
def cache(db):
    return MockCache(db)


@pytest.fixture
def client():
    ws = MockWebSocket()
    user = {"id": 42, "plan": "pro", "api_key": "lin_test123"}
    c = OpenClawClient(ws, user)
    register_oc_client(c)
    yield c
    unregister_oc_client(c)


# ── Connect ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_connect_handshake(client, cache):
    await _handle_connect(client, cache, "connect-0", {
        "device": {"id": "dev-abc123"},
    })
    ws = client.ws
    assert len(ws.sent) == 1
    res = ws.sent[0]
    assert res["type"] == "res"
    assert res["id"] == "connect-0"
    assert res["ok"] is True
    assert "connId" in res["payload"]
    assert "cron.list" in res["payload"]["methods"]
    assert "chat.send" in res["payload"]["methods"]
    assert "alert" in res["payload"]["events"]
    assert client.device_id == "dev-abc123"


# ── Cron CRUD ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_cron_list_empty(client, cache):
    await _handle_cron_list(client, cache, "r1")
    res = client.ws.sent[-1]
    assert res["ok"] is True
    assert res["payload"]["jobs"] == []


@pytest.mark.asyncio
async def test_cron_add_and_list(client, cache):
    await _handle_cron_add(client, cache, "r2", {
        "name": "lineage:watchlist:w1",
        "schedule": {"kind": "cron", "at": "0 */6 * * *"},
        "text": "Re-scan token ABC",
        "enabled": True,
    })
    res = client.ws.sent[-1]
    assert res["ok"] is True
    cron_id = res["payload"]["id"]
    assert cron_id.startswith("cron-")

    # List should return 1 job
    await _handle_cron_list(client, cache, "r3")
    jobs = client.ws.sent[-1]["payload"]["jobs"]
    assert len(jobs) == 1
    assert jobs[0]["name"] == "lineage:watchlist:w1"
    assert jobs[0]["status"] == "active"


@pytest.mark.asyncio
async def test_cron_upsert_same_name(client, cache):
    await _handle_cron_add(client, cache, "r1", {
        "name": "lineage:briefing",
        "schedule": {"cron": "0 8 * * *"},
        "text": "Morning briefing",
    })
    await _handle_cron_add(client, cache, "r2", {
        "name": "lineage:briefing",
        "schedule": {"cron": "0 9 * * *"},
        "text": "Updated briefing",
    })
    await _handle_cron_list(client, cache, "r3")
    jobs = client.ws.sent[-1]["payload"]["jobs"]
    assert len(jobs) == 1  # upsert, not duplicate


@pytest.mark.asyncio
async def test_cron_remove(client, cache):
    await _handle_cron_add(client, cache, "r1", {
        "name": "lineage:watchlist:w2",
        "schedule": {"cron": "0 */3 * * *"},
        "text": "Scan",
    })
    cron_id = client.ws.sent[-1]["payload"]["id"]

    await _handle_cron_remove(client, cache, "r2", {"id": cron_id})
    assert client.ws.sent[-1]["ok"] is True
    assert client.ws.sent[-1]["payload"]["deleted"] is True

    await _handle_cron_list(client, cache, "r3")
    assert client.ws.sent[-1]["payload"]["jobs"] == []


@pytest.mark.asyncio
async def test_cron_remove_nonexistent(client, cache):
    await _handle_cron_remove(client, cache, "r1", {"id": "bogus"})
    assert client.ws.sent[-1]["ok"] is True
    assert client.ws.sent[-1]["payload"]["deleted"] is False


@pytest.mark.asyncio
async def test_cron_add_missing_name(client, cache):
    await _handle_cron_add(client, cache, "r1", {"schedule": {"cron": "* * * * *"}})
    res = client.ws.sent[-1]
    assert res["ok"] is False
    assert "name is required" in res["error"]["message"]


# ── Event push ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_push_event_to_user(client):
    count = await push_event_to_user(42, "alert", {"type": "rug", "mint": "abc"})
    assert count == 1
    evt = client.ws.sent[-1]
    assert evt["type"] == "event"
    assert evt["event"] == "alert"
    assert evt["payload"]["type"] == "rug"


@pytest.mark.asyncio
async def test_push_event_no_clients():
    count = await push_event_to_user(999, "alert", {})
    assert count == 0


@pytest.mark.asyncio
async def test_push_node_invoke(client):
    count = await push_node_invoke(42, "lineage.scan", {"mint": "xyz"})
    assert count == 1
    evt = client.ws.sent[-1]
    assert evt["event"] == "node.invoke"
    assert evt["payload"]["command"] == "lineage.scan"


@pytest.mark.asyncio
async def test_forward_alert(client):
    count = await forward_alert_to_openclaw(42, {"type": "rug", "mint": "dead"})
    assert count == 1


# ── Client lifecycle ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_client_register_unregister():
    ws = MockWebSocket()
    user = {"id": 99, "plan": "free", "api_key": "lin_x"}
    c = OpenClawClient(ws, user)

    register_oc_client(c)
    assert 99 in _oc_clients
    assert c in _oc_clients[99]

    unregister_oc_client(c)
    assert 99 not in _oc_clients


# ── Chat send (ack only — no AI key in test env) ───────────────────────


@pytest.mark.asyncio
async def test_chat_send_missing_message(client, cache):
    await _handle_chat_send(client, cache, "r1", {})
    res = client.ws.sent[-1]
    assert res["ok"] is False
    assert "message is required" in res["error"]["message"]


@pytest.mark.asyncio
async def test_chat_send_ack(client, cache):
    await _handle_chat_send(client, cache, "r2", {
        "message": "What is this token?",
        "sessionKey": "lineage:token:abc",
        "idempotencyKey": "chat-1",
    })
    ack = client.ws.sent[-1]
    assert ack["ok"] is True
    assert ack["payload"]["runId"] == "chat-1"
    assert ack["payload"]["status"] == "started"
