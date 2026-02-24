"""Tests for the structured logging configuration."""

from __future__ import annotations

import json
import logging

import pytest

from lineage_agent.logging_config import (
    JSONFormatter,
    _RequestIdFilter,
    generate_request_id,
    request_id_ctx,
    setup_logging,
)


class TestGenerateRequestId:

    def test_length(self):
        rid = generate_request_id()
        assert len(rid) == 12

    def test_hex_chars(self):
        rid = generate_request_id()
        assert all(c in "0123456789abcdef" for c in rid)

    def test_unique(self):
        ids = {generate_request_id() for _ in range(100)}
        assert len(ids) == 100  # all unique


class TestRequestIdFilter:

    def test_injects_request_id(self):
        f = _RequestIdFilter()
        record = logging.LogRecord(
            name="test", level=logging.INFO, pathname="", lineno=0,
            msg="hi", args=(), exc_info=None,
        )
        request_id_ctx.set("abc123")
        f.filter(record)
        assert record.request_id == "abc123"  # type: ignore[attr-defined]

    def test_default_dash(self):
        f = _RequestIdFilter()
        record = logging.LogRecord(
            name="test", level=logging.INFO, pathname="", lineno=0,
            msg="hi", args=(), exc_info=None,
        )
        # Reset context to default
        token = request_id_ctx.set("-")
        f.filter(record)
        assert record.request_id == "-"  # type: ignore[attr-defined]


class TestJSONFormatter:

    def test_basic_output(self):
        formatter = JSONFormatter()
        request_id_ctx.set("test999")
        record = logging.LogRecord(
            name="mylogger", level=logging.WARNING, pathname="", lineno=0,
            msg="something happened", args=(), exc_info=None,
        )
        output = formatter.format(record)
        data = json.loads(output)
        assert data["level"] == "WARNING"
        assert data["logger"] == "mylogger"
        assert data["msg"] == "something happened"
        assert data["request_id"] == "test999"

    def test_exception_included(self):
        formatter = JSONFormatter()
        try:
            raise ValueError("boom")
        except ValueError:
            import sys
            record = logging.LogRecord(
                name="err", level=logging.ERROR, pathname="", lineno=0,
                msg="fail", args=(), exc_info=sys.exc_info(),
            )
        output = formatter.format(record)
        data = json.loads(output)
        assert "exception" in data
        assert "ValueError" in data["exception"]


class TestSetupLogging:

    def test_does_not_raise(self):
        """setup_logging should complete without error."""
        setup_logging()
        root = logging.getLogger()
        assert len(root.handlers) >= 1
