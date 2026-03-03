import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { useWatchlist } from "@/hooks/useWatchlist";

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(window, "localStorage", { value: localStorageMock });

describe("useWatchlist", () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it("starts empty", () => {
    const { result } = renderHook(() => useWatchlist());
    expect(result.current.entries).toHaveLength(0);
  });

  it("adds an item", async () => {
    const { result } = renderHook(() => useWatchlist());
    act(() => {
      result.current.add({ mint: "ABC123", name: "Test Token", symbol: "TST" });
    });
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.isWatched("ABC123")).toBe(true);
  });

  it("removes an item", () => {
    const { result } = renderHook(() => useWatchlist());
    act(() => {
      result.current.add({ mint: "ABC123", name: "Test Token", symbol: "TST" });
    });
    act(() => {
      result.current.remove("ABC123");
    });
    expect(result.current.entries).toHaveLength(0);
    expect(result.current.isWatched("ABC123")).toBe(false);
  });

  it("toggle adds when not watched", () => {
    const { result } = renderHook(() => useWatchlist());
    act(() => {
      result.current.toggle({ mint: "ABC123", name: "Test", symbol: "T" });
    });
    expect(result.current.isWatched("ABC123")).toBe(true);
  });

  it("toggle removes when already watched", () => {
    const { result } = renderHook(() => useWatchlist());
    act(() => {
      result.current.add({ mint: "ABC123", name: "Test", symbol: "T" });
    });
    act(() => {
      result.current.toggle({ mint: "ABC123", name: "Test", symbol: "T" });
    });
    expect(result.current.isWatched("ABC123")).toBe(false);
  });

  it("clears all items", () => {
    const { result } = renderHook(() => useWatchlist());
    act(() => {
      result.current.add({ mint: "A", name: "A", symbol: "A" });
      result.current.add({ mint: "B", name: "B", symbol: "B" });
    });
    act(() => {
      result.current.clear();
    });
    expect(result.current.entries).toHaveLength(0);
  });

  it("persists across hook instances (via localStorage)", () => {
    const { result: r1 } = renderHook(() => useWatchlist());
    act(() => {
      r1.current.add({ mint: "PERSIST", name: "Persisted", symbol: "P" });
    });
    // Simulate new component mount
    const { result: r2 } = renderHook(() => useWatchlist());
    expect(r2.current.isWatched("PERSIST")).toBe(true);
  });

  it("caps at 50 entries", () => {
    const { result } = renderHook(() => useWatchlist());
    act(() => {
      for (let i = 0; i < 60; i++) {
        result.current.add({ mint: `MINT${i}`, name: `Token${i}`, symbol: `T${i}` });
      }
    });
    expect(result.current.entries.length).toBeLessThanOrEqual(50);
  });
});
