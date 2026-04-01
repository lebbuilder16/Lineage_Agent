"""
Cluster Scoring Service — community-level risk aggregation.

Augments the per-deployer DeployerProfile with a community-wide risk score
by querying the cartel graph. When a deployer belongs to a cartel community,
this service aggregates the historical outcomes of ALL deployers in that
community to produce a ClusterRiskScore.

Key insight: a deployer with 1 token and 0 rugs looks clean in isolation.
But if they share a cartel community with 5 other deployers who rugged 20
tokens, the community context reveals the true risk.

Integrates into the forensic pipeline alongside the cartel report.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
from typing import Optional

from .data_sources._clients import cartel_edges_query, event_query
from .models import ClusterRiskScore
from .rug_detector import normalize_legacy_rug_events

logger = logging.getLogger(__name__)

_CLUSTER_TIMEOUT = 12.0


async def compute_cluster_score(
    mint: str,
    deployer: str,
) -> Optional[ClusterRiskScore]:
    """Compute a community-level risk score for a deployer.

    Returns None if the deployer has no cartel edges (i.e., is isolated).
    """
    if not deployer:
        return None
    try:
        return await asyncio.wait_for(
            _build_cluster_score(mint, deployer),
            timeout=_CLUSTER_TIMEOUT,
        )
    except asyncio.TimeoutError:
        logger.warning("[cluster] timed out for %s", deployer[:12])
        return None
    except Exception:
        logger.exception("[cluster] failed for %s", deployer[:12])
        return None


async def _build_cluster_score(
    mint: str,
    deployer: str,
) -> Optional[ClusterRiskScore]:
    """Internal: query cartel edges, run community detection, aggregate stats."""

    # Step 1: Get cartel edges involving this deployer
    edges_rows = await cartel_edges_query(deployer)
    if not edges_rows:
        return None

    # Step 2: Build community via BFS from deployer (simpler than full Louvain,
    # and consistent since we only care about the deployer's connected component)
    adjacency: dict[str, set[str]] = {}
    for row in edges_rows:
        w_a, w_b = row["wallet_a"], row["wallet_b"]
        adjacency.setdefault(w_a, set()).add(w_b)
        adjacency.setdefault(w_b, set()).add(w_a)

    # BFS from deployer
    visited: set[str] = set()
    queue = [deployer]
    while queue:
        node = queue.pop(0)
        if node in visited:
            continue
        visited.add(node)
        for neighbor in adjacency.get(node, set()):
            if neighbor not in visited:
                queue.append(neighbor)

    community_wallets = sorted(visited)
    if len(community_wallets) < 2:
        return None

    # Step 3: Aggregate token outcomes across the community
    ph = ",".join("?" for _ in community_wallets)
    created_rows = await event_query(
        f"event_type = 'token_created' AND deployer IN ({ph})",
        params=tuple(community_wallets),
        columns="mint, deployer, narrative, mcap_usd, created_at",
        limit=2000,
    )

    if not created_rows:
        return None

    all_mints = [r["mint"] for r in created_rows if r.get("mint")]
    total_tokens = len(all_mints)

    # Exclude the current token from historical stats
    sibling_mints = [m for m in all_mints if m != mint]

    # Fetch rug events
    total_rugs = 0
    total_dead = 0
    sibling_rug_mints: list[str] = []
    if sibling_mints:
        await normalize_legacy_rug_events(mints=sibling_mints)
        rug_ph = ",".join("?" for _ in sibling_mints)
        rug_rows = await event_query(
            f"event_type = 'token_rugged' AND mint IN ({rug_ph})",
            params=tuple(sibling_mints),
            columns="mint, rug_mechanism, evidence_level",
            limit=2000,
        )
        for row in rug_rows:
            mechanism = (row.get("rug_mechanism") or "").strip()
            if mechanism == "dead_token":
                total_dead += 1
            else:
                total_rugs += 1
                sibling_rug_mints.append(row["mint"])

    total_negative = total_rugs + total_dead
    sibling_count = len(sibling_mints)

    # Rug rate across sibling tokens (excluding current)
    community_rug_rate = (total_rugs / sibling_count * 100) if sibling_count > 0 else 0.0
    community_negative_rate = (total_negative / sibling_count * 100) if sibling_count > 0 else 0.0

    # Step 4: Compute risk score (0-100)
    risk_score = _compute_risk(
        community_size=len(community_wallets),
        total_tokens=total_tokens,
        rug_rate=community_rug_rate,
        negative_rate=community_negative_rate,
        total_rugs=total_rugs,
        edges_rows=edges_rows,
    )

    # Step 5: Determine risk level
    if risk_score >= 75:
        risk_level = "critical"
    elif risk_score >= 50:
        risk_level = "high"
    elif risk_score >= 25:
        risk_level = "medium"
    else:
        risk_level = "low"

    # Step 6: Signal diversity (what links the community)
    signal_types = list({row["signal_type"] for row in edges_rows})

    # Step 7: Deployer's own stats within the community context
    deployer_tokens = [r for r in created_rows if r.get("deployer") == deployer]
    deployer_token_count = len(deployer_tokens)

    # Narrative distribution
    from collections import Counter
    narrative_counter = Counter(
        r.get("narrative") or "unknown" for r in created_rows if r.get("narrative")
    )
    top_narratives = [n for n, _ in narrative_counter.most_common(3)]

    # Community ID (stable hash)
    community_id = hashlib.sha256(
        ":".join(community_wallets).encode()
    ).hexdigest()[:12]

    return ClusterRiskScore(
        community_id=community_id,
        community_size=len(community_wallets),
        total_tokens_launched=total_tokens,
        deployer_token_count=deployer_token_count,
        community_rug_count=total_rugs,
        community_dead_count=total_dead,
        community_rug_rate_pct=round(community_rug_rate, 1),
        community_negative_rate_pct=round(community_negative_rate, 1),
        risk_score=risk_score,
        risk_level=risk_level,
        signal_types=signal_types,
        top_narratives=top_narratives,
    )


def _compute_risk(
    *,
    community_size: int,
    total_tokens: int,
    rug_rate: float,
    negative_rate: float,
    total_rugs: int,
    edges_rows: list[dict],
) -> int:
    """Compute a 0-100 risk score from community stats.

    Weights:
    - Rug rate dominates (0-40 pts)
    - Absolute rug count as volume amplifier (0-20 pts)
    - Community size as network effect (0-15 pts)
    - Signal diversity as confidence booster (0-15 pts)
    - Negative outcome rate as secondary signal (0-10 pts)
    """
    score = 0.0

    # Rug rate: 0-40 points
    if rug_rate >= 80:
        score += 40
    elif rug_rate >= 60:
        score += 30
    elif rug_rate >= 40:
        score += 22
    elif rug_rate >= 20:
        score += 14
    elif rug_rate > 0:
        score += 6

    # Absolute rug count: 0-20 points (volume amplifier)
    if total_rugs >= 10:
        score += 20
    elif total_rugs >= 5:
        score += 15
    elif total_rugs >= 3:
        score += 10
    elif total_rugs >= 1:
        score += 5

    # Community size: 0-15 points (larger network = more organized)
    if community_size >= 5:
        score += 15
    elif community_size >= 3:
        score += 10
    elif community_size >= 2:
        score += 5

    # Signal diversity: 0-15 points (multiple link types = stronger evidence)
    signal_types = {row["signal_type"] for row in edges_rows}
    if len(signal_types) >= 4:
        score += 15
    elif len(signal_types) >= 3:
        score += 12
    elif len(signal_types) >= 2:
        score += 8
    elif len(signal_types) >= 1:
        score += 4

    # Negative outcome rate: 0-10 points
    if negative_rate >= 60:
        score += 10
    elif negative_rate >= 30:
        score += 5

    return min(100, int(score))
