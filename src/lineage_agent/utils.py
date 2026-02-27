"""
Shared utilities for the Lineage Agent.

Consolidates helper functions that were previously duplicated across
multiple service modules:

- ``parse_datetime`` — unified datetime parsing (replaces 4+ ``_parse_dt`` variants)
- ``classify_narrative`` — token narrative classification (replaces divergent
  implementations in ``factory_service`` and ``lineage_detector``)
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional


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
