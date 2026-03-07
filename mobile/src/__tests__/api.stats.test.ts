/**
 * Unit tests for the mobile API client additions:
 *  - getStatsBrief(): calls /stats/brief and returns StatsBrief
 *  - getGlobalStats(): field names match updated GlobalStats interface
 *
 * These tests use a fetch mock — no running server needed.
 */

// ── Mock expo-secure-store before importing api ───────────────────────────────
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn().mockResolvedValue("test-api-key"),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

// ── Import after mocks ────────────────────────────────────────────────────────
import { getStatsBrief, getGlobalStats } from "@/src/lib/api";
import type { StatsBrief, GlobalStats } from "@/src/types/api";

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockFetch(body: unknown, status = 200) {
  const impl = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
  (globalThis as any).fetch = impl;
  return impl;
}

// ── getStatsBrief ─────────────────────────────────────────────────────────────

describe("getStatsBrief", () => {
  const fakeBrief: StatsBrief = {
    text: "5 rug pulls in the last 24 h (10.0% rug rate). Top narrative: PEPE — 3 active deployers.",
    generated_at: "2026-03-07T12:00:00+00:00",
  };

  beforeEach(() => {
    mockFetch(fakeBrief);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("calls /stats/brief endpoint", async () => {
    const fetchSpy = mockFetch(fakeBrief);
    await getStatsBrief();
    const calledUrl: string = (fetchSpy.mock.calls[0] as [string])[0];
    expect(calledUrl).toContain("/stats/brief");
  });

  it("returns text field from response", async () => {
    mockFetch(fakeBrief);
    const result = await getStatsBrief();
    expect(result.text).toBe(fakeBrief.text);
  });

  it("returns generated_at field from response", async () => {
    mockFetch(fakeBrief);
    const result = await getStatsBrief();
    expect(result.generated_at).toBe(fakeBrief.generated_at);
  });

  it("result shape satisfies StatsBrief interface at runtime", async () => {
    mockFetch(fakeBrief);
    const result = await getStatsBrief();
    expect(typeof result.text).toBe("string");
    expect(typeof result.generated_at).toBe("string");
  });

  it("throws when the server returns an error", async () => {
    mockFetch({ detail: "Internal server error" }, 500);
    await expect(getStatsBrief()).rejects.toThrow();
  });
});

// ── getGlobalStats — field names match updated interface ─────────────────────

describe("getGlobalStats — updated GlobalStats field names", () => {
  const fakeStats: GlobalStats = {
    tokens_scanned_24h: 142,
    tokens_rugged_24h: 18,
    rug_rate_24h_pct: 12.68,
    active_deployers_24h: 31,
    top_narratives: [{ narrative: "pepe", count: 45 }],
    db_events_total: 9821,
    last_updated: "2026-03-07T12:00:00+00:00",
  };

  it("returns tokens_scanned_24h (correct field name)", async () => {
    mockFetch(fakeStats);
    const result = await getGlobalStats();
    expect(result.tokens_scanned_24h).toBe(142);
  });

  it("returns tokens_rugged_24h (correct field name)", async () => {
    mockFetch(fakeStats);
    const result = await getGlobalStats();
    expect(result.tokens_rugged_24h).toBe(18);
  });

  it("returns rug_rate_24h_pct", async () => {
    mockFetch(fakeStats);
    const result = await getGlobalStats();
    expect(result.rug_rate_24h_pct).toBeCloseTo(12.68, 2);
  });

  it("returns db_events_total", async () => {
    mockFetch(fakeStats);
    const result = await getGlobalStats();
    expect(result.db_events_total).toBe(9821);
  });

  it("returns last_updated string", async () => {
    mockFetch(fakeStats);
    const result = await getGlobalStats();
    expect(typeof result.last_updated).toBe("string");
  });

  it("does NOT have the old wrong field total_scanned_24h", async () => {
    mockFetch(fakeStats);
    const result = await getGlobalStats();
    // TypeScript won't compile if old field name is used, but also verify at runtime
    expect((result as any).total_scanned_24h).toBeUndefined();
  });

  it("does NOT have the old wrong field rug_count_24h", async () => {
    mockFetch(fakeStats);
    const result = await getGlobalStats();
    expect((result as any).rug_count_24h).toBeUndefined();
  });
});
