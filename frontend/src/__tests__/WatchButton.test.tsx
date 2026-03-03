import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import WatchButton from "@/components/WatchButton";
import * as watchlistHook from "@/hooks/useWatchlist";

// Mock useWatchlist hook
vi.mock("@/hooks/useWatchlist", () => ({
  useWatchlist: vi.fn(),
}));

const mockUseWatchlist = vi.mocked(watchlistHook.useWatchlist);

describe("WatchButton", () => {
  const mockToggle = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders 'Watch' label when not watched and showLabel=true", () => {
    mockUseWatchlist.mockReturnValue({
      items: [],
      add: vi.fn(),
      remove: vi.fn(),
      toggle: mockToggle,
      isWatched: () => false,
      clear: vi.fn(),
    });

    render(
      <WatchButton
        mint="MINT123"
        name="Test Token"
        symbol="TST"
        showLabel
      />
    );

    expect(screen.getByText("Watch")).toBeInTheDocument();
  });

  it("renders 'Watching' label when already watched", () => {
    mockUseWatchlist.mockReturnValue({
      items: [{ mint: "MINT123", name: "Test Token", symbol: "TST", addedAt: Date.now() }],
      add: vi.fn(),
      remove: vi.fn(),
      toggle: mockToggle,
      isWatched: () => true,
      clear: vi.fn(),
    });

    render(
      <WatchButton
        mint="MINT123"
        name="Test Token"
        symbol="TST"
        showLabel
      />
    );

    expect(screen.getByText("Watching")).toBeInTheDocument();
  });

  it("calls toggle when clicked", () => {
    mockUseWatchlist.mockReturnValue({
      items: [],
      add: vi.fn(),
      remove: vi.fn(),
      toggle: mockToggle,
      isWatched: () => false,
      clear: vi.fn(),
    });

    render(<WatchButton mint="MINT123" name="Test Token" showLabel />);
    fireEvent.click(screen.getByRole("button"));

    expect(mockToggle).toHaveBeenCalledWith({
      mint: "MINT123",
      name: "Test Token",
      symbol: undefined,
      riskScore: undefined,
    });
  });

  it("has correct title for watched state", () => {
    mockUseWatchlist.mockReturnValue({
      items: [],
      add: vi.fn(),
      remove: vi.fn(),
      toggle: mockToggle,
      isWatched: () => true,
      clear: vi.fn(),
    });

    render(<WatchButton mint="MINT123" name="Test Token" />);
    expect(screen.getByRole("button")).toHaveAttribute("title", "Remove from watchlist");
  });

  it("has correct title for unwatched state", () => {
    mockUseWatchlist.mockReturnValue({
      items: [],
      add: vi.fn(),
      remove: vi.fn(),
      toggle: mockToggle,
      isWatched: () => false,
      clear: vi.fn(),
    });

    render(<WatchButton mint="MINT123" name="Test Token" />);
    expect(screen.getByRole("button")).toHaveAttribute("title", "Add to watchlist");
  });
});
