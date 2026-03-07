"""
Tests for scan_history_service: snapshot persistence, delta computation,
retention rules, and fallback narrative generation.

Uses an in-memory SQLite cache via a lightweight stub of SQLiteCache.
"""

from __future__ import annotations

import asyncio
import json
import time
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import aiosqlite
import pytest

from src.lineage_agent.models import ScanDelta, ScanSnapshot
from src.lineage_agent.scan_history_service import (
    _extract_flags,
    _enforce_retention,
    compute_delta,
    get_snapshots,
    save_snapshot,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
async def mem_db():
    """Yield an in-memory aiosqlite connection with the scan_history schema."""
    async with aiosqlite.connect(":memory:") as db:
        await db.execute("""
            CREATE TABLE scan_history (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id       INTEGER NOT NULL,
                mint          TEXT NOT NULL,
                scanned_at    REAL NOT NULL,
                risk_score    INTEGER NOT NULL DEFAULT 0,
                flags_json    TEXT NOT NULL DEFAULT '[]',
                family_size   INTEGER NOT NULL DEFAULT 0,
                rug_count     INTEGER NOT NULL DEFAULT 0,
                snapshot_json TEXT NOT NULL DEFAULT '{}'
            )
        """)
        await db.commit()
        yield db


@pytest.fixture
def fake_cache(mem_db):
    """Stub SQLiteCache that returns our in-memory db connection."""
    cache = MagicMock()
    # _get_conn must be an async function returning db
    async def _get_conn():
        return mem_db
    cache._get_conn = _get_conn
    return cache


def _make_snapshot(
    snapshot_id: int = 1,
    user_id: int = 42,
    mint: str = "MINT1",
    scan_number: int = 1,
    risk_score: int = 30,
    flags: list[str] | None = None,
    family_size: int = 3,
    rug_count: int = 0,
) -> ScanSnapshot:
    return ScanSnapshot(
        snapshot_id=snapshot_id,
        user_id=user_id,
        mint=mint,
        scanned_at=datetime(2025, 1, 1, tzinfo=timezone.utc),
        scan_number=scan_number,
        risk_score=risk_score,
        flags=flags or [],
        family_size=family_size,
        rug_count=rug_count,
    )


def _make_lineage_result(**kwargs) -> MagicMock:
    """Build a minimal LineageResult mock."""
    result = MagicMock()
    result.bundle_report = None
    result.insider_sell = None
    result.zombie_alert = None
    result.death_clock = None
    result.factory_rhythm = None
    result.cartel_report = None
    result.operator_impact = None
    result.deployer_profile = None
    result.family_size = kwargs.get("family_size", 1)
    result.sol_flow = None

    qt = MagicMock()
    qt.name = kwargs.get("token_name", "TestToken")
    qt.symbol = kwargs.get("token_symbol", "TEST")
    result.query_token = qt
    result.root = qt
    result.confidence = 0.9

    for k, v in kwargs.items():
        setattr(result, k, v)
    return result


# ---------------------------------------------------------------------------
# Unit tests — _extract_flags
# ---------------------------------------------------------------------------

class TestExtractFlags:
    def test_no_signals_returns_empty(self):
        result = _make_lineage_result()
        assert _extract_flags(result) == []

    def test_bundle_confirmed(self):
        result = _make_lineage_result()
        result.bundle_report = MagicMock(overall_verdict="confirmed_team_extraction")
        flags = _extract_flags(result)
        assert "BUNDLE_CONFIRMED" in flags

    def test_bundle_suspected(self):
        result = _make_lineage_result()
        result.bundle_report = MagicMock(overall_verdict="suspected_team_extraction")
        assert "BUNDLE_SUSPECTED" in _extract_flags(result)

    def test_coordinated_dump(self):
        result = _make_lineage_result()
        result.bundle_report = MagicMock(overall_verdict="coordinated_dump_unknown_team")
        assert "COORDINATED_DUMP" in _extract_flags(result)

    def test_insider_dump(self):
        result = _make_lineage_result()
        result.insider_sell = MagicMock(verdict="insider_dump")
        assert "INSIDER_DUMP" in _extract_flags(result)

    def test_insider_suspicious(self):
        result = _make_lineage_result()
        result.insider_sell = MagicMock(verdict="suspicious")
        assert "INSIDER_SUSPICIOUS" in _extract_flags(result)

    def test_zombie_alert(self):
        result = _make_lineage_result()
        result.zombie_alert = MagicMock()
        assert "ZOMBIE_ALERT" in _extract_flags(result)

    def test_death_clock_critical(self):
        result = _make_lineage_result()
        result.death_clock = MagicMock(risk_level="critical")
        assert "DEATH_CLOCK_CRITICAL" in _extract_flags(result)

    def test_death_clock_high(self):
        result = _make_lineage_result()
        result.death_clock = MagicMock(risk_level="high")
        assert "DEATH_CLOCK_HIGH" in _extract_flags(result)

    def test_factory_detected(self):
        result = _make_lineage_result()
        result.factory_rhythm = MagicMock(is_factory=True)
        assert "FACTORY_DETECTED" in _extract_flags(result)

    def test_cartel_linked(self):
        result = _make_lineage_result()
        result.cartel_report = MagicMock(deployer_community="test_cartel")
        assert "CARTEL_LINKED" in _extract_flags(result)

    def test_serial_rugger(self):
        result = _make_lineage_result()
        result.operator_impact = MagicMock(rug_rate_pct=75)
        assert "SERIAL_RUGGER" in _extract_flags(result)

    def test_operator_below_threshold_not_flagged(self):
        result = _make_lineage_result()
        result.operator_impact = MagicMock(rug_rate_pct=40)
        assert "SERIAL_RUGGER" not in _extract_flags(result)

    def test_multiple_flags_combined(self):
        result = _make_lineage_result()
        result.bundle_report = MagicMock(overall_verdict="confirmed_team_extraction")
        result.insider_sell = MagicMock(verdict="insider_dump")
        result.death_clock = MagicMock(risk_level="critical")
        flags = _extract_flags(result)
        assert "BUNDLE_CONFIRMED" in flags
        assert "INSIDER_DUMP" in flags
        assert "DEATH_CLOCK_CRITICAL" in flags


# ---------------------------------------------------------------------------
# Unit tests — compute_delta (pure function)
# ---------------------------------------------------------------------------

class TestComputeDelta:
    def test_worsening_by_risk_delta(self):
        prev = _make_snapshot(scan_number=1, risk_score=40, flags=[])
        curr = _make_snapshot(scan_number=2, risk_score=60, flags=[])
        delta = compute_delta(prev, curr)
        assert delta.trend == "worsening"
        assert delta.risk_score_delta == 20

    def test_worsening_by_new_critical_flag(self):
        prev = _make_snapshot(scan_number=1, risk_score=50, flags=[])
        curr = _make_snapshot(scan_number=2, risk_score=52, flags=["BUNDLE_CONFIRMED"])
        delta = compute_delta(prev, curr)
        assert delta.trend == "worsening"
        assert "BUNDLE_CONFIRMED" in delta.new_flags

    def test_improving_by_risk_delta(self):
        prev = _make_snapshot(scan_number=1, risk_score=70, flags=["DEATH_CLOCK_HIGH"])
        curr = _make_snapshot(scan_number=2, risk_score=40, flags=[])
        delta = compute_delta(prev, curr)
        assert delta.trend == "improving"
        assert "DEATH_CLOCK_HIGH" in delta.resolved_flags

    def test_improving_when_flags_resolved_no_new(self):
        prev = _make_snapshot(scan_number=1, risk_score=55, flags=["INSIDER_SUSPICIOUS"])
        curr = _make_snapshot(scan_number=2, risk_score=53, flags=[])
        delta = compute_delta(prev, curr)
        assert delta.trend == "improving"

    def test_stable_small_delta(self):
        prev = _make_snapshot(scan_number=1, risk_score=50, flags=[])
        curr = _make_snapshot(scan_number=2, risk_score=53, flags=[])
        delta = compute_delta(prev, curr)
        assert delta.trend == "stable"
        assert delta.risk_score_delta == 3

    def test_new_flags_detected(self):
        prev = _make_snapshot(scan_number=1, flags=["FACTORY_DETECTED"])
        curr = _make_snapshot(scan_number=2, flags=["FACTORY_DETECTED", "ZOMBIE_ALERT"])
        delta = compute_delta(prev, curr)
        assert "ZOMBIE_ALERT" in delta.new_flags
        assert "FACTORY_DETECTED" not in delta.new_flags

    def test_resolved_flags_detected(self):
        prev = _make_snapshot(scan_number=1, flags=["BUNDLE_SUSPECTED", "CARTEL_LINKED"])
        curr = _make_snapshot(scan_number=2, flags=["BUNDLE_SUSPECTED"])
        delta = compute_delta(prev, curr)
        assert "CARTEL_LINKED" in delta.resolved_flags
        assert "BUNDLE_SUSPECTED" not in delta.resolved_flags

    def test_family_size_delta(self):
        prev = _make_snapshot(scan_number=1, family_size=3)
        curr = _make_snapshot(scan_number=2, family_size=7)
        delta = compute_delta(prev, curr)
        assert delta.family_size_delta == 4

    def test_rug_count_delta(self):
        prev = _make_snapshot(scan_number=1, rug_count=2)
        curr = _make_snapshot(scan_number=2, rug_count=5)
        delta = compute_delta(prev, curr)
        assert delta.rug_count_delta == 3

    def test_narrative_is_none_by_default(self):
        prev = _make_snapshot(scan_number=1)
        curr = _make_snapshot(scan_number=2)
        delta = compute_delta(prev, curr)
        assert delta.narrative is None

    def test_critical_flags_trigger_worsening_regardless_of_score_delta(self):
        """Even a tiny risk increase with INSIDER_DUMP must be worsening."""
        prev = _make_snapshot(scan_number=1, risk_score=60, flags=[])
        curr = _make_snapshot(scan_number=2, risk_score=62, flags=["INSIDER_DUMP"])
        delta = compute_delta(prev, curr)
        assert delta.trend == "worsening"


# ---------------------------------------------------------------------------
# Integration tests — save_snapshot + get_snapshots (in-memory DB)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestSaveAndGetSnapshots:
    async def test_save_returns_snapshot(self, fake_cache, mem_db):
        result = _make_lineage_result()
        # Patch _heuristic_score to return deterministic value
        with patch(
            "src.lineage_agent.scan_history_service._extract_risk_score",
            return_value=45,
        ):
            snap = await save_snapshot(fake_cache, user_id=1, mint="MINT1", result=result)
        assert snap is not None
        assert snap.mint == "MINT1"
        assert snap.scan_number == 1
        assert snap.risk_score == 45

    async def test_get_snapshots_oldest_first(self, fake_cache, mem_db):
        result = _make_lineage_result()
        with patch(
            "src.lineage_agent.scan_history_service._extract_risk_score",
            return_value=30,
        ):
            for _ in range(3):
                await save_snapshot(fake_cache, user_id=1, mint="MINT2", result=result)
                await asyncio.sleep(0)  # let the event loop tick

        snaps = await get_snapshots(fake_cache, user_id=1, mint="MINT2", plan="free")
        assert len(snaps) == 3
        scan_nums = [s.scan_number for s in snaps]
        assert scan_nums == sorted(scan_nums)

    async def test_different_users_isolated(self, fake_cache, mem_db):
        result = _make_lineage_result()
        with patch(
            "src.lineage_agent.scan_history_service._extract_risk_score",
            return_value=0,
        ):
            await save_snapshot(fake_cache, user_id=10, mint="MINTX", result=result)
            await save_snapshot(fake_cache, user_id=20, mint="MINTX", result=result)

        snaps10 = await get_snapshots(fake_cache, user_id=10, mint="MINTX")
        snaps20 = await get_snapshots(fake_cache, user_id=20, mint="MINTX")
        assert len(snaps10) == 1
        assert len(snaps20) == 1

    async def test_get_snapshots_empty(self, fake_cache):
        snaps = await get_snapshots(fake_cache, user_id=99, mint="UNKNOWN")
        assert snaps == []


# ---------------------------------------------------------------------------
# Retention tests — _enforce_retention
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestRetention:
    async def test_free_plan_caps_at_3(self, fake_cache, mem_db):
        """Free plan: inserting 5 snapshots should leave only 3."""
        result = _make_lineage_result()
        with patch(
            "src.lineage_agent.scan_history_service._extract_risk_score",
            return_value=0,
        ):
            for _ in range(5):
                await save_snapshot(
                    fake_cache, user_id=1, mint="MINTZ", result=result, plan="free"
                )
                await asyncio.sleep(0)

        snaps = await get_snapshots(fake_cache, user_id=1, mint="MINTZ", plan="free")
        assert len(snaps) == 3

    async def test_pro_plan_keeps_all_within_90_days(self, fake_cache, mem_db):
        """Pro plan: 6 snapshots within 90 days must all be kept."""
        result = _make_lineage_result()
        with patch(
            "src.lineage_agent.scan_history_service._extract_risk_score",
            return_value=0,
        ):
            for _ in range(6):
                await save_snapshot(
                    fake_cache, user_id=2, mint="MINTP", result=result, plan="pro"
                )
                await asyncio.sleep(0)

        snaps = await get_snapshots(fake_cache, user_id=2, mint="MINTP", plan="pro")
        assert len(snaps) == 6

    async def test_enforce_retention_deletes_old_pro(self, mem_db):
        """Pro plan: row older than 90 days must be deleted by _enforce_retention."""
        old_ts = time.time() - (91 * 86400)  # 91 days ago
        await mem_db.execute(
            "INSERT INTO scan_history "
            "(user_id, mint, scanned_at, risk_score, flags_json, family_size, rug_count, snapshot_json) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (3, "MINTP", old_ts, 10, "[]", 1, 0, "{}"),
        )
        await mem_db.commit()

        # Verify it exists
        cur = await mem_db.execute(
            "SELECT COUNT(*) FROM scan_history WHERE user_id=3 AND mint='MINTP'"
        )
        (count,) = await cur.fetchone()
        assert count == 1

        await _enforce_retention(mem_db, user_id=3, mint="MINTP", plan="pro")

        cur = await mem_db.execute(
            "SELECT COUNT(*) FROM scan_history WHERE user_id=3 AND mint='MINTP'"
        )
        (count,) = await cur.fetchone()
        assert count == 0

    async def test_enforce_retention_keeps_recent_pro(self, mem_db):
        """Pro plan: recent row must NOT be deleted."""
        recent_ts = time.time() - (10 * 86400)  # 10 days ago
        await mem_db.execute(
            "INSERT INTO scan_history "
            "(user_id, mint, scanned_at, risk_score, flags_json, family_size, rug_count, snapshot_json) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (4, "MINTR", recent_ts, 20, "[]", 1, 0, "{}"),
        )
        await mem_db.commit()

        await _enforce_retention(mem_db, user_id=4, mint="MINTR", plan="pro")

        cur = await mem_db.execute(
            "SELECT COUNT(*) FROM scan_history WHERE user_id=4 AND mint='MINTR'"
        )
        (count,) = await cur.fetchone()
        assert count == 1


# ---------------------------------------------------------------------------
# Unit tests — _fallback_delta_narrative (from ai_analyst)
# ---------------------------------------------------------------------------

class TestFallbackDeltaNarrative:
    def _get_fallback(self):
        from src.lineage_agent.ai_analyst import _fallback_delta_narrative
        return _fallback_delta_narrative

    def test_worsening_contains_risk_info(self):
        fn = self._get_fallback()
        prev = _make_snapshot(scan_number=1, risk_score=40)
        curr = _make_snapshot(scan_number=2, risk_score=80, flags=["BUNDLE_CONFIRMED"])
        delta = compute_delta(prev, curr)
        narrative = fn(delta)
        assert narrative
        assert isinstance(narrative, str)
        assert len(narrative) > 10
        # Should mention worsening / risky / alert context
        assert any(
            word in narrative.lower()
            for word in ["worsen", "risk", "danger", "alert", "escalat", "critical", "flag", "new"]
        )

    def test_improving_has_positive_tone(self):
        fn = self._get_fallback()
        prev = _make_snapshot(scan_number=1, risk_score=80, flags=["INSIDER_DUMP"])
        curr = _make_snapshot(scan_number=2, risk_score=40, flags=[])
        delta = compute_delta(prev, curr)
        narrative = fn(delta)
        assert any(
            word in narrative.lower()
            for word in ["improv", "resolv", "lower", "declin", "better", "reduc", "decreas"]
        )

    def test_stable_returns_string(self):
        fn = self._get_fallback()
        prev = _make_snapshot(scan_number=1, risk_score=50)
        curr = _make_snapshot(scan_number=2, risk_score=52)
        delta = compute_delta(prev, curr)
        narrative = fn(delta)
        assert isinstance(narrative, str)
        assert len(narrative) > 5
