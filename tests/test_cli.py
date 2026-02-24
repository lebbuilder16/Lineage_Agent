"""Tests for the CLI entry point (main.py)."""

from __future__ import annotations

import subprocess
import sys


class TestCLI:

    def test_help_flag(self):
        """--help should print usage and exit 0."""
        result = subprocess.run(
            [sys.executable, "src/main.py", "--help"],
            capture_output=True, text=True, timeout=10,
        )
        assert result.returncode == 0
        assert "--mint" in result.stdout

    def test_missing_mint_flag(self):
        """Missing --mint should exit with error."""
        result = subprocess.run(
            [sys.executable, "src/main.py"],
            capture_output=True, text=True, timeout=10,
        )
        assert result.returncode != 0
        assert "required" in result.stderr.lower() or "mint" in result.stderr.lower()
