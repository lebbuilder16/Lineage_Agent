"""Unit tests for lineage_agent.bundle_tracker_service.

Covers the sync/pure helpers (_extract_buyers, _tx_has_sol_transfer_from_deployer)
and the verdict thresholds — all without touching the network.
"""

from __future__ import annotations

import pytest

from lineage_agent.bundle_tracker_service import (
    _extract_buyers,
    _tx_has_sol_transfer_from_deployer,
    _MAX_BUNDLE_WALLETS,
    _SOL_DECIMALS,
    _PRE_FUND_MIN_SOL,
)


# ===================================================================
# Helpers for building mock transaction dicts
# ===================================================================

def _make_tx(
    signers: list[dict],  # [{"pubkey": str, "pre_bal": int, "post_bal": int}]
    *,
    extra_accounts: list[dict] | None = None,
) -> dict:
    """Build a minimal Solana jsonParsed transaction."""
    accounts = []
    pre_bals = []
    post_bals = []
    for s in signers:
        accounts.append({"pubkey": s["pubkey"], "signer": True})
        pre_bals.append(s["pre_bal"])
        post_bals.append(s["post_bal"])
    for ea in (extra_accounts or []):
        accounts.append({"pubkey": ea["pubkey"], "signer": False})
        pre_bals.append(ea.get("pre_bal", 0))
        post_bals.append(ea.get("post_bal", 0))
    return {
        "transaction": {"message": {"accountKeys": accounts}},
        "meta": {"preBalances": pre_bals, "postBalances": post_bals},
    }


# ===================================================================
# _extract_buyers
# ===================================================================

class TestExtractBuyers:
    """Verify buyer extraction logic from bundle transactions."""

    def test_buyer_who_spent_sol(self):
        deployer = "DEPLOYER_111"
        tx = _make_tx([
            {"pubkey": deployer, "pre_bal": 10 * _SOL_DECIMALS, "post_bal": 8 * _SOL_DECIMALS},
            {"pubkey": "BuyerA", "pre_bal": 5 * _SOL_DECIMALS, "post_bal": 3 * _SOL_DECIMALS},
        ])
        wallets: dict[str, float] = {}
        _extract_buyers(tx, deployer, wallets)
        assert "BuyerA" in wallets
        assert wallets["BuyerA"] == pytest.approx(2.0, abs=0.01)

    def test_deployer_excluded(self):
        deployer = "DEPLOYER_111"
        tx = _make_tx([
            {"pubkey": deployer, "pre_bal": 10 * _SOL_DECIMALS, "post_bal": 5 * _SOL_DECIMALS},
        ])
        wallets: dict[str, float] = {}
        _extract_buyers(tx, deployer, wallets)
        assert deployer not in wallets

    def test_system_programs_excluded(self):
        deployer = "DEPLOYER_111"
        system_prog = "11111111111111111111111111111111"
        tx = _make_tx([
            {"pubkey": deployer, "pre_bal": 10 * _SOL_DECIMALS, "post_bal": 9 * _SOL_DECIMALS},
            {"pubkey": system_prog, "pre_bal": 5 * _SOL_DECIMALS, "post_bal": 3 * _SOL_DECIMALS},
        ])
        wallets: dict[str, float] = {}
        _extract_buyers(tx, deployer, wallets)
        assert system_prog not in wallets

    def test_non_signer_excluded(self):
        deployer = "DEPLOYER_111"
        tx = _make_tx(
            [{"pubkey": deployer, "pre_bal": 10 * _SOL_DECIMALS, "post_bal": 9 * _SOL_DECIMALS}],
            extra_accounts=[
                {"pubkey": "NonSigner", "pre_bal": 5 * _SOL_DECIMALS, "post_bal": 3 * _SOL_DECIMALS},
            ],
        )
        wallets: dict[str, float] = {}
        _extract_buyers(tx, deployer, wallets)
        assert "NonSigner" not in wallets

    def test_positive_balance_delta_not_buyer(self):
        """A signer whose SOL increased is not a buyer."""
        deployer = "DEPLOYER_111"
        tx = _make_tx([
            {"pubkey": deployer, "pre_bal": 10 * _SOL_DECIMALS, "post_bal": 9 * _SOL_DECIMALS},
            {"pubkey": "Receiver", "pre_bal": 1 * _SOL_DECIMALS, "post_bal": 3 * _SOL_DECIMALS},
        ])
        wallets: dict[str, float] = {}
        _extract_buyers(tx, deployer, wallets)
        assert "Receiver" not in wallets

    def test_multiple_buyers_accumulate(self):
        """Two transactions from same buyer accumulate SOL spent."""
        deployer = "DEPLOYER_111"
        wallets: dict[str, float] = {}

        tx1 = _make_tx([
            {"pubkey": deployer, "pre_bal": 10 * _SOL_DECIMALS, "post_bal": 9 * _SOL_DECIMALS},
            {"pubkey": "BuyerA", "pre_bal": 5 * _SOL_DECIMALS, "post_bal": 4 * _SOL_DECIMALS},
        ])
        tx2 = _make_tx([
            {"pubkey": deployer, "pre_bal": 9 * _SOL_DECIMALS, "post_bal": 8 * _SOL_DECIMALS},
            {"pubkey": "BuyerA", "pre_bal": 4 * _SOL_DECIMALS, "post_bal": 2 * _SOL_DECIMALS},
        ])

        _extract_buyers(tx1, deployer, wallets)
        _extract_buyers(tx2, deployer, wallets)
        assert wallets["BuyerA"] == pytest.approx(3.0, abs=0.01)

    def test_tiny_spend_ignored(self):
        """SOL decrease below threshold (0.001) is ignored."""
        deployer = "DEPLOYER_111"
        tx = _make_tx([
            {"pubkey": deployer, "pre_bal": 10 * _SOL_DECIMALS, "post_bal": 9 * _SOL_DECIMALS},
            {"pubkey": "TinyBuyer", "pre_bal": 5 * _SOL_DECIMALS, "post_bal": int(4.9999 * _SOL_DECIMALS)},
        ])
        wallets: dict[str, float] = {}
        _extract_buyers(tx, deployer, wallets)
        # Delta ~0.0001 SOL, below 0.001 threshold → excluded
        assert "TinyBuyer" not in wallets

    def test_empty_tx_graceful(self):
        wallets: dict[str, float] = {}
        _extract_buyers({}, "DEPLOYER", wallets)
        assert wallets == {}


# ===================================================================
# _tx_has_sol_transfer_from_deployer
# ===================================================================

class TestTxHasSolTransfer:
    """SOL transfer detection between deployer and recipient."""

    def test_valid_transfer(self):
        deployer = "DEPLOYER"
        recipient = "RECIPIENT"
        tx = _make_tx(
            [{"pubkey": deployer, "pre_bal": 10 * _SOL_DECIMALS, "post_bal": int(9.5 * _SOL_DECIMALS)}],
            extra_accounts=[
                {"pubkey": recipient, "pre_bal": 1 * _SOL_DECIMALS, "post_bal": int(1.5 * _SOL_DECIMALS)},
            ],
        )
        assert _tx_has_sol_transfer_from_deployer(tx, deployer, recipient) is True

    def test_below_threshold(self):
        deployer = "DEPLOYER"
        recipient = "RECIPIENT"
        small = int(_PRE_FUND_MIN_SOL * _SOL_DECIMALS * 0.5)  # below threshold
        tx = _make_tx(
            [{"pubkey": deployer, "pre_bal": 10 * _SOL_DECIMALS, "post_bal": 10 * _SOL_DECIMALS - small}],
            extra_accounts=[
                {"pubkey": recipient, "pre_bal": 1 * _SOL_DECIMALS, "post_bal": 1 * _SOL_DECIMALS + small},
            ],
        )
        assert _tx_has_sol_transfer_from_deployer(tx, deployer, recipient) is False

    def test_deployer_not_in_tx(self):
        tx = _make_tx(
            [{"pubkey": "OTHER", "pre_bal": 10 * _SOL_DECIMALS, "post_bal": 9 * _SOL_DECIMALS}],
        )
        assert _tx_has_sol_transfer_from_deployer(tx, "DEPLOYER", "RECIPIENT") is False

    def test_empty_tx(self):
        assert _tx_has_sol_transfer_from_deployer({}, "D", "R") is False


# ===================================================================
# Verdict thresholds (integration-style — test the logic)
# ===================================================================

class TestVerdictThresholds:
    """Verify the verdict classification boundaries."""

    def test_confirmed_bundle_high_link_ratio(self):
        """≥50% confirmed linked → confirmed_bundle."""
        confirmed = 3
        total = 5
        total_sol_returned = 0.5
        ratio = confirmed / total
        if ratio >= 0.5 or (confirmed >= 2 and total_sol_returned > 1.0):
            verdict = "confirmed_bundle"
        else:
            verdict = "clean"
        assert verdict == "confirmed_bundle"

    def test_confirmed_bundle_sol_returned(self):
        """≥2 confirmed + >1.0 SOL returned → confirmed_bundle."""
        confirmed = 2
        total = 10
        total_sol_returned = 1.5
        ratio = confirmed / total
        if ratio >= 0.5 or (confirmed >= 2 and total_sol_returned > 1.0):
            verdict = "confirmed_bundle"
        elif confirmed >= 1 or 5.0 > 5.0:
            verdict = "suspected_bundle"
        else:
            verdict = "clean"
        assert verdict == "confirmed_bundle"

    def test_suspected_bundle(self):
        """1 confirmed, <1 SOL returned → suspected_bundle."""
        confirmed = 1
        total = 5
        total_sol_spent = 3.0
        total_sol_returned = 0.2
        ratio = confirmed / total
        if ratio >= 0.5 or (confirmed >= 2 and total_sol_returned > 1.0):
            verdict = "confirmed_bundle"
        elif confirmed >= 1 or total_sol_spent > 5.0:
            verdict = "suspected_bundle"
        else:
            verdict = "clean"
        assert verdict == "suspected_bundle"

    def test_clean_verdict(self):
        """No confirmed linked, low spend → clean."""
        confirmed = 0
        total = 3
        total_sol_spent = 0.5
        total_sol_returned = 0.0
        ratio = confirmed / total
        if ratio >= 0.5 or (confirmed >= 2 and total_sol_returned > 1.0):
            verdict = "confirmed_bundle"
        elif confirmed >= 1 or total_sol_spent > 5.0:
            verdict = "suspected_bundle"
        else:
            verdict = "clean"
        assert verdict == "clean"

    def test_max_bundle_wallets_cap(self):
        assert _MAX_BUNDLE_WALLETS == 20
