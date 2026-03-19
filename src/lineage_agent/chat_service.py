"""Chat service — rich context builder for backend-direct AI chat.

Ports the mobile buildTokenContext() logic (from openclaw-chat.ts) to Python,
so the backend can inject the same rich forensic context into Claude calls
without depending on OpenClaw.
"""
from __future__ import annotations

import datetime
import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)

# Cache the skill prompt on first load
_SKILL_PROMPT: str | None = None


def get_system_prompt() -> str:
    """Return the system prompt for backend-direct chat.

    This is a self-contained prompt that keeps the formatting and calibration
    rules from SKILL.md but removes all API-calling instructions (web_fetch,
    endpoints, etc.) since the data is already injected in the context.
    """
    global _SKILL_PROMPT
    if _SKILL_PROMPT is not None:
        return _SKILL_PROMPT

    _SKILL_PROMPT = """You are a Solana blockchain forensics analyst embedded in the Lineage Agent platform.

IMPORTANT: All on-chain data for the queried token has ALREADY been fetched and is provided in the FORENSIC CONTEXT section below. Do NOT attempt to call any API, use web_fetch, or reference any endpoint URL. Analyze ONLY the data provided.

## Response format — MOBILE OPTIMIZED

- Never use markdown tables — they render poorly on mobile. Use bullet lists instead.
- Always lead with the verdict, then key facts, then details.
- Always cite data freshness: "Données au HH:MM UTC" at the top.
- Use this exact structure (adapt to user's language):

[VERDICT EMOJI] VERDICT: [SAFE / CAUTION / HIGH RISK / CRITICAL / RUG]

Données au HH:MM UTC

- Risk score AI: X/100 (si disponible)
- Death clock: [risk_level] — probabilité de rug: X%
- Confiance: [low/medium/high] (X échantillons)

SIGNAUX CLÉS:
- [Signal 1 — le plus important, avec emoji 🚨 si critique, ⚠️ si warning]
- [Signal 2]
- [Signal 3]

MARKET DATA:
- Market cap: $X
- Liquidité: $X (Y% du MC)
- Pools: [détail si disponible]
- Statut: [bonding curve / DEX listé]
- Âge: Xh

INSIDER SELL:
- Verdict: [clean/suspicious/insider_dump]
- Flags: [DEPLOYER_EXITED, etc.]
- Pression vendeuse: X% en 1h, Y% en 6h
- Variation prix: X% en 1h, Y% en 24h

[Si on-chain activity fallback présent]:
ON-CHAIN ACTIVITY:
- Transactions dernière heure: X
- Transactions dernières 6h: X
- Transactions dernières 24h: X
- (Note: données RPC brutes, pas de distinction buy/sell — mais permet d'évaluer l'activité réelle du token)

[Si sol_flow présent]:
SOL FLOW:
- Extraction totale: X SOL
- Pattern: X wallets, Y hops
- Sink wallet: [adresse abrégée]
- CEX détecté: oui/non

[Si opérateur détecté]:
OPÉRATEUR:
- Fingerprint: [abrégé]
- Wallets liés: X
- Pattern: [description]

[Si clone/dérivé]:
LIGNÉE:
- Clone de [NOM] ($XXX mcap)
- Famille: X tokens
- Confiance détection: X%

BUNDLE:
- [Si données]: X bundles, Y SOL extraits
- [Si null]: Aucun bundle détecté

DONNÉES MANQUANTES:
- For each missing field, explain WHY it is missing and what WAS checked instead:
  - "insider_sell: données txn insuffisantes (token < 12h) — deployer balance vérifié on-chain: [holding/exited]"
  - "death_clock: premier token du deployer — aucun historique de rug"
  - "sol_flow: aucune extraction détectée (normal pour un token actif)"
- NEVER list a field as just "non disponible" without context

## Verdict calibration

- If death_clock confidence = low AND no strong signals:
  - Token < 24h: "CAUTION — token récent, surveillance recommandée" + list what WAS checked clean (bundle, deployer balance, liquidity ratio). NEVER say just "données limitées" without specifying what was verified.
  - Token < 24h + structural risk (liquidity/MC < 10%, deployer exited): "CAUTION — signaux structurels à surveiller" + cite specific signals
  - Token >= 24h: "CAUTION — données limitées"
- If at least 1 hard signal (bundle confirmed, insider_dump, sol_flow extraction) → escalate normally regardless of token age
- If insider_sell has DEPLOYER_EXITED + sol_flow extraction → "HIGH RISK" regardless of death clock
- If AI FORENSIC ANALYSIS section is present in context, use risk_score and findings to inform verdict
- Always cite WHICH source drives the verdict
- Always distinguish direct vs operator samples

## Data rules

- Use the FORENSIC CONTEXT data as authoritative — it is fresh from the scanner.
- Use `query_token` (not `root`) for market cap, liquidity, price. Root is the oldest ancestor.
- NEVER fabricate numbers. If a field is missing, say "non disponible".
- NEVER state or assume a SOL price. Report SOL amounts as-is.
- NEVER expose raw API URLs or JSON in your response.
- Respond in the user's language.
- Cross-reference signals before concluding. Converging signals = high conviction.
- Distinguish soft vs hard rugs: liquidity drain (hard) vs slow insider sell (soft).
"""
    return _SKILL_PROMPT


def _fmt(n: float | int) -> str:
    """Format number for display (matches mobile formatNum)."""
    if n >= 1_000_000:
        return f"{n / 1_000_000:.2f}M"
    if n >= 1_000:
        return f"{n / 1_000:.1f}K"
    return f"{n:.2f}"


def build_rich_context(lineage_result) -> str:
    """Build rich forensic context from a LineageResult, matching the mobile buildTokenContext().

    Args:
        lineage_result: A LineageResult Pydantic model or dict with all forensic signals.

    Returns:
        A formatted text block to inject into the Claude system prompt.
    """
    # Support both Pydantic models and dicts
    def _g(obj, key, default=None):
        if obj is None:
            return default
        if isinstance(obj, dict):
            return obj.get(key, default)
        return getattr(obj, key, default)

    mint = _g(lineage_result, "mint", "unknown")

    # Prefer query_token (the actually scanned token) over root (oldest ancestor)
    qt = _g(lineage_result, "query_token")
    root = qt or _g(lineage_result, "root")
    if not root:
        return f"[Analyzing Solana token {mint}. Scan data incomplete.]"

    dc = _g(lineage_result, "death_clock")
    bundle = _g(lineage_result, "bundle_report")
    insider = _g(lineage_result, "insider_sell")
    operator = _g(lineage_result, "operator_fingerprint")
    liq_arch = _g(lineage_result, "liquidity_arch")
    sol_flow = _g(lineage_result, "sol_flow")

    parts: list[str] = []
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()

    # Header
    parts.append(f"DATA SOURCE: LIVE DATA (fetched at {now})")
    parts.append("⚠ SOL PRICE NOTE: No SOL/USD price is provided. Do NOT state or assume a SOL price. Report SOL amounts as-is. Only convert to USD if total_extracted_usd is explicitly provided.")

    # Token metadata
    parts.append(f"TOKEN: {_g(root, 'name', '?')} ({_g(root, 'symbol', '?')}) — mint: {mint}")
    parts.append(f"Deployer: {_g(root, 'deployer', 'N/A')}")
    created = _g(root, "created_at")
    if created:
        parts.append(f"Created: {created}")
    mcap = _g(root, "market_cap_usd")
    liq = _g(root, "liquidity_usd")
    if mcap:
        parts.append(f"Market cap: ${_fmt(mcap)}")
    if liq:
        parts.append(f"Liquidity: ${_fmt(liq)}")
    stage = _g(root, "lifecycle_stage")
    if stage:
        parts.append(f"Lifecycle: {stage}")
    surface = _g(root, "market_surface")
    if surface:
        parts.append(f"Market surface: {surface}")

    # ── Early token profile — structural risk signals for young tokens ────
    _created_at = _g(root, "created_at")
    _token_age_hours: float | None = None
    if _created_at:
        import datetime as _dt
        try:
            if isinstance(_created_at, str):
                _ca_parsed = _dt.datetime.fromisoformat(_created_at.replace("Z", "+00:00"))
            else:
                _ca_parsed = _created_at
            if _ca_parsed.tzinfo is None:
                _ca_parsed = _ca_parsed.replace(tzinfo=_dt.timezone.utc)
            _token_age_hours = (
                _dt.datetime.now(_dt.timezone.utc) - _ca_parsed
            ).total_seconds() / 3600
        except Exception:
            _token_age_hours = None

    if _token_age_hours is not None and _token_age_hours < 24:
        parts.append("\nEARLY TOKEN PROFILE (< 24h):")
        parts.append(f"  Age: {_token_age_hours:.1f}h")
        if mcap and liq:
            _liq_ratio = (liq / mcap) * 100 if mcap > 0 else 0
            _liq_flag = " ⚠ (< 10% — low liquidity depth)" if _liq_ratio < 10 else ""
            parts.append(f"  Liquidity/MC ratio: {_liq_ratio:.1f}%{_liq_flag}")
        elif mcap:
            parts.append("  Liquidity/MC ratio: liquidity data unavailable")

        # Bundle summary (inline for quick read)
        _bundle_verdict = _g(bundle, "verdict") if bundle else None
        if _bundle_verdict:
            parts.append(f"  Bundle at launch: {_bundle_verdict}")
        else:
            parts.append("  Bundle at launch: none detected ✅")

        # Deployer profile from deployer_profile field
        dp = _g(lineage_result, "deployer_profile")
        if dp:
            _dp_total = _g(dp, "total_tokens_launched") or 0
            _dp_rugs = _g(dp, "rug_count") or 0
            _dp_rate = _g(dp, "rug_rate_pct") or 0
            if _dp_total <= 1:
                parts.append(f"  Deployer: first-time deployer (1 token, 0 rugs)")
            else:
                parts.append(f"  Deployer: {_dp_total} tokens launched, {_dp_rugs} rugs ({_dp_rate:.0f}%)")
        else:
            parts.append("  Deployer: profile not available")

        # Insider sell deployer exit status (always useful)
        if insider:
            _de = _g(insider, "deployer_exited")
            if _de is True:
                parts.append("  Deployer token balance: 0 (exited) ⚠")
            elif _de is False:
                parts.append("  Deployer token balance: still holding ✅")

    # Lineage relationship
    root_obj = _g(lineage_result, "root")
    root_mint = _g(root_obj, "mint") if root_obj else None
    is_derivative = root_mint and root_mint != mint
    derivs = _g(lineage_result, "derivatives") or []
    confidence = _g(lineage_result, "confidence")

    if is_derivative:
        parts.append(f"\nLINEAGE: This token is a derivative/clone of {_g(root_obj, 'name', '?')} ({root_mint})")
        root_mcap = _g(root_obj, "market_cap_usd") or 0
        parts.append(f"  Root market cap: ${_fmt(root_mcap)}")
    if derivs:
        conf_pct = f"{confidence * 100:.0f}%" if confidence else "N/A"
        parts.append(f"  {len(derivs)} total derivative(s) in family (confidence: {conf_pct})")

    # Death Clock
    if dc:
        parts.append("\nDEATH CLOCK:")
        parts.append(f"  Risk level: {_g(dc, 'risk_level', 'N/A')}")
        parts.append(f"  Historical rugs: {_g(dc, 'historical_rug_count', 0)}")
        rug_prob = _g(dc, "rug_probability_pct")
        if rug_prob is not None:
            parts.append(f"  Rug probability: {rug_prob}%")
        median = _g(dc, "median_rug_hours") or 0
        if median > 0:
            parts.append(f"  Median rug timing: {median:.1f}h")
        elapsed = _g(dc, "elapsed_hours")
        if elapsed is not None:
            parts.append(f"  Elapsed: {elapsed:.1f}h since launch")
        ws = _g(dc, "predicted_window_start")
        we = _g(dc, "predicted_window_end")
        if ws:
            parts.append(f"  Rug window: {ws} → {we}")
        parts.append(f"  Confidence: {_g(dc, 'confidence_level', 'N/A')} ({_g(dc, 'confidence_note', '')})")
        parts.append(f"  Basis: {_g(dc, 'prediction_basis', 'N/A')} ({_g(dc, 'sample_count', 0)} samples)")
        basis = _g(dc, "basis_breakdown")
        if basis and isinstance(basis, dict) and len(basis) > 0:
            parts.append(f"  Mechanisms: {', '.join(f'{k}: {v}' for k, v in basis.items())}")
        if _g(dc, "is_factory"):
            parts.append("  ⚠ Factory-pattern deployer")
        # Deployer profile summary — explicit context when prediction is unavailable
        dps = _g(dc, "deployer_profile_summary")
        if dps:
            parts.append(f"  Deployer context: {dps}")

    # Bundle Report
    if bundle:
        parts.append("\nBUNDLE REPORT:")
        bc = _g(bundle, "bundle_count")
        if bc is not None:
            parts.append(f"  Bundles: {bc}")
        sol = _g(bundle, "total_extracted_sol")
        if sol is not None:
            usd = _g(bundle, "total_extracted_usd")
            usd_str = f" (${_fmt(usd)})" if usd is not None else " (USD conversion unavailable)"
            parts.append(f"  Extracted: {sol} SOL{usd_str}")
        verdict = _g(bundle, "verdict")
        if verdict:
            parts.append(f"  Verdict: {verdict}")

    # Insider Sell
    if insider:
        parts.append("\nINSIDER SELL:")
        v = _g(insider, "verdict")
        if v:
            parts.append(f"  Verdict: {v}")
        dsp = _g(insider, "deployer_sold_pct")
        if dsp is not None:
            parts.append(f"  Deployer sold: {dsp}%")
        de = _g(insider, "deployer_exited")
        if de is not None:
            parts.append(f"  Deployer exited: {de}")
        flags = _g(insider, "flags")
        if flags and isinstance(flags, list):
            parts.append(f"  Flags: {', '.join(flags)}")
        for period, key in [("1h", "sell_pressure_1h"), ("6h", "sell_pressure_6h"), ("24h", "sell_pressure_24h")]:
            sp = _g(insider, key)
            if sp is not None:
                parts.append(f"  Sell pressure {period}: {sp * 100:.1f}%")
        pc1 = _g(insider, "price_change_1h")
        if pc1 is not None:
            parts.append(f"  Price change 1h: {pc1}%")
        pc24 = _g(insider, "price_change_24h")
        if pc24 is not None:
            parts.append(f"  Price change 24h: {pc24}%")

    # On-chain activity fallback (when DexScreener txns unavailable)
    if insider:
        otx_1h = _g(insider, "onchain_tx_count_1h")
        otx_6h = _g(insider, "onchain_tx_count_6h")
        otx_24h = _g(insider, "onchain_tx_count_24h")
        if otx_1h is not None or otx_6h is not None or otx_24h is not None:
            parts.append("\nON-CHAIN ACTIVITY (RPC fallback — DexScreener txns unavailable):")
            if otx_1h is not None:
                parts.append(f"  Transactions last 1h: {otx_1h}")
            if otx_6h is not None:
                parts.append(f"  Transactions last 6h: {otx_6h}")
            if otx_24h is not None:
                parts.append(f"  Transactions last 24h: {otx_24h}")

    if insider:
        # Explicit data coverage — never silent about what's missing
        _cov = _g(insider, "data_coverage")
        if _cov and _cov != "full":
            _cov_note = _g(insider, "data_coverage_note") or ""
            parts.append(f"  Data coverage: {_cov}" + (f" — {_cov_note}" if _cov_note else ""))

    if not insider:
        parts.append("\nINSIDER SELL: no data available")
    if not bundle:
        parts.append("\nBUNDLE REPORT: no bundle detected")

    # Operator
    if operator:
        parts.append("\nOPERATOR:")
        fp = _g(operator, "fingerprint")
        if fp:
            parts.append(f"  Fingerprint: {fp}")
        lw = _g(operator, "linked_wallets")
        if lw and isinstance(lw, list):
            parts.append(f"  Linked wallets: {len(lw)}")
        us = _g(operator, "upload_service")
        if us:
            parts.append(f"  Upload service: {us}")
        dp = _g(operator, "description_pattern")
        if dp:
            parts.append(f"  Pattern: {dp}")
        conf = _g(operator, "confidence")
        if conf:
            parts.append(f"  Confidence: {conf}")

    # Liquidity Architecture
    if liq_arch:
        parts.append("\nLIQUIDITY ARCHITECTURE:")
        hhi = _g(liq_arch, "concentration_hhi")
        if hhi is not None:
            parts.append(f"  HHI: {hhi}")
        pc = _g(liq_arch, "pool_count")
        if pc is not None:
            parts.append(f"  Pools: {pc}")
        pools = _g(liq_arch, "pools")
        if pools and isinstance(pools, dict):
            parts.append(f"  Distribution: {', '.join(f'{k}: ${_fmt(v)}' for k, v in pools.items())}")
        auth = _g(liq_arch, "authenticity_score")
        if auth is not None:
            parts.append(f"  Authenticity: {auth}")

    # SOL Flow — compact summary
    if sol_flow:
        parts.append("\nSOL FLOW:")
        ext_sol = _g(sol_flow, "total_extracted_sol")
        if ext_sol is not None:
            ext_usd = _g(sol_flow, "total_extracted_usd")
            usd_str = f" (${_fmt(ext_usd)})" if ext_usd is not None else " (USD conversion unavailable — do not assume SOL price)"
            parts.append(f"  Total extracted: {ext_sol} SOL{usd_str}")
        deployer_w = _g(sol_flow, "deployer")
        if deployer_w:
            parts.append(f"  Deployer wallet: {deployer_w}")
        hops = _g(sol_flow, "hop_count")
        if hops is not None:
            parts.append(f"  Hops: {hops}")
        cex = _g(sol_flow, "known_cex_detected")
        if cex is not None:
            parts.append(f"  CEX detected: {cex}")
        rug_ts = _g(sol_flow, "rug_timestamp")
        if rug_ts:
            parts.append(f"  Extraction started: {rug_ts}")
        terms = _g(sol_flow, "terminal_wallets")
        if terms and isinstance(terms, list):
            parts.append(f"  Terminal/sink wallets: {', '.join(terms)}")
        # Compact flow summary
        flows = _g(sol_flow, "flows")
        if flows and isinstance(flows, list) and len(flows) > 0:
            wallets = set()
            amount_by_hop: dict[int, float] = {}
            for f in flows:
                fa = _g(f, "from_address")
                ta = _g(f, "to_address")
                if fa:
                    wallets.add(fa)
                if ta:
                    wallets.add(ta)
                hop = _g(f, "hop") or 0
                amount_by_hop[hop] = amount_by_hop.get(hop, 0) + (_g(f, "amount_sol") or 0)
            parts.append(f"  Unique wallets in flow: {len(wallets)}")
            parts.append(f"  Total flow edges: {len(flows)}")
            hop_summary = ", ".join(
                f"hop{h}: {s:.3f} SOL"
                for h, s in sorted(amount_by_hop.items())
            )
            parts.append(f"  Volume by hop: {hop_summary}")
            # Time span of extraction
            times = sorted(
                _g(f, "block_time")
                for f in flows
                if _g(f, "block_time")
            )
            if len(times) >= 2:
                parts.append(f"  Time span: {times[0]} → {times[-1]}")

    # Family size
    family_size = _g(lineage_result, "family_size")
    if family_size is not None:
        parts.append(f"\nFamily size: {family_size} tokens total")

    # Zombie alert
    if _g(lineage_result, "zombie_alert"):
        parts.append("\n⚠ ZOMBIE ALERT: Token relaunch detected")

    return "\n".join(parts)


def build_ai_analysis_context(ai_result: dict) -> str:
    """Format cached AI analysis result for injection into chat context.

    Returns an empty string if ai_result is None or empty.
    """
    if not ai_result:
        return ""

    parts: list[str] = ["\nAI FORENSIC ANALYSIS (from /analyze):"]

    risk_score = ai_result.get("risk_score")
    if risk_score is not None:
        parts.append(f"  Risk score: {risk_score}/100")
    confidence = ai_result.get("confidence")
    if confidence:
        parts.append(f"  Confidence: {confidence}")
    rug_pattern = ai_result.get("rug_pattern")
    if rug_pattern:
        parts.append(f"  Pattern: {rug_pattern}")
    verdict = ai_result.get("verdict_summary")
    if verdict:
        parts.append(f"  Verdict: {verdict}")

    narrative = ai_result.get("narrative")
    if narrative and isinstance(narrative, dict):
        obs = narrative.get("observation")
        if obs:
            parts.append(f"  Observation: {obs}")
        risk = narrative.get("risk")
        if risk:
            parts.append(f"  Risk assessment: {risk}")

    findings = ai_result.get("key_findings")
    if findings and isinstance(findings, list):
        parts.append("  Key findings:")
        for f in findings[:6]:
            parts.append(f"    - {f}")

    chain = ai_result.get("conviction_chain")
    if chain:
        parts.append(f"  Conviction chain: {chain}")

    return "\n".join(parts)
