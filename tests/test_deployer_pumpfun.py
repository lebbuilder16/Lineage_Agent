"""Regression tests for deployer resolution on pump.fun and launchpad tokens.

These tests lock in the invariants documented in
``docs/helius/das.md``:

- DAS ``creators[]`` is Metaplex metadata, not the deployer wallet for
  pump.fun tokens. The pump.fun creator API is authoritative.
- ``_NON_DEPLOYER_AUTHORITIES`` must reject the pump.fun program when DAS
  returns it as the verified creator.
- Signature-walk is the correct fallback when neither path yields a
  deployer.

The backend already handles all of the above; these tests exist so a
future refactor can't silently break the pump.fun handling.
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


REAL_CREATOR = "FakeRealCreatorWallet1111111111111111111111"
PUMP_MINT = "FakeMintAddr11111111111111111111111111pump"
NON_PUMP_MINT = "FakeNonPumpMint2222222222222222222222222222"
PUMP_PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBymtzbm"  # in _NON_DEPLOYER_AUTHORITIES


class _FakeHttpResponse:
    def __init__(self, status_code: int, body: dict | None = None) -> None:
        self.status_code = status_code
        self._body = body or {}

    def json(self) -> dict:
        return self._body


class _FakeHttpClient:
    """Minimal async context-manager httpx.AsyncClient replacement."""

    def __init__(self, response: _FakeHttpResponse) -> None:
        self._response = response
        self.get = AsyncMock(return_value=response)

    async def __aenter__(self) -> "_FakeHttpClient":
        return self

    async def __aexit__(self, *args) -> None:
        return None


def _make_rpc(
    *,
    asset: dict | None = None,
    sig_walk: tuple[str, None] = ("", None),
) -> MagicMock:
    rpc = MagicMock()
    rpc.get_asset = AsyncMock(return_value=asset)
    rpc.get_deployer_and_timestamp = AsyncMock(return_value=sig_walk)
    return rpc


def _patch_http(response: _FakeHttpResponse):
    """Patch httpx.AsyncClient so the pump.fun API call returns *response*."""
    def _factory(*args, **kwargs):
        return _FakeHttpClient(response)
    return patch("httpx.AsyncClient", side_effect=_factory)


@pytest.fixture(autouse=True)
def _no_cache():
    """Force every cache lookup inside lineage_detector to miss and every
    cache write to be a no-op so these tests exercise the live paths."""
    async def _miss(_key):
        return None

    async def _noop(*args, **kwargs):
        return None

    with (
        patch("lineage_agent.lineage_detector._cache_get", side_effect=_miss),
        patch("lineage_agent.lineage_detector._cache_set", side_effect=_noop),
    ):
        yield


# ---------------------------------------------------------------------------
# Case 1 — pump.fun API succeeds → its creator wins over DAS creators[]
# ---------------------------------------------------------------------------

async def test_pumpfun_api_creator_wins_over_das():
    from lineage_agent.lineage_detector import _get_deployer_cached

    rpc = _make_rpc(
        asset={
            "creators": [
                {"address": "DasBogusCreator1111111111111111", "verified": True}
            ],
            "authorities": [],
        },
    )
    response = _FakeHttpResponse(200, {"creator": REAL_CREATOR})

    with _patch_http(response):
        deployer, _ts = await _get_deployer_cached(rpc, PUMP_MINT, skip_sig_walk=True)

    assert deployer == REAL_CREATOR, (
        "pump.fun API result must win — DAS creators[] is unreliable for pump.fun tokens"
    )


# ---------------------------------------------------------------------------
# Case 2 — pump.fun API 404 → fall back to DAS creators[]
# ---------------------------------------------------------------------------

async def test_pumpfun_404_falls_back_to_das():
    from lineage_agent.lineage_detector import _get_deployer_cached

    rpc = _make_rpc(
        asset={
            "creators": [
                {"address": REAL_CREATOR, "verified": True}
            ],
            "authorities": [],
        },
    )
    response = _FakeHttpResponse(404)

    with _patch_http(response):
        deployer, _ts = await _get_deployer_cached(rpc, NON_PUMP_MINT, skip_sig_walk=True)

    assert deployer == REAL_CREATOR


# ---------------------------------------------------------------------------
# Case 3 — DAS returns the pump.fun program itself → must be rejected
# ---------------------------------------------------------------------------

async def test_pumpfun_program_rejected_as_deployer():
    """If DAS says the creator is the pump.fun program address, the resolver
    must reject it (via _NON_DEPLOYER_AUTHORITIES) rather than persist it."""
    from lineage_agent.lineage_detector import _get_deployer_cached

    rpc = _make_rpc(
        asset={
            "creators": [
                {"address": PUMP_PROGRAM, "verified": True}
            ],
            "authorities": [],
        },
        sig_walk=("", None),  # sig-walk also returns nothing
    )
    response = _FakeHttpResponse(404)

    with _patch_http(response):
        deployer, _ts = await _get_deployer_cached(rpc, PUMP_MINT, skip_sig_walk=True)

    assert deployer == "", (
        "pump.fun program address must never be persisted as a deployer — "
        "it is in _NON_DEPLOYER_AUTHORITIES"
    )


# ---------------------------------------------------------------------------
# Case 4 — DAS empty & pump.fun 404 → sig-walk feePayer wins
# ---------------------------------------------------------------------------

async def test_sig_walk_fallback_when_das_empty():
    from lineage_agent.lineage_detector import _get_deployer_cached

    rpc = _make_rpc(
        asset={"creators": [], "authorities": []},
        sig_walk=(REAL_CREATOR, None),
    )
    response = _FakeHttpResponse(404)

    with _patch_http(response):
        deployer, _ts = await _get_deployer_cached(
            rpc, NON_PUMP_MINT, skip_sig_walk=False,
        )

    assert deployer == REAL_CREATOR
    rpc.get_deployer_and_timestamp.assert_awaited_once()


# ---------------------------------------------------------------------------
# Case 5 — mint address returned as deployer must be rejected
# ---------------------------------------------------------------------------

async def test_mint_as_deployer_rejected():
    """Some launchpads sign their own InitializeMint — the mint must never
    appear as its own deployer."""
    from lineage_agent.lineage_detector import _get_deployer_cached

    rpc = _make_rpc(
        asset={
            "creators": [
                {"address": NON_PUMP_MINT, "verified": True}
            ],
            "authorities": [],
        },
        sig_walk=("", None),
    )
    response = _FakeHttpResponse(404)

    with _patch_http(response):
        deployer, _ts = await _get_deployer_cached(
            rpc, NON_PUMP_MINT, skip_sig_walk=True,
        )

    assert deployer == "", "Mint address must never be persisted as its own deployer"
