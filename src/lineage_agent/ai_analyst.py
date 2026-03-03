"""
AI-powered forensic analysis layer.

Uses Anthropic Claude to transform raw on-chain data (lineage, bundle, SOL flows)
into structured narratives, risk scores, and actionable intelligence.

One Claude call is made per analysis — not per transaction — so cost stays
minimal (~$0.001–0.003 per report with claude-3-5-haiku).
"""

from __future__ import annotations

import inspect
import json
import logging
import os
import statistics
from datetime import datetime, timezone
from typing import Any, Optional

logger = logging.getLogger(__name__)

# Model selection: haiku 4.5 for cost/speed — override via ANTHROPIC_MODEL env var
# Available as of 2026: claude-haiku-4-5-20251001, claude-sonnet-4-5-20250929, claude-sonnet-4-6
_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001")
_MAX_TOKENS = 2000
_TIMEOUT = 45.0  # seconds


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
You are a blockchain forensics detective specialising in Solana rug pulls, \
token manipulation schemes, and on-chain capital flows.

Your job is to REASON, not to narrate. \
You weigh evidence, cross-reference signals, and reach explicit deductive conclusions. \
Do not paraphrase data back at the reader — explain what the data PROVES, IMPLIES, or RULES OUT.

Respond with a single JSON object \
(no markdown, no explanation outside the JSON) with EXACTLY these fields in this order:

{
  "risk_score": <integer 0-100>,
  "confidence": <"low" | "medium" | "high">,
  "rug_pattern": <"classic_rug" | "slow_rug" | "pump_dump" | "coordinated_bundle" | "factory_jito_bundle" | "serial_clone" | "insider_drain" | "unknown">,
  "verdict_summary": <string — ONE sentence max 20 words: your headline CONCLUSION, not a list of observations. \
State what the actor DID and what it proves. \
Example: "Jito-coordinated factory rug: 8 pre-funded wallets atomically drained 47 SOL then routed funds to known CEX.">,
  "narrative": {
    "observation": <string — 2-3 sentences that SYNTHESISE the convergent red flags. \
Do not list data points — explain what the COMBINATION of signals implies about actor intent and organisation. \
Name at minimum 3 signals that point in the same direction and state what their co-occurrence rules out \
(e.g. coincidence, organic selling). Use wallet prefixes (first 12 chars) and SOL amounts where they strengthen the argument.>,
    "pattern": <string — 2-3 sentences describing the causal attack chain in temporal order: \
how funds were staged BEFORE launch → how supply was accumulated AT launch → how the exit was triggered → \
where extracted SOL ended up. Each step must be causally linked to the next ("which then enabled", "triggering", "routing").>,
    "risk": <string — 2 sentences: (1) quantify damage already done (SOL extracted, % supply controlled, \
estimated USD); (2) state residual risk — what can still happen if the remaining supply is dumped or LP drained.>
  },
  "key_findings": [
    <3-6 findings, ordered most to least incriminating. \
Each finding MUST: (a) start with [DEPLOYMENT], [FINANCIAL], [COORDINATION], [IDENTITY], [TIMING], or [EXIT]; \
(b) state the specific evidence; (c) explain WHY it is significant and WHAT it rules out or confirms; \
(d) reference at least one other finding or section when the signals corroborate each other. \
Example format: "[COORDINATION] 6/8 wallets funded from the same intermediary 2 blocks before launch, \
proving pre-meditated deployment rather than independent buyers — corroborates the scripted EXIT pattern below.">
  ],
  "wallet_classifications": <dict mapping wallet_address_prefix (first 12 chars) → one of: \
"team_wallet" | "bundle_wallet" | "cash_out" | "cex_deposit" | "burner" | "clone_deployer" | "unknown">,
  "conviction_chain": <string — 2-3 sentences of explicit deductive reasoning: \
name 3+ independent signals that converge on the same fraud thesis, \
explain the logical chain that links them (if A and B and C, then D must be true because…), \
and state the confidence-weighted verdict with any single weakest assumption called out. \
This is your argument that a defence attorney would have to rebut.>,
  "operator_hypothesis": <string | null — 3 sentences: \
(1) WHO: fingerprint evidence placing this deployer within a known network (prior rugs, cartel links, factory pattern, image/metadata reuse); \
(2) WHAT playbook they used specifically in this token vs. their prior operations — note any tactical evolution; \
(3) WHAT single factor most clearly distinguishes this from a legitimate project with superficially similar signals. \
Null if insufficient data to identify the operator.>
}

Scoring guide:
- 90-100: Confirmed rug / extraction with on-chain proof — multiple independent signals converge
- 75-89:  Strong indicators, high suspicion — at least 2 hard signals + supporting context
- 50-74:  Moderate risk — concerning signals but could have alternative explanations
- <50:    Low risk or insufficient data

Rules:
- Ground every inference in named data points from the provided report — cite the specific number or signal.
- Do NOT repeat the same fact across narrative, key_findings, and conviction_chain — each section adds new analytical layer.
- Pre-computed subsystem labels (bundle verdict, insider_sell verdict, etc.) are WEAK HINTS only. \
Cross-reference ALL sections before scoring. Reason from raw numbers first, validate against labels second.
- If signals conflict (e.g. low bundle score but high cartel + insider signals), explicitly address the conflict in conviction_chain.
- conviction_chain is mandatory — never emit null for it; if data is sparse, state what the data cannot confirm and why.\
"""


# ── Public API ────────────────────────────────────────────────────────────────

async def analyze_token(
    mint: str,
    lineage_result: Optional[Any] = None,
    bundle_report: Optional[Any] = None,
    sol_flow_report: Optional[Any] = None,
    cache: Optional[Any] = None,
    force_refresh: bool = False,
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

    from config import CACHE_TTL_AI_SECONDS  # local import to avoid circular dep

    # ── P0-B: cache check ────────────────────────────────────────────────────
    cache_key = f"ai:v2:{mint}"
    if cache and not force_refresh:
        _cget = cache.get(cache_key)
        cached = (await _cget) if inspect.isawaitable(_cget) else _cget
        if cached is not None:
            logger.info("[ai_analyst] cache hit for %s", mint[:12])
            return cached

    # ── P1-B: deployer history from intelligence_events ──────────────────────
    deployer_history: list[dict] = []
    if cache:
        deployer = _extract_deployer(lineage_result)
        if deployer:
            try:
                deployer_history = await cache.query_events(
                    where="deployer = ? AND event_type = 'token_rugged'",
                    params=(deployer,),
                    columns="mint, name, rugged_at, mcap_usd",
                    limit=5,
                    order_by="recorded_at DESC",
                )
            except Exception:
                pass  # history unavailable — continue without it

    # ── Behavioral fingerprint signals (phash cluster, narrative DNA, timing) ─
    behavioral_signals: dict = {}
    if cache:
        behavioral_signals = await _gather_behavioral_signals(mint, lineage_result, cache)

    prompt = _build_prompt(mint, lineage_result, bundle_report, sol_flow_report,
                           deployer_history, behavioral_signals)

    try:
        client = _get_client()
        for _attempt in range(3):  # up to 2 retries on transient errors (529, timeout, rate-limit)
            try:
                message = await client.messages.create(
                    model=_MODEL,
                    max_tokens=_MAX_TOKENS,
                    system=_SYSTEM_PROMPT,
                    messages=[{"role": "user", "content": prompt}],
                )
                break
            except Exception as _retry_exc:
                _ename = type(_retry_exc).__name__
                _retriable = (
                    "RateLimit" in _ename
                    or "Timeout" in _ename
                    or "APIConnection" in _ename
                    or ("InternalServer" in _ename and "overloaded" in str(_retry_exc).lower())
                )
                if _attempt < 2 and _retriable:
                    import asyncio as _asyncio
                    _wait = (2 ** _attempt) * 3  # 3s, 6s
                    logger.warning(
                        "[ai_analyst] retry %d/2 after %s (%ds) for %s",
                        _attempt + 1, _ename, _wait, mint[:12],
                    )
                    await _asyncio.sleep(_wait)
                    continue
                raise
        raw = message.content[0].text
        logger.info(
            "[ai_analyst] %s | model=%s input_tokens=%d output_tokens=%d",
            mint[:12], _MODEL,
            message.usage.input_tokens, message.usage.output_tokens,
        )
        result = _parse_response(raw, mint)

        # ── P0-A: sanity-check the score against hard evidence ────────────────
        result = _sanity_check(result, lineage_result, bundle_report, sol_flow_report)

        # ── P0-B: persist to cache ────────────────────────────────────────────
        if cache:
            _cset = cache.set(cache_key, result, ttl=CACHE_TTL_AI_SECONDS)
            if inspect.isawaitable(_cset):
                await _cset

        return result

    except RuntimeError as exc:
        # Missing package or API key — fall through to rule-based
        logger.error("[ai_analyst] %s", exc)
    except Exception as exc:
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

    # ── P3-B: rule-based fallback when Claude is unavailable ─────────────────
    logger.info("[ai_analyst] falling back to rule-based scoring for %s", mint[:12])
    fallback = _rule_based_fallback(mint, lineage_result, bundle_report, sol_flow_report)
    if cache and fallback:
        # Short TTL for fallback results — retry real analysis sooner
        _cset = cache.set(cache_key, fallback, ttl=min(CACHE_TTL_AI_SECONDS, 60))
        if inspect.isawaitable(_cset):
            await _cset
    return fallback


# ── Prompt construction ───────────────────────────────────────────────────────

def _build_prompt(
    mint: str,
    lineage: Optional[Any],
    bundle: Optional[Any],
    sol_flow: Optional[Any],
    deployer_history: Optional[list] = None,
    behavioral_signals: Optional[dict] = None,
) -> str:
    parts: list[str] = [f"Token mint: {mint}\n"]

    # ── Data availability header ──────────────────────────────────────────
    _has_lin = "✓" if lineage else "✗"
    _has_bun = "✓" if bundle else "✗"
    _has_sol = "✓" if sol_flow else "✗"
    parts.append(f"DATA AVAILABLE: LINEAGE={_has_lin}  BUNDLE={_has_bun}  SOL_FLOW={_has_sol}")
    parts.append("(Absent sections = data not collected yet, NOT necessarily clean)\n")

    # ── Query token identity (the specific token being analyzed) ─────────
    if lineage:
        _qt = getattr(lineage, "query_token", None) or getattr(lineage, "root", None)
        if _qt:
            parts.append("=== QUERY TOKEN (token under analysis) ===")
            _qt_name    = getattr(_qt, "name", "") or "?"
            _qt_symbol  = getattr(_qt, "symbol", "") or "?"
            _qt_created = getattr(_qt, "created_at", None)
            _qt_mcap    = getattr(_qt, "market_cap_usd", None)
            _qt_liq     = getattr(_qt, "liquidity_usd", None)
            _qt_deployer = str(getattr(_qt, "deployer", "") or "?")
            parts.append(f"Name: {_qt_name} ({_qt_symbol})")
            parts.append(f"Deployer: {_qt_deployer[:16]}...")
            if _qt_created:
                try:
                    from datetime import datetime as _dt_cls, timezone as _tz
                    _now_utc = _dt_cls.now(tz=_tz.utc)
                    _created_dt = (_qt_created if getattr(_qt_created, "tzinfo", None)
                                   else _dt_cls.fromisoformat(str(_qt_created)).replace(tzinfo=_tz.utc))
                    _age_h = (_now_utc - _created_dt).total_seconds() / 3600
                    parts.append(f"Token age: {_age_h:.1f}h ({_age_h/24:.1f}d)")
                except Exception:
                    parts.append(f"Created: {_qt_created}")
            if _qt_mcap is not None:
                parts.append(f"Market cap: ${_qt_mcap:,.0f} USD")
            if _qt_liq is not None:
                parts.append(f"Liquidity: ${_qt_liq:,.0f} USD")

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
        if len(derivatives) >= 2:
            # Pre-calculate clone window so Claude doesn't have to parse raw ISO timestamps
            _dtimes: list[float] = []
            for _d in derivatives:
                _dts = getattr(_d, "created_at", None)
                if _dts:
                    try:
                        from datetime import datetime as _ddt, timezone as _dtz
                        _dobj = (_dts if getattr(_dts, "tzinfo", None)
                                 else _ddt.fromisoformat(str(_dts)).replace(tzinfo=_dtz.utc))
                        _dtimes.append(_dobj.timestamp())
                    except Exception:
                        pass
            if len(_dtimes) >= 2:
                _dtimes.sort()
                _win_min = (_dtimes[-1] - _dtimes[0]) / 60
                _gaps = [(_dtimes[i+1] - _dtimes[i]) / 60 for i in range(len(_dtimes)-1)]
                _med_gap = sorted(_gaps)[len(_gaps)//2]
                parts.append(
                    f"Clone deployment window: {_win_min:.0f} min total  "
                    f"| median gap between deploys: {_med_gap:.0f} min"
                )
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

        wallets_list = getattr(bundle, "bundle_wallets", []) or []
        n_wallets = len(wallets_list)
        parts.append(f"Bundle wallets: {n_wallets}")
        _sol_spent = getattr(bundle, "total_sol_spent_by_bundle", 0) or 0.0
        _sol_extracted_bun = getattr(bundle, "total_sol_extracted_confirmed", 0) or 0.0
        parts.append(f"Total SOL spent by bundle: {_sol_spent:.4f} SOL")
        if _sol_extracted_bun > 0:
            _rec_pct = (_sol_extracted_bun / _sol_spent * 100) if _sol_spent > 0 else 0.0
            parts.append(
                f"Total SOL extracted (confirmed): {_sol_extracted_bun:.4f} SOL  "
                f"(recovery={_rec_pct:.0f}% of spend — >80% = near-total extraction)"
            )
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

        factory = getattr(bundle, "factory_address", None)
        if factory:
            parts.append(f"Factory wallet: {factory[:16]}... (funded_deployer={getattr(bundle,'factory_funded_deployer',False)})")
            snip = getattr(bundle, "factory_sniper_wallets", [])
            if snip:
                parts.append(f"Factory snipers: {len(snip)} wallets")

        common_sinks = getattr(bundle, "common_sink_wallets", [])
        if common_sinks:
            parts.append(f"Common SOL sinks (≥2 wallets → same destination): {[s[:12] for s in common_sinks]}")

        evidence_chain = getattr(bundle, "evidence_chain", [])
        if evidence_chain:
            parts.append("Evidence chain:")
            for ev in evidence_chain[:6]:
                parts.append(f"  • {ev}")

        # ── Aggregate per-wallet signals (computed here for AI context) ───
        # wallets_list items may be plain strings in mocks; guard everywhere
        def _pre(w):  return getattr(w, "pre_sell",  None) if hasattr(w, "wallet") else None
        def _post(w): return getattr(w, "post_sell", None) if hasattr(w, "wallet") else None

        brand_new_count   = sum(1 for w in wallets_list if (getattr(_pre(w),"wallet_age_days",99) or 99) < 1.0)
        sold_count        = sum(1 for w in wallets_list if getattr(_post(w),"sell_detected",False))
        funded_deployer_c = sum(1 for w in wallets_list if getattr(_pre(w),"prefund_source_is_deployer",False))
        funded_known_c    = sum(1 for w in wallets_list if getattr(_pre(w),"prefund_source_is_known_funder",False))
        intra_bundle_c    = sum(
            1 for w in wallets_list
            if getattr(_pre(w),"prefund_hours_before_launch",None) == 0.0
            and getattr(_pre(w),"prefund_source",None)
        )

        if brand_new_count:
            parts.append(
                f"SIGNAL: {brand_new_count}/{n_wallets} wallets are brand-new "
                f"(<24h old at launch) — characteristic of dedicated Jito bundle burners."
            )
        if intra_bundle_c:
            parts.append(
                f"SIGNAL: {intra_bundle_c}/{n_wallets} wallets funded INSIDE the launch block "
                f"(intra-bundle atomic funding) — factory wallet creates+funds+buys atomically."
            )
        if funded_deployer_c:
            parts.append(f"SIGNAL: {funded_deployer_c}/{n_wallets} wallets directly pre-funded by deployer.")
        if funded_known_c:
            parts.append(f"SIGNAL: {funded_known_c}/{n_wallets} wallets funded by same shared funder.")
        if sold_count:
            parts.append(f"SIGNAL: {sold_count}/{n_wallets} wallets have sold their position.")

        # Per-wallet table — ALL wallets (budget: short rows)
        parts.append("Per-wallet breakdown:")
        for w in wallets_list[:15]:  # cover up to _MAX_BUNDLE_WALLETS (15)
            # handle both full objects and plain-string wallet addresses (mock/legacy)
            if not hasattr(w, "wallet"):
                parts.append(f"  {str(w)[:14]}...")
                continue
            pre  = getattr(w, "pre_sell",  None)
            post = getattr(w, "post_sell", None)
            age  = getattr(pre, "wallet_age_days", None)
            age_str = f"{age:.1f}d" if age is not None else "?"
            funder = getattr(pre, "prefund_source", None)
            funder_str = funder[:10] + "..." if funder else "none"
            is_dep = getattr(pre, "prefund_source_is_deployer", False)
            hrs    = getattr(pre, "prefund_hours_before_launch", None)
            prefund_sol = getattr(pre, "prefund_sol", 0.0) or 0.0
            sold   = getattr(post, "sell_detected", False)
            sol_recv = getattr(post, "sol_received_from_sell", 0.0) or 0.0
            dests  = getattr(post, "fund_destinations", []) or []
            n_dests = len(dests)
            flags  = getattr(w, "red_flags", [])
            parts.append(
                f"  {w.wallet[:14]}... age={age_str} funder={'deployer' if is_dep else funder_str}"
                f"({prefund_sol:.3f}SOL) hrs_before={hrs} sold={sold}"
                f" sol_recv={sol_recv:.3f}SOL n_out_dests={n_dests}"
                f" flags={flags[:3]} verdict={getattr(w,'verdict','?')}"
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

    # ── P1-B: Deployer cross-token track record ───────────────────────────
    if deployer_history:
        parts.append("\n=== DEPLOYER TRACK RECORD (prior rugs from database) ===")
        for ev in deployer_history:
            name_     = ev.get("name") or "?"
            mint_     = str(ev.get("mint") or "?")[:12]
            mcap      = ev.get("mcap_usd")
            rugged_at = ev.get("rugged_at") or "?"
            mcap_str  = f" mcap=${mcap:,.0f}" if mcap else ""
            parts.append(f"  {name_} ({mint_}...){mcap_str} rugged={rugged_at}")

    # ── Behavioral fingerprint signals ────────────────────────────────────
    if behavioral_signals:
        sections: list[str] = []

        phash = behavioral_signals.get("phash_cluster")
        if phash:
            reuses  = phash.get("total_reuses", 0)
            rugged  = phash.get("rugged_reuses", 0)
            lines   = [f"\n=== SIGNAL: IMAGE PHASH CLUSTER ==="]
            lines.append(f"Same image reused across {reuses} other token(s); {rugged} of them rugged.")
            for t in phash.get("tokens", []):
                rug_tag = " [RUGGED]" if t.get("rugged") else ""
                lines.append(f"  {t['name']} ({t['mint']}...) deployer={t['deployer']}...{rug_tag}")
            sections.extend(lines)

        dna = behavioral_signals.get("narrative_dna")
        if dna:
            sections.append(f"\n=== SIGNAL: NARRATIVE DNA (metadata fingerprint) ===")
            sections.append(f"Upload service: {dna.get('upload_service')}")
            sections.append(f"Description pattern: {dna.get('description_pattern')}")
            sections.append(
                f"Linked deployer wallets sharing same DNA: {dna.get('linked_deployer_wallets')} "
                f"(confidence: {dna.get('confidence')}) — {dna.get('total_linked_tokens')} total tokens"
            )

        timing = behavioral_signals.get("timing_pattern")
        if timing:
            sections.append(f"\n=== SIGNAL: TIMING FINGERPRINT ===")
            sections.append(f"Tokens observed for this deployer: {timing.get('tokens_observed')}")
            sections.append(f"Average launch hour (UTC): {timing.get('avg_launch_hour_utc')}h")
            if timing.get("consistent_schedule"):
                sections.append(
                    f"CONSISTENT SCHEDULE DETECTED (stdev={timing.get('launch_hour_stdev')}h) "
                    "— operator launches at predictable time window."
                )
            if timing.get("rugged_count"):
                sections.append(
                    f"Time-to-rug stats: avg={timing.get('avg_lifespan_hours')}h "
                    f"median={timing.get('median_lifespan_hours')}h "
                    f"min={timing.get('min_lifespan_hours')}h "
                    f"(over {timing.get('rugged_count')} confirmed rugs)"
                )

        parts.extend(sections)

    # ── Insider sell / silent drain ─────────────────────────────────────────
    ins = getattr(lineage, "insider_sell", None) if lineage else None
    if ins:
        parts.append("\n=== INSIDER SELL ANALYSIS ===")
        parts.append(f"Verdict: {getattr(ins,'verdict','?')} | risk_score={getattr(ins,'risk_score',0):.2f}")
        parts.append(f"Flags: {getattr(ins,'flags',[])}")
        parts.append(f"Deployer exited position: {getattr(ins,'deployer_exited',None)}")
        sp1  = getattr(ins, "sell_pressure_1h",  None)
        sp6  = getattr(ins, "sell_pressure_6h",  None)
        sp24 = getattr(ins, "sell_pressure_24h", None)
        pc1  = getattr(ins, "price_change_1h",   None)
        vsr  = getattr(ins, "volume_spike_ratio", None)
        if sp1  is not None: parts.append(f"Sell pressure  1h={sp1:.0%}  6h={sp6:.0%}  24h={sp24:.0%}")
        if pc1  is not None: parts.append(f"Price change   1h={pc1:+.1f}%")
        if vsr  is not None: parts.append(f"Volume spike ratio: {vsr:.1f}x  (>3 = burst selling)")
        for we in (getattr(ins, "wallet_events", []) or [])[:4]:
            parts.append(f"  {getattr(we,'wallet','?')[:14]} role={getattr(we,'role','?')} exited={getattr(we,'exited',False)}")

    # ── Factory rhythm (scripted deployment bot) ─────────────────────────
    fr = getattr(lineage, "factory_rhythm", None) if lineage else None
    if fr and getattr(fr, "is_factory", False):
        parts.append("\n=== FACTORY RHYTHM (scripted bot deployer) ===")
        parts.append(f"Tokens launched: {getattr(fr,'tokens_launched',0)}")
        parts.append(f"Median deploy interval: {getattr(fr,'median_interval_hours',0):.1f}h")
        parts.append(f"Regularity score: {getattr(fr,'regularity_score',0):.2f}  factory_score={getattr(fr,'factory_score',0):.2f}")
        parts.append(f"Naming pattern: {getattr(fr,'naming_pattern','?')}")

    # ── Cartel graph (operator ring coordination) ───────────────────────
    cr = getattr(lineage, "cartel_report", None) if lineage else None
    if cr:
        community = getattr(cr, "deployer_community", None)
        if community:
            parts.append("\n=== CARTEL DETECTION ===")
            parts.append(f"Community ID: {getattr(community,'community_id','?')}")
            parts.append(f"Wallets in ring: {len(getattr(community,'wallets',[]))} | confidence={getattr(community,'confidence','?')}")
            parts.append(f"Ring stats: {getattr(community,'total_tokens_launched',0)} tokens  {getattr(community,'total_rugs',0)} rugs  ~${getattr(community,'estimated_extracted_usd',0):,.0f} extracted")
            parts.append(f"Strongest signal: {getattr(community,'strongest_signal','?')}")
            _cartel_members = getattr(community, "wallets", []) or []
            if _cartel_members:
                parts.append(f"Ring members: {[str(w)[:12] for w in _cartel_members]}")
            for edge in (getattr(community, "edges", []) or [])[:5]:
                parts.append(f"  {getattr(edge,'wallet_a','?')[:12]}↔{getattr(edge,'wallet_b','?')[:12]} [{getattr(edge,'signal_type','?')}] strength={getattr(edge,'signal_strength',0):.2f}")

    # ── Operator impact (cross-wallet cumulative damage) ────────────────
    oi = getattr(lineage, "operator_impact", None) if lineage else None
    if oi:
        parts.append("\n=== OPERATOR IMPACT (cross-wallet damage ledger) ===")
        parts.append(f"Fingerprint: {getattr(oi,'fingerprint','?')[:16]}...")
        parts.append(f"Linked deployer wallets: {len(getattr(oi,'linked_wallets',[]))}")
        parts.append(f"Total tokens / rugs: {getattr(oi,'total_tokens_launched',0)} / {getattr(oi,'total_rug_count',0)} ({getattr(oi,'rug_rate_pct',0):.0f}% rug rate)")
        parts.append(f"Estimated extracted: ~${getattr(oi,'estimated_extracted_usd',0):,.0f} USD (is_estimated={getattr(oi,'is_estimated',True)})")
        parts.append(f"Campaign active now: {getattr(oi,'is_campaign_active',False)} | peak concurrent tokens: {getattr(oi,'peak_concurrent_tokens',0)}")
        parts.append(f"Narratives used: {getattr(oi,'narrative_sequence',[])[:6]}")

    # ── Liquidity architecture ───────────────────────────────────────────
    la = getattr(lineage, "liquidity_arch", None) if lineage else None
    if la:
        parts.append("\n=== LIQUIDITY ARCHITECTURE ===")
        parts.append(f"Total liquidity: ${getattr(la,'total_liquidity_usd',0):,.0f} across {getattr(la,'pool_count',0)} pool(s)")
        parts.append(f"Concentration HHI: {getattr(la,'concentration_hhi',0):.2f}  (1.0 = single pool)")
        parts.append(f"Authenticity score: {getattr(la,'authenticity_score',0):.2f}  flags={getattr(la,'flags',[])}")

    return "\n".join(parts)


# ── P0-A: Post-Claude sanity check ───────────────────────────────────────────

def _sanity_check(
    result: dict,
    lineage: Optional[Any],
    bundle: Optional[Any],
    sol_flow: Optional[Any],
) -> dict:
    """Cap hallucinated high scores and raise suppressed ones using hard evidence.

    Rules applied in order (each appends a [CAVEAT] finding when triggered):
      1. High score (>70) with zero bundle AND zero sol_flow → cap at 55, confidence=low
      2. Low score (<35) despite deployer rug_rate > 60% → raise +25, cap at 55
    """
    score = result.get("risk_score")
    if score is None:
        return result

    has_bundle = bundle is not None
    has_flow   = sol_flow is not None

    deployer_rug_rate = 0.0
    if lineage:
        dp = getattr(lineage, "deployer_profile", None)
        if dp:
            total = max(getattr(dp, "total_tokens_deployed", 0) or 1, 1)
            rugs  = getattr(dp, "rug_count", 0) or 0
            deployer_rug_rate = rugs / total

    caveats: list[str] = []

    # Rule 1: inflated score with no forensic backing — but only if no strong lineage signals
    if score > 70 and not has_bundle and not has_flow:
        derivatives_count = len(getattr(lineage, "derivatives", []) or []) if lineage else 0
        insider_dump = False
        if lineage:
            ins = getattr(lineage, "insider_sell", None)
            insider_dump = ins is not None and getattr(ins, "verdict", "clean") == "insider_dump"
        # Permit score >70 when there's hard lineage evidence even without bundle/flow
        strong_lineage = deployer_rug_rate > 0.60 or derivatives_count > 3 or insider_dump
        if not strong_lineage:
            result["risk_score"] = min(score, 65)
            result["confidence"] = "low"
            caveats.append(
                "[CAVEAT] Score capped at 65 — bundle/flow data unavailable; cannot confirm on-chain extraction."
            )
        else:
            result["risk_score"] = min(score, 80)  # cap at 80 without direct on-chain proof
            result["confidence"] = max(result.get("confidence", "medium"),
                                       "medium",
                                       key=lambda c: {"low":0,"medium":1,"high":2}.get(c, 0))
            caveats.append(
                "[CAVEAT] Score partially supported by lineage signals but no bundle/flow proof yet."
            )

    # Rule 2: suppressed score despite proven serial rugger deployer
    if score < 35 and deployer_rug_rate > 0.60:
        result["risk_score"] = min(score + 25, 55)
        if result.get("confidence") == "high":
            result["confidence"] = "medium"
        caveats.append(
            f"[CAVEAT] Score raised — deployer rug rate {deployer_rug_rate:.0%} on prior tokens."
        )

    if caveats:
        findings = result.get("key_findings") or []
        result["key_findings"] = caveats + findings

    return result


# ── P1-B: Deployer address extractor ─────────────────────────────────────────

def _extract_deployer(lineage: Optional[Any]) -> Optional[str]:
    """Pull deployer address from a LineageResult (query_token preferred over root)."""
    if not lineage:
        return None
    qt = getattr(lineage, "query_token", None) or getattr(lineage, "root", None)
    if not qt:
        return None
    deployer = getattr(qt, "deployer", None)
    return deployer if deployer else None


# ── Behavioral fingerprint signals ──────────────────────────────────────────

def _compute_timing_fingerprint(rows: list[dict]) -> Optional[dict]:
    """Derive launch-hour and time-to-rug statistics from intelligence_events rows."""
    if not rows:
        return None

    launch_hours: list[int] = []
    lifespans_h: list[float] = []

    for row in rows:
        created_str = row.get("created_at")
        rugged_str  = row.get("rugged_at")

        if created_str:
            try:
                dt = datetime.fromisoformat(str(created_str))
                if not dt.tzinfo:
                    dt = dt.replace(tzinfo=timezone.utc)
                launch_hours.append(dt.hour)
            except Exception:
                pass

        if created_str and rugged_str and str(rugged_str) not in ("", "None", "null"):
            try:
                dt_c = datetime.fromisoformat(str(created_str))
                dt_r = datetime.fromisoformat(str(rugged_str))
                if not dt_c.tzinfo:
                    dt_c = dt_c.replace(tzinfo=timezone.utc)
                if not dt_r.tzinfo:
                    dt_r = dt_r.replace(tzinfo=timezone.utc)
                diff_h = (dt_r - dt_c).total_seconds() / 3600
                if 0 < diff_h < 8760:  # between 0 and 1 year
                    lifespans_h.append(diff_h)
            except Exception:
                pass

    if not launch_hours:
        return None

    result: dict = {
        "tokens_observed": len(rows),
        "avg_launch_hour_utc": round(sum(launch_hours) / len(launch_hours), 1),
    }
    if len(launch_hours) >= 3:
        # Detect burst: stdev < 2h → operator launches at very consistent hour
        try:
            stdev = statistics.stdev(launch_hours)
            result["launch_hour_stdev"] = round(stdev, 1)
            result["consistent_schedule"] = stdev < 2.5
        except statistics.StatisticsError:
            pass

    if lifespans_h:
        result["avg_lifespan_hours"]    = round(statistics.mean(lifespans_h), 1)
        result["median_lifespan_hours"] = round(statistics.median(lifespans_h), 1)
        result["min_lifespan_hours"]    = round(min(lifespans_h), 2)
        result["rugged_count"]          = len(lifespans_h)

    return result


async def _gather_behavioral_signals(
    mint: str,
    lineage: Optional[Any],
    cache: Any,
) -> dict:
    """Collect the 3 behavioral fingerprint signals for AI context injection.

    Signal 1 — phash cluster  : same image reused across multiple tokens
    Signal 2 — narrative DNA  : same description fingerprint across deployers
    Signal 3 — timing pattern : launch-hour consistency + time-to-rug stats
    """
    signals: dict = {}

    # ── Signal 1: phash cluster ───────────────────────────────────────────
    try:
        phash_rows = await cache.query_events(
            where="mint = ? AND phash IS NOT NULL",
            params=(mint,),
            columns="phash",
            limit=1,
        )
        if phash_rows:
            phash = phash_rows[0].get("phash")
            if phash:
                cluster = await cache.query_events(
                    where="phash = ? AND mint != ?",
                    params=(phash, mint),
                    columns="mint, name, deployer, created_at, rugged_at",
                    limit=10,
                    order_by="recorded_at DESC",
                )
                if cluster:
                    rugged = [r for r in cluster if r.get("rugged_at")]
                    signals["phash_cluster"] = {
                        "phash": phash,
                        "total_reuses": len(cluster),
                        "rugged_reuses": len(rugged),
                        "tokens": [
                            {
                                "name": r.get("name") or "?",
                                "mint": str(r.get("mint") or "")[:12],
                                "deployer": str(r.get("deployer") or "")[:12],
                                "rugged": bool(r.get("rugged_at")),
                            }
                            for r in cluster[:5]
                        ],
                    }
    except Exception:
        pass

    # ── Signal 2: narrative DNA (operator fingerprint from lineage) ────────
    try:
        op_fp = getattr(lineage, "operator_fingerprint", None) if lineage else None
        if op_fp:
            linked_wallets = getattr(op_fp, "linked_wallets", []) or []
            linked_tokens  = getattr(op_fp, "linked_wallet_tokens", {}) or {}
            total_linked   = sum(len(v) for v in linked_tokens.values())
            if linked_wallets or total_linked:
                signals["narrative_dna"] = {
                    "fingerprint_prefix": str(getattr(op_fp, "fingerprint", ""))[:16],
                    "confidence":         getattr(op_fp, "confidence", "?"),
                    "upload_service":     getattr(op_fp, "upload_service", "?"),
                    "linked_deployer_wallets": len(linked_wallets),
                    "total_linked_tokens": total_linked,
                    "description_pattern": getattr(op_fp, "description_pattern", "?"),
                }
    except Exception:
        pass

    # ── Signal 3: timing fingerprint ──────────────────────────────────────
    try:
        deployer = _extract_deployer(lineage)
        if deployer:
            timing_rows = await cache.query_events(
                where="deployer = ? AND created_at IS NOT NULL",
                params=(deployer,),
                columns="created_at, rugged_at",
                limit=20,
                order_by="recorded_at DESC",
            )
            timing = _compute_timing_fingerprint(timing_rows)
            if timing:
                signals["timing_pattern"] = timing
    except Exception:
        pass

    return signals


# ── P3-B: Rule-based fallback when Claude is unavailable ─────────────────────

def _rule_based_fallback(
    mint: str,
    lineage: Optional[Any] = None,
    bundle: Optional[Any] = None,
    sol_flow: Optional[Any] = None,
) -> Optional[dict]:
    """Derive a basic risk score from structured data alone (no LLM).

    Used when the Anthropic API is down, rate-limited, or has no key set.
    Returns None if there is truly insufficient data to score.
    """
    ts = datetime.now(tz=timezone.utc).isoformat()
    weighted: list[tuple[float, float]] = []  # (score, weight)
    findings: list[str] = []

    # Bundle signal
    if bundle:
        verdict = getattr(bundle, "overall_verdict", "") or ""
        if "confirmed" in verdict or "coordinated" in verdict:
            weighted.append((88.0, 0.40))
            findings.append("[BUNDLE] Coordinated team dump confirmed at launch.")
        elif "suspected" in verdict:
            weighted.append((65.0, 0.40))
            findings.append("[BUNDLE] Suspected team coordination on launch.")
        else:
            weighted.append((28.0, 0.40))

    # SOL flow signal
    if sol_flow:
        extracted = getattr(sol_flow, "total_extracted_sol", 0) or 0.0
        if extracted > 10:
            weighted.append((90.0, 0.35))
            findings.append(f"[FINANCIAL] {extracted:.1f} SOL extracted from token.")
        elif extracted > 1:
            weighted.append((62.0, 0.35))
            findings.append(f"[FINANCIAL] {extracted:.2f} SOL extracted from token.")
        elif extracted > 0:
            weighted.append((38.0, 0.35))
        else:
            weighted.append((20.0, 0.35))

    # Lineage signals
    if lineage:
        clones = len(getattr(lineage, "derivatives", []) or [])
        dp     = getattr(lineage, "deployer_profile", None)
        rug_count = getattr(dp, "rug_count", 0) or 0 if dp else 0

        if clones > 10:
            weighted.append((78.0, 0.25))
            findings.append(f"[IDENTITY] {clones} clones detected — industrial-scale serial clone.")
        elif clones > 2:
            weighted.append((55.0, 0.25))
            findings.append(f"[IDENTITY] {clones} clones detected.")
        elif clones > 0:
            weighted.append((40.0, 0.25))

        if rug_count > 2:
            findings.append(f"[DEPLOYMENT] Deployer has {rug_count} prior rugged tokens.")
            # Boost weight if already high
            if weighted:
                last_score, last_w = weighted[-1]
                weighted[-1] = (min(last_score + 15, 90), last_w)

        if getattr(lineage, "zombie_alert", None):
            findings.append("[IDENTITY] Zombie relaunch — original token already died.")
            weighted.append((75.0, 0.15))

    if not weighted:
        return None

    total_w  = sum(w for _, w in weighted)
    risk_score = round(sum(s * w for s, w in weighted) / total_w)

    return {
        "mint":         mint,
        "model":        "rule_based_fallback",
        "analyzed_at":  ts,
        "risk_score":   risk_score,
        "confidence":   "low",
        "rug_pattern":  "unknown",
        "verdict_summary": "Automated rule-based analysis (AI temporarily unavailable).",
        "narrative": {
            "observation": "Score derived from bundle verdict, SOL flow, and lineage signals.",
            "pattern":     None,
            "risk":        "AI narrative unavailable — treat this score as a preliminary indicator only.",
        },
        "key_findings":          findings or ["[CAVEAT] Insufficient data for rule-based scoring."],
        "wallet_classifications": {},
        "conviction_chain":       None,
        "operator_hypothesis":   None,
        "is_fallback":           True,
    }


# ── Unified 3-layer response builder ─────────────────────────────────────────

def _build_unified_response(
    mint: str,
    ai_result: dict,
    lineage: Optional[Any] = None,
    bundle: Optional[Any] = None,
    sol_flow: Optional[Any] = None,
) -> dict:
    """Assemble the final 3-layer response:

    - ``token``       : identity metadata (name, mcap, liquidity…)
    - ``ai_analysis`` : Claude verdict (risk_score, narrative, findings…)
    - ``forensic``    : summarised backend metrics (bundle, sol_flow, lineage)
    - ``evidence``    : raw on-chain proof (wallet list, flows, clones)
    """

    # ── Token identity ────────────────────────────────────────────────────
    token: dict = {"mint": mint}
    if lineage:
        qt = getattr(lineage, "query_token", None) or getattr(lineage, "root", None)
        if qt:
            token = {
                "mint": mint,
                "name": getattr(qt, "name", "") or "",
                "symbol": getattr(qt, "symbol", "") or "",
                "image_uri": getattr(qt, "image_uri", "") or "",
                "deployer": getattr(qt, "deployer", "") or "",
                "created_at": (
                    qt.created_at.isoformat()
                    if getattr(qt, "created_at", None)
                    else None
                ),
                "market_cap_usd": getattr(qt, "market_cap_usd", None),
                "liquidity_usd": getattr(qt, "liquidity_usd", None),
                "dex_url": getattr(qt, "dex_url", "") or "",
            }

    # ── AI analysis (Claude output, clean) ───────────────────────────────
    ai_analysis = {
        "risk_score":          ai_result.get("risk_score"),
        "confidence":          ai_result.get("confidence"),
        "rug_pattern":         ai_result.get("rug_pattern"),
        "verdict_summary":     ai_result.get("verdict_summary"),
        "narrative":           ai_result.get("narrative"),
        "key_findings":        ai_result.get("key_findings", []),
        "conviction_chain":    ai_result.get("conviction_chain"),
        "operator_hypothesis": ai_result.get("operator_hypothesis"),
        "model":               ai_result.get("model"),
        "analyzed_at":         ai_result.get("analyzed_at"),
    }
    if ai_result.get("parse_error"):
        ai_analysis["parse_error"] = True

    # ── Forensic summary (pre-computed backend metrics) ───────────────────
    forensic: dict = {}

    if bundle:
        forensic["bundle"] = {
            "verdict":                   getattr(bundle, "overall_verdict", None),
            "wallets_count":             len(getattr(bundle, "bundle_wallets", []) or []),
            "confirmed_team_wallets":    getattr(bundle, "confirmed_team_wallets", []),
            "suspected_team_wallets":    getattr(bundle, "suspected_team_wallets", []),
            "coordinated_dump_wallets":  getattr(bundle, "coordinated_dump_wallets", []),
            "launch_slot":               getattr(bundle, "launch_slot", None),
            "total_sol_spent":           getattr(bundle, "total_sol_spent_by_bundle", 0.0),
            "total_sol_extracted":       getattr(bundle, "total_sol_extracted_confirmed", 0.0),
            "coordinated_sell_detected": getattr(bundle, "coordinated_sell_detected", False),
            "common_prefund_source":     getattr(bundle, "common_prefund_source", None),
            "common_sink_wallets":       getattr(bundle, "common_sink_wallets", []),
            "evidence_chain":            getattr(bundle, "evidence_chain", []),
        }

    if sol_flow:
        forensic["sol_flow"] = {
            "total_extracted_sol": getattr(sol_flow, "total_extracted_sol", 0.0),
            "total_extracted_usd": getattr(sol_flow, "total_extracted_usd", None),
            "hops_traced":         getattr(sol_flow, "hop_count", 1),
            "terminal_wallets_count": len(getattr(sol_flow, "terminal_wallets", []) or []),
            "known_cex_detected":  getattr(sol_flow, "known_cex_detected", False),
            "cross_chain_exits_count": len(getattr(sol_flow, "cross_chain_exits", []) or []),
            "rug_timestamp": (
                sol_flow.rug_timestamp.isoformat()
                if getattr(sol_flow, "rug_timestamp", None)
                else None
            ),
        }

    if lineage:
        derivatives = getattr(lineage, "derivatives", []) or []
        deployers = {d.deployer for d in derivatives if getattr(d, "deployer", "")}
        forensic["lineage"] = {
            "family_size":              getattr(lineage, "family_size", 0),
            "clones_count":             len(derivatives),
            "lineage_confidence":       round(getattr(lineage, "confidence", 0.0), 3),
            "query_is_root":            getattr(lineage, "query_is_root", False),
            "unique_deployers_count":   len(deployers),
            "zombie_relaunch_detected": getattr(lineage, "zombie_alert", None) is not None,
            "death_clock_risk":         (
                getattr(lineage.death_clock, "risk_level", None)
                if getattr(lineage, "death_clock", None)
                else None
            ),
            "rug_count":                (
                getattr(lineage.deployer_profile, "rug_count", 0)
                if getattr(lineage, "deployer_profile", None)
                else 0
            ),
        }

    # ── Raw evidence (on-chain proof for power users) ─────────────────────
    evidence: dict = {}

    # Wallet classifications from Claude
    wc = ai_result.get("wallet_classifications")
    if wc:
        evidence["wallet_classifications"] = wc

    if bundle:
        evidence["bundle_wallets"] = [
            {
                "wallet":    w.wallet,
                "verdict":   w.verdict,
                "sol_spent": w.sol_spent,
                "flags":     getattr(w, "red_flags", []) or [],
            }
            for w in (getattr(bundle, "bundle_wallets", []) or [])[:25]
        ]

    if sol_flow:
        flows = getattr(sol_flow, "flows", []) or []
        evidence["sol_flows"] = [
            {
                "hop":        e.hop,
                "from":       e.from_address,
                "to":         e.to_address,
                "amount_sol": round(e.amount_sol, 6),
                "to_label":   getattr(e, "to_label", None),
                "entity_type": getattr(e, "entity_type", None),
                "signature":  e.signature,
                "block_time": (
                    e.block_time.isoformat() if getattr(e, "block_time", None) else None
                ),
            }
            for e in sorted(flows, key=lambda x: x.amount_sol, reverse=True)[:30]
        ]
        evidence["terminal_wallets"] = getattr(sol_flow, "terminal_wallets", []) or []

        exits = getattr(sol_flow, "cross_chain_exits", []) or []
        if exits:
            evidence["cross_chain_exits"] = [
                {
                    "bridge":      getattr(ex, "bridge_name", ""),
                    "dest_chain":  getattr(ex, "dest_chain", ""),
                    "dest_address": getattr(ex, "dest_address", ""),
                    "amount_sol":  getattr(ex, "amount_sol", 0.0),
                    "signature":   getattr(ex, "tx_signature", ""),
                }
                for ex in exits
            ]

    if lineage:
        derivatives = getattr(lineage, "derivatives", []) or []
        evidence["clone_tokens"] = [
            {
                "mint":       d.mint,
                "name":       getattr(d, "name", ""),
                "symbol":     getattr(d, "symbol", ""),
                "generation": getattr(d, "generation", None),
                "deployer":   getattr(d, "deployer", ""),
                "created_at": (
                    d.created_at.isoformat()
                    if getattr(d, "created_at", None)
                    else None
                ),
                "market_cap_usd": getattr(d, "market_cap_usd", None),
                "similarity_score": (
                    round(d.evidence.composite_score, 3)
                    if getattr(d, "evidence", None)
                    else None
                ),
            }
            for d in sorted(derivatives, key=lambda x: getattr(x, "generation", 99))
        ]

        root = getattr(lineage, "root", None)
        if root and root.mint != mint:
            evidence["root_token"] = {
                "mint":       root.mint,
                "name":       getattr(root, "name", ""),
                "symbol":     getattr(root, "symbol", ""),
                "deployer":   getattr(root, "deployer", ""),
                "created_at": (
                    root.created_at.isoformat()
                    if getattr(root, "created_at", None)
                    else None
                ),
                "market_cap_usd": getattr(root, "market_cap_usd", None),
            }

    return {
        "token":       token,
        "ai_analysis": ai_analysis,
        "forensic":    forensic,
        "evidence":    evidence,
    }


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
            "conviction_chain": None,
            "operator_hypothesis": None,
            "parse_error": True,
        }
