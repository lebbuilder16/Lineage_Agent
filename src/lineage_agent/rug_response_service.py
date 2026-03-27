"""Rug auto-response service — enriches rug events with cartel/deployer analysis."""
from __future__ import annotations

import asyncio
import logging

logger = logging.getLogger(__name__)


async def handle_rug_event(mint: str, alert: dict, cache) -> dict:
    """Called when a rug is detected. Enriches the alert with parallel analysis.

    1. Runs cartel + deployer analysis in parallel
    2. Calls Claude for summary
    3. Returns enriched alert
    """
    enriched = {**alert}

    try:
        # Parallel: cartel report + deployer profile
        from .lineage_detector import detect_lineage, get_cached_lineage_report

        lin = await get_cached_lineage_report(mint)
        if lin is None:
            try:
                lin = await asyncio.wait_for(detect_lineage(mint), timeout=20.0)
            except Exception:
                lin = None

        if lin:
            # Extract deployer + cartel info
            dp = getattr(lin, "deployer_profile", None)
            cr = getattr(lin, "cartel_report", None)
            sf = getattr(lin, "sol_flow", None)

            if dp:
                enriched["deployer_rug_rate"] = getattr(dp, "rug_rate_pct", None)
                enriched["deployer_total_tokens"] = getattr(dp, "total_tokens_launched", None)
            if cr:
                community = getattr(cr, "deployer_community", None)
                if community:
                    enriched["cartel_id"] = getattr(community, "community_id", None)
                    enriched["cartel_members"] = getattr(community, "member_count", None)
            if sf:
                enriched["sol_extracted"] = getattr(sf, "total_extracted_sol", None)
                enriched["extraction_hops"] = getattr(sf, "hop_count", None)

        # AI summary
        try:
            from .ai_analyst import _get_client

            context = (
                f"Token {mint} has been rugged.\n"
                f"Deployer rug rate: {enriched.get('deployer_rug_rate', 'N/A')}%\n"
                f"Deployer total tokens: {enriched.get('deployer_total_tokens', 'N/A')}\n"
                f"SOL extracted: {enriched.get('sol_extracted', 'N/A')}\n"
                f"Extraction hops: {enriched.get('extraction_hops', 'N/A')}\n"
                f"Cartel: {enriched.get('cartel_id', 'none detected')}\n"
            )

            client = _get_client()
            response = await client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=200,
                messages=[{"role": "user", "content": f"Briefly summarize this rug event for a trader (2-3 sentences max):\n\n{context}"}],
            )
            enriched["ai_summary"] = response.content[0].text
        except Exception as exc:
            logger.warning("rug AI summary failed: %s", exc)
            enriched["ai_summary"] = None

    except Exception as exc:
        logger.warning("handle_rug_event failed for %s: %s", mint, exc)

    return enriched
