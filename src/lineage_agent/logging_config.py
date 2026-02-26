"""
Logging configuration for the Meme Lineage Agent.

Supports two formats:
- ``text`` (default): human-readable log lines
- ``json``: structured JSON for log aggregation (ELK, Datadog, etc.)

Settings via env vars:
- ``LOG_LEVEL``: DEBUG / INFO / WARNING / ERROR (default: INFO)
- ``LOG_FORMAT``: text / json (default: text)
"""

from __future__ import annotations

import json as json_mod
import logging
import sys
import uuid
from contextvars import ContextVar

from config import LOG_FORMAT, LOG_LEVEL

# Context var to hold a per-request correlation ID
request_id_ctx: ContextVar[str] = ContextVar("request_id", default="-")


class JSONFormatter(logging.Formatter):
    """Emit each log record as a single JSON line."""

    def format(self, record: logging.LogRecord) -> str:
        entry = {
            "ts": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
            "request_id": request_id_ctx.get("-"),
        }
        if record.exc_info and record.exc_info[1]:
            entry["exception"] = self.formatException(record.exc_info)
        return json_mod.dumps(entry, default=str)


def setup_logging() -> None:
    """Configure the root logger based on env settings."""
    root = logging.getLogger()
    root.setLevel(getattr(logging, LOG_LEVEL, logging.INFO))

    # Remove existing handlers
    root.handlers.clear()

    handler = logging.StreamHandler(sys.stdout)

    if LOG_FORMAT == "json":
        handler.setFormatter(JSONFormatter())
    else:
        handler.setFormatter(
            logging.Formatter(
                "%(asctime)s [%(levelname)s] %(name)s (%(request_id)s) %(message)s",
                defaults={"request_id": "-"},
            )
        )

    # Always inject request_id into records so it is available in both formats
    handler.addFilter(_RequestIdFilter())

    root.addHandler(handler)


class _RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_ctx.get("-")  # type: ignore[attr-defined]
        return True


def generate_request_id() -> str:
    """Create a short unique request ID."""
    return uuid.uuid4().hex[:12]
