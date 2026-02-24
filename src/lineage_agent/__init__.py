"""
Lineage Agent package initializer.

This package exposes the primary function ``detect_lineage`` for external
usage.  Other internal modules (e.g. bot, API) should be imported
explicitly from their respective files.
"""

from .lineage_detector import detect_lineage  # noqa: F401

__all__ = ["detect_lineage"]
