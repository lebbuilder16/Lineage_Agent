"""
AI-powered forensic analysis layer.

Uses Anthropic Claude to transform raw on-chain data (lineage, bundle, SOL flows)
into structured narratives, risk scores, and actionable intelligence.

One Claude call is made per analysis — not per transaction — so cost stays
minimal (~$0.001–0.003 per report with claude-3-5-haiku).
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from typing import Any, Optional

logger = logging.getLogger(__name__)

# Model selection: haiku 4.5 for cost/speed — override via ANTHROPIC_MODEL env var
# Available as of 2026: claude-haiku-4-5-20251001, claude-sonnet-4-5-20250929, claude-sonnet-4-6
_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001")
_MAX_TOKENS = 1200
_TIMEOUT = 30.0  # seconds


# ── Lazy client (avoids import error when API key not set) ────────────────────

_client = None


def _get_client():
    global _client
    if _client is not None:
        return _client
    try:
        import anthropic  # noqa: PLC0415
    except ImportError as exc:
        raise RuntimeError(
            "anthropic package not installed. Run: pip install anthropic"
        ) from exc
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY environment variable not set")
    _client = anthropic.AsyncAnthropic(api_key=api_key, timeout=_TIMEOUT)
    return _client


# ── System prompt ─────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """\
You are a blockchain forensics expert specialising in Solana rug pulls, \
token manipulation schemes, and on-chain capital flows.

Analyse the provided on-chain data and respond with a single JSON object \
(no markdown, no explanation outside the JSON) with EXACTLY these fields in this order:

{
  "risk_score": <integer 0-100>,
  "confidence": <"low" | "medium" | "high">,
  "rug_pattern": <"classic_rug" | "slow_rug" | "pump_dump" | "coordinated_bundle" | "serial_clone" | "insider_drain" | "unknown">,
  "verdict_summary": <string — ONE sentence max 20 words, the headline conclusion e.g. \
"Serial clone operation: 4 copies in 4 hours by 4 fresh deployers with zombie relaunch.">,
  "narrative": {
    "observation": <string — 1-2 sentences: what the raw data shows (facts, numbers, timestamps)>,
    "pattern": <string — 1-2 sentences: the manipulation scheme identified and how it works>,
    "risk": <string — 1 sentence: concrete risk to token holders / why this matters>
  },
  "key_findings": [
    <Each finding MUST start with a category tag in brackets: [DEPLOYMENT], [FINANCIAL], \
[COORDINATION], [IDENTITY], [TIMING], or [EXIT]. Then one concise factual sentence. \
Include 3-6 findings, ordered from most to least incriminating.>
  ],
  "wallet_classifications": <dict mapping wallet_address_prefix (first 12 chars) → one of: \
"team_wallet" | "bundle_wallet" | "cash_out" | "cex_deposit" | "burner" | "clone_deployer" | "unknown">,
  "operator_hypothesis": <string | null — max 2 sentences: WHO is behind this and WHAT is \
their playbook. Null if insufficient data.>
}

Scoring guide:
- 90-100: Confirmed rug / extraction with on-chain proof
- 75-89:  Strong indicators, high suspicion
- 50-74:  Moderate risk signals
- <50:    Low risk or insufficient data

Rules:
- Be strictly factual — only reference data explicitly provided.
- Do not repeat the same information across narrative and key_findings.
- narrative.observation = raw facts. narrative.pattern = interpretation. narrative.risk = consequence.
- key_findings must add NEW information not already stated in verdict_summary.\
"""


# ── Public API ────────────────────────────────────────────────────────────────

async def analyze_token(
    mint: str,
    lineage_result: Optional[Any] = None,
    bundle_report: Optional[Any] = None,
    sol_flow_report: Optional[Any] = None,
) -> Optional[dict]:
    """Generate an AI forensic analysis from available on-chain reports.

    Accepts any combination of LineageResult, BundleExtractionReport,
    SolFlowReport — at least one must be provided.

    Returns a dict with risk_score, confidence, narrative, key_findings, etc.
    Returns None if the AI call fails or no data was provided.
    """
    if not lineage_result and not bundle_report and not sol_flow_report:
        logger.warning("[ai_analyst] analyze_token called with no data for %s", mint[:12])
        return None

    prompt = _build_prompt(mint, lineage_result, bundle_report, sol_flow_report)

    try:
        client = _get_client()
        message = await client.messages.create(
            model=_MODEL,
            max_tokens=_MAX_TOKENS,
            system=_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = message.content[0].text
        logger.info(
            "[ai_analyst] %s | model=%s input_tokens=%d output_tokens=%d",
            mint[:12], _MODEL,
            message.usage.input_tokens, message.usage.output_tokens,
        )
        result = _parse_response(raw, mint)
        return result

    except RuntimeError as exc:
        # Missing package or API key
        logger.error("[ai_analyst] %s", exc)
        return None
    except Exception as exc:
        # Catch anthropic errors by name to avoid hard import dependency
        exc_name = type(exc).__name__
        if "RateLimit" in exc_name:
            logger.warning("[ai_analyst] rate-limited for mint=%s", mint[:12])
        elif "NotFound" in exc_name:
            logger.error("[ai_analyst] model not found (%s) — set ANTHROPIC_MODEL env var. %s", _MODEL, exc)
        elif "APIConnection" in exc_name:
            logger.error("[ai_analyst] connection error: %s", exc)
        elif "APIStatus" in exc_name:
            logger.error("[ai_analyst] API error: %s", exc)
        else:
            logger.exception("[ai_analyst] unexpected error for mint=%s", mint[:12])
        return None


# ── Prompt construction ───────────────────────────────────────────────────────

def _build_prompt(
    mint: str,
    lineage: Optional[Any],
    bundle: Optional[Any],
    sol_flow: Optional[Any],
) -> str:
    parts: list[str] = [f"Token mint: {mint}\n"]

    # ── Lineage / clone intelligence ──────────────────────────────────────
    if lineage:
        parts.append("=== LINEAGE ANALYSIS ===")
        root = getattr(lineage, "root", None)
        if root:
            parts.append(f"Root token: {getattr(root,'name','')} ({getattr(root,'symbol','')})")
            parts.append(f"Root deployer: {getattr(root,'deployer','?')[:16]}...")
            parts.append(f"Root created: {getattr(root,'created_at','?')}")

        query_is_root = getattr(lineage, "query_is_root", None)
        if query_is_root is not None:
            parts.append(f"Queried token is root: {query_is_root}")

        derivatives = getattr(lineage, "derivatives", []) or []
        parts.append(f"Clones detected: {len(derivatives)}")
        for der in derivatives[:6]:
            parts.append(
                f"  Gen{getattr(der,'generation','?')}: {getattr(der,'name','?')} "
                f"({getattr(der,'symbol','?')}) deployer={str(getattr(der,'deployer','?'))[:12]}... "
                f"created={getattr(der,'created_at','?')} "
                f"score={getattr(getattr(der,'evidence',None),'composite_score',0):.0%}"
            )

        confidence = getattr(lineage, "confidence", None)
        if confidence is not None:
            parts.append(f"Lineage confidence: {confidence:.0%}")

        # Forensic signals
        zombie = getattr(lineage, "zombie_alert", None)
        if zombie:
            parts.append(f"ZOMBIE ALERT: same operator relaunched dead token "
                         f"(original {getattr(zombie,'original_mint','?')[:12]}...)")

        death_clock = getattr(lineage, "death_clock", None)
        if death_clock:
            parts.append(
                f"Death clock: risk={getattr(death_clock,'risk_level','?')} "
                f"median_rug_hours={getattr(death_clock,'median_rug_hours',0):.0f}h "
                f"elapsed={getattr(death_clock,'elapsed_hours',0):.0f}h"
            )

        deployer_profile = getattr(lineage, "deployer_profile", None)
        if deployer_profile:
            parts.append(
                f"Deployer history: "
                f"rug_count={getattr(deployer_profile,'rug_count',0)} "
                f"total_tokens={getattr(deployer_profile,'total_tokens_deployed',0)} "
                f"avg_lifespan_hours={getattr(deployer_profile,'avg_token_lifespan_hours',0):.0f}h"
            )

    # ── Bundle forensics ──────────────────────────────────────────────────
    if bundle:
        parts.append("\n=== BUNDLE FORENSICS ===")
        parts.append(f"Overall verdict: {getattr(bundle,'overall_verdict','?')}")
        parts.append(f"Launch slot: {getattr(bundle,'launch_slot','?')}")
        parts.append(f"Bundle wallets: {len(getattr(bundle,'bundle_wallets',[]))}")
        parts.append(f"Total SOL spent by bundle: {getattr(bundle,'total_sol_spent_by_bundle',0):.4f} SOL")
        parts.append(f"Coordinated sell detected: {getattr(bundle,'coordinated_sell_detected',False)}")

        confirmed = getattr(bundle, "confirmed_team_wallets", [])
        suspected = getattr(bundle, "suspected_team_wallets", [])
        coordinated = getattr(bundle, "coordinated_dump_wallets", [])
        if confirmed:
            parts.append(f"Confirmed team wallets: {[w[:12] for w in confirmed]}")
        if suspected:
            parts.append(f"Suspected team wallets: {[w[:12] for w in suspected]}")
        if coordinated:
            parts.append(f"Coordinated dump wallets: {[w[:12] for w in coordinated]}")

        common_funder = getattr(bundle, "common_prefund_source", None)
        if common_funder:
            parts.append(f"Common pre-funder: {common_funder[:16]}...")

        common_sinks = getattr(bundle, "common_sink_wallets", [])
        if common_sinks:
            parts.append(f"Common SOL sinks (≥2 wallets → same destination): {[s[:12] for s in common_sinks]}")

        evidence_chain = getattr(bundle, "evidence_chain", [])
        if evidence_chain:
            parts.append("Evidence chain:")
            for ev in evidence_chain[:6]:
                parts.append(f"  • {ev}")

        # Per-wallet detail (top 5 by suspicion)
        wallets = getattr(bundle, "bundle_wallets", [])
        suspicious = [
            w for w in wallets
            if getattr(w, "verdict", "early_buyer") != "early_buyer"
        ]
        if suspicious:
            parts.append("Suspicious wallets detail:")
            for w in suspicious[:5]:
                pre = getattr(w, "pre_sell", None)
                post = getattr(w, "post_sell", None)
                parts.append(
                    f"  {w.wallet[:14]} verdict={w.verdict} "
                    f"sol_spent={w.sol_spent:.4f} "
                    f"flags={w.red_flags[:3]}"
                )

    # ── SOL flow intelligence ─────────────────────────────────────────────
    if sol_flow:
        parts.append("\n=== SOL FLOW TRACE ===")
        parts.append(f"Total extracted: {getattr(sol_flow,'total_extracted_sol',0):.4f} SOL")
        if getattr(sol_flow, "total_extracted_usd", None):
            parts.append(f"USD value: ${sol_flow.total_extracted_usd:,.2f}")
        parts.append(f"Hops traced: {getattr(sol_flow,'hop_count',1)}")
        parts.append(f"Terminal wallets (final destinations): {len(getattr(sol_flow,'terminal_wallets',[]))}")
        parts.append(f"Known CEX detected: {getattr(sol_flow,'known_cex_detected',False)}")

        # Cross-chain exits
        exits = getattr(sol_flow, "cross_chain_exits", [])
        if exits:
            parts.append(f"Cross-chain exits: {len(exits)} detected")
            for ex in exits[:3]:
                parts.append(f"  bridge={getattr(ex,'bridge_program','?')[:12]} "
                              f"amount={getattr(ex,'amount_sol',0):.4f} SOL")

        # Top 6 flows sorted by amount
        flows = getattr(sol_flow, "flows", []) or []
        top_flows = sorted(flows, key=lambda e: getattr(e, "amount_sol", 0), reverse=True)[:6]
        if top_flows:
            parts.append("Largest flows:")
            for edge in top_flows:
                label = f" [{edge.to_label}]" if getattr(edge, "to_label", None) else ""
                parts.append(
                    f"  hop{edge.hop} {edge.from_address[:10]}→{edge.to_address[:10]}"
                    f"{label} {edge.amount_sol:.4f} SOL"
                )

    return "\n".join(parts)


# ── Response parsing ──────────────────────────────────────────────────────────

def _parse_response(raw: str, mint: str) -> dict:
    """Parse Claude's JSON response robustly."""
    ts = datetime.now(tz=timezone.utc).isoformat()
    try:
        cleaned = raw.strip()
        # Strip markdown code fences if present
        if cleaned.startswith("```"):
            lines = cleaned.split("\n")
            cleaned = "\n".join(
                line for line in lines
                if not line.strip().startswith("```")
            )
        result = json.loads(cleaned.strip())
        result["mint"] = mint
        result["model"] = _MODEL
        result["analyzed_at"] = ts
        return result
    except json.JSONDecodeError:
        logger.warning("[ai_analyst] JSON parse failed, raw=%s", raw[:200])
        return {
            "mint": mint,
            "model": _MODEL,
            "analyzed_at": ts,
            "risk_score": None,
            "confidence": "low",
            "rug_pattern": "unknown",
            "verdict_summary": "Analysis failed — could not parse AI response.",
            "narrative": {
                "observation": raw[:400],
                "pattern": None,
                "risk": None,
            },
            "key_findings": [],
            "wallet_classifications": {},
            "operator_hypothesis": None,
            "parse_error": True,
        }
