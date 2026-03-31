"""Simulation tests for rug_detector — drain / soft-rug / dead-token logic.

Thresholds (updated 2026-03-30 to catch more pump.fun rugs):
  - Soft rug STRONG:   drain >= 75% (was 90%)
  - Soft rug MODERATE: drain >= 50% (was 75%)
  - Min recorded liq:  $500 (was $1k)
  - Dead token drain:  >= 50% (was 60%)
  - Lookback:          7 days (was 48h)
  - Min recorded liq for scanning: $200 (was $500)
"""

from __future__ import annotations

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, call, patch

import pytest

from lineage_agent.models import EvidenceLevel, LifecycleStage, RugMechanism

MINT = "SimMint1111111111111111111111111111111111111"
MINT2 = "SimMint2222222222222222222222222222222222222"
DEPLOYER = "SimDeployer111111111111111111111111111111111"
CREATED_AT = "2024-01-01T00:00:00+00:00"


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _row(liq_usd: float, mint: str = MINT, lifecycle: str = "dex_listed") -> dict:
    return {
        "mint": mint,
        "deployer": DEPLOYER,
        "liq_usd": liq_usd,
        "created_at": CREATED_AT,
        "launch_platform": "pump-fun",
        "lifecycle_stage": lifecycle,
        "market_surface": "dex_pool_observed",
    }


def _pairs(liq_usd: float, chain: str = "solana") -> list[dict]:
    return [{"chainId": chain, "liquidity": {"usd": liq_usd}}]


def _make_dex(liq_usd: float, chain: str = "solana") -> MagicMock:
    dex = MagicMock()
    dex.get_token_pairs_with_fallback = AsyncMock(return_value=_pairs(liq_usd, chain))
    return dex


async def _run(rows: list[dict], dex: MagicMock, mock_insert: AsyncMock, mock_update: AsyncMock) -> int:
    """Run one sweep with fully mocked dependencies."""
    with (
        patch("lineage_agent.rug_detector.event_query", new=AsyncMock(return_value=rows)),
        patch("lineage_agent.rug_detector.event_insert", new=mock_insert),
        patch("lineage_agent.rug_detector.event_update", new=mock_update),
        patch("lineage_agent.rug_detector.get_dex_client", return_value=dex),
        patch("asyncio.create_task"),   # neutralise fire-and-forget sol_trace
    ):
        from lineage_agent.rug_detector import _run_rug_sweep
        return await _run_rug_sweep()


def _inserted_kwargs(mock_insert: AsyncMock) -> dict:
    """Return the kwargs of the first event_insert call."""
    assert mock_insert.call_count == 1
    return mock_insert.call_args.kwargs


# ─── Tests ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_hard_rug_absolute_floor():
    """Liq < $100 → DEX_LIQUIDITY_RUG / STRONG."""
    insert = AsyncMock()
    update = AsyncMock()
    count = await _run([_row(50_000)], _make_dex(50.0), insert, update)

    assert count == 1
    kw = _inserted_kwargs(insert)
    assert kw["rug_mechanism"] == RugMechanism.DEX_LIQUIDITY_RUG.value
    assert kw["evidence_level"] == EvidenceLevel.STRONG.value
    assert "liquidity_below_dead_threshold" in json.loads(kw["reason_codes"])
    assert kw["liq_usd"] == 50.0


@pytest.mark.asyncio
async def test_soft_rug_strong_95pct_drain():
    """$80k → $4k = 95% drain → LIQUIDITY_DRAIN_RUG / STRONG (≥90%)."""
    insert = AsyncMock()
    update = AsyncMock()
    count = await _run([_row(80_000)], _make_dex(4_000), insert, update)

    assert count == 1
    kw = _inserted_kwargs(insert)
    assert kw["rug_mechanism"] == RugMechanism.LIQUIDITY_DRAIN_RUG.value
    assert kw["evidence_level"] == EvidenceLevel.STRONG.value
    reason_codes = json.loads(kw["reason_codes"])
    assert "liquidity_drained_95pct" in reason_codes
    assert kw["liq_usd"] == 4_000


@pytest.mark.asyncio
async def test_soft_rug_strong_80pct_drain():
    """$80k → $16k = 80% drain → LIQUIDITY_DRAIN_RUG / STRONG (≥75%)."""
    insert = AsyncMock()
    update = AsyncMock()
    count = await _run([_row(80_000)], _make_dex(16_000), insert, update)

    assert count == 1
    kw = _inserted_kwargs(insert)
    assert kw["rug_mechanism"] == RugMechanism.LIQUIDITY_DRAIN_RUG.value
    assert kw["evidence_level"] == EvidenceLevel.STRONG.value
    reason_codes = json.loads(kw["reason_codes"])
    assert "liquidity_drained_80pct" in reason_codes


@pytest.mark.asyncio
async def test_soft_rug_moderate_50pct_drain():
    """$80k → $40k = 50% drain → LIQUIDITY_DRAIN_RUG / MODERATE (≥50%)."""
    insert = AsyncMock()
    update = AsyncMock()
    count = await _run([_row(80_000)], _make_dex(40_000), insert, update)

    assert count == 1
    kw = _inserted_kwargs(insert)
    assert kw["rug_mechanism"] == RugMechanism.LIQUIDITY_DRAIN_RUG.value
    assert kw["evidence_level"] == EvidenceLevel.MODERATE.value


@pytest.mark.asyncio
async def test_soft_rug_at_low_recorded_liq():
    """Recorded liq $600 (≥$500 min), drain 75% → LIQUIDITY_DRAIN_RUG / STRONG.
    With lowered thresholds: min recorded = $500, strong = 75%."""
    insert = AsyncMock()
    update = AsyncMock()
    # recorded=$600 (≥ $500 min), current=$150 → drain 75% → STRONG
    count = await _run([_row(600)], _make_dex(150), insert, update)

    assert count == 1
    kw = _inserted_kwargs(insert)
    assert kw["rug_mechanism"] == RugMechanism.LIQUIDITY_DRAIN_RUG.value
    assert kw["evidence_level"] == EvidenceLevel.STRONG.value


@pytest.mark.asyncio
async def test_high_water_mark_update_no_rug():
    """current > recorded → event_update pour mémoriser le pic, pas de rug ce cycle."""
    insert = AsyncMock()
    update = AsyncMock()
    # recorded=$8k en base, mais DexScreener montre $80k (token a grandi)
    count = await _run([_row(8_000)], _make_dex(80_000), insert, update)

    assert count == 0
    insert.assert_not_called()
    # Le pic doit être persisté
    update.assert_called_once()
    update_kwargs = update.call_args.kwargs
    assert update_kwargs["liq_usd"] == 80_000.0
    assert MINT in update_kwargs["params"]  # params contient le mint


@pytest.mark.asyncio
async def test_two_cycles_peak_then_drain():
    """Simulation de deux sweeps successifs.

    Cycle 1 : liq_usd=$8k en base, DexScreener=$80k → peak update → pas de rug
    Cycle 2 : liq_usd=$80k (mis à jour), DexScreener=$4k → drain 95% → RUG STRONG
    """
    # ── Cycle 1 ────────────────────────────────────────────────────────────────
    insert1 = AsyncMock()
    update1 = AsyncMock()
    count1 = await _run([_row(8_000)], _make_dex(80_000), insert1, update1)

    assert count1 == 0
    insert1.assert_not_called()
    update1.assert_called_once()  # peak mémorisé à $80k

    # ── Cycle 2 : DB retourne maintenant liq_usd=$80k (mis à jour) ─────────────
    insert2 = AsyncMock()
    update2 = AsyncMock()
    count2 = await _run([_row(80_000)], _make_dex(4_000), insert2, update2)

    assert count2 == 1
    kw = _inserted_kwargs(insert2)
    assert kw["rug_mechanism"] == RugMechanism.LIQUIDITY_DRAIN_RUG.value
    assert kw["evidence_level"] == EvidenceLevel.STRONG.value
    update2.assert_not_called()  # pas de mise à jour peak quand liq chute


@pytest.mark.asyncio
async def test_non_dex_context_skipped():
    """Token sans contexte DEX confirmé → ignoré, aucun insert.

    Les trois conditions sont toutes fausses :
      - lifecycle_stage != 'dex_listed'
      - market_surface != 'dex_pool_observed'
      - aucune paire Solana retournée par DexScreener
    """
    insert = AsyncMock()
    update = AsyncMock()
    row = {
        "mint": MINT,
        "deployer": DEPLOYER,
        "liq_usd": 80_000,
        "created_at": CREATED_AT,
        "launch_platform": "pump-fun",
        "lifecycle_stage": "bonding_curve",   # pas dex_listed
        "market_surface": "bonding_curve",    # pas dex_pool_observed
    }
    dex = MagicMock()
    dex.get_token_pairs_with_fallback = AsyncMock(return_value=_pairs(50, chain="ethereum"))  # pas Solana
    count = await _run([row], dex, insert, update)

    assert count == 0
    insert.assert_not_called()


@pytest.mark.asyncio
async def test_empty_rows_returns_zero():
    """Aucun token en base → retourne 0 sans appel DexScreener."""
    insert = AsyncMock()
    update = AsyncMock()
    dex = _make_dex(0)
    count = await _run([], dex, insert, update)

    assert count == 0
    dex.get_token_pairs_with_fallback.assert_not_called()


@pytest.mark.asyncio
async def test_hard_rug_takes_priority_over_soft():
    """current < $100 : hard rug prioritaire même si recorded > $5k et drain ≥ 90%."""
    insert = AsyncMock()
    update = AsyncMock()
    # recorded=$80k, current=$50 → hard rug (< $100), pas soft rug
    count = await _run([_row(80_000)], _make_dex(50), insert, update)

    assert count == 1
    kw = _inserted_kwargs(insert)
    assert kw["rug_mechanism"] == RugMechanism.DEX_LIQUIDITY_RUG.value
    assert kw["evidence_level"] == EvidenceLevel.STRONG.value


@pytest.mark.asyncio
async def test_multiple_tokens_independent():
    """Plusieurs tokens dans un même sweep — chacun classifié indépendamment."""
    insert = AsyncMock()
    update = AsyncMock()
    rows = [
        _row(80_000, mint=MINT),   # soft rug ($80k → $4k = 95% drain → STRONG)
        _row(80_000, mint=MINT2),  # also rug ($80k → $40k = 50% drain → MODERATE)
    ]
    dex = MagicMock()
    dex.get_token_pairs_with_fallback = AsyncMock(side_effect=[
        _pairs(4_000),   # MINT  → STRONG rug
        _pairs(40_000),  # MINT2 → MODERATE rug (50% drain ≥ 50% threshold)
    ])
    count = await _run(rows, dex, insert, update)

    assert count == 2
    assert insert.call_count == 2


@pytest.mark.asyncio
async def test_reason_code_contains_drain_percentage():
    """Le reason_code encode le pourcentage exact du drain."""
    insert = AsyncMock()
    update = AsyncMock()
    # $50k → $2k = 96% drain
    count = await _run([_row(50_000)], _make_dex(2_000), insert, update)

    assert count == 1
    reason_codes = json.loads(insert.call_args.kwargs["reason_codes"])
    assert "liquidity_drained_96pct" in reason_codes


@pytest.mark.asyncio
async def test_exact_50pct_boundary_is_moderate():
    """Exactement 50% drain (recorded ≥$500) → MODERATE."""
    insert = AsyncMock()
    update = AsyncMock()
    # recorded=$10k, current=$5k → drain = 50.0% exactement
    count = await _run([_row(10_000)], _make_dex(5_000), insert, update)

    assert count == 1
    kw = _inserted_kwargs(insert)
    assert kw["rug_mechanism"] == RugMechanism.LIQUIDITY_DRAIN_RUG.value
    assert kw["evidence_level"] == EvidenceLevel.MODERATE.value


@pytest.mark.asyncio
async def test_exact_75pct_boundary_is_strong():
    """Exactement 75% drain → STRONG."""
    insert = AsyncMock()
    update = AsyncMock()
    # recorded=$10k, current=$2.5k → drain = 75.0% exactement
    count = await _run([_row(10_000)], _make_dex(2_500), insert, update)

    assert count == 1
    kw = _inserted_kwargs(insert)
    assert kw["rug_mechanism"] == RugMechanism.LIQUIDITY_DRAIN_RUG.value
    assert kw["evidence_level"] == EvidenceLevel.STRONG.value


# ─── Dead Token Tests ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_dead_token_low_liq_high_drain():
    """liq < $500, drain ≥ 50%, recorded < $500 (no soft rug) → DEAD_TOKEN / MODERATE."""
    insert = AsyncMock()
    update = AsyncMock()
    # recorded=$400 (< $500 min for soft rug), current=$150 → drain 62.5%, liq < $500
    count = await _run([_row(400)], _make_dex(150), insert, update)

    assert count == 1
    kw = _inserted_kwargs(insert)
    assert kw["rug_mechanism"] == RugMechanism.DEAD_TOKEN.value
    assert kw["evidence_level"] == EvidenceLevel.MODERATE.value
    reason_codes = json.loads(kw["reason_codes"])
    assert "token_dead_natural_fade" in reason_codes
    assert any("liquidity_faded_" in r for r in reason_codes)


@pytest.mark.asyncio
async def test_dead_token_below_500_with_80pct_drain():
    """$2k → $400 = 80% drain, recorded ≥$500 → soft rug STRONG takes priority."""
    insert = AsyncMock()
    update = AsyncMock()
    # recorded=$2k (≥ $500), current=$400, drain = 80% → soft rug STRONG (≥75%)
    count = await _run([_row(2_000)], _make_dex(400), insert, update)

    assert count == 1
    kw = _inserted_kwargs(insert)
    assert kw["rug_mechanism"] == RugMechanism.LIQUIDITY_DRAIN_RUG.value
    assert kw["evidence_level"] == EvidenceLevel.STRONG.value


@pytest.mark.asyncio
async def test_dead_token_skipped_drain_below_50pct():
    """liq < $500 but drain < 50% → token still alive."""
    insert = AsyncMock()
    update = AsyncMock()
    # recorded=$400 (below scanning min $200? no, $400 > $200), current=$250 → drain 37.5%
    count = await _run([_row(400)], _make_dex(250), insert, update)

    assert count == 0
    insert.assert_not_called()


@pytest.mark.asyncio
async def test_dead_token_skipped_liq_above_500():
    """drain ≥ 60% but liq ≥ $500 and recorded < $1k → not soft rug, not dead → alive."""
    insert = AsyncMock()
    update = AsyncMock()
    # recorded=$900 (< $1k), current=$350 → drain 61%, but current $350 < $500 → dead token
    # Actually let's test: recorded=$900, current=$550 → drain 39%, liq > $500 → alive
    count = await _run([_row(900)], _make_dex(550), insert, update)

    assert count == 0
    insert.assert_not_called()
