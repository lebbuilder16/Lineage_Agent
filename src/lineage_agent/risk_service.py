"""
On-Chain Risk Score Service.

Fetches up to 100 token holder accounts via Helius DAS ``getTokenAccounts``
and computes a concentration-based risk score.

Score breakdown (0-100 total):
  - Top-10 wallets hold ≥80% supply  → +40 pts (≥60%  → +20 pts)
  - Deployer wallet holds ≥10%       → +30 pts (≥5%  → +15 pts)
  - Fewer than 50 holders            → +20 pts (< 100 → +10 pts)
  - Top-1 wallet holds ≥50% supply   → +10 pts

Risk levels:
  0-24  → low
  25-49 → medium
  50-74 → high
  75+   → critical
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from .data_sources._clients import get_rpc_client
from .models import OnChainRiskScore

logger = logging.getLogger(__name__)

_TIMEOUT_SECONDS = 8.0


async def compute_on_chain_risk(
    mint: str, deployer: str = ""
) -> OnChainRiskScore | None:
    """Return an ``OnChainRiskScore`` for *mint*, or ``None`` on failure/timeout."""
    if not mint:
        return None
    try:
        return await asyncio.wait_for(
            _compute(mint, deployer), timeout=_TIMEOUT_SECONDS
        )
    except asyncio.TimeoutError:
        logger.debug("on_chain_risk timed out for %s", mint)
        return None
    except Exception as exc:
        logger.debug("on_chain_risk failed for %s: %s", mint, exc)
        return None


async def _compute(mint: str, deployer: str) -> OnChainRiskScore | None:
    rpc = get_rpc_client()
    accounts: list[dict[str, Any]] = await rpc.get_token_accounts(mint, limit=100)
    if not accounts:
        return None

    # Parse amounts
    amounts: list[int] = []
    deployer_amount = 0
    for acc in accounts:
        raw = acc.get("amount") or acc.get("tokenAmount", {}) or 0
        if isinstance(raw, dict):
            # Solana RPC sometimes returns {"amount": "1234", "decimals": 6, ...}
            raw = raw.get("amount", 0)
        try:
            amt = int(raw)
        except (ValueError, TypeError):
            amt = 0
        amounts.append(amt)
        # Match deployer by owner address
        owner = acc.get("owner") or acc.get("address") or ""
        if deployer and owner == deployer:
            deployer_amount += amt

    total_supply = sum(amounts)
    if total_supply <= 0:
        return None

    holder_count = len(amounts)
    amounts_sorted = sorted(amounts, reverse=True)

    top10_total = sum(amounts_sorted[:10])
    top1_total = amounts_sorted[0] if amounts_sorted else 0

    top_10_pct = round(top10_total / total_supply * 100, 2)
    top_1_pct = round(top1_total / total_supply * 100, 2)
    deployer_holds_pct = round(deployer_amount / total_supply * 100, 2)

    # Compute risk score
    risk_score = 0
    flags: list[str] = []

    if top_10_pct >= 80:
        risk_score += 40
        flags.append(f"Top-10 wallets hold {top_10_pct:.0f}% of supply")
    elif top_10_pct >= 60:
        risk_score += 20
        flags.append(f"Top-10 wallets hold {top_10_pct:.0f}% of supply")

    if deployer_holds_pct >= 10:
        risk_score += 30
        flags.append(f"Deployer holds {deployer_holds_pct:.0f}% of supply")
    elif deployer_holds_pct >= 5:
        risk_score += 15
        flags.append(f"Deployer holds {deployer_holds_pct:.0f}% of supply")

    if holder_count < 50:
        risk_score += 20
        flags.append(f"Only {holder_count} holders")
    elif holder_count < 100:
        risk_score += 10
        flags.append(f"Fewer than 100 holders ({holder_count})")

    if top_1_pct >= 50:
        risk_score += 10
        flags.append(f"Single wallet holds {top_1_pct:.0f}% of supply")

    risk_score = min(risk_score, 100)

    if risk_score >= 75:
        risk_level: str = "critical"
    elif risk_score >= 50:
        risk_level = "high"
    elif risk_score >= 25:
        risk_level = "medium"
    else:
        risk_level = "low"

    return OnChainRiskScore(
        mint=mint,
        holder_count=holder_count,
        top_10_pct=top_10_pct,
        top_1_pct=top_1_pct,
        deployer_holds_pct=deployer_holds_pct,
        risk_score=risk_score,
        risk_level=risk_level,  # type: ignore[arg-type]
        flags=flags,
    )
