"""
Shared utilities for the Lineage Agent.

Consolidates helper functions that were previously duplicated across
multiple service modules:

- ``parse_datetime`` — unified datetime parsing (replaces 4+ ``_parse_dt`` variants)
- ``classify_narrative`` — synchronous keyword-based narrative classification
- ``classify_narrative_llm`` — async LLM-enhanced classification (Claude fallback for "other")
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Unified datetime parser
# ---------------------------------------------------------------------------

def parse_datetime(value: object) -> Optional[datetime]:
    """Convert a value to a timezone-aware ``datetime`` (UTC).

    Accepted inputs:

    - ``None`` → ``None``
    - ``datetime`` → pass-through, with ``tzinfo`` set to UTC if naïve
    - ``str`` → ISO-format (handles both ``"Z"`` and ``"+00:00"`` suffixes)
    - ``int`` / ``float`` → Unix epoch timestamp in seconds
    - Anything else → ``None``

    This function replaces the per-module ``_parse_dt()`` functions that
    previously existed in ``deployer_service``, ``death_clock``,
    ``factory_service``, ``lineage_detector``, and inline datetime parsing
    in ``operator_impact_service`` and ``cartel_service``.
    """
    if value is None:
        return None

    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value

    if isinstance(value, str):
        try:
            # Handle "Z" suffix (common in JSON/ISO output)
            cleaned = value.replace("Z", "+00:00") if value.endswith("Z") else value
            dt = datetime.fromisoformat(cleaned)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except (ValueError, TypeError):
            return None

    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(float(value), tz=timezone.utc)
        except (ValueError, OSError, OverflowError):
            return None

    return None


# ---------------------------------------------------------------------------
# Unified narrative taxonomy
# ---------------------------------------------------------------------------

# Comprehensive taxonomy covering all narrative categories.
# Previously split between factory_service.NARRATIVE_TAXONOMY (22 categories)
# and lineage_detector._guess_narrative (6 categories with different labels).
NARRATIVE_TAXONOMY: dict[str, list[str]] = {
    "pepe":    ["pepe", "frog", "kek", "pepemoon"],
    "doge":    ["doge", "doggo", "shibe"],
    "inu":     ["inu", "shiba", "shib"],
    "ai":      ["ai", "gpt", "llm", "agent", "neural", "claude", "gemini", "deepseek"],
    "trump":   ["trump", "maga", "donald"],
    "elon":    ["elon", "musk"],
    "cat":     ["cat", "nyan", "kitty", "meow", "kitten", "popcat"],
    "anime":   ["anime", "waifu", "chan", "kun", "senpai"],
    "wojak":   ["wojak", "chad", "based", "cope", "gigachad", "sigma"],
    "sol":     ["solana", "sol"],
    "moon":    ["moon", "luna", "lunar"],
    "baby":    ["baby", "mini", "micro"],
    "ape":     ["ape", "monkey", "gorilla"],
    "dragon":  ["dragon", "drgn"],
    "bear":    ["bear"],
    "hawk":    ["hawk", "tuah", "hawktuah"],
    "pomni":   ["pomni", "circus", "jax"],
    "brain":   ["brain", "brainrot", "rot"],
    "skibidi": ["skibidi", "toilet", "rizz"],
    "goat":    ["goat", "goated"],
    "pnut":    ["pnut", "peanut", "squirrel"],
    # Political and celebrity categories that were previously using
    # divergent labels ("political"/"celebrity" in lineage_detector vs
    # "trump"/"elon" in factory_service). Now unified to the more
    # specific names used by factory_service.
    "biden":   ["biden"],
}


def classify_narrative(name: str, symbol: str) -> str:
    """Return the narrative category for a token name/symbol.

    Searches the unified ``NARRATIVE_TAXONOMY`` dictionary and returns
    the first matching category. Falls back to ``"other"`` when no
    keyword matches.

    Parameters
    ----------
    name:   Token name (e.g. "Baby Pepe 2.0").
    symbol: Token symbol (e.g. "BPEPE").

    Returns
    -------
    A narrative category string (e.g. ``"pepe"``, ``"ai"``, ``"other"``).
    """
    text = f"{name} {symbol}".lower()
    for category, keywords in NARRATIVE_TAXONOMY.items():
        if any(kw in text for kw in keywords):
            return category
    return "other"


# ---------------------------------------------------------------------------
# LLM-enhanced narrative classifier (async)
# ---------------------------------------------------------------------------

# In-process LRU cache: "name:symbol" → narrative string
# Unbounded in theory; in practice each key is tiny and narrative space is small.
_narrative_llm_cache: dict[str, str] = {}

_NARRATIVE_LLM_PROMPT = """\
Classify the Solana memecoin into exactly ONE of these narrative categories:
{categories}

Token name: {name}
Token symbol: {symbol}

Reply with ONLY the category label, nothing else.
If none fit, reply: other
"""


async def classify_narrative_llm(name: str, symbol: str) -> str:
    """Classify a token narrative, using Claude only when keyword matching fails.

    Fast path: keyword match via :func:`classify_narrative` — no network call.
    Slow path: Claude ``claude-haiku-4-5`` call when keyword match returns ``"other"``.

    Results are cached in-memory; repeated calls for the same (name, symbol)
    never trigger a second API call.

    Parameters
    ----------
    name:   Token name.
    symbol: Token ticker / symbol.

    Returns
    -------
    Narrative category string.  Always returns a non-empty string.
    If the LLM call fails the keyword-based ``"other"`` is returned and the
    error is logged at WARNING level (never silent).
    """
    # Fast path: keyword match already sufficient
    keyword_result = classify_narrative(name, symbol)
    if keyword_result != "other":
        return keyword_result

    cache_key = f"{name}:{symbol}"
    if cache_key in _narrative_llm_cache:
        return _narrative_llm_cache[cache_key]

    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        logger.warning(
            "classify_narrative_llm: ANTHROPIC_API_KEY not set — returning 'other' for '%s %s'",
            name, symbol,
        )
        return "other"

    try:
        import anthropic  # noqa: PLC0415
        categories = ", ".join(NARRATIVE_TAXONOMY.keys()) + ", other"
        prompt = _NARRATIVE_LLM_PROMPT.format(
            categories=categories, name=name, symbol=symbol
        )
        client = anthropic.AsyncAnthropic(api_key=api_key, timeout=15.0)
        message = await client.messages.create(
            model=os.getenv("ANTHROPIC_MODEL", "claude-haiku-4-5"),
            max_tokens=16,
            messages=[{"role": "user", "content": prompt}],
        )
        raw: str = message.content[0].text.strip().lower()
        # Accept only known categories; default to "other" for unexpected output
        result = raw if raw in NARRATIVE_TAXONOMY or raw == "other" else "other"
    except Exception:
        logger.warning(
            "classify_narrative_llm: LLM call failed for '%s %s' — returning 'other'",
            name, symbol, exc_info=True,
        )
        result = "other"

    _narrative_llm_cache[cache_key] = result
    return result
