"""
Agent Memory Service — Cross-Investigation Intelligence Layer.

Provides four memory operations:
1. record_episode() — persist a verdict + signal snapshot after each investigation
2. build_memory_brief() — build a 300-800 token text brief for agent system prompt
3. recall_entity() — on-demand entity lookup (recall_memory tool)
4. get_calibration_offset() — fetch active calibration rules for heuristic adjustment

All retrieval is 100% SQL — zero additional LLM calls.
"""
from __future__ import annotations

import json
import logging
import time
from typing import Any, Optional

logger = logging.getLogger(__name__)


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
    """Recompute entity knowledge from episodes."""
    try:
        col = "deployer" if entity_type == "deployer" else "operator_fp"
        cursor = await db.execute(
            f"SELECT risk_score, rug_pattern, signals_json, created_at "
            f"FROM investigation_episodes WHERE {col} = ? ORDER BY created_at DESC LIMIT 50",
            (entity_id,),
        )
        rows = await cursor.fetchall()
        if not rows:
            return

        total = len(rows)
        risk_scores = [r[0] for r in rows]
        avg_score = sum(risk_scores) / total
        patterns = [r[1] for r in rows if r[1]]
        typical_pattern = max(set(patterns), key=patterns.count) if patterns else ""

        # Count rugs (risk >= 70)
        rug_count = sum(1 for s in risk_scores if s >= 70)

        # Aggregate extraction SOL + narrative preferences from signals_json
        total_extracted = 0.0
        narratives: list[str] = []
        for r in rows:
            try:
                sigs = json.loads(r[2]) if r[2] else {}
                total_extracted += sigs.get("sol_extracted", 0) or 0
                total_extracted += sigs.get("bundle_extracted_sol", 0) or 0
                platform = sigs.get("launch_platform", "")
                if platform:
                    narratives.append(platform)
            except Exception:
                pass

        # Velocity: tokens in last 24h
        now = time.time()
        recent_24h = sum(1 for r in rows if now - r[3] < 86400)

        # Previous velocity (24-48h ago)
        prev_24h = sum(1 for r in rows if 86400 < now - r[3] < 172800)
        acceleration = recent_24h - prev_24h

        first_seen = min(r[3] for r in rows)
        last_seen = max(r[3] for r in rows)

        confidence = "high" if total >= 5 else "medium" if total >= 2 else "low"

        # Top narratives/platforms
        narrative_counts = {}
        for n in narratives:
            narrative_counts[n] = narrative_counts.get(n, 0) + 1
        top_narratives = sorted(narrative_counts, key=narrative_counts.get, reverse=True)[:3]

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
    except Exception as exc:
        logger.debug("[memory] entity_knowledge update error: %s", exc)


# ── Memory Brief Builder ──────────────────────────────────────────────────────

async def build_memory_brief(
    mint: str,
    deployer: Optional[str] = None,
    operator_fp: Optional[str] = None,
    community_id: Optional[str] = None,
) -> str:
    """Build a 300-800 token intelligence brief from all memory layers.

    Injected into the agent's system prompt before Claude is called.
    100% SQL retrieval — zero LLM calls.
    """
    try:
        from .data_sources._clients import cache as _cache
        from .cache import SQLiteCache
        if not isinstance(_cache, SQLiteCache):
            return ""

        db = await _cache._get_conn()
        sections: list[str] = []

        # ── Episodic: past verdicts for this token ────────────────────────
        cursor = await db.execute(
            "SELECT risk_score, verdict_summary, user_rating, created_at "
            "FROM investigation_episodes WHERE mint = ? ORDER BY created_at DESC LIMIT 1",
            (mint,),
        )
        prev = await cursor.fetchone()
        if prev:
            age_h = (time.time() - prev[3]) / 3600
            rating = f" (user rated: {prev[2]})" if prev[2] else ""
            sections.append(
                f"### This Token\n"
                f"Previously investigated {age_h:.0f}h ago → risk {prev[0]}/100: "
                f'"{prev[1][:100]}"{rating}'
            )

        # ── Episodic: other tokens from same deployer ─────────────────────
        if deployer:
            cursor = await db.execute(
                "SELECT mint, risk_score, verdict_summary, user_rating "
                "FROM investigation_episodes WHERE deployer = ? AND mint != ? "
                "ORDER BY created_at DESC LIMIT 3",
                (deployer, mint),
            )
            deployer_eps = await cursor.fetchall()
            if deployer_eps:
                lines = []
                for ep in deployer_eps:
                    rating = f" [{ep[3]}]" if ep[3] else ""
                    lines.append(f"  - {ep[0][:12]}.. risk={ep[1]}{rating}")
                sections.append(
                    f"### Deployer History ({deployer[:12]}..)\n"
                    f"{len(deployer_eps)} past investigations:\n" + "\n".join(lines)
                )

        # ── Entity knowledge: deployer profile ────────────────────────────
        if deployer:
            cursor = await db.execute(
                "SELECT total_tokens, total_rugs, avg_risk_score, typical_rug_pattern, "
                "launch_velocity, acceleration, confidence "
                "FROM entity_knowledge WHERE entity_type = 'deployer' AND entity_id = ?",
                (deployer,),
            )
            ek = await cursor.fetchone()
            if ek:
                vel_str = ""
                if ek[4] and ek[4] > 0:
                    arrow = "↑" if (ek[5] or 0) > 0 else "↓" if (ek[5] or 0) < 0 else "→"
                    vel_str = f" Velocity: {ek[4]:.1f}/24h {arrow}"
                rug_rate = round(ek[1] / ek[0] * 100) if ek[0] > 0 else 0
                sections.append(
                    f"### Deployer Profile\n"
                    f"{ek[0]} tokens, {ek[1]} rugs ({rug_rate}%). "
                    f"Avg risk: {ek[2]:.0f}. Pattern: {ek[3] or 'unknown'}.{vel_str} "
                    f"[{ek[6]} confidence]"
                )

        # ── Entity knowledge: operator profile ────────────────────────────
        if operator_fp:
            cursor = await db.execute(
                "SELECT total_tokens, total_rugs, avg_risk_score, launch_velocity, acceleration "
                "FROM entity_knowledge WHERE entity_type = 'operator' AND entity_id = ?",
                (operator_fp,),
            )
            op = await cursor.fetchone()
            if op and op[0] > 1:
                rug_rate = round(op[1] / op[0] * 100) if op[0] > 0 else 0
                vel = f" {op[3]:.1f} launches/24h" if op[3] else ""
                sections.append(
                    f"### Operator ({operator_fp[:12]}..)\n"
                    f"{op[0]} tokens across linked wallets, {op[1]} rugs ({rug_rate}%). "
                    f"Avg risk: {op[2]:.0f}.{vel}"
                )

        # ── Calibration rules ─────────────────────────────────────────────
        cursor = await db.execute(
            "SELECT rule_type, condition_json, adjustment, sample_count "
            "FROM calibration_rules WHERE active = 1 AND sample_count >= 3 AND confidence >= 0.7 "
            "ORDER BY sample_count DESC LIMIT 3",
        )
        rules = await cursor.fetchall()
        if rules:
            lines = []
            for r in rules:
                cond = json.loads(r[1]) if r[1] else {}
                cond_str = ", ".join(f"{k}={v}" for k, v in cond.items())
                lines.append(f"  - {r[0]}: {cond_str} → adjust {r[2]:+.0f} ({r[3]} samples)")
            sections.append("### Calibration Notes\n" + "\n".join(lines))

        # ── Feedback synthesis ────────────────────────────────────────────
        if deployer:
            cursor = await db.execute(
                "SELECT user_rating, COUNT(*) FROM investigation_episodes "
                "WHERE deployer = ? AND user_rating IS NOT NULL "
                "GROUP BY user_rating",
                (deployer,),
            )
            feedback_rows = await cursor.fetchall()
            if feedback_rows:
                parts = [f"{r[1]}x {r[0]}" for r in feedback_rows]
                sections.append(f"### Feedback: {', '.join(parts)}")

        if not sections:
            return ""

        brief = "## INTELLIGENCE MEMORY\n\n" + "\n\n".join(sections)
        logger.debug("[memory] brief built: %d chars for %s", len(brief), mint[:12])
        return brief

    except Exception as exc:
        logger.debug("[memory] build_memory_brief error: %s", exc)
        return ""


# ── Entity Recall (for recall_memory tool) ────────────────────────────────────

async def recall_entity(entity_type: str, entity_id: str) -> dict:
    """Full memory recall for an entity — used by the recall_memory agent tool."""
    result: dict[str, Any] = {"entity_type": entity_type, "entity_id": entity_id}

    try:
        from .data_sources._clients import cache as _cache
        from .cache import SQLiteCache
        if not isinstance(_cache, SQLiteCache):
            return result

        db = await _cache._get_conn()

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
                 "age_hours": round((time.time() - r[6]) / 3600, 1)}
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
            {"event": r[0], "mint": r[1][:12] if r[1] else "", "age_hours": round((time.time() - r[2]) / 3600, 1),
             "risk_score": r[3], "extracted_sol": r[4]}
            for r in timeline
        ]

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

        return max(-30, min(30, total_offset))  # clamp to [-30, +30]

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
