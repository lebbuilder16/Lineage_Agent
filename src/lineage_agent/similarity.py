"""
Similarity scoring functions for the Meme Lineage Agent.

Each ``compute_*`` function returns a float in [0.0, 1.0] where 1.0 means
identical and 0.0 means completely different.
"""

from __future__ import annotations

import io
import logging
from datetime import datetime
from typing import Optional

import requests
from Levenshtein import ratio as levenshtein_ratio

logger = logging.getLogger(__name__)

# We lazily import heavy optional deps so the module still loads even when
# Pillow / imagehash are not installed (e.g. during tests).
_PIL_AVAILABLE = False
try:
    from PIL import Image
    import imagehash

    _PIL_AVAILABLE = True
except ImportError:
    pass


# ------------------------------------------------------------------
# Name / Symbol similarity
# ------------------------------------------------------------------

def compute_name_similarity(name_a: str, name_b: str) -> float:
    """Normalised Levenshtein similarity between two names.

    Both names are lower-cased and stripped before comparison.
    """
    a = name_a.strip().lower()
    b = name_b.strip().lower()
    if not a or not b:
        return 0.0
    return levenshtein_ratio(a, b)


def compute_symbol_similarity(symbol_a: str, symbol_b: str) -> float:
    """Similarity between two ticker symbols.

    Exact match (case-insensitive) → 1.0, otherwise Levenshtein ratio.
    """
    a = symbol_a.strip().upper()
    b = symbol_b.strip().upper()
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    return levenshtein_ratio(a, b)


# ------------------------------------------------------------------
# Image similarity  (perceptual hash)
# ------------------------------------------------------------------

def compute_image_similarity(
    url_a: str,
    url_b: str,
    timeout: int = 10,
) -> float:
    """Perceptual-hash similarity between two images fetched by URL.

    Returns 1.0 when the hashes are identical and approaches 0.0 as
    difference grows.  If either image cannot be downloaded or decoded
    the function returns 0.0 gracefully.
    """
    if not _PIL_AVAILABLE:
        logger.warning("Pillow / imagehash not installed – image similarity disabled")
        return 0.0

    if not url_a or not url_b:
        return 0.0

    hash_a = _phash_from_url(url_a, timeout)
    hash_b = _phash_from_url(url_b, timeout)

    if hash_a is None or hash_b is None:
        return 0.0

    # imagehash difference: 0 == identical, max ~64 for 8×8 hash
    diff = hash_a - hash_b
    max_bits = 64  # 8×8 phash
    similarity = max(0.0, 1.0 - diff / max_bits)
    return similarity


def _phash_from_url(url: str, timeout: int = 10):
    """Download an image and compute its perceptual hash."""
    try:
        resp = requests.get(url, timeout=timeout, stream=True)
        resp.raise_for_status()
        img = Image.open(io.BytesIO(resp.content)).convert("RGB")
        return imagehash.phash(img)
    except Exception as exc:  # noqa: BLE001
        logger.debug("Could not compute phash for %s: %s", url, exc)
        return None


# ------------------------------------------------------------------
# Deployer similarity
# ------------------------------------------------------------------

def compute_deployer_score(deployer_a: str, deployer_b: str) -> float:
    """1.0 if both addresses are the same (and non-empty), else 0.0."""
    if not deployer_a or not deployer_b:
        return 0.0
    return 1.0 if deployer_a == deployer_b else 0.0


# ------------------------------------------------------------------
# Temporal score  (older token → more likely root)
# ------------------------------------------------------------------

def compute_temporal_score(
    ts_a: Optional[datetime],
    ts_b: Optional[datetime],
) -> float:
    """Score indicating whether *ts_a* is older than *ts_b*.

    Returns a value in [0, 1]:
    * 1.0 – *ts_a* is significantly older
    * 0.5 – roughly the same age
    * 0.0 – *ts_a* is significantly newer, or data missing

    The score is scaled by how many days apart the two timestamps are:
    more than 30 days → clamp to 1.0.
    """
    if ts_a is None or ts_b is None:
        return 0.5  # neutral when data is missing

    diff_seconds = (ts_b - ts_a).total_seconds()
    if diff_seconds == 0:
        return 0.5

    # Positive means a is older – good for root candidacy
    days_diff = diff_seconds / 86_400
    # Sigmoid-like mapping: 0 days → 0.5, ±30 days → ≈0/1
    score = 0.5 + 0.5 * _clamp(days_diff / 30.0, -1.0, 1.0)
    return score


# ------------------------------------------------------------------
# Composite score
# ------------------------------------------------------------------

def compute_composite_score(
    scores: dict[str, float],
    weights: dict[str, float],
) -> float:
    """Weighted average of individual similarity scores.

    Keys in *scores* and *weights* must match.  Missing keys are treated
    as 0.0.
    """
    total_weight = sum(weights.values())
    if total_weight == 0:
        return 0.0
    weighted = sum(scores.get(k, 0.0) * w for k, w in weights.items())
    return weighted / total_weight


# ------------------------------------------------------------------
# Util
# ------------------------------------------------------------------

def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))
