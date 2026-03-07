/**
 * Frontend unit tests for the force-refresh additions in api.ts:
 *  - fetchLineage(mint, forceRefresh)
 *  - fetchLineageWithProgress(mint, cb, signal, forceRefresh)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchLineage, fetchLineageWithProgress } from "@/lib/api";
import type { LineageResult, ProgressEvent } from "@/lib/api";

// ── Shared fixture ────────────────────────────────────────────────────────────

const MINT = "So11111111111111111111111111111111111111112";

import type { TokenMetadata } from "@/lib/api";

const fakeResult: LineageResult = {
  mint: MINT,
  root: { mint: MINT, name: "Wrapped SOL", symbol: "WSOL" } as unknown as TokenMetadata,
  query_token: { mint: MINT, name: "Wrapped SOL", symbol: "WSOL" } as unknown as TokenMetadata,
  confidence: 1.0,
  derivatives: [],
  family_size: 1,
  query_is_root: true,
  scanned_at: "2026-03-07T12:00:00Z",
};

// ── fetchLineage (HTTP path) tests ────────────────────────────────────────────

describe("fetchLineage", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => fakeResult,
    });
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("includes &force_refresh=true in URL when forceRefresh=true", async () => {
    await fetchLineage(MINT, true);

    expect(mockFetch).toHaveBeenCalledOnce();
    const calledUrl: string = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain("force_refresh=true");
    expect(calledUrl).toContain(encodeURIComponent(MINT));
  });

  it("does NOT include force_refresh in URL when forceRefresh is omitted", async () => {
    await fetchLineage(MINT);

    const calledUrl: string = mockFetch.mock.calls[0][0];
    expect(calledUrl).not.toContain("force_refresh");
  });

  it("does NOT include force_refresh in URL when forceRefresh=false", async () => {
    await fetchLineage(MINT, false);

    const calledUrl: string = mockFetch.mock.calls[0][0];
    expect(calledUrl).not.toContain("force_refresh");
  });

  it("returns result with scanned_at from API response", async () => {
    const result = await fetchLineage(MINT);
    expect(result.scanned_at).toBe("2026-03-07T12:00:00Z");
  });
});

// ── fetchLineageWithProgress (WebSocket path) tests ───────────────────────────

/**
 * Minimal WebSocket mock — records sent messages and exposes callbacks so tests
 * can simulate server-side events (onopen, onmessage, onerror, onclose).
 */
class MockWebSocket {
  static instances: MockWebSocket[] = [];

  url: string;
  sentMessages: string[] = [];

  onopen: (() => void) | null = null;
  onmessage: ((evt: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((evt: { wasClean: boolean; code: number }) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sentMessages.push(data);
  }

  close() {
    /* no-op */
  }

  /** Simulate a successful analysis response from the server. */
  simulateSuccess(result: LineageResult) {
    this.onopen?.();
    this.onmessage?.({ data: JSON.stringify({ step: "Analysing…", progress: 50 }) });
    this.onmessage?.({ data: JSON.stringify({ done: true, result }) });
  }
}

describe("fetchLineageWithProgress", () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.stubGlobal("WebSocket", MockWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllTimers();
  });

  it("sends { mint, force_refresh: true } via WS when forceRefresh=true", async () => {
    const progressCalls: ProgressEvent[] = [];
    const promise = fetchLineageWithProgress(
      MINT,
      (evt) => progressCalls.push(evt),
      undefined,
      true,
    );

    const ws = MockWebSocket.instances[0];
    expect(ws).toBeDefined();

    ws.simulateSuccess(fakeResult);
    await promise;

    expect(ws.sentMessages).toHaveLength(1);
    const sent = JSON.parse(ws.sentMessages[0]);
    expect(sent).toMatchObject({ mint: MINT, force_refresh: true });
  });

  it("sends { mint, force_refresh: false } via WS when forceRefresh is omitted", async () => {
    const promise = fetchLineageWithProgress(MINT, vi.fn());

    const ws = MockWebSocket.instances[0];
    ws.simulateSuccess(fakeResult);
    await promise;

    const sent = JSON.parse(ws.sentMessages[0]);
    expect(sent).toMatchObject({ mint: MINT, force_refresh: false });
  });

  it("sends { mint, force_refresh: false } via WS when forceRefresh=false", async () => {
    const promise = fetchLineageWithProgress(MINT, vi.fn(), undefined, false);

    const ws = MockWebSocket.instances[0];
    ws.simulateSuccess(fakeResult);
    await promise;

    const sent = JSON.parse(ws.sentMessages[0]);
    expect(sent.force_refresh).toBe(false);
  });

  it("resolves with result that contains scanned_at", async () => {
    const promise = fetchLineageWithProgress(MINT, vi.fn());

    MockWebSocket.instances[0].simulateSuccess(fakeResult);
    const result = await promise;

    expect(result.scanned_at).toBe(fakeResult.scanned_at);
  });

  it("fires onProgress callback for intermediate steps", async () => {
    const progress: ProgressEvent[] = [];
    const promise = fetchLineageWithProgress(MINT, (e) => progress.push(e));

    MockWebSocket.instances[0].simulateSuccess(fakeResult);
    await promise;

    expect(progress.length).toBeGreaterThan(0);
    expect(progress[0].step).toBe("Analysing…");
  });
});
