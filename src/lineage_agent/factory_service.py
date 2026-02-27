"""
Phase 5 — Token Factory Rhythm Detection.

Detects statistically regular deployment patterns that indicate a
script or bot is launching tokens (factory behaviour).

Reads from ``intelligence_events`` (token_created events) and analyses
intervals between token launches by the same deployer.

Signal is active when:
  - ≥3 tokens analysed for this deployer
  - Interval regularity score > 0.65 (factory_score threshold)
"""

from __future__ import annotations

import json
import logging
import re
import statistics
from datetime import datetime, timezone
from typing import Literal, Optional

from .data_sources._clients import event_insert, event_query, get_img_client
from .models import FactoryRhythmReport, TokenMetadata
from .utils import classify_narrative, NARRATIVE_TAXONOMY

logger = logging.getLogger(__name__)

_MIN_TOKENS_FOR_DETECTION = 3
_FACTORY_SCORE_THRESHOLD = 0.65

# NARRATIVE_TAXONOMY and classify_narrative are now imported from .utils
# (unified source of truth — resolves divergence with lineage_detector)


async def record_token_creation(token: TokenMetadata) -> None:
    """Record a token_created event for use in factory rhythm analysis.

    Also computes and stores the image pHash for cartel detection.
    """
    # Compute pHash asynchronously (best-effort, non-blocking)
    phash_hex: Optional[str] = None
    extra_data: dict = {}
    if token.image_uri:
        try:
            phash_hex = await _compute_phash(token.image_uri)
            if phash_hex:
                extra_data["phash"] = phash_hex
        except Exception:
            pass

    try:
        await event_insert(
            event_type="token_created",
            mint=token.mint,
            deployer=token.deployer,
            name=token.name,
            symbol=token.symbol,
            narrative=classify_narrative(token.name, token.symbol),
            mcap_usd=token.market_cap_usd,
            liq_usd=token.liquidity_usd,
            created_at=token.created_at.isoformat() if token.created_at else None,
            extra_json=json.dumps(extra_data) if extra_data else None,
            phash=phash_hex,
        )
    except Exception:
        logger.debug("record_token_creation failed for %s", token.mint, exc_info=True)


async def _compute_phash(image_uri: str) -> Optional[str]:
    """Fetch image and compute pHash hex string. Returns None on failure."""
    try:
        import io
        import imagehash
        from PIL import Image
        client = get_img_client()
        resp = await client.get(image_uri, timeout=5.0)
        if resp.status_code != 200:
            return None
        img = Image.open(io.BytesIO(resp.content)).convert("RGB")
        ph = imagehash.phash(img)
        # Convert 8x8 bit array to 64-bit integer hex
        bits = [v for row in ph.hash for v in row]
        val = int("".join("1" if b else "0" for b in bits), 2)
        return format(val, "016x")
    except Exception:
        return None


async def analyze_factory_rhythm(deployer: str) -> Optional[FactoryRhythmReport]:
    """Detect factory/bot deployment patterns for a deployer.

    Returns FactoryRhythmReport or None if < 3 tokens on record.
    """
    if not deployer:
        return None

    rows = await event_query(
        where="deployer = ? AND event_type = 'token_created' AND created_at IS NOT NULL",
        params=(deployer,),
        columns="created_at, name, mcap_usd",
        order_by="created_at",
    )

    if len(rows) < _MIN_TOKENS_FOR_DETECTION:
        return None

    # Parse timestamps
    timestamps: list[datetime] = []
    for row in rows:
        dt = _parse_dt(row.get("created_at"))
        if dt:
            timestamps.append(dt)
    timestamps.sort()

    if len(timestamps) < _MIN_TOKENS_FOR_DETECTION:
        return None

    # Compute intervals in hours (include zero-second launches — strongest bot signal)
    intervals_h = [
        (timestamps[i + 1] - timestamps[i]).total_seconds() / 3600.0
        for i in range(len(timestamps) - 1)
        if timestamps[i + 1] >= timestamps[i]
    ]
    if len(intervals_h) < 2:
        return None

    median_interval = statistics.median(intervals_h)
    stdev_interval = statistics.stdev(intervals_h) if len(intervals_h) >= 3 else median_interval * 0.5
    # Regularity: 1.0 = perfectly regular, 0.0 = totally random
    regularity = 1.0 - min(stdev_interval / max(median_interval, 0.01), 1.0)

    # Naming pattern analysis
    names = [row.get("name") or "" for row in rows]
    naming_pattern = _detect_naming_pattern(names)

    # Initial MCap variance (low variance = templated launches)
    mcaps = [row.get("mcap_usd") for row in rows if row.get("mcap_usd")]
    if len(mcaps) >= 3:
        mean_mc = statistics.mean(mcaps)
        coeff_var = (statistics.stdev(mcaps) / mean_mc) if mean_mc > 0 else 1.0
        mcap_consistency = 1.0 - min(coeff_var, 1.0)
    else:
        mcap_consistency = 0.0

    factory_score = (
        regularity * 0.55
        + (0.30 if naming_pattern == "incremental" else 0.0)
        + mcap_consistency * 0.15
    )

    return FactoryRhythmReport(
        tokens_launched=len(rows),
        median_interval_hours=round(median_interval, 2),
        regularity_score=round(regularity, 3),
        naming_pattern=naming_pattern,
        factory_score=round(factory_score, 3),
        is_factory=factory_score >= _FACTORY_SCORE_THRESHOLD,
    )


def _detect_naming_pattern(names: list[str]) -> Literal["incremental", "themed", "random"]:
    """Detect whether names follow an incremental, themed, or random pattern."""
    # Incremental: PEPE → PEPEX → PEPEZ  or TOKEN1 → TOKEN2 → TOKEN3
    incremental_re = re.compile(r"[vV]\d+$|[\dxXyYzZ]$|[\dxX]{1,2}$")
    incremental_count = sum(1 for n in names if incremental_re.search(n.strip()))
    if incremental_count >= len(names) * 0.5:
        return "incremental"

    # Themed: all share a common base word with length ≥ 3
    if len(names) >= 2:
        base = _longest_common_prefix([n.lower().strip() for n in names if n])
        if len(base) >= 3:
            return "themed"

    return "random"


def _longest_common_prefix(strings: list[str]) -> str:
    if not strings:
        return ""
    prefix = strings[0]
    for s in strings[1:]:
        while not s.startswith(prefix):
            prefix = prefix[:-1]
            if not prefix:
                return ""
    return prefix


# _parse_dt is now imported from .utils (unified parse_datetime)
from .utils import parse_datetime as _parse_dt
