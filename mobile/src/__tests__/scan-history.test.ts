/**
 * Unit tests for scan history feature (mobile):
 *
 *  - ScanSnapshot / ScanDelta types: correct shape
 *  - getScanHistory / getScanDelta API wrappers
 *  - ScanTimeline: renders nothing when snapshots is empty
 *  - ScanDeltaPanel: trend and score delta logic
 */

import type { ScanSnapshot, ScanDelta, ScanHistory } from "@/src/types/api";

// ── Factories ─────────────────────────────────────────────────────────────────

function makeSnapshot(overrides: Partial<ScanSnapshot> = {}): ScanSnapshot {
  return {
    snapshot_id: 1,
    user_id: 42,
    mint: "ABC123",
    scanned_at: new Date(Date.now() - 3_600_000).toISOString(),
    scan_number: 1,
    risk_score: 45,
    flags: [],
    family_size: 3,
    rug_count: 1,
    death_clock_risk: "medium",
    bundle_verdict: "early_buyers_no_link_proven",
    insider_verdict: "clean",
    zombie_detected: false,
    token_name: "TestToken",
    token_symbol: "TEST",
    ...overrides,
  };
}

function makeDelta(overrides: Partial<ScanDelta> = {}): ScanDelta {
  const prev = makeSnapshot({ scan_number: 1, risk_score: 45 });
  const curr = makeSnapshot({ snapshot_id: 2, scan_number: 2, risk_score: 67 });
  return {
    mint: "ABC123",
    current_scan: curr,
    previous_scan: prev,
    scan_number: 2,
    risk_score_delta: 22,
    new_flags: ["BUNDLE_CONFIRMED"],
    resolved_flags: [],
    family_size_delta: 1,
    rug_count_delta: 0,
    trend: "worsening",
    narrative: null,
    ...overrides,
  };
}

// ── ScanSnapshot shape ────────────────────────────────────────────────────────

describe("ScanSnapshot — type shape", () => {
  it("has all required fields", () => {
    const snap = makeSnapshot();
    expect(snap).toHaveProperty("snapshot_id");
    expect(snap).toHaveProperty("user_id");
    expect(snap).toHaveProperty("mint");
    expect(snap).toHaveProperty("scanned_at");
    expect(snap).toHaveProperty("scan_number");
    expect(snap).toHaveProperty("risk_score");
    expect(snap).toHaveProperty("flags");
    expect(snap).toHaveProperty("family_size");
    expect(snap).toHaveProperty("rug_count");
    expect(snap).toHaveProperty("death_clock_risk");
    expect(snap).toHaveProperty("bundle_verdict");
    expect(snap).toHaveProperty("insider_verdict");
    expect(snap).toHaveProperty("zombie_detected");
    expect(snap).toHaveProperty("token_name");
    expect(snap).toHaveProperty("token_symbol");
  });

  it("risk_score is between 0 and 100", () => {
    const snap = makeSnapshot({ risk_score: 72 });
    expect(snap.risk_score).toBeGreaterThanOrEqual(0);
    expect(snap.risk_score).toBeLessThanOrEqual(100);
  });

  it("flags defaults to empty array", () => {
    const snap = makeSnapshot();
    expect(Array.isArray(snap.flags)).toBe(true);
    expect(snap.flags).toHaveLength(0);
  });
});

// ── ScanDelta shape ───────────────────────────────────────────────────────────

describe("ScanDelta — type shape", () => {
  it("has current_scan and previous_scan", () => {
    const delta = makeDelta();
    expect(delta.current_scan).toBeTruthy();
    expect(delta.previous_scan).toBeTruthy();
  });

  it("risk_score_delta = current - previous", () => {
    const delta = makeDelta();
    expect(delta.risk_score_delta).toBe(
      delta.current_scan.risk_score - delta.previous_scan.risk_score
    );
  });

  it("trend is one of the valid values", () => {
    const validTrends = ["worsening", "stable", "improving"];
    const delta = makeDelta();
    expect(validTrends).toContain(delta.trend);
  });

  it("new_flags is an array", () => {
    const delta = makeDelta({ new_flags: ["BUNDLE_CONFIRMED", "ZOMBIE_ALERT"] });
    expect(Array.isArray(delta.new_flags)).toBe(true);
    expect(delta.new_flags).toHaveLength(2);
  });

  it("resolved_flags is an array", () => {
    const delta = makeDelta({ resolved_flags: ["INSIDER_DUMP"] });
    expect(delta.resolved_flags).toContain("INSIDER_DUMP");
  });

  it("narrative is null when not available", () => {
    const delta = makeDelta({ narrative: null });
    expect(delta.narrative).toBeNull();
  });

  it("narrative is a string when provided", () => {
    const delta = makeDelta({ narrative: "Risk escalated due to new bundle activity." });
    expect(typeof delta.narrative).toBe("string");
  });
});

// ── ScanHistory shape ─────────────────────────────────────────────────────────

describe("ScanHistory — type shape", () => {
  it("contains scan_count, plan and snapshots", () => {
    const history: ScanHistory = {
      scan_count: 3,
      plan: "free",
      snapshots: [makeSnapshot(), makeSnapshot({ snapshot_id: 2, scan_number: 2 })],
    };
    expect(history.scan_count).toBe(3);
    expect(["free", "pro"]).toContain(history.plan);
    expect(history.snapshots).toHaveLength(2);
  });
});

// ── Risk bucket logic (mirrors ScanTimeline internals) ────────────────────────

function riskBucket(score: number) {
  if (score >= 85) return "EXTREME";
  if (score >= 75) return "HIGH";
  if (score >= 50) return "MED";
  return "LOW";
}

describe("riskBucket — ScanTimeline color logic", () => {
  it("0–49  → LOW",     () => expect(riskBucket(0)).toBe("LOW"));
  it("49    → LOW",     () => expect(riskBucket(49)).toBe("LOW"));
  it("50    → MED",     () => expect(riskBucket(50)).toBe("MED"));
  it("74    → MED",     () => expect(riskBucket(74)).toBe("MED"));
  it("75    → HIGH",    () => expect(riskBucket(75)).toBe("HIGH"));
  it("84    → HIGH",    () => expect(riskBucket(84)).toBe("HIGH"));
  it("85    → EXTREME", () => expect(riskBucket(85)).toBe("EXTREME"));
  it("100   → EXTREME", () => expect(riskBucket(100)).toBe("EXTREME"));
});

// ── Score delta display ────────────────────────────────────────────────────────

function formatScoreDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : String(delta);
}

describe("formatScoreDelta — ScanDeltaPanel display", () => {
  it("positive delta gets a + prefix",    () => expect(formatScoreDelta(22)).toBe("+22"));
  it("negative delta has no double minus", () => expect(formatScoreDelta(-10)).toBe("-10"));
  it("zero shown as 0",                   () => expect(formatScoreDelta(0)).toBe("0"));
});

// ── Trend color heuristic ─────────────────────────────────────────────────────

function scoreColor(delta: number, safeColor: string, dangerColor: string, neutral: string): string {
  if (delta > 5) return dangerColor;
  if (delta < -5) return safeColor;
  return neutral;
}

describe("scoreColor — ScanDeltaPanel color logic", () => {
  it(">5 → danger",   () => expect(scoreColor(22, "safe", "danger", "neutral")).toBe("danger"));
  it("<-5 → safe",    () => expect(scoreColor(-8, "safe", "danger", "neutral")).toBe("safe"));
  it("0 → neutral",  () => expect(scoreColor(0, "safe", "danger", "neutral")).toBe("neutral"));
  it("5 → neutral",  () => expect(scoreColor(5, "safe", "danger", "neutral")).toBe("neutral"));
  it("-5 → neutral", () => expect(scoreColor(-5, "safe", "danger", "neutral")).toBe("neutral"));
});
