"""
Agent Memory Service — Cross-Investigation Intelligence Layer.

Provides five memory operations:
1. record_episode() — persist a verdict + signal snapshot after each investigation
2. build_memory_brief() — narrative intelligence brief for agent system prompt
3. recall_entity() — on-demand entity lookup with synthesised insights (recall_memory tool)
4. get_calibration_offset() — fetch active calibration rules for heuristic adjustment
5. synthesize_recommendation() — Haiku micro-synthesis for actionable guidance

Architecture:
- All data retrieval is 100% SQL — zero LLM calls for facts
- Optional Haiku micro-synthesis (~50 tokens) for the recommendation line
- Deterministic fallback if Haiku is unavailable
"""
from __future__ import annotations

import json
import logging
import math
import time
from typing import Any, Optional

logger = logging.getLogger(__name__)

# Temporal decay: half-life of 14 days — episode from 2 weeks ago has half the weight
_DECAY_HALF_LIFE_DAYS = 14.0
_DECAY_LAMBDA = math.log(2) / _DECAY_HALF_LIFE_DAYS
_DECAY_MIN_WEIGHT = 0.05  # floor so old episodes still contribute 5%


def _decay_weight(episode_ts: float, now: float) -> float:
    """Exponential decay weight based on episode age."""
    age_days = (now - episode_ts) / 86400
    return max(_DECAY_MIN_WEIGHT, math.exp(-_DECAY_LAMBDA * age_days))


# ── Episode Recording ─────────────────────────────────────────────────────────

async def record_episode(
    mint: str,
    verdict: dict,
    scan_data: Optional[dict] = None,
    deployer: Optional[str] = None,
    operator_fp: Optional[str] = None,
    community_id: Optional[str] = None,
) -> None:
    """Persist an investigation verdict as an episode in memory.

    Called post-verdict from investigate_service.py.
    Uses INSERT OR REPLACE so re-scanning a mint updates the episode.
    """
    try:
        from .data_sources._clients import cache as _cache
        from .cache import SQLiteCache
        if not isinstance(_cache, SQLiteCache):
            return

        db = await _cache._get_conn()

        # Extract structured signals from scan_data
        signals = _extract_signals(scan_data) if scan_data else {}

        # Extract fields from verdict
        risk_score = verdict.get("risk_score", 0)
        confidence = verdict.get("confidence", "medium")
        rug_pattern = verdict.get("rug_pattern", "")
        summary = verdict.get("verdict_summary", "")
        conviction = verdict.get("conviction_chain", "")
        key_findings = json.dumps(verdict.get("key_findings", []))
        model = verdict.get("model", "")

        await db.execute(
            "INSERT OR REPLACE INTO investigation_episodes "
            "(mint, deployer, operator_fp, campaign_id, community_id, "
            " risk_score, confidence, rug_pattern, verdict_summary, conviction_chain, "
            " key_findings, signals_json, model, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                mint, deployer, operator_fp, None, community_id,
                risk_score, confidence, rug_pattern, summary, conviction,
                key_findings, json.dumps(signals), model, time.time(),
            ),
        )
        await db.commit()

        # Also record in campaign_timelines
        if deployer:
            await _record_timeline_event(db, "deployer", deployer, "launch", mint, risk_score)
        if operator_fp:
            await _record_timeline_event(db, "operator", operator_fp, "launch", mint, risk_score)

        # Update entity_knowledge
        if deployer:
            await _update_entity_knowledge(db, "deployer", deployer)
        if operator_fp:
            await _update_entity_knowledge(db, "operator", operator_fp)

        logger.debug("[memory] episode recorded: %s (score=%d)", mint[:12], risk_score)
    except Exception as exc:
        logger.debug("[memory] record_episode error: %s", exc)


def _extract_signals(scan_data: dict) -> dict:
    """Extract a flat dict of key signals from the scan/lineage data."""
    signals: dict[str, Any] = {}
    try:
        # Death clock
        dc = scan_data.get("death_clock") or {}
        signals["death_clock_risk"] = dc.get("risk_level", "unknown")
        signals["death_clock_negative_count"] = dc.get("total_negative_outcome_count", 0)

        # Deployer profile
        dp = scan_data.get("deployer_profile") or {}
        signals["deployer_total_tokens"] = dp.get("total_tokens_launched", 0)
        signals["deployer_rug_count"] = dp.get("rug_count", 0)
        signals["deployer_rug_rate"] = dp.get("rug_rate_pct", 0)

        # Bundle
        br = scan_data.get("bundle_report") or {}
        signals["bundle_verdict"] = br.get("overall_verdict", "")
        signals["bundle_wallets"] = br.get("bundle_wallet_count", 0)

        # SOL flow
        sf = scan_data.get("sol_flow") or {}
        signals["sol_extracted"] = sf.get("total_extracted_sol", 0)
        signals["sol_extraction_context"] = sf.get("extraction_context", "")

        # Insider sell
        ins = scan_data.get("insider_sell") or {}
        signals["insider_verdict"] = ins.get("verdict", "")
        signals["deployer_exited"] = ins.get("deployer_exited", False)

        # Insider details
        signals["sell_pressure_24h"] = ins.get("sell_pressure_24h", 0)
        signals["insider_sell_count"] = ins.get("insider_sell_count", 0)

        # Bundle details
        signals["bundle_extracted_sol"] = br.get("total_extracted_sol", 0)

        # Cartel
        cr = scan_data.get("cartel_report") or {}
        dc_community = cr.get("deployer_community") or {}
        signals["cartel_member_count"] = len(dc_community.get("wallets", []))
        signals["cartel_community_id"] = dc_community.get("community_id", "")
        signals["cartel_total_rugs"] = dc_community.get("total_rugs", 0)

        # Factory rhythm
        fr = scan_data.get("factory_rhythm") or {}
        signals["factory_is_factory"] = fr.get("is_factory", False) if isinstance(fr, dict) else False
        signals["factory_token_count"] = fr.get("total_tokens", 0) if isinstance(fr, dict) else 0
        signals["factory_avg_lifespan_h"] = fr.get("avg_lifespan_hours", 0) if isinstance(fr, dict) else 0

        # Rug mechanism (from death_clock)
        signals["rug_mechanism"] = dc.get("rug_mechanism", "")
        signals["rug_probability_pct"] = dc.get("rug_probability_pct")

        # Zombie alert
        za = scan_data.get("zombie_alert") or {}
        signals["is_zombie"] = bool(za) if isinstance(za, dict) and za.get("original_mint") else False
        signals["zombie_original"] = za.get("original_mint", "") if isinstance(za, dict) else ""

        # Liquidity architecture
        la = scan_data.get("liquidity_arch") or {}
        signals["liquidity_usd"] = la.get("total_liquidity_usd", 0) if isinstance(la, dict) else 0
        signals["liquidity_concentration_hhi"] = la.get("concentration_hhi", 0) if isinstance(la, dict) else 0
        signals["liquidity_authenticity"] = la.get("authenticity_score", 0) if isinstance(la, dict) else 0
        signals["liquidity_flags"] = la.get("flags", []) if isinstance(la, dict) else []

        # Family size
        signals["family_size"] = len(scan_data.get("derivatives", []))

        # Operator
        op = scan_data.get("operator_fingerprint") or {}
        signals["operator_rug_rate"] = op.get("rug_rate_pct", 0) if isinstance(op, dict) else 0
        signals["operator_linked_wallets"] = len(op.get("linked_wallets", [])) if isinstance(op, dict) else 0
        signals["operator_total_tokens"] = op.get("total_tokens", 0) if isinstance(op, dict) else 0

        # Lifecycle
        qt = scan_data.get("query_token") or scan_data.get("root") or {}
        signals["lifecycle_stage"] = qt.get("lifecycle_stage", "")
        signals["market_surface"] = qt.get("market_surface", "")
        signals["launch_platform"] = qt.get("launch_platform", "")

    except Exception:
        pass
    return signals


async def _record_timeline_event(
    db, entity_type: str, entity_id: str, event_type: str,
    mint: str, risk_score: int, extracted_sol: float = 0,
) -> None:
    """Insert a timeline event (idempotent via UNIQUE constraint)."""
    try:
        await db.execute(
            "INSERT OR IGNORE INTO campaign_timelines "
            "(entity_type, entity_id, event_type, mint, event_at, risk_score, extracted_sol) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (entity_type, entity_id, event_type, mint, time.time(), risk_score, extracted_sol),
        )
    except Exception:
        pass


async def _update_entity_knowledge(db, entity_type: str, entity_id: str) -> None:
    """Recompute entity knowledge from episodes with temporal decay weighting.

    Recent episodes contribute more than old ones (half-life = 14 days).
    After updating, checks for anomalies vs the entity's prior baseline.
    """
    try:
        # Read prior values BEFORE overwrite (for anomaly detection)
        prior = await _read_prior_knowledge(db, entity_type, entity_id)

        col = "deployer" if entity_type == "deployer" else "operator_fp"
        cursor = await db.execute(
            f"SELECT risk_score, rug_pattern, signals_json, created_at "
            f"FROM investigation_episodes WHERE {col} = ? ORDER BY created_at DESC LIMIT 50",
            (entity_id,),
        )
        rows = await cursor.fetchall()
        if not rows:
            return

        now = time.time()
        total = len(rows)

        # Decay-weighted averages
        weights = [_decay_weight(r[3], now) for r in rows]
        total_weight = sum(weights)

        risk_scores = [r[0] for r in rows]
        avg_score = sum(s * w for s, w in zip(risk_scores, weights)) / total_weight

        patterns = [r[1] for r in rows if r[1]]
        typical_pattern = max(set(patterns), key=patterns.count) if patterns else ""

        # Weighted rug count (risk >= 70)
        rug_count_weighted = sum(w for s, w in zip(risk_scores, weights) if s >= 70)
        rug_count = round(rug_count_weighted)

        # Weighted extraction SOL + narrative preferences
        total_extracted = 0.0
        narratives: list[str] = []
        for r, w in zip(rows, weights):
            try:
                sigs = json.loads(r[2]) if r[2] else {}
                sol = (sigs.get("sol_extracted", 0) or 0) + (sigs.get("bundle_extracted_sol", 0) or 0)
                total_extracted += sol * w
                platform = sigs.get("launch_platform", "")
                if platform:
                    narratives.append(platform)
            except Exception:
                pass

        # Velocity: tokens in last 24h (not weighted — raw count matters)
        recent_24h = sum(1 for r in rows if now - r[3] < 86400)
        prev_24h = sum(1 for r in rows if 86400 < now - r[3] < 172800)
        acceleration = recent_24h - prev_24h

        first_seen = min(r[3] for r in rows)
        last_seen = max(r[3] for r in rows)

        confidence = "high" if total >= 5 else "medium" if total >= 2 else "low"

        # Top narratives/platforms
        narrative_counts: dict[str, int] = {}
        for n in narratives:
            narrative_counts[n] = narrative_counts.get(n, 0) + 1
        top_narratives = sorted(narrative_counts, key=narrative_counts.get, reverse=True)[:3]

        new_values = {
            "total_tokens": total,
            "total_rugs": rug_count,
            "total_extracted_sol": round(total_extracted, 2),
            "avg_risk_score": round(avg_score, 1),
            "launch_velocity": recent_24h,
            "acceleration": acceleration,
        }

        await db.execute(
            "INSERT OR REPLACE INTO entity_knowledge "
            "(entity_type, entity_id, total_tokens, total_rugs, total_extracted_sol, "
            " avg_risk_score, preferred_narratives, typical_rug_pattern, "
            " launch_velocity, acceleration, first_seen, last_seen, "
            " sample_count, confidence, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                entity_type, entity_id, total, rug_count, round(total_extracted, 2),
                round(avg_score, 1), json.dumps(top_narratives), typical_pattern,
                recent_24h, acceleration,
                first_seen, last_seen, total, confidence, now,
            ),
        )
        await db.commit()

        # Anomaly detection: compare new values against prior baseline
        if prior:
            await _check_anomalies(db, entity_type, entity_id, prior, new_values, now)

    except Exception as exc:
        logger.debug("[memory] entity_knowledge update error: %s", exc)


# ── Anomaly Detection ─────────────────────────────────────────────────────────

async def _read_prior_knowledge(db, entity_type: str, entity_id: str) -> Optional[dict]:
    """Read the entity's current knowledge row before it's overwritten."""
    try:
        cursor = await db.execute(
            "SELECT total_tokens, total_rugs, total_extracted_sol, avg_risk_score, "
            "launch_velocity, acceleration, last_seen "
            "FROM entity_knowledge WHERE entity_type = ? AND entity_id = ?",
            (entity_type, entity_id),
        )
        row = await cursor.fetchone()
        if not row:
            return None
        return {
            "total_tokens": row[0],
            "total_rugs": row[1],
            "total_extracted_sol": row[2],
            "avg_risk_score": row[3],
            "launch_velocity": row[4] or 0,
            "acceleration": row[5] or 0,
            "last_seen": row[6] or 0,
        }
    except Exception:
        return None


async def _check_anomalies(
    db, entity_type: str, entity_id: str,
    prior: dict, new: dict, now: float,
) -> None:
    """Compare new entity metrics against prior baseline and flag anomalies.

    Anomaly dimensions:
    - velocity_spike: launch rate jumped 3x+
    - risk_jump: avg risk score increased 20+ points
    - extraction_spike: extracted SOL doubled
    - rug_rate_inflection: entity crossed from <30% to >50% rug rate
    """
    try:
        # Skip if re-scanned too quickly (< 5 min gap)
        if prior.get("last_seen") and (now - prior["last_seen"]) < 300:
            return

        anomalies: list[dict] = []

        # Velocity spike: 3x increase (baseline must be > 0)
        prior_vel = prior.get("launch_velocity", 0)
        new_vel = new.get("launch_velocity", 0)
        if prior_vel > 0 and new_vel >= prior_vel * 3:
            anomalies.append({
                "anomaly_type": "velocity_spike",
                "severity": "high" if new_vel >= prior_vel * 5 else "medium",
                "baseline_value": prior_vel,
                "current_value": new_vel,
                "description": f"Launch velocity spiked {new_vel/prior_vel:.1f}x "
                               f"({prior_vel:.0f}/day → {new_vel:.0f}/day)",
            })

        # Risk score jump: +20 points
        prior_risk = prior.get("avg_risk_score", 0)
        new_risk = new.get("avg_risk_score", 0)
        if new_risk >= prior_risk + 20:
            anomalies.append({
                "anomaly_type": "risk_jump",
                "severity": "high" if new_risk >= prior_risk + 30 else "medium",
                "baseline_value": prior_risk,
                "current_value": new_risk,
                "description": f"Average risk score jumped {new_risk - prior_risk:+.0f} "
                               f"({prior_risk:.0f} → {new_risk:.0f})",
            })

        # Extraction spike: doubled (baseline must be > 1 SOL)
        prior_ext = prior.get("total_extracted_sol", 0)
        new_ext = new.get("total_extracted_sol", 0)
        if prior_ext > 1.0 and new_ext >= prior_ext * 2:
            anomalies.append({
                "anomaly_type": "extraction_spike",
                "severity": "high" if new_ext >= prior_ext * 3 else "medium",
                "baseline_value": prior_ext,
                "current_value": new_ext,
                "description": f"Extracted SOL spiked {new_ext/prior_ext:.1f}x "
                               f"({prior_ext:.1f} → {new_ext:.1f} SOL)",
            })

        # Rug rate inflection: crossed from <30% to >50%
        prior_tokens = prior.get("total_tokens", 0)
        new_tokens = new.get("total_tokens", 0)
        if prior_tokens > 0 and new_tokens > 0:
            prior_rug_rate = prior.get("total_rugs", 0) / prior_tokens * 100
            new_rug_rate = new.get("total_rugs", 0) / new_tokens * 100
            if prior_rug_rate < 30 and new_rug_rate > 50:
                anomalies.append({
                    "anomaly_type": "rug_rate_inflection",
                    "severity": "high",
                    "baseline_value": round(prior_rug_rate, 1),
                    "current_value": round(new_rug_rate, 1),
                    "description": f"Rug rate inflection: was {prior_rug_rate:.0f}% clean, "
                                   f"now {new_rug_rate:.0f}% — entity turned hostile",
                })

        # Write new anomalies
        for a in anomalies:
            await db.execute(
                "INSERT INTO anomaly_alerts "
                "(entity_type, entity_id, anomaly_type, severity, "
                " baseline_value, current_value, description, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (entity_type, entity_id, a["anomaly_type"], a["severity"],
                 a["baseline_value"], a["current_value"], a["description"], now),
            )
            logger.info("[anomaly] %s %s: %s", entity_type, entity_id[:12], a["description"])

        # Auto-resolve old anomalies where metric returned to within 1.5x of baseline
        cursor = await db.execute(
            "SELECT id, anomaly_type, baseline_value FROM anomaly_alerts "
            "WHERE entity_type = ? AND entity_id = ? AND resolved = 0",
            (entity_type, entity_id),
        )
        open_alerts = await cursor.fetchall()
        for alert_id, atype, baseline in open_alerts:
            current = new.get({
                "velocity_spike": "launch_velocity",
                "risk_jump": "avg_risk_score",
                "extraction_spike": "total_extracted_sol",
            }.get(atype, ""), 0)
            if baseline and current <= baseline * 1.5:
                await db.execute(
                    "UPDATE anomaly_alerts SET resolved = 1, resolved_at = ? WHERE id = ?",
                    (now, alert_id),
                )

        if anomalies:
            await db.commit()

    except Exception as exc:
        logger.debug("[anomaly] check error: %s", exc)


async def get_active_anomalies(entity_type: str, entity_id: str) -> list[dict]:
    """Fetch unresolved anomaly alerts for an entity."""
    try:
        from .data_sources._clients import cache as _cache
        from .cache import SQLiteCache
        if not isinstance(_cache, SQLiteCache):
            return []

        db = await _cache._get_conn()
        cursor = await db.execute(
            "SELECT anomaly_type, severity, baseline_value, current_value, description, created_at "
            "FROM anomaly_alerts WHERE entity_type = ? AND entity_id = ? AND resolved = 0 "
            "ORDER BY created_at DESC LIMIT 5",
            (entity_type, entity_id),
        )
        rows = await cursor.fetchall()
        return [
            {"type": r[0], "severity": r[1], "baseline": r[2],
             "current": r[3], "description": r[4],
             "age_hours": round((time.time() - r[5]) / 3600, 1)}
            for r in rows
        ]
    except Exception:
        return []


# ── Narrative Clustering ──────────────────────────────────────────────────────

_NARRATIVE_STOPWORDS = frozenset({
    # English stop words
    "token", "coin", "meme", "sol", "solana", "new", "the", "to", "and",
    "of", "a", "in", "on", "is", "it", "for", "my", "by", "up", "no",
    "go", "do", "so", "or", "an", "be", "at", "if", "ok", "v2", "v1",
    # Verdict template words (appear in heuristic/AI verdicts, not real narratives)
    "dex", "graduation", "auto-scan", "heuristic", "score", "scan",
    "rule-based", "temporarily", "unavailable", "analysis", "risk",
    "insufficient", "evidence", "minimal", "moderate", "high", "low",
    "critical", "detected", "confirmed", "suspected", "unknown",
    "with", "but", "not", "was", "has", "had", "are", "were", "been",
    "from", "this", "that", "than", "very", "more", "less", "only",
    "pre-dex", "post-launch", "early-stage", "0/100", "100",
    "deployer", "wallet", "bundle", "liquidity", "market",
    "via", "chain", "clean", "minimal_risk", "caution", "treat",
})


async def detect_narrative_clusters(
    window_days: int = 7, min_deployers: int = 3,
) -> list[dict]:
    """Detect coordinated thematic waves across unrelated deployers.

    Scans recent investigation episodes, extracts narrative keywords from
    verdict summaries and launch platforms, and clusters by theme.
    Returns clusters where >= min_deployers participated in the window.
    """
    try:
        from .data_sources._clients import cache as _cache
        from .cache import SQLiteCache
        if not isinstance(_cache, SQLiteCache):
            return []

        db = await _cache._get_conn()
        now = time.time()
        window_start = now - (window_days * 86400)

        cursor = await db.execute(
            "SELECT mint, deployer, risk_score, signals_json, verdict_summary, created_at "
            "FROM investigation_episodes WHERE created_at >= ? AND deployer IS NOT NULL "
            "ORDER BY created_at DESC",
            (window_start,),
        )
        rows = await cursor.fetchall()
        if not rows:
            return []

        # Extract narrative keywords per token
        # keyword → {deployers: set, mints: list, risk_scores: list}
        keyword_groups: dict[str, dict] = {}

        for mint, deployer, risk_score, sigs_json, summary, created_at in rows:
            keywords: set[str] = set()

            # From signals_json: launch_platform
            try:
                sigs = json.loads(sigs_json) if sigs_json else {}
                platform = sigs.get("launch_platform", "")
                if platform and len(platform) > 2:
                    keywords.add(platform.lower().strip())
            except Exception:
                pass

            # From verdict_summary: extract meaningful words
            if summary:
                for word in summary.lower().split():
                    word = word.strip(".,;:!?()[]\"'")
                    if len(word) > 2 and word not in _NARRATIVE_STOPWORDS and not word.isdigit():
                        keywords.add(word)

            for kw in keywords:
                if kw not in keyword_groups:
                    keyword_groups[kw] = {"deployers": set(), "mints": [], "risk_scores": []}
                keyword_groups[kw]["deployers"].add(deployer)
                keyword_groups[kw]["mints"].append(mint)
                keyword_groups[kw]["risk_scores"].append(risk_score)

        # Filter: only clusters with enough distinct deployers
        clusters: list[dict] = []
        for keyword, data in keyword_groups.items():
            deployer_count = len(data["deployers"])
            if deployer_count >= min_deployers:
                avg_risk = sum(data["risk_scores"]) / len(data["risk_scores"])
                cluster = {
                    "narrative_key": keyword,
                    "deployer_count": deployer_count,
                    "token_count": len(data["mints"]),
                    "deployers": list(data["deployers"]),
                    "mints": data["mints"][:20],  # cap for storage
                    "avg_risk_score": round(avg_risk, 1),
                }
                clusters.append(cluster)

        # Replace all active clusters atomically: delete old → insert fresh
        await db.execute("DELETE FROM narrative_clusters WHERE active = 1")

        for c in clusters:
            await db.execute(
                "INSERT INTO narrative_clusters "
                "(narrative_key, deployer_count, token_count, deployers_json, mints_json, "
                " avg_risk_score, window_start, window_end, active, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)",
                (
                    c["narrative_key"], c["deployer_count"], c["token_count"],
                    json.dumps(c["deployers"]), json.dumps(c["mints"]),
                    c["avg_risk_score"], window_start, now, now,
                ),
            )
        await db.commit()

        logger.info("[narrative] detected %d clusters (%d+ deployers, %d-day window)",
                     len(clusters), min_deployers, window_days)
        return clusters

    except Exception as exc:
        logger.debug("[narrative] detect_narrative_clusters error: %s", exc)
        return []


async def get_narrative_clusters_for_deployer(deployer: str) -> list[dict]:
    """Get active narrative clusters that include this deployer."""
    try:
        from .data_sources._clients import cache as _cache
        from .cache import SQLiteCache
        if not isinstance(_cache, SQLiteCache):
            return []

        db = await _cache._get_conn()
        cursor = await db.execute(
            "SELECT narrative_key, deployer_count, token_count, avg_risk_score "
            "FROM narrative_clusters WHERE active = 1 "
            "AND deployers_json LIKE ? ORDER BY deployer_count DESC LIMIT 3",
            (f'%"{deployer}"%',),
        )
        rows = await cursor.fetchall()
        return [
            {"narrative": r[0], "deployers": r[1], "tokens": r[2], "avg_risk": r[3]}
            for r in rows
        ]
    except Exception:
        return []


# ── Memory Brief Builder ──────────────────────────────────────────────────────

async def build_memory_brief(
    mint: str,
    deployer: Optional[str] = None,
    operator_fp: Optional[str] = None,
    community_id: Optional[str] = None,
) -> str:
    """Build a narrative intelligence brief from all memory layers.

    Injected into the agent's system prompt before Claude is called.
    Structure:
    1. Threat Assessment — one-line classification + narrative synthesis
    2. Cross-Entity Intelligence — deployer ↔ operator ↔ cluster correlation
    3. Recommended Focus — deterministic investigation guidance
    4. Haiku micro-synthesis — optional actionable recommendation

    Data retrieval: 100% SQL. Optional Haiku call for recommendation (~50 tokens).
    """
    try:
        from .data_sources._clients import cache as _cache
        from .cache import SQLiteCache
        if not isinstance(_cache, SQLiteCache):
            return ""

        db = await _cache._get_conn()
        now = time.time()

        # ── Collect all data in one pass ──────────────────────────────────
        ctx = _MemoryContext()

        # Previous investigation of this token
        cursor = await db.execute(
            "SELECT risk_score, verdict_summary, user_rating, created_at "
            "FROM investigation_episodes WHERE mint = ? ORDER BY created_at DESC LIMIT 1",
            (mint,),
        )
        ctx.prev_episode = await cursor.fetchone()

        # Deployer knowledge + episodes
        if deployer:
            cursor = await db.execute(
                "SELECT total_tokens, total_rugs, avg_risk_score, typical_rug_pattern, "
                "launch_velocity, acceleration, confidence, total_extracted_sol "
                "FROM entity_knowledge WHERE entity_type = 'deployer' AND entity_id = ?",
                (deployer,),
            )
            ctx.deployer_ek = await cursor.fetchone()

            cursor = await db.execute(
                "SELECT mint, risk_score, user_rating, model, created_at "
                "FROM investigation_episodes WHERE deployer = ? AND mint != ? "
                "ORDER BY created_at DESC LIMIT 5",
                (deployer, mint),
            )
            ctx.deployer_episodes = await cursor.fetchall()

        # Operator knowledge
        if operator_fp:
            cursor = await db.execute(
                "SELECT total_tokens, total_rugs, avg_risk_score, launch_velocity, acceleration "
                "FROM entity_knowledge WHERE entity_type = 'operator' AND entity_id = ?",
                (operator_fp,),
            )
            ctx.operator_ek = await cursor.fetchone()

        # Anomaly alerts
        for a_type, a_id in [("deployer", deployer), ("operator", operator_fp)]:
            if not a_id:
                continue
            cursor = await db.execute(
                "SELECT anomaly_type, severity, description, created_at "
                "FROM anomaly_alerts WHERE entity_type = ? AND entity_id = ? AND resolved = 0 "
                "ORDER BY created_at DESC LIMIT 3",
                (a_type, a_id),
            )
            for row in await cursor.fetchall():
                ctx.anomalies.append((a_type, row))

        # Narrative clusters
        if deployer:
            cursor = await db.execute(
                "SELECT narrative_key, deployer_count, token_count, avg_risk_score "
                "FROM narrative_clusters WHERE active = 1 AND deployers_json LIKE ? "
                "ORDER BY deployer_count DESC LIMIT 2",
                (f'%"{deployer}"%',),
            )
            ctx.clusters = await cursor.fetchall()

        # Calibration rules
        cursor = await db.execute(
            "SELECT rule_type, condition_json, adjustment, sample_count "
            "FROM calibration_rules WHERE active = 1 AND sample_count >= 3 AND confidence >= 0.7 "
            "ORDER BY sample_count DESC LIMIT 3",
        )
        ctx.calibration_rules = await cursor.fetchall()

        # Feedback
        if deployer:
            cursor = await db.execute(
                "SELECT user_rating, COUNT(*) FROM investigation_episodes "
                "WHERE deployer = ? AND user_rating IS NOT NULL GROUP BY user_rating",
                (deployer,),
            )
            ctx.feedback = await cursor.fetchall()

        # ── Build narrative sections ──────────────────────────────────────
        sections: list[str] = []

        # 1. Threat Assessment
        threat = _build_threat_assessment(ctx, deployer, operator_fp, now)
        if threat:
            sections.append(threat)

        # 2. Cross-Entity Intelligence
        cross = _build_cross_entity(ctx, deployer, operator_fp)
        if cross:
            sections.append(cross)

        # 3. Recommended Focus (deterministic)
        focus = _build_recommended_focus(ctx)
        if focus:
            sections.append(focus)

        # 4. Calibration Notes (for transparency)
        if ctx.calibration_rules:
            lines = []
            for r in ctx.calibration_rules:
                cond = json.loads(r[1]) if r[1] else {}
                cond_str = ", ".join(f"{k}={v}" for k, v in cond.items())
                lines.append(f"  - {r[0]}: {cond_str} → adjust {r[2]:+.0f} ({r[3]} samples)")
            sections.append("### Calibration Active\n" + "\n".join(lines))

        # 5. Feedback track record
        if ctx.feedback:
            parts = [f"{r[1]}x {r[0]}" for r in ctx.feedback]
            sections.append(f"### Feedback: {', '.join(parts)}")

        if not sections:
            return ""

        brief = "## INTELLIGENCE MEMORY\n\n" + "\n\n".join(sections)

        # 6. Haiku micro-synthesis (optional, async, best-effort)
        recommendation = await _haiku_recommendation(ctx, deployer, operator_fp)
        if recommendation:
            brief += f"\n\n### Recommendation\n{recommendation}"

        logger.debug("[memory] brief built: %d chars for %s", len(brief), mint[:12])
        return brief

    except Exception as exc:
        logger.debug("[memory] build_memory_brief error: %s", exc)
        return ""


# ── Brief sub-builders (deterministic, pure functions) ────────────────────────

class _MemoryContext:
    """Container for all memory data collected in one pass."""
    __slots__ = (
        "prev_episode", "deployer_ek", "deployer_episodes",
        "operator_ek", "anomalies", "clusters",
        "calibration_rules", "feedback",
    )

    def __init__(self):
        self.prev_episode = None
        self.deployer_ek = None
        self.deployer_episodes: list = []
        self.operator_ek = None
        self.anomalies: list[tuple] = []
        self.clusters: list = []
        self.calibration_rules: list = []
        self.feedback: list = []

    @property
    def deployer_rug_rate(self) -> float:
        if not self.deployer_ek or not self.deployer_ek[0]:
            return 0
        return self.deployer_ek[1] / self.deployer_ek[0] * 100

    @property
    def deployer_threat_level(self) -> str:
        rate = self.deployer_rug_rate
        if rate >= 70:
            return "critical"
        if rate >= 40:
            return "high"
        if rate >= 15:
            return "medium"
        return "low"

    @property
    def has_velocity_spike(self) -> bool:
        return any(a[1][0] == "velocity_spike" for a in self.anomalies)

    @property
    def has_high_risk_cluster(self) -> bool:
        return any(c[3] >= 60 for c in self.clusters)


def _build_threat_assessment(ctx: _MemoryContext, deployer: Optional[str],
                             operator_fp: Optional[str], now: float) -> str:
    """Section 1: One-line threat classification + narrative."""
    parts: list[str] = []

    # Previous investigation
    if ctx.prev_episode:
        age_h = (now - ctx.prev_episode[3]) / 3600
        rating = f" — user rated {ctx.prev_episode[2]}" if ctx.prev_episode[2] else ""
        parts.append(
            f"Re-scan: last investigated {age_h:.0f}h ago at risk {ctx.prev_episode[0]}/100{rating}."
        )

    # Deployer threat classification
    ek = ctx.deployer_ek
    if ek and ek[0] > 0:
        total, rugs, avg_risk, pattern = ek[0], ek[1], ek[2], ek[3] or "unknown"
        velocity, accel, confidence, extracted = ek[4] or 0, ek[5] or 0, ek[6], ek[7] or 0
        rug_rate = round(rugs / total * 100)
        level = ctx.deployer_threat_level.upper()

        # Narrative synthesis
        if rug_rate >= 70:
            label = "SERIAL RUGGER"
        elif rug_rate >= 40:
            label = "HIGH-RISK DEPLOYER"
        elif rug_rate >= 15:
            label = "MODERATE-RISK DEPLOYER"
        else:
            label = "LOW-RISK DEPLOYER"

        accel_note = ""
        if velocity > 0:
            arrow = "↑ accelerating" if accel > 0 else "↓ slowing" if accel < 0 else "→ steady"
            accel_note = f" Velocity: {velocity:.0f} tokens/24h ({arrow})."

        campaign_note = ""
        if ctx.has_velocity_spike:
            campaign_note = " ACTIVE CAMPAIGN DETECTED — velocity anomaly flagged."

        parts.append(
            f"[{level}] {label}: {rug_rate}% rug rate across {total} tokens "
            f"({rugs} rugged, {extracted:.1f} SOL extracted). "
            f"Pattern: {pattern}. Confidence: {confidence}.{accel_note}{campaign_note}"
        )

    # Anomalies
    if ctx.anomalies:
        for a_type, al in ctx.anomalies:
            age_h = (now - al[3]) / 3600
            parts.append(f"⚠ [{al[1].upper()}] {al[2]} ({age_h:.0f}h ago)")

    if not parts:
        return ""
    return "### Threat Assessment\n" + "\n".join(parts)


def _build_cross_entity(ctx: _MemoryContext, deployer: Optional[str],
                        operator_fp: Optional[str]) -> str:
    """Section 2: Deployer ↔ Operator ↔ Cluster correlation."""
    parts: list[str] = []

    dep_ek = ctx.deployer_ek
    op_ek = ctx.operator_ek

    # Cross-reference deployer and operator
    if dep_ek and op_ek and op_ek[0] > 1:
        dep_total, dep_rugs = dep_ek[0], dep_ek[1]
        op_total, op_rugs, op_risk = op_ek[0], op_ek[1], op_ek[2]
        op_rug_rate = round(op_rugs / op_total * 100) if op_total > 0 else 0

        if op_total > dep_total:
            parts.append(
                f"This deployer ({dep_total} tokens) is linked to operator "
                f"{operator_fp[:12]}.. which controls {op_total} tokens across multiple wallets "
                f"({op_rugs} rugs, {op_rug_rate}% rug rate, avg risk {op_risk:.0f}). "
                f"The operator's footprint is {op_total - dep_total} tokens larger than "
                f"this deployer alone."
            )
        else:
            parts.append(
                f"Operator {operator_fp[:12]}.. ({op_total} tokens, "
                f"{op_rug_rate}% rug rate, avg risk {op_risk:.0f})."
            )
    elif op_ek and op_ek[0] > 1:
        op_total, op_rugs, op_risk = op_ek[0], op_ek[1], op_ek[2]
        op_rug_rate = round(op_rugs / op_total * 100) if op_total > 0 else 0
        parts.append(
            f"Operator {operator_fp[:12]}.. controls {op_total} tokens "
            f"({op_rugs} rugs, {op_rug_rate}% rug rate)."
        )

    # Cluster membership
    if ctx.clusters:
        for nc in ctx.clusters:
            parts.append(
                f"Part of \"{nc[0]}\" wave: {nc[1]} deployers launched {nc[2]} tokens "
                f"with avg risk {nc[3]:.0f} — coordinated thematic activity."
            )

    # Deployer history (condensed)
    if ctx.deployer_episodes:
        recent = ctx.deployer_episodes[:3]
        scores = [ep[1] for ep in recent]
        trend = "escalating" if len(scores) >= 2 and scores[0] > scores[-1] else \
                "improving" if len(scores) >= 2 and scores[0] < scores[-1] else "stable"
        lines = [f"  - {ep[0][:12]}.. risk={ep[1]}" +
                 (f" [{ep[2]}]" if ep[2] else "") for ep in recent]
        parts.append(
            f"Recent history ({trend}): {len(ctx.deployer_episodes)} past investigations\n"
            + "\n".join(lines)
        )

    if not parts:
        return ""
    return "### Cross-Entity Intelligence\n" + "\n".join(parts)


def _build_recommended_focus(ctx: _MemoryContext) -> str:
    """Section 3: Deterministic investigation guidance based on memory signals."""
    priorities: list[str] = []
    skip: list[str] = []

    rug_rate = ctx.deployer_rug_rate

    # No history → full investigation
    if not ctx.deployer_ek:
        return "### Recommended Focus\nFirst-time entity — run full investigation, all tools relevant."

    # Serial rugger → focus exits
    if rug_rate >= 60:
        priorities.append("sol_flow + bundle_report (verify exit pattern)")
        skip.append("compare_tokens (pattern already established)")

    # Velocity spike → coordinated campaign
    if ctx.has_velocity_spike:
        priorities.append("cartel_report + operator_impact (investigate coordination)")

    # Cluster member → check thematic wave
    if ctx.has_high_risk_cluster:
        priorities.append("compare_tokens (verify cluster pattern)")

    # Re-scan with high confidence → minimal
    if ctx.prev_episode and ctx.deployer_ek and ctx.deployer_ek[6] == "high":
        prev_age_h = (time.time() - ctx.prev_episode[3]) / 3600
        if prev_age_h < 24:
            priorities.clear()
            skip.clear()
            priorities.append("delta analysis only — high-confidence re-scan within 24h")

    if not priorities and not skip:
        return ""

    lines = []
    if priorities:
        lines.append("Priority: " + "; ".join(priorities))
    if skip:
        lines.append("Skip: " + "; ".join(skip))
    return "### Recommended Focus\n" + "\n".join(lines)


async def _haiku_recommendation(ctx: _MemoryContext, deployer: Optional[str],
                                operator_fp: Optional[str]) -> str:
    """Generate a 1-2 sentence actionable recommendation via Haiku.

    Best-effort: returns empty string on failure (deterministic brief is sufficient).
    Cost: ~50 output tokens × Haiku rate ≈ $0.001 per call.
    """
    # Only call Haiku if we have meaningful data
    if not ctx.deployer_ek and not ctx.operator_ek:
        return ""

    # Build a compact fact summary for Haiku (no raw data, just structured facts)
    facts: list[str] = []
    if ctx.deployer_ek:
        ek = ctx.deployer_ek
        facts.append(f"Deployer: {ek[0]} tokens, {ek[1]} rugs, {ek[2]:.0f} avg risk, "
                     f"{ek[7] or 0:.1f} SOL extracted, velocity={ek[4] or 0:.0f}/24h")
    if ctx.operator_ek and ctx.operator_ek[0] > 1:
        op = ctx.operator_ek
        facts.append(f"Operator: {op[0]} tokens, {op[1]} rugs, {op[2]:.0f} avg risk")
    if ctx.anomalies:
        facts.append(f"Active anomalies: {', '.join(a[1][0] for a in ctx.anomalies)}")
    if ctx.clusters:
        facts.append(f"Cluster membership: {', '.join(c[0] for c in ctx.clusters)}")
    if ctx.feedback:
        parts = [f"{r[1]}x {r[0]}" for r in ctx.feedback]
        facts.append(f"User feedback: {', '.join(parts)}")

    if not facts:
        return ""

    try:
        import asyncio as _asyncio
        from .ai_analyst import _get_client

        client = _get_client()
        response = await _asyncio.wait_for(
            client.messages.create(
                model="claude-haiku-4-5",
                max_tokens=80,
                messages=[{
                    "role": "user",
                    "content": (
                        "You are a blockchain forensics advisor. Given these facts about a "
                        "Solana token deployer, write ONE actionable sentence (max 30 words) "
                        "advising the investigation agent what to focus on and why.\n\n"
                        + "\n".join(facts)
                    ),
                }],
            ),
            timeout=3.0,  # hard cap — never block the investigation
        )
        text = response.content[0].text.strip()
        logger.debug("[memory] haiku recommendation: %s", text[:80])
        return text
    except Exception as exc:
        logger.debug("[memory] haiku recommendation skipped: %s", exc)
        return ""  # deterministic brief is sufficient


# ── Entity Recall (for recall_memory tool) ────────────────────────────────────

async def recall_entity(entity_type: str, entity_id: str) -> dict:
    """Full memory recall for an entity — used by the recall_memory agent tool.

    Returns profile, episodes, timeline, AND a pre-digested synthesis
    with trend, threat level, active anomalies, and cluster membership.
    """
    result: dict[str, Any] = {"entity_type": entity_type, "entity_id": entity_id}

    try:
        from .data_sources._clients import cache as _cache
        from .cache import SQLiteCache
        if not isinstance(_cache, SQLiteCache):
            return result

        db = await _cache._get_conn()
        now = time.time()

        # Entity knowledge
        cursor = await db.execute(
            "SELECT * FROM entity_knowledge WHERE entity_type = ? AND entity_id = ?",
            (entity_type, entity_id),
        )
        ek_row = await cursor.fetchone()
        if ek_row:
            cols = [d[0] for d in cursor.description]
            result["profile"] = dict(zip(cols, ek_row))

        # Related episodes
        col_map = {"deployer": "deployer", "operator": "operator_fp", "campaign": "campaign_id", "mint": "mint"}
        col = col_map.get(entity_type)
        episodes = []
        if col:
            cursor = await db.execute(
                f"SELECT mint, risk_score, confidence, rug_pattern, verdict_summary, "
                f"user_rating, created_at FROM investigation_episodes "
                f"WHERE {col} = ? ORDER BY created_at DESC LIMIT 10",
                (entity_id,),
            )
            episodes = await cursor.fetchall()
            result["episodes"] = [
                {"mint": r[0], "risk_score": r[1], "confidence": r[2],
                 "rug_pattern": r[3], "summary": r[4][:100], "rating": r[5],
                 "age_hours": round((now - r[6]) / 3600, 1)}
                for r in episodes
            ]

        # Timeline events
        cursor = await db.execute(
            "SELECT event_type, mint, event_at, risk_score, extracted_sol "
            "FROM campaign_timelines WHERE entity_type = ? AND entity_id = ? "
            "ORDER BY event_at DESC LIMIT 20",
            (entity_type, entity_id),
        )
        timeline = await cursor.fetchall()
        result["timeline"] = [
            {"event": r[0], "mint": r[1][:12] if r[1] else "", "age_hours": round((now - r[2]) / 3600, 1),
             "risk_score": r[3], "extracted_sol": r[4]}
            for r in timeline
        ]

        # ── Synthesis: pre-digested insights ──────────────────────────────
        synthesis: dict[str, Any] = {}

        # Trend: compare first half vs second half of episodes
        if len(episodes) >= 4:
            mid = len(episodes) // 2
            recent_avg = sum(e[1] for e in episodes[:mid]) / mid
            older_avg = sum(e[1] for e in episodes[mid:]) / (len(episodes) - mid)
            if recent_avg > older_avg + 10:
                synthesis["trend"] = "degrading"
            elif recent_avg < older_avg - 10:
                synthesis["trend"] = "improving"
            else:
                synthesis["trend"] = "stable"
        elif episodes:
            synthesis["trend"] = "insufficient_data"
        else:
            synthesis["trend"] = "unknown"

        # Threat level
        if ek_row:
            total_tokens = ek_row[cols.index("total_tokens")] if "total_tokens" in cols else 0
            total_rugs = ek_row[cols.index("total_rugs")] if "total_rugs" in cols else 0
            rug_rate = (total_rugs / total_tokens * 100) if total_tokens > 0 else 0
            if rug_rate >= 70:
                synthesis["threat_level"] = "critical"
            elif rug_rate >= 40:
                synthesis["threat_level"] = "high"
            elif rug_rate >= 15:
                synthesis["threat_level"] = "medium"
            else:
                synthesis["threat_level"] = "low"
        else:
            synthesis["threat_level"] = "unknown"

        # Active anomalies
        cursor = await db.execute(
            "SELECT anomaly_type, severity, description FROM anomaly_alerts "
            "WHERE entity_type = ? AND entity_id = ? AND resolved = 0 LIMIT 5",
            (entity_type, entity_id),
        )
        anomaly_rows = await cursor.fetchall()
        synthesis["active_anomalies"] = [
            {"type": r[0], "severity": r[1], "description": r[2]} for r in anomaly_rows
        ]

        # Cluster membership
        cursor = await db.execute(
            "SELECT narrative_key, deployer_count, avg_risk_score "
            "FROM narrative_clusters WHERE active = 1 AND deployers_json LIKE ? LIMIT 3",
            (f'%"{entity_id}"%',),
        )
        cluster_rows = await cursor.fetchall()
        synthesis["cluster_membership"] = [
            {"narrative": r[0], "deployers": r[1], "avg_risk": r[2]} for r in cluster_rows
        ]

        # Reliability
        sample = ek_row[cols.index("sample_count")] if ek_row and "sample_count" in cols else 0
        rated = sum(1 for e in episodes if e[5])  # episodes with user_rating
        if sample >= 10 and rated >= 3:
            synthesis["reliability"] = "high"
        elif sample >= 3:
            synthesis["reliability"] = "medium"
        else:
            synthesis["reliability"] = "low"

        result["synthesis"] = synthesis

    except Exception as exc:
        logger.debug("[memory] recall_entity error: %s", exc)

    return result


# ── Calibration Offset ────────────────────────────────────────────────────────

async def get_calibration_offset(context: dict) -> float:
    """Get the aggregate score offset from active calibration rules matching this context."""
    try:
        from .data_sources._clients import cache as _cache
        from .cache import SQLiteCache
        if not isinstance(_cache, SQLiteCache):
            return 0.0

        db = await _cache._get_conn()
        cursor = await db.execute(
            "SELECT condition_json, adjustment FROM calibration_rules "
            "WHERE active = 1 AND sample_count >= 3 AND confidence >= 0.7 "
            "AND rule_type = 'score_offset'",
        )
        rules = await cursor.fetchall()

        total_offset = 0.0
        for cond_json, adjustment in rules:
            try:
                cond = json.loads(cond_json)
                # Check if all conditions match the current context
                if all(context.get(k) == v for k, v in cond.items()):
                    total_offset += adjustment
            except Exception:
                continue

        clamped = max(-30, min(30, total_offset))
        if clamped != 0:
            rules_matched = sum(1 for cj, adj in rules
                                if all(context.get(k) == v
                                       for k, v in json.loads(cj).items()))
            logger.debug("[calibration] offset=%.1f from %d matching rules", clamped, rules_matched)
            if abs(clamped) >= 25:
                logger.warning("[calibration] large offset %.0f — possible over-fitting", clamped)
        return clamped

    except Exception:
        return 0.0


# ── Calibration Rule Generation ──────────────────────────────────────────────

async def generate_calibration_rules() -> int:
    """Analyse feedback-rated episodes and generate score_offset calibration rules.

    Looks for systematic over/under-estimation patterns across signal dimensions:
    - Per rug_pattern (e.g. "high_risk_signals" rated accurate → no adjustment)
    - Per deployer_rug_rate bucket (0%, 1-30%, 30-70%, 70%+)
    - Per launch_platform (pump.fun, raydium, etc.)

    Rules are only created/activated when sample_count >= 3 and agreement >= 70%.
    Returns the number of rules created or updated.
    """
    try:
        from .data_sources._clients import cache as _cache
        from .cache import SQLiteCache
        if not isinstance(_cache, SQLiteCache):
            return 0

        db = await _cache._get_conn()

        # Fetch all episodes that have user feedback
        cursor = await db.execute(
            "SELECT risk_score, rug_pattern, signals_json, user_rating "
            "FROM investigation_episodes WHERE user_rating IS NOT NULL"
        )
        rated = await cursor.fetchall()
        if len(rated) < 3:
            return 0  # Not enough feedback to learn from

        rules_written = 0
        now = time.time()

        # ── Dimension 1: per rug_pattern ──────────────────────────────────
        pattern_buckets: dict[str, list[tuple[int, str]]] = {}
        for risk_score, pattern, _sigs_json, rating in rated:
            if not pattern:
                continue
            pattern_buckets.setdefault(pattern, []).append((risk_score, rating))

        for pattern, entries in pattern_buckets.items():
            if len(entries) < 3:
                continue
            incorrect = [e for e in entries if e[1] == "incorrect"]
            accurate = [e for e in entries if e[1] == "accurate"]
            total = len(entries)
            incorrect_rate = len(incorrect) / total

            if incorrect_rate >= 0.5 and len(incorrect) >= 2:
                # Systematic over- or under-estimation for this pattern
                avg_incorrect_score = sum(e[0] for e in incorrect) / len(incorrect)
                avg_accurate_score = sum(e[0] for e in accurate) / len(accurate) if accurate else 50
                # If incorrect verdicts had high scores → we over-estimate → negative offset
                # If incorrect verdicts had low scores → we under-estimate → positive offset
                adjustment = round((avg_accurate_score - avg_incorrect_score) * 0.5)
                adjustment = max(-30, min(30, adjustment))
                if abs(adjustment) >= 3:  # Only create rule if meaningful
                    confidence = round(1 - incorrect_rate, 2)
                    cond = json.dumps({"rug_pattern": pattern})
                    await db.execute(
                        "INSERT OR REPLACE INTO calibration_rules "
                        "(rule_type, condition_json, adjustment, sample_count, confidence, "
                        " source_episodes, active, created_at, updated_at) "
                        "VALUES ('score_offset', ?, ?, ?, ?, ?, 1, ?, ?)",
                        (cond, adjustment, total, max(0.5, confidence),
                         json.dumps([e[0] for e in entries]), now, now),
                    )
                    rules_written += 1

        # ── Dimension 2: per deployer rug_rate bucket ─────────────────────
        rate_buckets: dict[str, list[tuple[int, str]]] = {}
        for risk_score, _pattern, sigs_json, rating in rated:
            try:
                sigs = json.loads(sigs_json) if sigs_json else {}
            except Exception:
                sigs = {}
            rug_rate = sigs.get("deployer_rug_rate", 0) or 0
            if rug_rate == 0:
                bucket = "deployer_clean"
            elif rug_rate <= 30:
                bucket = "deployer_low_rug"
            elif rug_rate <= 70:
                bucket = "deployer_mid_rug"
            else:
                bucket = "deployer_serial"
            rate_buckets.setdefault(bucket, []).append((risk_score, rating))

        for bucket, entries in rate_buckets.items():
            if len(entries) < 3:
                continue
            incorrect = [e for e in entries if e[1] == "incorrect"]
            accurate = [e for e in entries if e[1] == "accurate"]
            total = len(entries)
            incorrect_rate = len(incorrect) / total

            if incorrect_rate >= 0.5 and len(incorrect) >= 2:
                avg_incorrect_score = sum(e[0] for e in incorrect) / len(incorrect)
                avg_accurate_score = sum(e[0] for e in accurate) / len(accurate) if accurate else 50
                adjustment = round((avg_accurate_score - avg_incorrect_score) * 0.5)
                adjustment = max(-30, min(30, adjustment))
                if abs(adjustment) >= 3:
                    confidence = round(1 - incorrect_rate, 2)
                    cond = json.dumps({"deployer_bucket": bucket})
                    await db.execute(
                        "INSERT OR REPLACE INTO calibration_rules "
                        "(rule_type, condition_json, adjustment, sample_count, confidence, "
                        " source_episodes, active, created_at, updated_at) "
                        "VALUES ('score_offset', ?, ?, ?, ?, ?, 1, ?, ?)",
                        (cond, adjustment, total, max(0.5, confidence),
                         json.dumps([e[0] for e in entries]), now, now),
                    )
                    rules_written += 1

        # ── Dimension 3: per launch_platform ──────────────────────────────
        platform_buckets: dict[str, list[tuple[int, str]]] = {}
        for risk_score, _pattern, sigs_json, rating in rated:
            try:
                sigs = json.loads(sigs_json) if sigs_json else {}
            except Exception:
                sigs = {}
            platform = sigs.get("launch_platform", "") or "unknown"
            platform_buckets.setdefault(platform, []).append((risk_score, rating))

        for platform, entries in platform_buckets.items():
            if len(entries) < 3:
                continue
            incorrect = [e for e in entries if e[1] == "incorrect"]
            accurate = [e for e in entries if e[1] == "accurate"]
            total = len(entries)
            incorrect_rate = len(incorrect) / total

            if incorrect_rate >= 0.5 and len(incorrect) >= 2:
                avg_incorrect_score = sum(e[0] for e in incorrect) / len(incorrect)
                avg_accurate_score = sum(e[0] for e in accurate) / len(accurate) if accurate else 50
                adjustment = round((avg_accurate_score - avg_incorrect_score) * 0.5)
                adjustment = max(-30, min(30, adjustment))
                if abs(adjustment) >= 3:
                    confidence = round(1 - incorrect_rate, 2)
                    cond = json.dumps({"launch_platform": platform})
                    await db.execute(
                        "INSERT OR REPLACE INTO calibration_rules "
                        "(rule_type, condition_json, adjustment, sample_count, confidence, "
                        " source_episodes, active, created_at, updated_at) "
                        "VALUES ('score_offset', ?, ?, ?, ?, ?, 1, ?, ?)",
                        (cond, adjustment, total, max(0.5, confidence),
                         json.dumps([e[0] for e in entries]), now, now),
                    )
                    rules_written += 1

        # Deactivate stale rules (no matching rated episodes)
        if rules_written > 0:
            await db.execute(
                "UPDATE calibration_rules SET active = 0 "
                "WHERE updated_at < ? AND rule_type = 'score_offset'",
                (now - 1,),
            )

        await db.commit()
        logger.info("[memory] calibration: %d rule(s) generated from %d rated episodes",
                     rules_written, len(rated))
        return rules_written

    except Exception as exc:
        logger.debug("[memory] generate_calibration_rules error: %s", exc)
        return 0
