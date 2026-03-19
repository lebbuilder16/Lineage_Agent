"""
Phase 2 — Death Clock: Deployer Rug Timing Forecast.

Uses historical rug events recorded in ``intelligence_events`` for a
deployer to forecast the statistical window when the current token may
be rugged.

Reads from the ``intelligence_events`` table (written by lineage_detector
at analysis time). Requires at least 2 confirmed rug events for the same
deployer to produce a meaningful forecast.
"""

from __future__ import annotations

import logging
import statistics
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Optional

from .data_sources._clients import event_query, operator_mapping_query_by_wallet
from .factory_service import analyze_factory_rhythm
from .models import (
    DeathClockForecast,
    EvidenceLevel,
    MarketSignals,
    MarketSurface,
    RugMechanism,
    TokenMetadata,
)
from .rug_detector import normalize_legacy_rug_events
from .utils import parse_datetime as _parse_dt

logger = logging.getLogger(__name__)

_MIN_SAMPLES = 1          # minimum rug events to compute forecast (1 = single-sample mode)
_MAX_STDEV_RATIO = 2.0    # cap stdev at 2× median to avoid absurd windows
_PREDICTIVE_RUG_MECHANISMS = {
    RugMechanism.DEX_LIQUIDITY_RUG.value,
    RugMechanism.PRE_DEX_EXTRACTION_RUG.value,
    RugMechanism.LIQUIDITY_DRAIN_RUG.value,
}
_CONFIRMED_EVIDENCE_LEVELS = {
    EvidenceLevel.MODERATE.value,
    EvidenceLevel.STRONG.value,
}


def _is_confirmed_predictive_rug(row: dict) -> bool:
    mechanism = (row.get("rug_mechanism") or "").strip()
    evidence_level = (row.get("evidence_level") or "").strip()
    if not mechanism:
        return True
    if mechanism not in _PREDICTIVE_RUG_MECHANISMS:
        return False
    if not evidence_level:
        return True
    return evidence_level in _CONFIRMED_EVIDENCE_LEVELS


async def _fetch_deployer_durations(deployer: str) -> list[float]:
    """Return confirmed predictive rug durations (hours) for a single deployer."""
    rows = await event_query(
        where="deployer = ? AND event_type = 'token_rugged' AND rugged_at IS NOT NULL AND created_at IS NOT NULL",
        params=(deployer,),
        columns="mint, created_at, rugged_at, rug_mechanism, evidence_level",
    )
    confirmed = [r for r in rows if _is_confirmed_predictive_rug(r)]
    durations: list[float] = []
    for row in confirmed:
        try:
            created = _parse_dt(row["created_at"])
            rugged = _parse_dt(row["rugged_at"])
            if created and rugged and rugged > created:
                durations.append((rugged - created).total_seconds() / 3600.0)
        except Exception:
            continue
    return durations


async def compute_death_clock(
    deployer: str,
    token_created_at: Optional[datetime],
    token_metadata: Optional[TokenMetadata] = None,
) -> Optional[DeathClockForecast]:
    """Compute a rug timing forecast for a token based on deployer history.

    Extends the base deployer-level prediction with two enhancements:

    1. **Operator network fallback**: when the deployer has < 3 individual
       samples, sibling deployers sharing the same DNA fingerprint are
       queried and their rug timing is aggregated to improve coverage for
       factory-style operators who rotate wallet addresses.

    2. **Market signal escalation**: the ``adjusted_risk_boost`` computed
       from live liquidity / mcap signals is now applied to the timing-based
       ``risk_level`` (previously calculated but never wired).

    Parameters
    ----------
    deployer:
        The deployer wallet address.
    token_created_at:
        On-chain creation timestamp of the token being analysed.
    token_metadata:
        Optional current market data used for market signal escalation.

    Returns
    -------
    DeathClockForecast or None if insufficient data.
    """
    if not deployer or not token_created_at:
        return None

    await normalize_legacy_rug_events(deployer=deployer)

    # ── Step 1: fetch deployer-specific rug events ──────────────────────────
    rows = await event_query(
        where="deployer = ? AND event_type = 'token_rugged' AND rugged_at IS NOT NULL AND created_at IS NOT NULL",
        params=(deployer,),
        columns="mint, created_at, rugged_at, rug_mechanism, evidence_level",
    )
    total_negative_outcomes = len(rows)
    confirmed_rows = [r for r in rows if _is_confirmed_predictive_rug(r)]
    basis_breakdown = Counter(
        (r.get("rug_mechanism") or RugMechanism.UNKNOWN.value) for r in confirmed_rows
    )

    deployer_durations = await _fetch_deployer_durations(deployer)

    # ── Step 2: factory detection + operator-network fallback ───────────────
    is_factory = False
    operator_sample_count = 0
    prediction_basis: str = "insufficient"
    operator_durations: list[float] = []

    try:
        factory_report = await analyze_factory_rhythm(deployer)
        if factory_report is not None:
            is_factory = factory_report.is_factory
    except Exception:
        pass

    if len(deployer_durations) < 3:
        # Try to enrich via operator fingerprint (sibling deployers)
        try:
            fingerprint_rows = await operator_mapping_query_by_wallet(deployer)
            seen_deployers: set[str] = {deployer}
            for fp_row in fingerprint_rows:
                fingerprint = fp_row.get("fingerprint")
                if not fingerprint:
                    continue
                # Import here to avoid circular — _clients already imported above
                from .data_sources._clients import operator_mapping_query  # noqa: PLC0415
                sibling_rows = await operator_mapping_query(fingerprint)
                for sib in sibling_rows:
                    sib_wallet = sib.get("wallet") or sib.get("deployer") or ""
                    if sib_wallet and sib_wallet not in seen_deployers:
                        seen_deployers.add(sib_wallet)
                        sib_durations = await _fetch_deployer_durations(sib_wallet)
                        operator_durations.extend(sib_durations)
            operator_sample_count = len(operator_durations)
        except Exception as exc:
            logger.debug("[death_clock] operator fallback failed: %s", exc)

    all_durations = deployer_durations + operator_durations

    if len(deployer_durations) >= _MIN_SAMPLES:
        prediction_basis = "deployer"
    elif len(all_durations) >= _MIN_SAMPLES:
        prediction_basis = "operator"
    else:
        prediction_basis = "insufficient"

    # ── Step 3: return insufficient_data when no samples at all ─────────────
    if len(all_durations) < _MIN_SAMPLES:
        # Build deployer profile summary so "insufficient" is explicit, not silent
        _profile_summary: str | None = None
        try:
            _created_rows = await event_query(
                where="deployer = ? AND event_type = 'token_created'",
                params=(deployer,),
                columns="mint, created_at",
            )
            _total_launched = len(_created_rows)
            _first_seen = None
            if _created_rows:
                _dates = sorted(
                    _parse_dt(r["created_at"])
                    for r in _created_rows
                    if r.get("created_at") and _parse_dt(r["created_at"])
                )
                if _dates:
                    _first_seen = _dates[0]

            if _total_launched == 0:
                _profile_summary = (
                    f"First-time deployer — no prior tokens recorded. "
                    f"No rug history. Wallet age unknown."
                )
            else:
                _age_str = ""
                if _first_seen:
                    _age_h = (datetime.now(timezone.utc) - _first_seen).total_seconds() / 3600
                    if _age_h < 24:
                        _age_str = f", wallet active since {_age_h:.0f}h"
                    else:
                        _age_str = f", wallet active since {_age_h / 24:.0f}d"
                _profile_summary = (
                    f"{_total_launched} token(s) launched, "
                    f"{total_negative_outcomes} rug(s) recorded"
                    f"{_age_str}. "
                    f"No confirmed rug timing data available for prediction."
                )
        except Exception:
            _profile_summary = "Deployer history query failed — no profile available."

        return DeathClockForecast(
            deployer=deployer,
            historical_rug_count=0,
            median_rug_hours=0.0,
            stdev_rug_hours=0.0,
            elapsed_hours=_elapsed_hours(token_created_at),
            risk_level="insufficient_data",
            confidence_note="No prior rug events on record for this deployer",
            sample_count=0,
            confidence_level="low",
            total_negative_outcome_count=total_negative_outcomes,
            basis_breakdown=dict(basis_breakdown),
            is_factory=is_factory,
            prediction_basis="insufficient",  # type: ignore[arg-type]
            operator_sample_count=operator_sample_count,
            deployer_profile_summary=_profile_summary,
        )

    # ── Step 4: compute timing statistics ───────────────────────────────────
    single_sample = len(all_durations) == 1
    median_h = statistics.median(all_durations)

    if single_sample:
        stdev_h = median_h * 0.5
    else:
        stdev_h = (
            statistics.stdev(all_durations) if len(all_durations) >= 3 else median_h * 0.30
        )
        stdev_h = min(stdev_h, median_h * _MAX_STDEV_RATIO)

    elapsed_h = _elapsed_hours(token_created_at)
    ratio = elapsed_h / median_h if median_h > 0 else 0.0

    if single_sample:
        risk_level = "first_rug"
    elif ratio < 0.5:
        risk_level = "low"
    elif ratio < 0.8:
        risk_level = "medium"
    elif ratio < 1.0:
        risk_level = "high"
    else:
        risk_level = "critical"

    # ── Step 5: wire market-signal boost to risk_level ──────────────────────
    market_signals = _compute_market_signals(token_metadata, risk_level)
    if market_signals and market_signals.adjusted_risk_boost >= 1.0 and risk_level not in ("first_rug", "insufficient_data"):
        steps = int(market_signals.adjusted_risk_boost)
        for _ in range(steps):
            risk_level = _RISK_ESCALATION.get(risk_level, risk_level)

    # ── Step 6: predicted window ─────────────────────────────────────────────
    window_start = token_created_at + timedelta(hours=max(0.0, median_h - stdev_h))
    window_end = token_created_at + timedelta(hours=median_h + stdev_h)
    if token_created_at.tzinfo is None:
        token_created_at = token_created_at.replace(tzinfo=timezone.utc)
        window_start = window_start.replace(tzinfo=timezone.utc)
        window_end = window_end.replace(tzinfo=timezone.utc)

    # ── Step 7: confidence level ─────────────────────────────────────────────
    total_samples = len(all_durations)
    if total_samples >= 5:
        _confidence_level = "high"
    elif total_samples >= 2:
        _confidence_level = "medium"
    else:
        _confidence_level = "low"

    # ── Step 8: confidence note ──────────────────────────────────────────────
    deployer_n = len(deployer_durations)
    operator_n = operator_sample_count
    if prediction_basis == "operator":
        n_siblings = len({w for w in [] if w})  # placeholder; count noted in operator_sample_count
        confidence_note = (
            f"Based on {total_samples} samples from operator network "
            f"({deployer_n} direct + {operator_n} sibling deployers)"
        )
    elif single_sample:
        confidence_note = "Single prior rug — estimate based on 1 data point (\u00b150% window)"
    else:
        confidence_note = f"Based on {deployer_n} confirmed rug(s)"

    return DeathClockForecast(
        deployer=deployer,
        historical_rug_count=deployer_n,
        median_rug_hours=round(median_h, 2),
        stdev_rug_hours=round(stdev_h, 2),
        elapsed_hours=round(elapsed_h, 2),
        risk_level=risk_level,  # type: ignore[arg-type]
        predicted_window_start=window_start,
        predicted_window_end=window_end,
        sample_count=deployer_n,
        confidence_level=_confidence_level,  # type: ignore[arg-type]
        total_negative_outcome_count=total_negative_outcomes,
        basis_breakdown=dict(basis_breakdown),
        confidence_note=confidence_note,
        market_signals=market_signals,
        is_factory=is_factory,
        prediction_basis=prediction_basis,  # type: ignore[arg-type]
        operator_sample_count=operator_sample_count,
    )


def _compute_rug_probability(
    elapsed_h: float,
    median_h: float,
    stdev_h: float,
    sample_count: int,
    operator_sample_count: int,
    confidence_level: str,
    market_signals: Optional[MarketSignals],
    insider_verdict: Optional[str],
    deployer_exited: bool,
) -> Optional[float]:
    """Composite rug probability 0–99 from timing + confidence + live signals.

    Returns None when no sample data is available (no prediction possible).
    """
    total_samples = sample_count + operator_sample_count
    if total_samples == 0 or median_h <= 0:
        # No timing history — still possible to compute a signal-only estimate
        # when live signals are very strong (deployer exited = near-certain rug)
        if deployer_exited and insider_verdict == "insider_dump":
            return 88.0
        if insider_verdict == "insider_dump":
            return 65.0
        return None

    # 1. Timing score (0–50 pts) — how far through the expected rug window
    window_end_h = median_h + stdev_h
    timing_score = min(elapsed_h / window_end_h, 1.2) * 50.0

    # 2. Confidence weight degrades score when few samples exist
    conf_weight = {"low": 0.45, "medium": 0.72, "high": 1.0}.get(confidence_level, 0.45)
    timing_score *= conf_weight

    # 3. Live signal bonuses (0–40 pts)
    bonus = 0.0
    if market_signals is not None:
        if market_signals.adjusted_risk_boost >= 2.0:
            bonus += 18.0
        elif market_signals.adjusted_risk_boost >= 1.0:
            bonus += 9.0
    if deployer_exited:
        bonus += 22.0
    elif insider_verdict == "insider_dump":
        bonus += 14.0
    elif insider_verdict == "suspicious":
        bonus += 6.0

    return round(min(timing_score + bonus, 99.0), 1)


def _elapsed_hours(created_at: datetime) -> float:
    now = datetime.now(tz=timezone.utc)
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    return max(0.0, (now - created_at).total_seconds() / 3600.0)


# ---------------------------------------------------------------------------
# Market signal helpers
# ---------------------------------------------------------------------------

# Risk escalation order (each step escalates by one level)
_RISK_ESCALATION: dict[str, str] = {
    "low": "medium",
    "medium": "high",
    "high": "critical",
    "critical": "critical",   # already at max
    "first_rug": "first_rug",  # single-sample mode — don't escalate
    "insufficient_data": "insufficient_data",
}

# Thresholds that trigger a risk boost
_LOW_LIQ_USD = 500.0          # below this liquidity → suspicious
_LOW_LIQ_MCAP_RATIO = 0.005   # liquidity < 0.5 % of mcap → typical pre-rug setup


def _compute_market_signals(
    metadata: Optional[TokenMetadata],
    timing_risk: str,
) -> Optional[MarketSignals]:
    """Derive :class:`MarketSignals` from token metadata fields.

    No extra RPC or HTTP calls are made — only uses the already-fetched
    ``TokenMetadata`` fields (``liquidity_usd``, ``market_cap_usd``).

    Returns ``None`` when no metadata is provided.

    Parameters
    ----------
    metadata:
        Enriched token metadata (may have ``None`` fields).
    timing_risk:
        The timing-based risk level *before* market adjustment.

    Returns
    -------
    MarketSignals with ``adjusted_risk_boost`` reflecting how many steps
    the market data would escalate the timing risk, or ``None`` when
    ``metadata is None``.
    """
    if metadata is None:
        return None

    if metadata.market_surface != MarketSurface.DEX_POOL_OBSERVED:
        return None

    liq = metadata.liquidity_usd
    mcap = metadata.market_cap_usd

    boost = 0.0

    # Signal 1 — dangerously low absolute liquidity
    if liq is not None and liq < _LOW_LIQ_USD:
        boost += 1.0
        logger.debug(
            "[death_clock] market signal: liq=%.2f < %.0f → boost +1",
            liq, _LOW_LIQ_USD,
        )

    # Signal 2 — liquidity / mcap ratio indicates pre-rug LP drain
    liq_mcap_ratio: Optional[float] = None
    if liq is not None and mcap is not None and mcap > 0:
        liq_mcap_ratio = liq / mcap
        if liq_mcap_ratio < _LOW_LIQ_MCAP_RATIO:
            boost += 1.0
            logger.debug(
                "[death_clock] market signal: liq/mcap=%.4f < %.3f → boost +1",
                liq_mcap_ratio, _LOW_LIQ_MCAP_RATIO,
            )

    # Cap boost at 3 (matches model Field constraint)
    boost = min(3.0, boost)

    return MarketSignals(
        liquidity_usd=liq,
        market_cap_usd=mcap,
        liq_to_mcap_ratio=round(liq_mcap_ratio, 6) if liq_mcap_ratio is not None else None,
        adjusted_risk_boost=boost,
    )


# _parse_dt is now imported from .utils (unified parse_datetime)
