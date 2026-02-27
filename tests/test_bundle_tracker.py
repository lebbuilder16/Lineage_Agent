"""Unit tests for lineage_agent.bundle_tracker_service.

Covers the sync/pure helpers without touching the network:
  - _extract_buyers
  - _is_full_sell / _compute_sol_received
  - _find_incoming_sol_transfer / _extract_sol_outflows
  - Phase-4 coordination detectors
  - Phase-5 wallet + overall verdict computation
"""

from __future__ import annotations

import pytest

from lineage_agent.bundle_tracker_service import (
    _extract_buyers,
    _is_full_sell,
    _compute_sol_received,
    _find_incoming_sol_transfer,
    _extract_sol_outflows,
    _detect_common_prefund_source,
    _detect_coordinated_sell,
    _coordinated_sell_slots,
    _detect_common_sinks,
    _compute_wallet_verdict,
    _compute_overall_verdict,
    _collect_window_sigs,
    _MAX_BUNDLE_WALLETS,
    _BUNDLE_SLOT_WINDOW,
    _SOL_DECIMALS,
    _MIN_PREFUND_LAMPORTS,
)
from lineage_agent.models import (
    PreSellBehavior,
    PostSellBehavior,
    FundDestination,
    BundleWalletAnalysis,
    BundleWalletVerdict,
)


# ===================================================================
# Helpers for building mock transaction dicts
# ===================================================================

def _make_tx(
    signers: list[dict],
    *,
    extra_accounts: list[dict] | None = None,
    pre_token_balances: list[dict] | None = None,
    post_token_balances: list[dict] | None = None,
) -> dict:
    """Build a minimal Solana jsonParsed transaction."""
    accounts, pre_bals, post_bals = [], [], []
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
        "meta": {
            "preBalances": pre_bals,
            "postBalances": post_bals,
            "preTokenBalances": pre_token_balances or [],
            "postTokenBalances": post_token_balances or [],
        },
    }


def _make_pre_sell(
    prefund_source_is_deployer: bool = False,
    prefund_source_is_known_funder: bool = False,
    is_dormant: bool = False,
    same_deployer_prior_launches: int = 0,
    prior_bundle_count: int = 0,
    prefund_source: str | None = None,
) -> PreSellBehavior:
    return PreSellBehavior(
        prefund_source_is_deployer=prefund_source_is_deployer,
        prefund_source_is_known_funder=prefund_source_is_known_funder,
        is_dormant=is_dormant,
        same_deployer_prior_launches=same_deployer_prior_launches,
        prior_bundle_count=prior_bundle_count,
        prefund_source=prefund_source,
    )


def _make_post_sell(
    sell_detected: bool = False,
    sell_slot: int | None = None,
    direct_transfer_to_deployer: bool = False,
    transfer_to_deployer_linked_wallet: bool = False,
    indirect_via_intermediary: bool = False,
    common_destination_with_other_bundles: bool = False,
    sol_received_from_sell: float = 0.0,
) -> PostSellBehavior:
    return PostSellBehavior(
        sell_detected=sell_detected,
        sell_slot=sell_slot,
        direct_transfer_to_deployer=direct_transfer_to_deployer,
        transfer_to_deployer_linked_wallet=transfer_to_deployer_linked_wallet,
        indirect_via_intermediary=indirect_via_intermediary,
        common_destination_with_other_bundles=common_destination_with_other_bundles,
        sol_received_from_sell=sol_received_from_sell,
    )


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
        system_prog = "11111111111111111111111111111111"
        deployer = "DEPLOYER_111"
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
        deployer = "DEPLOYER_111"
        tx = _make_tx([
            {"pubkey": deployer, "pre_bal": 10 * _SOL_DECIMALS, "post_bal": 9 * _SOL_DECIMALS},
            {"pubkey": "Receiver", "pre_bal": 1 * _SOL_DECIMALS, "post_bal": 3 * _SOL_DECIMALS},
        ])
        wallets: dict[str, float] = {}
        _extract_buyers(tx, deployer, wallets)
        assert "Receiver" not in wallets

    def test_multiple_buyers_accumulate(self):
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
        deployer = "DEPLOYER_111"
        tx = _make_tx([
            {"pubkey": deployer, "pre_bal": 10 * _SOL_DECIMALS, "post_bal": 9 * _SOL_DECIMALS},
            {"pubkey": "TinyBuyer", "pre_bal": 5 * _SOL_DECIMALS, "post_bal": int(4.9999 * _SOL_DECIMALS)},
        ])
        wallets: dict[str, float] = {}
        _extract_buyers(tx, deployer, wallets)
        assert "TinyBuyer" not in wallets

    def test_empty_tx_graceful(self):
        wallets: dict[str, float] = {}
        _extract_buyers({}, "DEPLOYER", wallets)
        assert wallets == {}


# ===================================================================
# _is_full_sell
# ===================================================================

class TestIsFullSell:

    def _token_bal(self, owner: str, mint: str, amount: float) -> dict:
        return {
            "owner": owner,
            "mint": mint,
            "uiTokenAmount": {"uiAmount": amount},
        }

    def test_full_sell_detected(self):
        wallet = "WALLET1"
        tx = _make_tx(
            [{"pubkey": wallet, "pre_bal": _SOL_DECIMALS, "post_bal": 2 * _SOL_DECIMALS}],
            pre_token_balances=[self._token_bal(wallet, "MINT_A", 1_000_000.0)],
            post_token_balances=[self._token_bal(wallet, "MINT_A", 0.0)],
        )
        assert _is_full_sell(tx, wallet, "MINT_A") is True

    def test_full_sell_no_target_mint_legacy(self):
        """Without target_mint, checks all positions (legacy)."""
        wallet = "WALLET1"
        tx = _make_tx(
            [{"pubkey": wallet, "pre_bal": _SOL_DECIMALS, "post_bal": 2 * _SOL_DECIMALS}],
            pre_token_balances=[self._token_bal(wallet, "MINT_A", 1_000_000.0)],
            post_token_balances=[self._token_bal(wallet, "MINT_A", 0.0)],
        )
        assert _is_full_sell(tx, wallet) is True

    def test_partial_sell_not_full(self):
        wallet = "WALLET1"
        tx = _make_tx(
            [{"pubkey": wallet, "pre_bal": _SOL_DECIMALS, "post_bal": 2 * _SOL_DECIMALS}],
            pre_token_balances=[self._token_bal(wallet, "MINT_A", 1_000_000.0)],
            post_token_balances=[self._token_bal(wallet, "MINT_A", 500_000.0)],
        )
        assert _is_full_sell(tx, wallet, "MINT_A") is False

    def test_no_pre_balance_not_sell(self):
        wallet = "WALLET1"
        tx = _make_tx(
            [{"pubkey": wallet, "pre_bal": _SOL_DECIMALS, "post_bal": 2 * _SOL_DECIMALS}],
            pre_token_balances=[],
            post_token_balances=[],
        )
        assert _is_full_sell(tx, wallet, "MINT_A") is False

    def test_different_owner_not_sell(self):
        wallet = "WALLET1"
        other = "WALLET2"
        tx = _make_tx(
            [{"pubkey": wallet, "pre_bal": _SOL_DECIMALS, "post_bal": 2 * _SOL_DECIMALS}],
            pre_token_balances=[self._token_bal(other, "MINT_A", 1_000_000.0)],
            post_token_balances=[self._token_bal(other, "MINT_A", 0.0)],
        )
        assert _is_full_sell(tx, wallet, "MINT_A") is False

    def test_empty_tx_graceful(self):
        assert _is_full_sell({}, "WALLET", "MINT") is False

    def test_multi_mint_target_sell_detected(self):
        """Wallet holds MINT_A and MINT_B; sells only MINT_A.
        With target_mint=MINT_A this should be True."""
        wallet = "WALLET1"
        tx = _make_tx(
            [{"pubkey": wallet, "pre_bal": _SOL_DECIMALS, "post_bal": 2 * _SOL_DECIMALS}],
            pre_token_balances=[
                self._token_bal(wallet, "MINT_A", 1_000_000.0),
                self._token_bal(wallet, "MINT_B", 500_000.0),
            ],
            post_token_balances=[
                self._token_bal(wallet, "MINT_A", 0.0),
                self._token_bal(wallet, "MINT_B", 500_000.0),
            ],
        )
        assert _is_full_sell(tx, wallet, "MINT_A") is True

    def test_multi_mint_without_target_fails(self):
        """Without target_mint, wallet still holds MINT_B → False (legacy)."""
        wallet = "WALLET1"
        tx = _make_tx(
            [{"pubkey": wallet, "pre_bal": _SOL_DECIMALS, "post_bal": 2 * _SOL_DECIMALS}],
            pre_token_balances=[
                self._token_bal(wallet, "MINT_A", 1_000_000.0),
                self._token_bal(wallet, "MINT_B", 500_000.0),
            ],
            post_token_balances=[
                self._token_bal(wallet, "MINT_A", 0.0),
                self._token_bal(wallet, "MINT_B", 500_000.0),
            ],
        )
        # Legacy (no target_mint): both positions checked, MINT_B still held → True
        # because MINT_B went from 500k to 500k which is >1, so all(500k <= 1) is False
        # Wait — actually MINT_B pre=500k, post=500k → wallet_post.get("MINT_B") = 500k
        # → 500k <= 1.0 is False → returns False
        assert _is_full_sell(tx, wallet) is False

    def test_pumpfun_missing_owner(self):
        """PumpFun token balances often lack 'owner'. Should still detect sell."""
        wallet = "WALLET1"
        target = "PUMP_MINT"
        # Token balances without owner field (PumpFun bonding curve)
        pre_tb = {"mint": target, "uiTokenAmount": {"uiAmount": 1_000_000.0}}
        post_tb = {"mint": target, "uiTokenAmount": {"uiAmount": 0.0}}
        tx = _make_tx(
            [{"pubkey": wallet, "pre_bal": _SOL_DECIMALS, "post_bal": 2 * _SOL_DECIMALS}],
            pre_token_balances=[pre_tb],
            post_token_balances=[post_tb],
        )
        assert _is_full_sell(tx, wallet, target) is True


# ===================================================================
# _compute_sol_received
# ===================================================================

class TestComputeSolReceived:

    def test_positive_gain(self):
        wallet = "WALLET1"
        tx = _make_tx([
            {"pubkey": "OTHER", "pre_bal": 10 * _SOL_DECIMALS, "post_bal": 7 * _SOL_DECIMALS},
            {"pubkey": wallet, "pre_bal": 1 * _SOL_DECIMALS, "post_bal": 4 * _SOL_DECIMALS},
        ])
        result = _compute_sol_received(tx, wallet)
        assert result == pytest.approx(3.0, abs=0.001)

    def test_negative_delta_returns_zero(self):
        wallet = "WALLET1"
        tx = _make_tx([
            {"pubkey": wallet, "pre_bal": 5 * _SOL_DECIMALS, "post_bal": 3 * _SOL_DECIMALS},
        ])
        assert _compute_sol_received(tx, wallet) == 0.0

    def test_wallet_not_in_tx(self):
        tx = _make_tx([
            {"pubkey": "OTHER", "pre_bal": _SOL_DECIMALS, "post_bal": _SOL_DECIMALS},
        ])
        assert _compute_sol_received(tx, "MISSING") == 0.0


# ===================================================================
# _find_incoming_sol_transfer
# ===================================================================

class TestFindIncomingSolTransfer:

    def test_detects_funding_above_threshold(self):
        sender = "FUNDER"
        recipient = "RECIPIENT"
        fund_amount = _MIN_PREFUND_LAMPORTS * 2
        tx = _make_tx([
            {"pubkey": sender, "pre_bal": 10 * _SOL_DECIMALS, "post_bal": 10 * _SOL_DECIMALS - fund_amount},
        ], extra_accounts=[
            {"pubkey": recipient, "pre_bal": 0, "post_bal": fund_amount},
        ])
        found_sender, sol = _find_incoming_sol_transfer(tx, recipient)
        assert found_sender == sender
        assert sol * _SOL_DECIMALS >= _MIN_PREFUND_LAMPORTS

    def test_below_threshold_returns_none(self):
        sender = "FUNDER"
        recipient = "RECIPIENT"
        tiny = _MIN_PREFUND_LAMPORTS // 2
        tx = _make_tx([
            {"pubkey": sender, "pre_bal": _SOL_DECIMALS, "post_bal": _SOL_DECIMALS - tiny},
        ], extra_accounts=[
            {"pubkey": recipient, "pre_bal": 0, "post_bal": tiny},
        ])
        found_sender, sol = _find_incoming_sol_transfer(tx, recipient)
        assert found_sender is None

    def test_recipient_not_in_tx(self):
        tx = _make_tx([{"pubkey": "OTHER", "pre_bal": _SOL_DECIMALS, "post_bal": _SOL_DECIMALS}])
        sender, sol = _find_incoming_sol_transfer(tx, "MISSING_RECIPIENT")
        assert sender is None
        assert sol == 0.0


# ===================================================================
# _extract_sol_outflows
# ===================================================================

class TestExtractSolOutflows:

    def test_detects_outflow_above_min(self):
        sender = "WALLET1"
        dest = "DEST1"
        amount = 100_000_000  # 0.1 SOL
        tx = _make_tx([
            {"pubkey": sender, "pre_bal": _SOL_DECIMALS, "post_bal": _SOL_DECIMALS - amount},
        ], extra_accounts=[
            {"pubkey": dest, "pre_bal": 0, "post_bal": amount},
        ])
        outflows = _extract_sol_outflows(tx, sender, min_lamports=50_000_000)
        assert dest in outflows
        assert outflows[dest] == amount

    def test_below_min_lamports_excluded(self):
        sender = "WALLET1"
        dest = "DEST1"
        amount = 10_000_000  # 0.01 SOL
        tx = _make_tx([
            {"pubkey": sender, "pre_bal": _SOL_DECIMALS, "post_bal": _SOL_DECIMALS - amount},
        ], extra_accounts=[
            {"pubkey": dest, "pre_bal": 0, "post_bal": amount},
        ])
        outflows = _extract_sol_outflows(tx, sender, min_lamports=50_000_000)
        assert dest not in outflows

    def test_sender_not_in_tx_returns_empty(self):
        tx = _make_tx([{"pubkey": "OTHER", "pre_bal": _SOL_DECIMALS, "post_bal": _SOL_DECIMALS}])
        assert _extract_sol_outflows(tx, "MISSING") == {}


# ===================================================================
# Phase-4: Cross-wallet coordination detectors
# ===================================================================

class TestDetectCommonPrefundSource:

    def test_common_funder_detected(self):
        results = [
            _make_pre_sell(prefund_source="FUNDER_A"),
            _make_pre_sell(prefund_source="FUNDER_A"),
            _make_pre_sell(prefund_source="FUNDER_B"),
        ]
        assert _detect_common_prefund_source(results) == "FUNDER_A"

    def test_no_common_funder(self):
        results = [
            _make_pre_sell(prefund_source="FUNDER_A"),
            _make_pre_sell(prefund_source="FUNDER_B"),
        ]
        assert _detect_common_prefund_source(results) is None

    def test_no_funders_at_all(self):
        results = [_make_pre_sell(), _make_pre_sell()]
        assert _detect_common_prefund_source(results) is None


class TestDetectCoordinatedSell:

    def test_three_sells_within_window(self):
        results = [
            _make_post_sell(sell_detected=True, sell_slot=100),
            _make_post_sell(sell_detected=True, sell_slot=102),
            _make_post_sell(sell_detected=True, sell_slot=104),
        ]
        assert _detect_coordinated_sell(results) is True

    def test_two_sells_within_window(self):
        results = [
            _make_post_sell(sell_detected=True, sell_slot=100),
            _make_post_sell(sell_detected=True, sell_slot=103),
        ]
        assert _detect_coordinated_sell(results) is True

    def test_sells_outside_window(self):
        results = [
            _make_post_sell(sell_detected=True, sell_slot=100),
            _make_post_sell(sell_detected=True, sell_slot=200),
            _make_post_sell(sell_detected=True, sell_slot=300),
        ]
        assert _detect_coordinated_sell(results) is False

    def test_single_sell(self):
        results = [
            _make_post_sell(sell_detected=True, sell_slot=100),
        ]
        assert _detect_coordinated_sell(results) is False

    def test_no_sells(self):
        results = [_make_post_sell(), _make_post_sell()]
        assert _detect_coordinated_sell(results) is False


class TestCoordinatedSellSlots:

    def test_returns_slots_within_window(self):
        results = [
            _make_post_sell(sell_detected=True, sell_slot=100),
            _make_post_sell(sell_detected=True, sell_slot=103),
            _make_post_sell(sell_detected=True, sell_slot=500),
        ]
        slots = _coordinated_sell_slots(results)
        assert 100 in slots
        assert 103 in slots
        assert 500 not in slots

    def test_no_coordinated_sells(self):
        results = [
            _make_post_sell(sell_detected=True, sell_slot=100),
            _make_post_sell(sell_detected=True, sell_slot=200),
        ]
        slots = _coordinated_sell_slots(results)
        assert len(slots) == 0

    def test_empty_input(self):
        assert _coordinated_sell_slots([]) == set()


class TestDetectCommonSinks:

    def test_common_sink_detected(self):
        dest_a = FundDestination(destination="SINK_1", lamports=100_000_000, hop=0)
        dest_b = FundDestination(destination="SINK_1", lamports=200_000_000, hop=0)
        ps1 = _make_post_sell()
        ps2 = _make_post_sell()
        ps1.fund_destinations = [dest_a]
        ps2.fund_destinations = [dest_b]
        sinks = _detect_common_sinks([ps1, ps2])
        assert "SINK_1" in sinks

    def test_no_common_sink(self):
        ps1 = _make_post_sell()
        ps2 = _make_post_sell()
        ps1.fund_destinations = [FundDestination(destination="SINK_1", lamports=100_000_000, hop=0)]
        ps2.fund_destinations = [FundDestination(destination="SINK_2", lamports=100_000_000, hop=0)]
        sinks = _detect_common_sinks([ps1, ps2])
        assert len(sinks) == 0

    def test_system_program_excluded(self):
        system_prog = "11111111111111111111111111111111"
        ps1 = _make_post_sell()
        ps2 = _make_post_sell()
        ps1.fund_destinations = [FundDestination(destination=system_prog, lamports=100_000_000, hop=0)]
        ps2.fund_destinations = [FundDestination(destination=system_prog, lamports=100_000_000, hop=0)]
        sinks = _detect_common_sinks([ps1, ps2])
        assert system_prog not in sinks


# ===================================================================
# Phase-5: Wallet verdict computation
# ===================================================================

class TestComputeWalletVerdict:

    def test_confirmed_team_direct_transfer(self):
        pre = _make_pre_sell()
        post = _make_post_sell(direct_transfer_to_deployer=True)
        flags, verdict = _compute_wallet_verdict(pre, post)
        assert verdict == BundleWalletVerdict.CONFIRMED_TEAM
        assert "DIRECT_TRANSFER_TO_DEPLOYER" in flags

    def test_confirmed_team_funded_and_linked(self):
        pre = _make_pre_sell(prefund_source_is_deployer=True)
        post = _make_post_sell(transfer_to_deployer_linked_wallet=True)
        flags, verdict = _compute_wallet_verdict(pre, post)
        assert verdict == BundleWalletVerdict.CONFIRMED_TEAM

    def test_suspected_team_linked_wallet(self):
        pre = _make_pre_sell()
        post = _make_post_sell(transfer_to_deployer_linked_wallet=True)
        flags, verdict = _compute_wallet_verdict(pre, post)
        assert verdict == BundleWalletVerdict.SUSPECTED_TEAM
        assert "TRANSFERRED_TO_DEPLOYER_LINKED_WALLET" in flags

    def test_suspected_team_deployer_funded_with_flags(self):
        pre = _make_pre_sell(prefund_source_is_deployer=True, is_dormant=True)
        post = _make_post_sell()
        flags, verdict = _compute_wallet_verdict(pre, post)
        # prefund_source_is_deployer + is_dormant = 2 flags → SUSPECTED_TEAM
        assert verdict == BundleWalletVerdict.SUSPECTED_TEAM

    def test_coordinated_dump_three_flags(self):
        pre = _make_pre_sell(is_dormant=True, prefund_source_is_known_funder=True)
        post = _make_post_sell(common_destination_with_other_bundles=True)
        flags, verdict = _compute_wallet_verdict(pre, post)
        assert verdict == BundleWalletVerdict.COORDINATED_DUMP

    def test_coordinated_dump_known_funder_plus_common_sink(self):
        pre = _make_pre_sell(prefund_source_is_known_funder=True)
        post = _make_post_sell(common_destination_with_other_bundles=True)
        flags, verdict = _compute_wallet_verdict(pre, post)
        assert verdict == BundleWalletVerdict.COORDINATED_DUMP

    def test_early_buyer_no_signals(self):
        pre = _make_pre_sell()
        post = _make_post_sell()
        flags, verdict = _compute_wallet_verdict(pre, post)
        assert verdict == BundleWalletVerdict.EARLY_BUYER
        assert flags == []

    def test_early_buyer_with_one_flag(self):
        pre = _make_pre_sell(is_dormant=True)
        post = _make_post_sell()
        flags, verdict = _compute_wallet_verdict(pre, post)
        assert verdict == BundleWalletVerdict.EARLY_BUYER
        assert "DORMANT_BEFORE_LAUNCH" in flags

    # ── Bundle-specific signals ──────────────────────────────────────────

    def test_bundle_sell_detected_flag(self):
        """Wallet that sold in a bundle with ≥3 wallets gets BUNDLE_SELL_DETECTED."""
        pre = _make_pre_sell()
        post = _make_post_sell(sell_detected=True)
        flags, verdict = _compute_wallet_verdict(pre, post, num_bundle_wallets=5)
        assert "BUNDLE_SELL_DETECTED" in flags

    def test_no_bundle_sell_flag_small_bundle(self):
        """Wallet in a small bundle (<3 wallets) doesn't get BUNDLE_SELL_DETECTED."""
        pre = _make_pre_sell()
        post = _make_post_sell(sell_detected=True)
        flags, verdict = _compute_wallet_verdict(pre, post, num_bundle_wallets=2)
        assert "BUNDLE_SELL_DETECTED" not in flags

    def test_coordinated_sell_timing_flag(self):
        """Wallet flagged as coordinated sell participant gets COORDINATED_SELL_TIMING."""
        pre = _make_pre_sell()
        post = _make_post_sell(sell_detected=True)
        flags, verdict = _compute_wallet_verdict(
            pre, post, is_coordinated_sell_participant=True, num_bundle_wallets=5,
        )
        assert "COORDINATED_SELL_TIMING" in flags

    def test_bundle_sell_plus_coordinated_sell_gives_coordinated_dump(self):
        """BUNDLE_SELL_DETECTED + COORDINATED_SELL_TIMING → COORDINATED_DUMP."""
        pre = _make_pre_sell()
        post = _make_post_sell(sell_detected=True)
        flags, verdict = _compute_wallet_verdict(
            pre, post, is_coordinated_sell_participant=True, num_bundle_wallets=5,
        )
        assert verdict == BundleWalletVerdict.COORDINATED_DUMP
        assert "BUNDLE_SELL_DETECTED" in flags
        assert "COORDINATED_SELL_TIMING" in flags


# ===================================================================
# Phase-5: Overall verdict computation
# ===================================================================

def _make_analysis(wallet: str, verdict: BundleWalletVerdict, sell: bool = False) -> BundleWalletAnalysis:
    return BundleWalletAnalysis(
        wallet=wallet,
        sol_spent=1.0,
        pre_sell=_make_pre_sell(),
        post_sell=_make_post_sell(sell_detected=sell),
        red_flags=[],
        verdict=verdict,
    )


class TestComputeOverallVerdict:

    def test_confirmed_extraction_two_confirmed(self):
        analyses = [
            _make_analysis("W1", BundleWalletVerdict.CONFIRMED_TEAM),
            _make_analysis("W2", BundleWalletVerdict.CONFIRMED_TEAM),
        ]
        verdict, evidence = _compute_overall_verdict(analyses, ["W1", "W2"], [], [], set(), False)
        assert verdict == "confirmed_team_extraction"

    def test_confirmed_extraction_one_confirmed_one_suspected(self):
        analyses = [
            _make_analysis("W1", BundleWalletVerdict.CONFIRMED_TEAM),
            _make_analysis("W2", BundleWalletVerdict.SUSPECTED_TEAM),
        ]
        verdict, evidence = _compute_overall_verdict(analyses, ["W1"], ["W2"], [], set(), False)
        assert verdict == "confirmed_team_extraction"

    def test_suspected_extraction_two_suspected(self):
        analyses = [
            _make_analysis("W1", BundleWalletVerdict.SUSPECTED_TEAM),
            _make_analysis("W2", BundleWalletVerdict.SUSPECTED_TEAM),
        ]
        verdict, evidence = _compute_overall_verdict(analyses, [], ["W1", "W2"], [], set(), False)
        assert verdict == "suspected_team_extraction"

    def test_suspected_extraction_dumps_with_common_sink(self):
        analyses = [
            _make_analysis("W1", BundleWalletVerdict.COORDINATED_DUMP),
            _make_analysis("W2", BundleWalletVerdict.COORDINATED_DUMP),
            _make_analysis("W3", BundleWalletVerdict.COORDINATED_DUMP),
        ]
        verdict, evidence = _compute_overall_verdict(
            analyses, [], [], ["W1", "W2", "W3"], {"SINK_1"}, False
        )
        assert verdict == "suspected_team_extraction"

    def test_coordinated_dump_no_deployer_link(self):
        analyses = [
            _make_analysis("W1", BundleWalletVerdict.COORDINATED_DUMP),
            _make_analysis("W2", BundleWalletVerdict.COORDINATED_DUMP),
            _make_analysis("W3", BundleWalletVerdict.COORDINATED_DUMP),
        ]
        verdict, evidence = _compute_overall_verdict(
            analyses, [], [], ["W1", "W2", "W3"], set(), False
        )
        assert verdict == "coordinated_dump_unknown_team"

    def test_coordinated_dump_two_dumps_coordinated_sell(self):
        analyses = [
            _make_analysis("W1", BundleWalletVerdict.COORDINATED_DUMP),
            _make_analysis("W2", BundleWalletVerdict.COORDINATED_DUMP),
        ]
        verdict, evidence = _compute_overall_verdict(
            analyses, [], [], ["W1", "W2"], set(), True
        )
        assert verdict == "coordinated_dump_unknown_team"

    def test_early_buyers_no_link(self):
        analyses = [
            _make_analysis("W1", BundleWalletVerdict.EARLY_BUYER),
            _make_analysis("W2", BundleWalletVerdict.EARLY_BUYER),
        ]
        verdict, evidence = _compute_overall_verdict(analyses, [], [], [], set(), False)
        assert verdict == "early_buyers_no_link_proven"

    def test_bulk_exit_heuristic_large_bundle(self):
        """≥3 wallets with ≥40% sells → coordinated_dump even without per-wallet COORDINATED_DUMP."""
        analyses = [
            _make_analysis("W1", BundleWalletVerdict.EARLY_BUYER, sell=True),
            _make_analysis("W2", BundleWalletVerdict.EARLY_BUYER, sell=True),
            _make_analysis("W3", BundleWalletVerdict.EARLY_BUYER, sell=True),
            _make_analysis("W4", BundleWalletVerdict.EARLY_BUYER),
            _make_analysis("W5", BundleWalletVerdict.EARLY_BUYER),
        ]
        verdict, evidence = _compute_overall_verdict(analyses, [], [], [], set(), False)
        assert verdict == "coordinated_dump_unknown_team"

    def test_bulk_exit_heuristic_requires_three_wallets(self):
        """Only 2 wallets — bulk-exit doesn't apply, stays early_buyers."""
        analyses = [
            _make_analysis("W1", BundleWalletVerdict.EARLY_BUYER, sell=True),
            _make_analysis("W2", BundleWalletVerdict.EARLY_BUYER, sell=True),
        ]
        verdict, evidence = _compute_overall_verdict(analyses, [], [], [], set(), False)
        # Only 2 wallets total → bulk-exit threshold (≥3) not met, but
        # coordinated_sell with ≥2 sells triggers second heuristic if coord_sell=True
        assert verdict == "early_buyers_no_link_proven"

    def test_coordinated_sell_with_two_sells_elevates(self):
        """coordinated_sell=True + 2 sells → coordinated_dump."""
        analyses = [
            _make_analysis("W1", BundleWalletVerdict.EARLY_BUYER, sell=True),
            _make_analysis("W2", BundleWalletVerdict.EARLY_BUYER, sell=True),
            _make_analysis("W3", BundleWalletVerdict.EARLY_BUYER),
        ]
        verdict, evidence = _compute_overall_verdict(analyses, [], [], [], set(), True)
        assert verdict == "coordinated_dump_unknown_team"

    def test_evidence_chain_populated(self):
        analyses = [_make_analysis("W1", BundleWalletVerdict.CONFIRMED_TEAM, sell=True)]
        _, evidence = _compute_overall_verdict(analyses, ["W1"], [], [], set(), False)
        assert any("direct on-chain deployer link" in e for e in evidence)
        assert any("fully exited" in e for e in evidence)


# ===================================================================
# Constants sanity
# ===================================================================

def test_max_bundle_wallets_cap():
    assert _MAX_BUNDLE_WALLETS == 10


def test_bundle_slot_window_is_20():
    """Ensure the widened slot window is 20 (~8s)."""
    assert _BUNDLE_SLOT_WINDOW == 20


# ===================================================================
# _collect_window_sigs (async, mock RPC)
# ===================================================================

class TestCollectWindowSigs:

    @pytest.fixture
    def mock_rpc(self):
        """Minimal mock for SolanaRpcClient with programmable _call."""
        class MockRPC:
            def __init__(self):
                self.call_log: list[tuple] = []
                self._pages: list[list[dict]] = []
                self._page_idx = 0

            async def _call(self, method, params, **kwargs):
                self.call_log.append((method, params))
                if self._page_idx < len(self._pages):
                    page = self._pages[self._page_idx]
                    self._page_idx += 1
                    return page
                return []
        return MockRPC()

    @pytest.mark.asyncio
    async def test_single_page_all_in_window(self, mock_rpc):
        """All sigs in a single sub-1000 page within the window."""
        creation_slot = 100
        mock_rpc._pages = [
            [  # < 1000 entries → last page
                {"signature": "sig1", "slot": 102},
                {"signature": "sig2", "slot": 101},
                {"signature": "sig3", "slot": 100},
            ]
        ]
        result = await _collect_window_sigs(mock_rpc, "ADDR", creation_slot)
        assert set(result) == {"sig1", "sig2", "sig3"}

    @pytest.mark.asyncio
    async def test_cross_page_accumulation(self, mock_rpc):
        """Window sigs spanning two pages are both collected."""
        creation_slot = 100
        window_end = creation_slot + _BUNDLE_SLOT_WINDOW  # 120
        # Page 1: 1000 sigs, min_slot > creation_slot (need more pages)
        page1 = [{"signature": f"new_{i}", "slot": 200 + i} for i in range(998)]
        # Add 2 sigs in the window at the end of page 1
        page1.append({"signature": "window_sig_A", "slot": 115})
        page1.append({"signature": "window_sig_B", "slot": 110})
        assert len(page1) == 1000

        # Page 2: has creation_slot (will terminate)
        page2 = [
            {"signature": "window_sig_C", "slot": 105},
            {"signature": "window_sig_D", "slot": 100},
            {"signature": "pre_creation", "slot": 95},  # before window
        ]

        mock_rpc._pages = [page1, page2]
        result = await _collect_window_sigs(mock_rpc, "ADDR", creation_slot)
        # Should have all 4 window sigs from both pages
        assert "window_sig_A" in result
        assert "window_sig_B" in result
        assert "window_sig_C" in result
        assert "window_sig_D" in result
        assert "pre_creation" not in result
        # Sigs with slot > window_end should not be included
        assert not any(s.startswith("new_") for s in result)

    @pytest.mark.asyncio
    async def test_empty_result_no_sigs(self, mock_rpc):
        mock_rpc._pages = []
        result = await _collect_window_sigs(mock_rpc, "ADDR", 100)
        assert result == []

    @pytest.mark.asyncio
    async def test_all_sigs_after_window(self, mock_rpc):
        """All sigs are newer than the window → empty (can't reach creation)."""
        mock_rpc._pages = [
            [{"signature": f"s{i}", "slot": 500 + i} for i in range(5)]
        ]
        result = await _collect_window_sigs(mock_rpc, "ADDR", 100)
        assert result == []


