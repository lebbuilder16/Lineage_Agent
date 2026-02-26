"""Tests for the Cartel Financial Graph service.

Uses a temporary SQLiteCache with pre-seeded intelligence_events and a mocked
RPC client so no real on-chain calls are made.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from unittest.mock import AsyncMock

import pytest

from lineage_agent.cache import SQLiteCache

# ── Constants ─────────────────────────────────────────────────────────────────
_DEPLOYER_A = "DeployerAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA111"
_DEPLOYER_B = "DeployerBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB222"
_DEPLOYER_C = "DeployerCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC333"
_MINT_A = "MintAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA1111"
_MINT_B = "MintBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB2222"
_MINT_C = "MintCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC3333"
_LP_WALLET = "LPwalletXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX00"
_BUYER_1 = "BuyerWallet1XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
_BUYER_2 = "BuyerWallet2XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
_BUYER_3 = "BuyerWallet3XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
_NOW = datetime.now(tz=timezone.utc)


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
async def cache(tmp_path, monkeypatch):
    """Provide a fresh SQLiteCache and patch _clients to use it."""
    db = str(tmp_path / "financial_test.db")
    c = SQLiteCache(db_path=db, default_ttl=3600)

    import lineage_agent.data_sources._clients as clients_mod
    monkeypatch.setattr(clients_mod, "cache", c)

    yield c


class FakeRpc:
    """Minimal RPC stub that returns canned responses."""

    def __init__(self) -> None:
        self.sig_responses: dict[str, list[dict]] = {}
        self.tx_responses: dict[str, dict] = {}

    async def _call(
        self, method: str, params: Any, *, circuit_protect: bool = True
    ) -> Any:
        if method == "getSignaturesForAddress":
            address = params[0] if isinstance(params, list) else ""
            return self.sig_responses.get(address, [])
        if method == "getTransaction":
            sig = params[0] if isinstance(params, list) else ""
            return self.tx_responses.get(sig)
        return None


@pytest.fixture
def fake_rpc(monkeypatch):
    """Patch get_rpc_client to return a FakeRpc instance.

    Patches BOTH the _clients module attribute AND the imported name
    in cartel_financial_service so the fake is used regardless of
    how the function was resolved.
    """
    rpc = FakeRpc()

    import lineage_agent.data_sources._clients as clients_mod
    monkeypatch.setattr(clients_mod, "_rpc_client", rpc)
    monkeypatch.setattr(clients_mod, "get_rpc_client", lambda: rpc)

    # Also patch the imported name directly in the financial service module
    monkeypatch.setattr(
        "lineage_agent.cartel_financial_service.get_rpc_client",
        lambda: rpc,
    )

    return rpc


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _seed_token(
    cache: SQLiteCache,
    deployer: str,
    mint: str,
    created_at: datetime | None = None,
    extra_json: dict | None = None,
) -> None:
    """Insert a token_created event."""
    ts = created_at or _NOW
    ej = json.dumps(extra_json or {}, default=str)
    await cache.insert_event(
        event_type="token_created",
        mint=mint,
        deployer=deployer,
        name="TestToken",
        symbol="TT",
        narrative="meme",
        mcap_usd=10_000,
        liq_usd=5_000,
        created_at=ts.isoformat(),
        extra_json=ej,
    )


def _make_sig_entry(
    signature: str,
    block_time: int,
    err: Any = None,
) -> dict:
    """Build a getSignaturesForAddress result entry."""
    return {
        "signature": signature,
        "blockTime": block_time,
        "err": err,
        "slot": 100000,
    }


def _make_parsed_tx(
    fee_payer: str,
    sol_transfers: list[dict] | None = None,
    lp_program: bool = False,
    token_balances: list[dict] | None = None,
    block_time: int | None = None,
) -> dict:
    """Build a minimal jsonParsed getTransaction response."""
    account_keys = [
        {"pubkey": fee_payer, "signer": True, "writable": True},
    ]
    if lp_program:
        # Include a Raydium AMM v4 program in account keys
        account_keys.append(
            {"pubkey": "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8", "signer": False, "writable": False}
        )

    instructions: list[dict] = []
    inner_instructions: list[dict] = []

    if sol_transfers:
        for xfer in sol_transfers:
            instructions.append({
                "program": "system",
                "parsed": {
                    "type": "transfer",
                    "info": {
                        "source": xfer["from"],
                        "destination": xfer["to"],
                        "lamports": xfer["lamports"],
                    },
                },
            })

    return {
        "blockTime": block_time or int(_NOW.timestamp()),
        "transaction": {
            "message": {
                "accountKeys": account_keys,
                "instructions": instructions,
            },
        },
        "meta": {
            "innerInstructions": inner_instructions,
            "preTokenBalances": [],
            "postTokenBalances": token_balances or [],
        },
    }


# ═══════════════════════════════════════════════════════════════════════════════
# Tests: _parse_transaction
# ═══════════════════════════════════════════════════════════════════════════════

class TestParseTransaction:
    @pytest.mark.asyncio
    async def test_extracts_sol_transfers(self, fake_rpc):
        """Should extract system-program SOL transfers."""
        from lineage_agent.cartel_financial_service import _parse_transaction

        sig = "sig_sol_xfer"
        fake_rpc.tx_responses[sig] = _make_parsed_tx(
            fee_payer=_DEPLOYER_A,
            sol_transfers=[
                {"from": _DEPLOYER_B, "to": _DEPLOYER_A, "lamports": 2_000_000_000},
            ],
        )
        result = await _parse_transaction(fake_rpc, sig)
        assert result["fee_payer"] == _DEPLOYER_A
        assert len(result["sol_transfers"]) == 1
        assert result["sol_transfers"][0]["amount_lamports"] == 2_000_000_000
        assert result["involves_lp_program"] is False

    @pytest.mark.asyncio
    async def test_detects_lp_program(self, fake_rpc):
        """Should flag transactions involving LP/DEX programs."""
        from lineage_agent.cartel_financial_service import _parse_transaction

        sig = "sig_lp"
        fake_rpc.tx_responses[sig] = _make_parsed_tx(
            fee_payer=_LP_WALLET,
            lp_program=True,
        )
        result = await _parse_transaction(fake_rpc, sig)
        assert result["involves_lp_program"] is True
        assert result["fee_payer"] == _LP_WALLET

    @pytest.mark.asyncio
    async def test_extracts_token_recipients(self, fake_rpc):
        """Should extract wallets that received tokens via postTokenBalances."""
        from lineage_agent.cartel_financial_service import _parse_transaction

        sig = "sig_token_recv"
        fake_rpc.tx_responses[sig] = _make_parsed_tx(
            fee_payer=_BUYER_1,
            token_balances=[
                {
                    "accountIndex": 5,
                    "mint": _MINT_A,
                    "owner": _BUYER_1,
                    "uiTokenAmount": {"amount": "1000000", "decimals": 6},
                },
            ],
        )
        result = await _parse_transaction(fake_rpc, sig, target_mint=_MINT_A)
        assert _BUYER_1 in result["token_recipients"]

    @pytest.mark.asyncio
    async def test_returns_empty_on_missing_tx(self, fake_rpc):
        """Should return empty dict when transaction doesn't exist."""
        from lineage_agent.cartel_financial_service import _parse_transaction

        result = await _parse_transaction(fake_rpc, "nonexistent_sig")
        assert result == {}


# ═══════════════════════════════════════════════════════════════════════════════
# Tests: _collect_token_financial_data
# ═══════════════════════════════════════════════════════════════════════════════

class TestCollectTokenFinancialData:
    @pytest.mark.asyncio
    async def test_collects_lp_providers(self, fake_rpc):
        """LP provider = fee payer of LP-program tx (not the deployer)."""
        from lineage_agent.cartel_financial_service import _collect_token_financial_data

        # Set up: mint has 2 sigs — creation (by deployer) + LP add (by LP wallet)
        sigs = [
            _make_sig_entry("sig_create", int((_NOW - timedelta(hours=2)).timestamp())),
            _make_sig_entry("sig_lp_add", int((_NOW - timedelta(hours=1)).timestamp())),
        ]
        fake_rpc.sig_responses[_MINT_A] = list(reversed(sigs))  # newest-first

        fake_rpc.tx_responses["sig_create"] = _make_parsed_tx(
            fee_payer=_DEPLOYER_A,
        )
        fake_rpc.tx_responses["sig_lp_add"] = _make_parsed_tx(
            fee_payer=_LP_WALLET,
            lp_program=True,
        )

        data = await _collect_token_financial_data(fake_rpc, _MINT_A, _DEPLOYER_A)
        assert _LP_WALLET in data["lp_providers"]
        assert _DEPLOYER_A not in data["lp_providers"]

    @pytest.mark.asyncio
    async def test_collects_early_buyers(self, fake_rpc):
        """Early buyers = wallets that received the target token."""
        from lineage_agent.cartel_financial_service import _collect_token_financial_data

        sigs = [
            _make_sig_entry("sig_buy1", int((_NOW - timedelta(minutes=30)).timestamp())),
        ]
        fake_rpc.sig_responses[_MINT_A] = sigs

        fake_rpc.tx_responses["sig_buy1"] = _make_parsed_tx(
            fee_payer=_BUYER_1,
            token_balances=[
                {
                    "accountIndex": 3,
                    "mint": _MINT_A,
                    "owner": _BUYER_1,
                    "uiTokenAmount": {"amount": "500000", "decimals": 6},
                },
            ],
        )

        data = await _collect_token_financial_data(fake_rpc, _MINT_A, _DEPLOYER_A)
        assert _BUYER_1 in data["early_buyers"]

    @pytest.mark.asyncio
    async def test_empty_on_no_signatures(self, fake_rpc):
        """Returns empty lists when no signatures found."""
        from lineage_agent.cartel_financial_service import _collect_token_financial_data

        data = await _collect_token_financial_data(fake_rpc, _MINT_A, _DEPLOYER_A)
        assert data["lp_providers"] == []
        assert data["early_buyers"] == []


# ═══════════════════════════════════════════════════════════════════════════════
# Tests: signal_funding_link
# ═══════════════════════════════════════════════════════════════════════════════

class TestSignalFundingLink:
    @pytest.mark.asyncio
    async def test_detects_pre_deploy_funding(self, cache, fake_rpc):
        """Should detect SOL transfer from deployer B to deployer A before A's launch."""
        from lineage_agent.cartel_financial_service import signal_funding_link

        deploy_time = _NOW - timedelta(hours=24)

        # Seed tokens for both deployers
        await _seed_token(cache, _DEPLOYER_A, _MINT_A, created_at=deploy_time)
        await _seed_token(cache, _DEPLOYER_B, _MINT_B, created_at=deploy_time - timedelta(days=5))

        # Deployer A received SOL from deployer B 12 hours before launching
        funding_time = deploy_time - timedelta(hours=12)
        sigs = [
            _make_sig_entry("sig_fund", int(funding_time.timestamp())),
        ]
        fake_rpc.sig_responses[_DEPLOYER_A] = sigs

        fake_rpc.tx_responses["sig_fund"] = _make_parsed_tx(
            fee_payer=_DEPLOYER_B,
            sol_transfers=[
                {"from": _DEPLOYER_B, "to": _DEPLOYER_A, "lamports": 3_000_000_000},
            ],
            block_time=int(funding_time.timestamp()),
        )

        count = await signal_funding_link(_DEPLOYER_A)
        assert count >= 1

        # Verify edge was stored
        from lineage_agent.data_sources._clients import cartel_edges_query
        edges = await cartel_edges_query(_DEPLOYER_A)
        funding_edges = [e for e in edges if e["signal_type"] == "funding_link"]
        assert len(funding_edges) >= 1
        assert funding_edges[0]["signal_strength"] > 0.0

    @pytest.mark.asyncio
    async def test_ignores_funding_outside_window(self, cache, fake_rpc):
        """SOL transfers outside 72h window should be ignored."""
        from lineage_agent.cartel_financial_service import signal_funding_link

        deploy_time = _NOW

        await _seed_token(cache, _DEPLOYER_A, _MINT_A, created_at=deploy_time)
        await _seed_token(cache, _DEPLOYER_B, _MINT_B, created_at=deploy_time - timedelta(days=10))

        # Funding happened 100 hours before deploy — outside the 72h window
        old_time = deploy_time - timedelta(hours=100)
        sigs = [
            _make_sig_entry("sig_old", int(old_time.timestamp())),
        ]
        fake_rpc.sig_responses[_DEPLOYER_A] = sigs

        fake_rpc.tx_responses["sig_old"] = _make_parsed_tx(
            fee_payer=_DEPLOYER_B,
            sol_transfers=[
                {"from": _DEPLOYER_B, "to": _DEPLOYER_A, "lamports": 5_000_000_000},
            ],
            block_time=int(old_time.timestamp()),
        )

        count = await signal_funding_link(_DEPLOYER_A)
        assert count == 0

    @pytest.mark.asyncio
    async def test_no_edges_when_no_known_deployers(self, cache, fake_rpc):
        """Should return 0 when deployer is the only known deployer."""
        from lineage_agent.cartel_financial_service import signal_funding_link

        await _seed_token(cache, _DEPLOYER_A, _MINT_A, created_at=_NOW)
        fake_rpc.sig_responses[_DEPLOYER_A] = []

        count = await signal_funding_link(_DEPLOYER_A)
        assert count == 0

    @pytest.mark.asyncio
    async def test_detects_outgoing_funding(self, cache, fake_rpc):
        """Should detect SOL transfers FROM deployer A TO deployer B."""
        from lineage_agent.cartel_financial_service import signal_funding_link

        deploy_time = _NOW - timedelta(hours=10)

        await _seed_token(cache, _DEPLOYER_A, _MINT_A, created_at=deploy_time)
        await _seed_token(cache, _DEPLOYER_B, _MINT_B, created_at=deploy_time)

        funding_time = deploy_time - timedelta(hours=5)
        sigs = [
            _make_sig_entry("sig_out", int(funding_time.timestamp())),
        ]
        fake_rpc.sig_responses[_DEPLOYER_A] = sigs

        fake_rpc.tx_responses["sig_out"] = _make_parsed_tx(
            fee_payer=_DEPLOYER_A,
            sol_transfers=[
                {"from": _DEPLOYER_A, "to": _DEPLOYER_B, "lamports": 1_000_000_000},
            ],
            block_time=int(funding_time.timestamp()),
        )

        count = await signal_funding_link(_DEPLOYER_A)
        assert count >= 1


# ═══════════════════════════════════════════════════════════════════════════════
# Tests: signal_shared_lp
# ═══════════════════════════════════════════════════════════════════════════════

class TestSignalSharedLp:
    @pytest.mark.asyncio
    async def test_detects_shared_lp_provider(self, cache, fake_rpc):
        """Should find edges when same LP wallet provided liquidity for A and B."""
        from lineage_agent.cartel_financial_service import signal_shared_lp

        # Deployer A's token has LP data cached
        await _seed_token(
            cache, _DEPLOYER_A, _MINT_A,
            extra_json={"lp_providers": [_LP_WALLET], "early_buyers": []},
        )

        # Deployer B's token also has the same LP wallet cached
        await _seed_token(
            cache, _DEPLOYER_B, _MINT_B,
            extra_json={"lp_providers": [_LP_WALLET], "early_buyers": []},
        )

        count = await signal_shared_lp(_DEPLOYER_A)
        assert count >= 1

        from lineage_agent.data_sources._clients import cartel_edges_query
        edges = await cartel_edges_query(_DEPLOYER_A)
        lp_edges = [e for e in edges if e["signal_type"] == "shared_lp"]
        assert len(lp_edges) >= 1

    @pytest.mark.asyncio
    async def test_no_edge_when_different_lp_providers(self, cache, fake_rpc):
        """No edge when LP providers don't overlap."""
        from lineage_agent.cartel_financial_service import signal_shared_lp

        other_lp = "OtherLPwallet0000000000000000000000000000000"

        await _seed_token(
            cache, _DEPLOYER_A, _MINT_A,
            extra_json={"lp_providers": [_LP_WALLET], "early_buyers": []},
        )
        await _seed_token(
            cache, _DEPLOYER_B, _MINT_B,
            extra_json={"lp_providers": [other_lp], "early_buyers": []},
        )

        count = await signal_shared_lp(_DEPLOYER_A)
        assert count == 0

    @pytest.mark.asyncio
    async def test_collects_and_caches_missing_data(self, cache, fake_rpc):
        """Should run RPC collection and cache when extra_json lacks lp_providers."""
        from lineage_agent.cartel_financial_service import signal_shared_lp

        # Token A has no financial data yet
        await _seed_token(cache, _DEPLOYER_A, _MINT_A, extra_json={})

        # Set up RPC responses for collection
        sigs = [_make_sig_entry("sig_lp_collect", int(_NOW.timestamp()))]
        fake_rpc.sig_responses[_MINT_A] = sigs
        fake_rpc.tx_responses["sig_lp_collect"] = _make_parsed_tx(
            fee_payer=_LP_WALLET,
            lp_program=True,
        )

        # No matching deployer B data, so no edges, but data should be collected
        count = await signal_shared_lp(_DEPLOYER_A)

        # Verify data was cached (re-query the event)
        events = await cache.query_events(
            where="event_type = 'token_created' AND mint = ?",
            params=(_MINT_A,),
            columns="extra_json",
        )
        assert events
        ej = json.loads(events[0]["extra_json"])
        assert "lp_providers" in ej


# ═══════════════════════════════════════════════════════════════════════════════
# Tests: signal_sniper_ring
# ═══════════════════════════════════════════════════════════════════════════════

class TestSignalSniperRing:
    @pytest.mark.asyncio
    async def test_detects_sniper_ring(self, cache, fake_rpc):
        """Should detect sniper ring when ≥ 2 early buyers overlap."""
        from lineage_agent.cartel_financial_service import signal_sniper_ring

        await _seed_token(
            cache, _DEPLOYER_A, _MINT_A,
            extra_json={
                "lp_providers": [],
                "early_buyers": [_BUYER_1, _BUYER_2, _BUYER_3],
            },
        )
        await _seed_token(
            cache, _DEPLOYER_B, _MINT_B,
            extra_json={
                "lp_providers": [],
                "early_buyers": [_BUYER_1, _BUYER_2],  # 2 shared buyers
            },
        )

        count = await signal_sniper_ring(_DEPLOYER_A)
        assert count >= 1

        from lineage_agent.data_sources._clients import cartel_edges_query
        edges = await cartel_edges_query(_DEPLOYER_A)
        sniper_edges = [e for e in edges if e["signal_type"] == "sniper_ring"]
        assert len(sniper_edges) >= 1
        ev = json.loads(sniper_edges[0]["evidence_json"])
        assert ev["shared_count"] >= 2

    @pytest.mark.asyncio
    async def test_no_edge_with_single_shared_buyer(self, cache, fake_rpc):
        """Exactly 1 shared buyer is below the threshold (needs ≥ 2)."""
        from lineage_agent.cartel_financial_service import signal_sniper_ring

        await _seed_token(
            cache, _DEPLOYER_A, _MINT_A,
            extra_json={
                "lp_providers": [],
                "early_buyers": [_BUYER_1, _BUYER_3],
            },
        )
        await _seed_token(
            cache, _DEPLOYER_B, _MINT_B,
            extra_json={
                "lp_providers": [],
                "early_buyers": [_BUYER_1, _BUYER_2],  # only BUYER_1 shared
            },
        )

        count = await signal_sniper_ring(_DEPLOYER_A)
        assert count == 0

    @pytest.mark.asyncio
    async def test_strength_scales_with_overlap(self, cache, fake_rpc):
        """Signal strength should increase with more shared buyers."""
        from lineage_agent.cartel_financial_service import signal_sniper_ring

        many_buyers = [f"Buyer{i:04d}{'X' * 38}" for i in range(10)]

        await _seed_token(
            cache, _DEPLOYER_A, _MINT_A,
            extra_json={"lp_providers": [], "early_buyers": many_buyers},
        )
        await _seed_token(
            cache, _DEPLOYER_B, _MINT_B,
            extra_json={"lp_providers": [], "early_buyers": many_buyers[:5]},
        )

        await signal_sniper_ring(_DEPLOYER_A)

        from lineage_agent.data_sources._clients import cartel_edges_query
        edges = await cartel_edges_query(_DEPLOYER_A)
        sniper_edges = [e for e in edges if e["signal_type"] == "sniper_ring"]
        assert sniper_edges
        # 5 shared buyers → strength = min(1.0, 0.3 + 0.15*5) = 1.05 → clamped to 1.0
        assert sniper_edges[0]["signal_strength"] == 1.0


# ═══════════════════════════════════════════════════════════════════════════════
# Tests: build_financial_edges (aggregate runner)
# ═══════════════════════════════════════════════════════════════════════════════

class TestBuildFinancialEdges:
    @pytest.mark.asyncio
    async def test_runs_all_three_signals(self, cache, fake_rpc):
        """build_financial_edges should run all 3 signals without error."""
        from lineage_agent.cartel_financial_service import build_financial_edges

        await _seed_token(cache, _DEPLOYER_A, _MINT_A, extra_json={
            "lp_providers": [],
            "early_buyers": [],
        })
        fake_rpc.sig_responses[_DEPLOYER_A] = []

        count = await build_financial_edges(_DEPLOYER_A)
        assert isinstance(count, int)
        assert count >= 0

    @pytest.mark.asyncio
    async def test_tolerates_signal_timeout(self, cache, fake_rpc, monkeypatch):
        """Should handle timeouts gracefully without crashing."""
        import lineage_agent.cartel_financial_service as fin_svc

        async def _slow(*_a, **_kw):
            import asyncio
            await asyncio.sleep(100)
            return 0

        monkeypatch.setattr(fin_svc, "signal_funding_link", _slow)
        monkeypatch.setattr(fin_svc, "_SIGNAL_TIMEOUT", 0.01)

        await _seed_token(cache, _DEPLOYER_A, _MINT_A, extra_json={
            "lp_providers": [],
            "early_buyers": [],
        })

        # Should not raise — timeouts are handled
        count = await fin_svc.build_financial_edges(_DEPLOYER_A)
        assert isinstance(count, int)


# ═══════════════════════════════════════════════════════════════════════════════
# Tests: _get_earliest_signatures
# ═══════════════════════════════════════════════════════════════════════════════

class TestGetEarliestSignatures:
    @pytest.mark.asyncio
    async def test_returns_chronological_order(self, fake_rpc):
        """Earliest signatures should be returned oldest-first."""
        from lineage_agent.cartel_financial_service import _get_earliest_signatures

        # Simulate 3 signatures, newest-first (as RPC returns)
        fake_rpc.sig_responses[_MINT_A] = [
            _make_sig_entry("sig_3", 1000003),
            _make_sig_entry("sig_2", 1000002),
            _make_sig_entry("sig_1", 1000001),
        ]

        result = await _get_earliest_signatures(fake_rpc, _MINT_A, count=3)
        assert len(result) == 3
        assert result[0]["signature"] == "sig_1"
        assert result[1]["signature"] == "sig_2"
        assert result[2]["signature"] == "sig_3"

    @pytest.mark.asyncio
    async def test_returns_count_items(self, fake_rpc):
        """Should return at most *count* items."""
        from lineage_agent.cartel_financial_service import _get_earliest_signatures

        fake_rpc.sig_responses[_MINT_A] = [
            _make_sig_entry(f"sig_{i}", 1000000 + i)
            for i in range(10, 0, -1)
        ]

        result = await _get_earliest_signatures(fake_rpc, _MINT_A, count=3)
        assert len(result) == 3

    @pytest.mark.asyncio
    async def test_empty_when_no_sigs(self, fake_rpc):
        from lineage_agent.cartel_financial_service import _get_earliest_signatures

        result = await _get_earliest_signatures(fake_rpc, _MINT_A)
        assert result == []


# ═══════════════════════════════════════════════════════════════════════════════
# Tests: Model
# ═══════════════════════════════════════════════════════════════════════════════

class TestFinancialGraphSummaryModel:
    def test_score_formula(self):
        """Verify the FinancialGraphSummary model instantiates correctly."""
        from lineage_agent.models import FinancialGraphSummary

        summary = FinancialGraphSummary(
            deployer=_DEPLOYER_A,
            funding_links=2,
            shared_lp_count=1,
            sniper_ring_count=3,
            metadata_edges=4,
            financial_score=2 * 30 + 1 * 25 + 3 * 20 + 0 * 15 + 4 * 10,
        )
        assert summary.financial_score == 185.0
        assert summary.deployer == _DEPLOYER_A

    def test_cartel_edge_accepts_new_signal_types(self):
        """CartelEdge should accept the 3 new financial signal types."""
        from lineage_agent.models import CartelEdge

        for st in ("funding_link", "shared_lp", "sniper_ring"):
            edge = CartelEdge(
                wallet_a=_DEPLOYER_A,
                wallet_b=_DEPLOYER_B,
                signal_type=st,
                signal_strength=0.8,
            )
            assert edge.signal_type == st


# ═══════════════════════════════════════════════════════════════════════════════
# Tests: Integration with cartel_service
# ═══════════════════════════════════════════════════════════════════════════════

class TestCartelServiceIntegration:
    @pytest.mark.asyncio
    async def test_build_cartel_edges_includes_financial(self, cache, fake_rpc, monkeypatch):
        """build_cartel_edges_for_deployer should call build_financial_edges."""
        from lineage_agent.cartel_service import build_cartel_edges_for_deployer

        # Seed required data
        await _seed_token(cache, _DEPLOYER_A, _MINT_A, extra_json={
            "lp_providers": [],
            "early_buyers": [],
        })
        fake_rpc.sig_responses[_DEPLOYER_A] = []

        # Should not raise — financial signals are included
        count = await build_cartel_edges_for_deployer(_DEPLOYER_A)
        assert isinstance(count, int)
