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
    """Load the Lineage skill system prompt from SKILL.md."""
    global _SKILL_PROMPT
    if _SKILL_PROMPT is not None:
        return _SKILL_PROMPT

    skill_path = Path(__file__).resolve().parents[2] / "skills" / "lineage" / "SKILL.md"
    try:
        raw = skill_path.read_text(encoding="utf-8")
        # Strip YAML frontmatter
        if raw.startswith("---"):
            end = raw.find("---", 3)
            if end > 0:
                raw = raw[end + 3:].strip()
        _SKILL_PROMPT = raw
    except Exception:
        logger.warning("Could not load SKILL.md from %s", skill_path)
        _SKILL_PROMPT = "You are a Solana token security analyst."
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
