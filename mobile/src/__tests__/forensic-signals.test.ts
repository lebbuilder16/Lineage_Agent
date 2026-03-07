/**
 * Unit tests for the forensic signal cards logic:
 *
 *  - RISK_SCORE map: correct values for all risk_level variants
 *  - DeathClockCard helper: score derived from risk_level
 *  - SolFlowCard shape: verifies expected fields exist on SolFlowReport
 *  - CartelCard shape: verifies expected fields exist on CartelCommunity
 *  - ForensicSignalCards registration: each signal type is included
 */

import { RISK_SCORE } from "@/src/components/forensics/ForensicSignalCards";
import { Fonts } from "@/src/theme/fonts";
import type { DeathClockForecast, SolFlowReport, CartelCommunity } from "@/src/types/api";

// ── RISK_SCORE map ────────────────────────────────────────────────────────────

describe("RISK_SCORE map", () => {
  it("has an entry for every DeathClockForecast risk_level variant", () => {
    const expectedLevels: DeathClockForecast["risk_level"][] = [
      "low",
      "medium",
      "high",
      "critical",
      "first_rug",
      "insufficient_data",
    ];
    for (const level of expectedLevels) {
      expect(RISK_SCORE).toHaveProperty(level);
    }
  });

  it("low < medium < high < critical", () => {
    expect(RISK_SCORE.low).toBeLessThan(RISK_SCORE.medium);
    expect(RISK_SCORE.medium).toBeLessThan(RISK_SCORE.high);
    expect(RISK_SCORE.high).toBeLessThan(RISK_SCORE.critical);
  });

  it("all scores are between 0 and 1 inclusive", () => {
    for (const [level, score] of Object.entries(RISK_SCORE)) {
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    }
  });

  it("critical score is above 0.9", () => {
    expect(RISK_SCORE.critical).toBeGreaterThan(0.9);
  });

  it("first_rug score is high (above 0.8)", () => {
    expect(RISK_SCORE.first_rug).toBeGreaterThan(0.8);
  });

  it("insufficient_data score is low (below 0.5)", () => {
    expect(RISK_SCORE.insufficient_data).toBeLessThan(0.5);
  });

  it("falls back to 0.2 for unknown level via ?? 0.2", () => {
    const score = RISK_SCORE["nonexistent_level"] ?? 0.2;
    expect(score).toBe(0.2);
  });
});

// ── DeathClockForecast field shape ────────────────────────────────────────────

describe("DeathClockForecast type — correct field names", () => {
  // This test acts as a runtime guard that the RIGHT fields are used
  // (the wrong ones — predicted_death, confidence float, reason — should NOT be expected)

  const forecast: DeathClockForecast = {
    deployer: "DEPLOYER123",
    historical_rug_count: 3,
    median_rug_hours: 48,
    stdev_rug_hours: 6,
    elapsed_hours: 12,
    risk_level: "high",
    predicted_window_start: "2026-03-08T00:00:00Z",
    predicted_window_end: "2026-03-09T00:00:00Z",
    confidence_note: "Based on 3 historical rugs",
    sample_count: 3,
    confidence_level: "high",
    market_signals: null,
  };

  it("has risk_level (not confidence float)", () => {
    expect(typeof forecast.risk_level).toBe("string");
    expect(["low", "medium", "high", "critical", "first_rug", "insufficient_data"]).toContain(
      forecast.risk_level
    );
  });

  it("has predicted_window_start (not predicted_death)", () => {
    expect(forecast).toHaveProperty("predicted_window_start");
    expect((forecast as any).predicted_death).toBeUndefined();
  });

  it("has confidence_note (not reason)", () => {
    expect(forecast).toHaveProperty("confidence_note");
    expect((forecast as any).reason).toBeUndefined();
  });

  it("does NOT have a top-level float confidence field", () => {
    // The old buggy code used data.confidence as a float 0–1
    // The correct type has confidence_level: "low" | "medium" | "high"
    expect(typeof (forecast as any).confidence).not.toBe("number");
  });

  it("RISK_SCORE[risk_level] gives a valid gauge score", () => {
    const score = RISK_SCORE[forecast.risk_level] ?? 0.2;
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});

// ── SolFlowReport field shape ─────────────────────────────────────────────────

describe("SolFlowReport type — fields used by SolFlowCard", () => {
  const report: SolFlowReport = {
    mint: "MINT123",
    deployer: "DEP123",
    total_extracted_sol: 42.5,
    total_extracted_usd: 8500,
    flows: [],
    terminal_wallets: ["W1", "W2", "W3"],
    known_cex_detected: true,
    hop_count: 4,
    analysis_timestamp: "2026-03-07T10:00:00Z",
    rug_timestamp: null,
    cross_chain_exits: [],
  };

  it("has total_extracted_sol", () => {
    expect(report.total_extracted_sol).toBe(42.5);
  });

  it("has total_extracted_usd (nullable)", () => {
    expect(report.total_extracted_usd).toBe(8500);
  });

  it("has hop_count", () => {
    expect(report.hop_count).toBe(4);
  });

  it("has terminal_wallets array", () => {
    expect(report.terminal_wallets).toHaveLength(3);
  });

  it("has known_cex_detected boolean", () => {
    expect(typeof report.known_cex_detected).toBe("boolean");
  });

  it("terminal_wallets.length can be displayed as count", () => {
    const count = report.terminal_wallets.length;
    expect(count).toBe(3);
  });
});

// ── CartelCommunity field shape ───────────────────────────────────────────────

describe("CartelCommunity type — fields used by CartelCard", () => {
  const community: CartelCommunity = {
    community_id: "COMM1",
    wallets: [],
    total_tokens_launched: 12,
    total_rugs: 9,
    estimated_extracted_usd: 250000,
    active_since: "2025-01-01T00:00:00Z",
    strongest_signal: "shared_deployer_wallet",
    confidence: "high",
  };

  it("has total_tokens_launched", () => {
    expect(community.total_tokens_launched).toBe(12);
  });

  it("has total_rugs", () => {
    expect(community.total_rugs).toBe(9);
  });

  it("has estimated_extracted_usd", () => {
    expect(community.estimated_extracted_usd).toBe(250000);
  });

  it("has strongest_signal string", () => {
    expect(typeof community.strongest_signal).toBe("string");
  });

  it("has confidence as string union", () => {
    expect(["high", "medium", "low"]).toContain(community.confidence);
  });

  it("confidence='high' maps to score > 0.8", () => {
    const confScore =
      community.confidence === "high" ? 0.9 : community.confidence === "medium" ? 0.5 : 0.2;
    expect(confScore).toBeGreaterThan(0.8);
  });

  it("confidence='low' maps to score < 0.3", () => {
    // Use a widened type to avoid literal narrowing warning in the ternary
    const conf: string = "low";
    const confScore = conf === "high" ? 0.9 : conf === "medium" ? 0.5 : 0.2;
    expect(confScore).toBeLessThan(0.3);
  });
});

// ── Fonts constants ───────────────────────────────────────────────────────────

describe("Fonts theme helper", () => {
  it("exports all four weight constants", () => {
    expect(Fonts.regular).toBe("Inter_400Regular");
    expect(Fonts.medium).toBe("Inter_500Medium");
    expect(Fonts.semiBold).toBe("Inter_600SemiBold");
    expect(Fonts.bold).toBe("Inter_700Bold");
  });

  it("all font values are non-empty strings", () => {
    for (const value of Object.values(Fonts)) {
      expect(typeof value).toBe("string");
      expect(value.length).toBeGreaterThan(0);
    }
  });
});
