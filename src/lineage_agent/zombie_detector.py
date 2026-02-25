"""
Phase 1 — Zombie Token (Resurrection) Detector.

Detects when a dead token (liquidity → 0) has been relaunched under a new
mint by the same operator.  Uses data already present in LineageResult —
zero additional network calls.

Logic
-----
For each pair (token_A, token_B) in the family:
- If token_A.liquidity_usd < $100 AND token_A is older than 24h → "dead"
- If token_B is alive AND same deployer → CONFIRMED zombie
- If token_B is alive AND image_score > 0.92 (different deployer) → PROBABLE zombie
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from .models import DerivativeInfo, LineageResult, TokenMetadata, ZombieAlert

logger = logging.getLogger(__name__)

_DEAD_LIQUIDITY_THRESHOLD = 100.0      # USD — below this we consider the token rugged
_DEAD_MIN_AGE_HOURS = 24.0             # token must be at least 24h old to be "definitely dead"
_ZOMBIE_SAME_DEPLOYER_IMAGE_MIN = 0.72 # same deployer + this image sim → confirmed
_ZOMBIE_DIFF_DEPLOYER_IMAGE_MIN = 0.92 # different deployer needs very high image sim


def detect_resurrection(result: LineageResult) -> Optional[ZombieAlert]:
    """Scan a LineageResult for zombie / resurrection patterns.

    Returns the highest-confidence ZombieAlert found, or None.
    """
    if not result.root:
        return None

    now = datetime.now(tz=timezone.utc)
    all_tokens: list[tuple[str, str, Optional[float], Optional[datetime], str, float]] = []
    # (mint, name, liq_usd, created_at, deployer, image_score_vs_root)

    # Root token — image score vs itself is 1.0
    all_tokens.append((
        result.root.mint,
        result.root.name or result.root.symbol,
        result.root.liquidity_usd,
        result.root.created_at,
        result.root.deployer,
        1.0,
    ))

    for d in result.derivatives:
        all_tokens.append((
            d.mint,
            d.name or d.symbol,
            d.liquidity_usd,
            d.created_at,
            "",  # deployer not stored on DerivativeInfo — use deployer_score proxy
            d.evidence.image_score,
        ))

    # Try pairing each dead token with each alive token
    best: Optional[ZombieAlert] = None
    best_priority = -1

    for i, (mint_a, name_a, liq_a, created_a, dep_a, _img_a) in enumerate(all_tokens):
        if not _is_dead(liq_a, created_a, now):
            continue

        for j, (mint_b, _name_b, liq_b, _created_b, _dep_b, img_b_vs_root) in enumerate(all_tokens):
            if i == j:
                continue
            if _is_dead(liq_b, _created_b, now):
                continue  # both dead — not a resurrection

            # Check if same deployer (root vs derivative we can infer from deployer_score)
            same_deployer = False
            for d in result.derivatives:
                if d.mint == mint_b and d.evidence.deployer_score >= 0.99:
                    same_deployer = True
                if d.mint == mint_a and d.evidence.deployer_score >= 0.99:
                    same_deployer = True
            # NOTE: pairing root with a derivative does NOT automatically mean
            # same_deployer — we rely on deployer_score only.

            confidence: str | None = None
            priority = -1

            if same_deployer and img_b_vs_root >= _ZOMBIE_SAME_DEPLOYER_IMAGE_MIN:
                confidence = "confirmed"
                priority = 3
            elif same_deployer and img_b_vs_root >= 0.60:
                confidence = "probable"
                priority = 2
            elif (not same_deployer) and img_b_vs_root >= _ZOMBIE_DIFF_DEPLOYER_IMAGE_MIN:
                confidence = "probable"
                priority = 1
            elif (not same_deployer) and img_b_vs_root >= 0.80:
                confidence = "possible"
                priority = 0

            if confidence and priority > best_priority:
                # Find the resurrection mint (the alive one if A is dead)
                resurrection_mint = mint_b
                if mint_b == result.root.mint:
                    resurrection_mint = mint_b
                    dead_mint = mint_a
                    dead_name = name_a
                    dead_created = created_a
                    dead_liq = liq_a
                else:
                    dead_mint = mint_a
                    dead_name = name_a
                    dead_created = created_a
                    dead_liq = liq_a

                best = ZombieAlert(
                    original_mint=dead_mint,
                    original_name=dead_name or dead_mint[:8],
                    original_rugged_at=None,  # creation date != rug date; unknown
                    original_liq_peak_usd=dead_liq,
                    resurrection_mint=resurrection_mint,
                    image_similarity=round(img_b_vs_root, 4),
                    same_deployer=same_deployer,
                    confidence=confidence,  # type: ignore[arg-type]
                )
                best_priority = priority

    return best


def _is_dead(
    liq_usd: Optional[float],
    created_at: Optional[datetime],
    now: datetime,
) -> bool:
    """Return True if a token appears to be rugged / dead."""
    if liq_usd is None:
        return False
    if liq_usd >= _DEAD_LIQUIDITY_THRESHOLD:
        return False
    # Require minimum age to avoid false positives with new low-liq tokens
    if created_at is None:
        return True
    # Ensure tz-aware comparison
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    age_hours = (now - created_at).total_seconds() / 3600
    return age_hours >= _DEAD_MIN_AGE_HOURS
