import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useDebouncedSearch } from "@/hooks/useDebouncedSearch";
import * as api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  searchTokens: vi.fn(),
}));

const mockSearchTokens = vi.mocked(api.searchTokens);

describe("useDebouncedSearch", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockSearchTokens.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("returns empty results for short query (1 char)", () => {
    const { result } = renderHook(() => useDebouncedSearch("a"));
    expect(result.current.results).toHaveLength(0);
    expect(result.current.isLoading).toBe(false);
    expect(mockSearchTokens).not.toHaveBeenCalled();
  });

  it("returns empty results for mint address (Base58 pattern)", () => {
    const { result } = renderHook(() =>
      useDebouncedSearch("So11111111111111111111111111111111111111112")
    );
    expect(result.current.results).toHaveLength(0);
    expect(mockSearchTokens).not.toHaveBeenCalled();
  });

  it("calls searchTokens after debounce delay", async () => {
    const mockResults = [
      {
        mint: "ABCDEFGHIJKLMNOP1234567890abcdef12345678",
        name: "Test Token",
        symbol: "TST",
        image_uri: "",
        price_usd: 0.001,
        market_cap_usd: 100000,
        liquidity_usd: 10000,
        dex_url: "https://dexscreener.com/solana/ABC",
      },
    ];
    mockSearchTokens.mockResolvedValue(mockResults);

    const { result } = renderHook(() => useDebouncedSearch("test"));
    expect(mockSearchTokens).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(400);
      // Allow promises to flush
      await Promise.resolve();
    });

    expect(mockSearchTokens).toHaveBeenCalledWith("test");

    await waitFor(() => {
      expect(result.current.results).toHaveLength(1);
    });
  });

  it("does not call API when query is cleared", () => {
    const { result } = renderHook(() => useDebouncedSearch(""));
    act(() => { vi.advanceTimersByTime(400); });
    expect(mockSearchTokens).not.toHaveBeenCalled();
    expect(result.current.results).toHaveLength(0);
  });
});
