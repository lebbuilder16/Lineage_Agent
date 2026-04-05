"""
Comparative test: Claude Haiku 4.5 vs Arcee Trinity-Large-Thinking (via OpenRouter)

Usage:
    export ARCEE_API_KEY="rcai-..."          # Arcee direct
    export ANTHROPIC_API_KEY="sk-ant-..."    # Anthropic direct (optional)
    export OPENROUTER_API_KEY="sk-or-..."    # OpenRouter (optional)
    python tests/compare_trinity_vs_haiku.py

Sends the same forensic prompt to both models and compares:
  - Response quality (structured JSON, all required fields)
  - Latency
  - Token usage & estimated cost
"""

import asyncio
import json
import os
import time
import sys

# ── Fake forensic data (realistic rug pull scenario) ─────────────────────────

SYSTEM_PROMPT = """\
You are a blockchain forensics detective specialising in Solana rug pulls, \
token manipulation schemes, and on-chain capital flows.

Your job is to REASON, not to narrate. \
Weigh evidence, cross-reference signals, and reach explicit deductive conclusions. \
Explain what the data PROVES, IMPLIES, or RULES OUT — do not paraphrase it back.

After analysing the data, call the forensic_report tool with your findings.

Scoring guide:
- 90-100: Confirmed rug / extraction with on-chain proof
- 75-89:  Strong indicators, high suspicion
- 50-74:  Moderate risk
- <50:    Low risk or insufficient data

Write EXCLUSIVELY in plain, accessible English that any non-technical person can understand.
"""

USER_PROMPT = """\
Token mint: 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU

DATA AVAILABLE: LINEAGE=✓  BUNDLE=✓  SOL_FLOW=✓

=== ⚑ TOKEN BEING ANALYZED — YOUR PRIMARY SUBJECT ===
Name: MOONDOG (MDOG)
Deployer: 5Uj3eRVp2cFz...
On-chain mint age: 4.2h (0.2d)
Market cap: $12,500 USD
Liquidity: $3,200 USD

Pre-scan heuristic: 82/100

=== LINEAGE DATA ===
Deployer profile:
  - rug_count: 7
  - total_tokens_deployed: 12
  - rug_rate: 58.3%
  - first_deploy: 2025-11-01
  - last_deploy: 2026-04-02

Root token: SPACEPUP (rugged after 2.1h, extracted 24 SOL)
Clone chain: SPACEPUP → MOONPUP → ASTRODOG → MOONDOG
All 4 tokens share identical metadata template (phash similarity 0.97)

Insider sell analysis:
  - verdict: insider_dump
  - deployer_exited: true
  - deployer_sold_pct: 94.2%
  - time_to_exit: 1.8h
  - top_5_wallets_sold_pct: 88.1%

Death clock:
  - risk_level: critical
  - estimated_time_to_rug: 0.4h (already past)
  - pattern_match: "rapid_clone_cycle"

=== BUNDLE DATA ===
Overall verdict: confirmed_bundle
Bundle size: 8 wallets
Coordinated buy within first 3 blocks
Total bundled purchase: 42% of supply
Coordinated sell detected: true
Sell timing: all 8 wallets sold within 12-minute window

=== SOL FLOW DATA ===
Total extracted SOL: 18.4
Extraction route: deployer → intermediary (3Kf8x...) → Binance deposit
Time from deploy to full extraction: 3.1h
Deployer current SOL balance: 0.02 SOL
Net profit estimate: ~$3,680 USD
"""

FORENSIC_TOOL_ANTHROPIC = {
    "name": "forensic_report",
    "description": "Submit the structured forensic analysis report for this token.",
    "input_schema": {
        "type": "object",
        "properties": {
            "risk_score": {
                "type": "integer",
                "description": "Risk score 0-100",
            },
            "confidence": {
                "type": "string",
                "enum": ["low", "medium", "high"],
            },
            "rug_pattern": {
                "type": "string",
                "enum": [
                    "classic_rug", "slow_rug", "pump_dump",
                    "coordinated_bundle", "factory_jito_bundle",
                    "serial_clone", "insider_drain", "unknown",
                ],
            },
            "verdict_summary": {
                "type": "string",
                "description": "ONE sentence, max 20 words: headline conclusion.",
            },
            "narrative": {
                "type": "object",
                "properties": {
                    "observation": {
                        "type": "string",
                        "description": "2-3 sentences synthesising red flags.",
                    },
                    "pattern": {
                        "type": "string",
                        "description": "2-3 sentences: causal attack chain in temporal order.",
                    },
                    "risk": {
                        "type": "string",
                        "description": "2 sentences: quantify damage + residual risk.",
                    },
                },
                "required": ["observation", "pattern", "risk"],
            },
            "key_findings": {
                "type": "array",
                "items": {"type": "string"},
                "description": "3-6 findings, most incriminating first.",
            },
            "conviction_chain": {
                "type": "string",
                "description": "2-3 sentences: converging signals, logical chain, verdict.",
            },
        },
        "required": [
            "risk_score", "confidence", "rug_pattern", "verdict_summary",
            "narrative", "key_findings", "conviction_chain",
        ],
    },
}

# OpenAI function calling format (for OpenRouter/Trinity)
FORENSIC_TOOL_OPENAI = {
    "type": "function",
    "function": {
        "name": "forensic_report",
        "description": "Submit the structured forensic analysis report for this token.",
        "parameters": FORENSIC_TOOL_ANTHROPIC["input_schema"],
    },
}

def _extract_json_from_text(text: str) -> dict | None:
    """Try to extract a JSON object from text response (fallback when tool use fails)."""
    import re
    # Try to find JSON block in markdown code fence
    m = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(1))
        except json.JSONDecodeError:
            pass
    # Try to find raw JSON object
    m = re.search(r'(\{[^{}]*"risk_score"[^{}]*\})', text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(1))
        except json.JSONDecodeError:
            pass
    # Try the whole text
    try:
        return json.loads(text)
    except (json.JSONDecodeError, ValueError):
        pass
    return None


REQUIRED_FIELDS = [
    "risk_score", "confidence", "rug_pattern", "verdict_summary",
    "narrative", "key_findings", "conviction_chain",
]


# ── Haiku call (Anthropic SDK) ───────────────────────────────────────────────

async def call_haiku():
    import anthropic
    client = anthropic.AsyncAnthropic(
        api_key=os.environ["ANTHROPIC_API_KEY"],
        timeout=60.0,
    )
    t0 = time.monotonic()
    message = await client.messages.create(
        model="claude-haiku-4-5",
        max_tokens=800,
        temperature=0,
        system=SYSTEM_PROMPT,
        tools=[FORENSIC_TOOL_ANTHROPIC],
        tool_choice={"type": "tool", "name": "forensic_report"},
        messages=[{"role": "user", "content": USER_PROMPT}],
    )
    elapsed = time.monotonic() - t0

    # Extract tool result
    result = None
    for block in message.content:
        if getattr(block, "type", None) == "tool_use" and getattr(block, "name", None) == "forensic_report":
            result = block.input
            break

    return {
        "model": "claude-haiku-4-5",
        "provider": "Anthropic (direct)",
        "latency_s": round(elapsed, 2),
        "input_tokens": message.usage.input_tokens,
        "output_tokens": message.usage.output_tokens,
        "cost_input": message.usage.input_tokens / 1_000_000 * 1.00,
        "cost_output": message.usage.output_tokens / 1_000_000 * 5.00,
        "tool_use_success": result is not None,
        "result": result,
    }


# ── Trinity call (OpenAI SDK via OpenRouter) ─────────────────────────────────

async def call_trinity():
    from openai import AsyncOpenAI
    # Support both Arcee direct (ARCEE_API_KEY) and OpenRouter (OPENROUTER_API_KEY)
    arcee_key = os.environ.get("ARCEE_API_KEY")
    openrouter_key = os.environ.get("OPENROUTER_API_KEY")
    if arcee_key:
        base_url = "https://api.arcee.ai/api/v1"
        api_key = arcee_key
    elif openrouter_key:
        base_url = "https://openrouter.ai/api/v1"
        api_key = openrouter_key
    else:
        raise RuntimeError("Set ARCEE_API_KEY or OPENROUTER_API_KEY")
    client = AsyncOpenAI(
        base_url=base_url,
        api_key=api_key,
        timeout=180.0,
    )
    # Trinity doesn't support tool_choice — use JSON prompt instead
    trinity_system = SYSTEM_PROMPT.replace(
        "After analysing the data, call the forensic_report tool with your findings.",
        "After analysing the data, respond with ONLY a JSON object (no markdown, no commentary) with these fields:\n"
        '  risk_score (int 0-100), confidence ("low"/"medium"/"high"),\n'
        '  rug_pattern (one of: "classic_rug","slow_rug","pump_dump","coordinated_bundle","factory_jito_bundle","serial_clone","insider_drain","unknown"),\n'
        '  verdict_summary (string, max 20 words),\n'
        '  narrative: {observation (string), pattern (string), risk (string)},\n'
        '  key_findings (array of 3-6 strings),\n'
        '  conviction_chain (string, 2-3 sentences)'
    )
    t0 = time.monotonic()
    response = await client.chat.completions.create(
        model="trinity-large-thinking" if arcee_key else "arcee-ai/trinity-large-thinking",
        max_tokens=4096,
        temperature=0,
        messages=[
            {"role": "system", "content": trinity_system},
            {"role": "user", "content": USER_PROMPT},
        ],
    )
    elapsed = time.monotonic() - t0

    # Extract tool call result — debug full response structure
    result = None
    tool_use_ok = False
    choice = response.choices[0]
    msg = choice.message

    # Debug: dump full message structure
    debug_info = {
        "finish_reason": choice.finish_reason,
        "has_tool_calls": bool(msg.tool_calls),
        "tool_calls_count": len(msg.tool_calls) if msg.tool_calls else 0,
        "content_type": type(msg.content).__name__,
        "content_preview": str(msg.content)[:300] if msg.content else None,
        "role": msg.role,
    }

    if msg.tool_calls:
        for tc in msg.tool_calls:
            if tc.function.name == "forensic_report":
                try:
                    result = json.loads(tc.function.arguments)
                    tool_use_ok = True
                except json.JSONDecodeError:
                    result = {"_raw": tc.function.arguments, "_parse_error": True}
                break

    # Fallback: try to parse JSON from text content
    text_content = msg.content or ""
    if result is None and text_content:
        result = _extract_json_from_text(text_content)

    usage = response.usage
    return {
        "model": "arcee-ai/trinity-large-thinking",
        "provider": "OpenRouter" if not arcee_key else "Arcee (direct)",
        "latency_s": round(elapsed, 2),
        "input_tokens": usage.prompt_tokens if usage else 0,
        "output_tokens": usage.completion_tokens if usage else 0,
        "cost_input": (usage.prompt_tokens if usage else 0) / 1_000_000 * 0.25,
        "cost_output": (usage.completion_tokens if usage else 0) / 1_000_000 * 0.90,
        "tool_use_success": tool_use_ok,
        "text_fallback": result is not None and not tool_use_ok,
        "raw_text": text_content[:500] if not tool_use_ok else None,
        "debug": debug_info,
        "result": result,
    }


# ── Haiku via OpenRouter (to isolate provider vs model differences) ──────────

async def call_haiku_openrouter():
    from openai import AsyncOpenAI
    client = AsyncOpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=os.environ["OPENROUTER_API_KEY"],
    )
    t0 = time.monotonic()
    response = await client.chat.completions.create(
        model="anthropic/claude-haiku-4-5",
        max_tokens=4096,
        temperature=0,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": USER_PROMPT},
        ],
        tools=[FORENSIC_TOOL_OPENAI],
        tool_choice={"type": "function", "function": {"name": "forensic_report"}},
    )
    elapsed = time.monotonic() - t0

    result = None
    tool_use_ok = False
    choice = response.choices[0]
    msg = choice.message

    debug_info = {
        "finish_reason": choice.finish_reason,
        "has_tool_calls": bool(msg.tool_calls),
        "tool_calls_count": len(msg.tool_calls) if msg.tool_calls else 0,
        "content_type": type(msg.content).__name__,
        "content_preview": str(msg.content)[:300] if msg.content else None,
        "role": msg.role,
    }

    if msg.tool_calls:
        for tc in msg.tool_calls:
            if tc.function.name == "forensic_report":
                try:
                    result = json.loads(tc.function.arguments)
                    tool_use_ok = True
                except json.JSONDecodeError:
                    result = {"_raw": tc.function.arguments, "_parse_error": True}
                break

    # Fallback: try to parse JSON from text content
    text_content = msg.content or ""
    if result is None and text_content:
        result = _extract_json_from_text(text_content)

    usage = response.usage
    return {
        "model": "anthropic/claude-haiku-4-5",
        "provider": "OpenRouter",
        "debug": debug_info,
        "latency_s": round(elapsed, 2),
        "input_tokens": usage.prompt_tokens if usage else 0,
        "output_tokens": usage.completion_tokens if usage else 0,
        "cost_input": (usage.prompt_tokens if usage else 0) / 1_000_000 * 1.00,
        "cost_output": (usage.completion_tokens if usage else 0) / 1_000_000 * 5.00,
        "tool_use_success": tool_use_ok,
        "text_fallback": result is not None and not tool_use_ok,
        "result": result,
    }


# ── Quality validation ──────────────────────────────────────────────────────

def validate_result(data: dict) -> dict:
    """Check structural quality of the forensic report."""
    if not data.get("result"):
        return {"valid": False, "errors": ["No result returned"], "score": 0}

    result = data["result"]
    errors = []
    score = 0

    # Required fields
    for field in REQUIRED_FIELDS:
        if field in result:
            score += 10
        else:
            errors.append(f"Missing required field: {field}")

    # Type checks
    if isinstance(result.get("risk_score"), int):
        score += 5
        if 0 <= result["risk_score"] <= 100:
            score += 5
        else:
            errors.append(f"risk_score out of range: {result['risk_score']}")
    elif "risk_score" in result:
        errors.append(f"risk_score wrong type: {type(result['risk_score']).__name__}")

    if result.get("confidence") in ("low", "medium", "high"):
        score += 5
    elif "confidence" in result:
        errors.append(f"Invalid confidence: {result.get('confidence')}")

    valid_patterns = {
        "classic_rug", "slow_rug", "pump_dump", "coordinated_bundle",
        "factory_jito_bundle", "serial_clone", "insider_drain", "unknown",
    }
    if result.get("rug_pattern") in valid_patterns:
        score += 5
    elif "rug_pattern" in result:
        errors.append(f"Invalid rug_pattern: {result.get('rug_pattern')}")

    # Narrative sub-fields
    narrative = result.get("narrative", {})
    if isinstance(narrative, dict):
        for sub in ("observation", "pattern", "risk"):
            if isinstance(narrative.get(sub), str) and len(narrative[sub]) > 20:
                score += 5
            else:
                errors.append(f"narrative.{sub} missing or too short")

    # Key findings
    findings = result.get("key_findings", [])
    if isinstance(findings, list) and 3 <= len(findings) <= 6:
        score += 10
    elif isinstance(findings, list):
        errors.append(f"key_findings count: {len(findings)} (expected 3-6)")

    # Conviction chain
    cc = result.get("conviction_chain", "")
    if isinstance(cc, str) and len(cc) > 50:
        score += 5
    else:
        errors.append("conviction_chain missing or too short")

    return {"valid": len(errors) == 0, "errors": errors, "score": score}


# ── Main ─────────────────────────────────────────────────────────────────────

async def main():
    has_anthropic = bool(os.environ.get("ANTHROPIC_API_KEY"))
    has_openrouter = bool(os.environ.get("OPENROUTER_API_KEY"))
    has_arcee = bool(os.environ.get("ARCEE_API_KEY"))

    if not has_anthropic and not has_openrouter and not has_arcee:
        print("ERROR: Set at least one of ANTHROPIC_API_KEY, OPENROUTER_API_KEY, or ARCEE_API_KEY")
        sys.exit(1)

    tasks = {}
    if has_anthropic:
        tasks["haiku_direct"] = call_haiku()
    if has_arcee or has_openrouter:
        tasks["trinity"] = call_trinity()
    if has_openrouter:
        tasks["haiku_openrouter"] = call_haiku_openrouter()

    print(f"Running {len(tasks)} test(s) in parallel...\n")
    results = {}
    for name, coro in tasks.items():
        try:
            results[name] = await coro
        except Exception as e:
            results[name] = {"model": name, "error": str(e)}

    # ── Print comparison ─────────────────────────────────────────────────
    print("=" * 80)
    print("COMPARATIVE RESULTS: Forensic Report Quality")
    print("=" * 80)

    for name, data in results.items():
        print(f"\n{'─' * 40}")
        print(f"  {data.get('model', name)} ({data.get('provider', '?')})")
        print(f"{'─' * 40}")

        if "error" in data:
            print(f"  ERROR: {data['error']}")
            continue

        print(f"  Latency:       {data['latency_s']}s")
        print(f"  Input tokens:  {data['input_tokens']}")
        print(f"  Output tokens: {data['output_tokens']}")
        cost_total = data['cost_input'] + data['cost_output']
        print(f"  Cost:          ${cost_total:.6f} (in: ${data['cost_input']:.6f} + out: ${data['cost_output']:.6f})")
        print(f"  Tool use OK:   {data['tool_use_success']}")
        if data.get("debug"):
            d = data["debug"]
            print(f"  [debug] finish_reason={d.get('finish_reason')} tool_calls={d.get('has_tool_calls')} count={d.get('tool_calls_count')} content_type={d.get('content_type')}")
            if d.get("content_preview"):
                print(f"  [debug] content: {d['content_preview'][:200]}")
        if data.get("text_fallback"):
            print(f"  Text fallback: Yes (model responded in text, not tool call)")
        if data.get("raw_text"):
            print(f"  Raw text:      {data['raw_text'][:300]}...")

        if data.get("result"):
            validation = validate_result(data)
            print(f"  Quality score: {validation['score']}/100")
            if validation["errors"]:
                print(f"  Issues:        {', '.join(validation['errors'])}")

            r = data["result"]
            print(f"\n  risk_score:      {r.get('risk_score')}")
            print(f"  confidence:      {r.get('confidence')}")
            print(f"  rug_pattern:     {r.get('rug_pattern')}")
            print(f"  verdict_summary: {r.get('verdict_summary', '')[:100]}")
            print(f"  key_findings:    {len(r.get('key_findings', []))} items")

            # Print full narrative
            narr = r.get("narrative", {})
            if isinstance(narr, dict):
                print(f"\n  --- Narrative ---")
                for k in ("observation", "pattern", "risk"):
                    val = narr.get(k, "")
                    print(f"  {k}: {val[:200]}{'...' if len(str(val)) > 200 else ''}")

            print(f"\n  --- Conviction Chain ---")
            print(f"  {str(r.get('conviction_chain', ''))[:300]}")

    # ── Side-by-side summary ─────────────────────────────────────────────
    if len(results) > 1:
        print(f"\n{'=' * 80}")
        print("SIDE-BY-SIDE SUMMARY")
        print(f"{'=' * 80}")
        header = f"{'Metric':<25}"
        for name in results:
            header += f"  {name:<25}"
        print(header)
        print("-" * (25 + 27 * len(results)))

        for metric in ["latency_s", "input_tokens", "output_tokens", "tool_use_success"]:
            row = f"{metric:<25}"
            for name, data in results.items():
                val = data.get(metric, "N/A")
                row += f"  {str(val):<25}"
            print(row)

        # Cost row
        row = f"{'total_cost':<25}"
        for name, data in results.items():
            if "error" in data:
                row += f"  {'ERROR':<25}"
            else:
                cost = data.get("cost_input", 0) + data.get("cost_output", 0)
                row += f"  ${cost:.6f}{'':<18}"
            print(row)
            row = ""  # reset for next iteration if needed

        # Quality row
        row = f"{'quality_score':<25}"
        for name, data in results.items():
            if "error" in data:
                row += f"  {'ERROR':<25}"
            else:
                v = validate_result(data)
                row += f"  {v['score']}/100{'':<19}"
        print(row)

    # ── Save full results to JSON ────────────────────────────────────────
    out_path = "tests/compare_results.json"
    with open(out_path, "w") as f:
        json.dump(results, f, indent=2, default=str)
    print(f"\nFull results saved to {out_path}")


if __name__ == "__main__":
    asyncio.run(main())
