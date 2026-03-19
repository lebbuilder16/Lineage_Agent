"""Tests for chat_service — rich context builder."""
import pytest
from lineage_agent.chat_service import build_rich_context, get_system_prompt, _fmt


class TestFmt:
    def test_millions(self):
        assert _fmt(5_400_000) == "5.40M"

    def test_thousands(self):
        assert _fmt(92_239) == "92.2K"

    def test_small(self):
        assert _fmt(42.5) == "42.50"


class TestBuildRichContext:
    @pytest.fixture()
    def lineage_result(self):
        return {
            "mint": "A35d6iCMuM9CLux6AoqiNAnnYpBbyM9pGH5V6KKGpump",
            "root": {
                "mint": "AGS6D1m3X7LLYNB3wf8jD4Xgun5EhmybHBGGDLCcpump",
                "name": "Digital Collectible Solana",
                "symbol": "SOL#000",
                "deployer": "",
                "market_cap_usd": 1578.0,
                "liquidity_usd": 3150.62,
                "created_at": "2026-03-18T08:17:54Z",
            },
            "query_token": {
                "mint": "A35d6iCMuM9CLux6AoqiNAnnYpBbyM9pGH5V6KKGpump",
                "name": "Digital Collectible Solana",
                "symbol": "SOL#000",
                "deployer": "BEESwgY2Z77xS5zNQkiZebN5zLLRZySzYcNDMJCfhgFF",
                "market_cap_usd": 92239.0,
                "liquidity_usd": 26781.76,
                "created_at": "2026-03-18T08:26:38Z",
                "lifecycle_stage": "dex_listed",
                "market_surface": "dex_pool_observed",
            },
            "confidence": 0.5834,
            "derivatives": [{"mint": "x"}, {"mint": "y"}],
            "family_size": 6,
            "death_clock": {
                "risk_level": "insufficient_data",
                "historical_rug_count": 0,
                "rug_probability_pct": None,
                "median_rug_hours": 0.0,
                "elapsed_hours": 7.85,
                "predicted_window_start": None,
                "predicted_window_end": None,
                "confidence_level": "low",
                "confidence_note": "No prior rug events",
                "prediction_basis": "insufficient",
                "sample_count": 0,
                "basis_breakdown": {},
                "is_factory": False,
            },
            "insider_sell": {
                "verdict": "suspicious",
                "deployer_exited": True,
                "flags": ["DEPLOYER_EXITED"],
                "sell_pressure_1h": 0.444,
                "sell_pressure_6h": 0.329,
                "price_change_1h": -0.92,
                "price_change_24h": 138.0,
            },
            "bundle_report": None,
            "operator_fingerprint": {
                "fingerprint": "8ff4f201a73d3f14",
                "linked_wallets": ["w1", "w2", "w3"],
                "upload_service": "ipfs",
                "description_pattern": "digital collectible solana",
                "confidence": "confirmed",
            },
            "liquidity_arch": {
                "concentration_hhi": 0.999,
                "pool_count": 3,
                "pools": {"pumpswap": 26774.78, "meteora": 6.98},
                "authenticity_score": 1.0,
            },
            "sol_flow": {
                "total_extracted_sol": 0.6409,
                "total_extracted_usd": None,
                "deployer": "8QzeANwShWVdZKntpCRcd9bTMPtYA1n7aT4Hx6cAbTsc",
                "hop_count": 3,
                "known_cex_detected": False,
                "rug_timestamp": "2026-03-18T11:02:40Z",
                "terminal_wallets": ["8o6ru18N"],
                "flows": [
                    {"from_address": "A", "to_address": "B", "hop": 0, "amount_sol": 0.28},
                    {"from_address": "A", "to_address": "C", "hop": 0, "amount_sol": 0.36},
                    {"from_address": "B", "to_address": "D", "hop": 1, "amount_sol": 0.25},
                ],
            },
            "zombie_alert": None,
        }

    def test_uses_query_token(self, lineage_result):
        ctx = build_rich_context(lineage_result)
        # Should use query_token's market cap (92.2K), not root's (1.6K)
        assert "$92.2K" in ctx
        assert "BEESwgY2Z77" in ctx

    def test_includes_death_clock(self, lineage_result):
        ctx = build_rich_context(lineage_result)
        assert "DEATH CLOCK:" in ctx
        assert "insufficient_data" in ctx

    def test_includes_insider_sell(self, lineage_result):
        ctx = build_rich_context(lineage_result)
        assert "INSIDER SELL:" in ctx
        assert "DEPLOYER_EXITED" in ctx
        assert "44.4%" in ctx

    def test_includes_operator(self, lineage_result):
        ctx = build_rich_context(lineage_result)
        assert "OPERATOR:" in ctx
        assert "8ff4f201" in ctx
        assert "Linked wallets: 3" in ctx

    def test_includes_sol_flow_summary(self, lineage_result):
        ctx = build_rich_context(lineage_result)
        assert "SOL FLOW:" in ctx
        assert "0.6409 SOL" in ctx
        assert "USD conversion unavailable" in ctx
        assert "Unique wallets in flow:" in ctx

    def test_no_bundle_message(self, lineage_result):
        ctx = build_rich_context(lineage_result)
        assert "BUNDLE REPORT: no bundle detected" in ctx

    def test_derivative_lineage(self, lineage_result):
        ctx = build_rich_context(lineage_result)
        assert "derivative/clone" in ctx
        assert "2 total derivative" in ctx

    def test_sol_price_warning(self, lineage_result):
        ctx = build_rich_context(lineage_result)
        assert "Do NOT state or assume a SOL price" in ctx

    def test_empty_result(self):
        ctx = build_rich_context({"mint": "abc123"})
        assert "Scan data incomplete" in ctx

    def test_liquidity_arch(self, lineage_result):
        ctx = build_rich_context(lineage_result)
        assert "LIQUIDITY ARCHITECTURE:" in ctx
        assert "HHI: 0.999" in ctx
        assert "pumpswap" in ctx


class TestGetSystemPrompt:
    def test_loads_skill(self):
        prompt = get_system_prompt()
        assert "Lineage" in prompt
        assert len(prompt) > 100
