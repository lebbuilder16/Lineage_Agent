"""
Command line interface for the Meme Lineage Agent.

Usage::

    python src/main.py --mint <TOKEN_MINT>
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
import os

# Ensure ``src/`` is on the import path
sys.path.insert(0, os.path.dirname(__file__))

from lineage_agent.lineage_detector import detect_lineage

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)


async def _run(mint: str, as_json: bool) -> None:
    """Async entry point."""
    result = await detect_lineage(mint)

    if as_json:
        print(result.model_dump_json(indent=2))
        return

    # Pretty print
    root = result.root
    print("=" * 60)
    print(f"  Meme Lineage Agent – Results")
    print("=" * 60)
    print(f"  Queried Mint : {result.mint}")
    print(f"  Root         : {root.name if root else 'Unknown'} ({root.mint[:12] if root else 'n/a'}…)")
    print(f"  Confidence   : {result.confidence:.0%}")
    print(f"  Family Size  : {result.family_size}")
    print("-" * 60)

    if result.derivatives:
        print("  Derivatives / Clones:")
        for i, d in enumerate(result.derivatives[:10], 1):
            score = d.evidence.composite_score
            print(f"    {i:>2}. {d.name or d.mint[:12]:20s}  score={score:.3f}")
    else:
        print("  No derivatives/clones found.")

    print("=" * 60)


def main() -> None:
    """Entry point for the CLI."""
    parser = argparse.ArgumentParser(
        description="Detect memecoin lineage by mint address"
    )
    parser.add_argument(
        "--mint",
        required=True,
        help="Mint address of the token to analyse",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        dest="as_json",
        help="Output result as raw JSON",
    )
    args = parser.parse_args()
    asyncio.run(_run(args.mint, args.as_json))


if __name__ == "__main__":
    main()
