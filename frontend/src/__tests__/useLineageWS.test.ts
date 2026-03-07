/**
 * Tests for useLineageWS — focusing on the force-refresh / scanned_at changes:
 *  1. forceRefresh=true clears sessionStorage before fetching
 *  2. forceRefresh flag is forwarded to fetchLineageWithProgress
 *  3. forceRefresh=false (or omitted) never touches sessionStorage
 *  4. HTTP fallback receives forceRefresh
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useLineageWS } from "@/lib/useLineageWS";
import * as api from "@/lib/api";

// ── Shared fake result ────────────────────────────────────────────────────

const MINT = "So11111111111111111111111111111111111111112";

const fakeResult: api.LineageResult = {
  mint: MINT,
  root: { mint: MINT, name: "Wrapped SOL", symbol: "WSOL" },
  query_token: { mint: MINT, name: "Wrapped SOL", symbol: "WSOL" },
  confidence: 1.0,
  derivatives: [],
  family_size: 1,
  query_is_root: true,
  scanned_at: "2026-03-07T12:00:00Z",
};

// ── Mock api module ───────────────────────────────────────────────────────

vi.mock("@/lib/api", async (importOriginal) => {
  const orig = await importOriginal<typeof api>();
  return {
    ...orig,
    fetchLineageWithProgress: vi.fn(),
    fetchLineage: vi.fn(),
  };
});

const mockFetchWS = vi.mocked(api.fetchLineageWithProgress);
const mockFetchHTTP = vi.mocked(api.fetchLineage);

// ── sessionStorage mock ───────────────────────────────────────────────────

const sessionStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    _store: () => store,
  };
})();

Object.defineProperty(window, "sessionStorage", {
  value: sessionStorageMock,
  writable: true,
  configurable: true,
});

// ─────────────────────────────────────────────────────────────────────────────

describe("useLineageWS — forceRefresh behaviour", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorageMock.clear();
    // Token has a deployer AND a bundle_report so writeCache will persist it
    mockFetchWS.mockResolvedValue({
      ...fakeResult,
      query_token: { ...fakeResult.query_token!, deployer: "DeployerABC" },
      bundle_report: { overall_verdict: "clean" } as api.BundleExtractionReport,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("analyze() without forceRefresh does NOT remove sessionStorage entry", async () => {
    // Pre-seed a cache entry
    const cacheKey = `lineage_v1:${MINT}`;
    sessionStorageMock.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data: fakeResult }));
    sessionStorageMock.removeItem.mockClear(); // reset call count after seeding

    const { result } = renderHook(() => useLineageWS());

    act(() => {
      result.current.analyze(MINT); // no forceRefresh
    });

    await waitFor(() => !result.current.isLoading);

    // removeItem should NOT have been called for the cache key
    expect(sessionStorageMock.removeItem).not.toHaveBeenCalledWith(cacheKey);
  });

  it("analyze(mint, true) removes the sessionStorage entry before fetching", async () => {
    const cacheKey = `lineage_v1:${MINT}`;
    sessionStorageMock.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data: fakeResult }));
    sessionStorageMock.removeItem.mockClear();

    const { result } = renderHook(() => useLineageWS());

    act(() => {
      result.current.analyze(MINT, true);
    });

    await waitFor(() => !result.current.isLoading);

    expect(sessionStorageMock.removeItem).toHaveBeenCalledWith(cacheKey);
  });

  it("analyze(mint, true) passes forceRefresh=true to fetchLineageWithProgress", async () => {
    const { result } = renderHook(() => useLineageWS());

    act(() => {
      result.current.analyze(MINT, true);
    });

    await waitFor(() => !result.current.isLoading);

    // 4th argument must be true
    expect(mockFetchWS).toHaveBeenCalledWith(
      MINT,
      expect.any(Function),
      expect.any(AbortSignal),
      true,
    );
  });

  it("analyze(mint) (no flag) passes forceRefresh=undefined to fetchLineageWithProgress", async () => {
    const { result } = renderHook(() => useLineageWS());

    act(() => {
      result.current.analyze(MINT);
    });

    await waitFor(() => !result.current.isLoading);

    expect(mockFetchWS).toHaveBeenCalledWith(
      MINT,
      expect.any(Function),
      expect.any(AbortSignal),
      undefined,
    );
  });

  it("HTTP fallback receives forceRefresh=true when WS fails", async () => {
    // Make WS throw so the fallback path is exercised
    mockFetchWS.mockRejectedValueOnce(new Error("WS failed"));
    mockFetchHTTP.mockResolvedValueOnce(fakeResult);

    const { result } = renderHook(() => useLineageWS());

    act(() => {
      result.current.analyze(MINT, true);
    });

    await waitFor(() => !result.current.isLoading);

    expect(mockFetchHTTP).toHaveBeenCalledWith(MINT, true);
  });

  it("HTTP fallback receives forceRefresh=undefined when WS fails without flag", async () => {
    mockFetchWS.mockRejectedValueOnce(new Error("WS failed"));
    mockFetchHTTP.mockResolvedValueOnce(fakeResult);

    const { result } = renderHook(() => useLineageWS());

    act(() => {
      result.current.analyze(MINT);
    });

    await waitFor(() => !result.current.isLoading);

    expect(mockFetchHTTP).toHaveBeenCalledWith(MINT, undefined);
  });

  it("result data contains scanned_at returned by the API", async () => {
    const { result } = renderHook(() => useLineageWS());

    act(() => {
      result.current.analyze(MINT);
    });

    await waitFor(() => result.current.data !== null);

    expect(result.current.data?.scanned_at).toBe(fakeResult.scanned_at);
  });
});
