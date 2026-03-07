/**
 * Tests for lineage/[mint]/page.tsx — covering the force-refresh additions:
 *  - formatScannedAgo: correct human-readable output via rendered DOM
 *  - "Refresh data" button calls analyze(mint, true)
 *  - button is disabled when isLoading=true
 *  - "Last scanned: unknown" shown when scanned_at is absent
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Heavy deps mocked before importing the page ───────────────────────────────

vi.mock("next/navigation", () => ({
  useParams: vi.fn(() => ({ mint: "TESTMINT111111111111111111111111111111111" })),
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}));

vi.mock("@/lib/useLineageWS");
vi.mock("@/lib/useAnalysisStream");
vi.mock("@/hooks/useWatchlist");

// UI-only stubs so tests don't need to satisfy deep component trees
vi.mock("@/components/HeroCard", () => ({ default: () => <div data-testid="hero-card" /> }));
vi.mock("@/components/WatchButton", () => ({ default: () => <div data-testid="watch-button" /> }));
vi.mock("@/components/forensics/ZombieAlert", () => ({ default: () => null }));
vi.mock("@/components/forensics/ForensicTabs", () => ({ default: () => <div data-testid="forensic-tabs" /> }));
vi.mock("@/components/forensics/OverviewTab", () => ({ default: () => null }));
vi.mock("@/components/forensics/BundleTab", () => ({ default: () => null }));
vi.mock("@/components/forensics/MoneyFlowTab", () => ({ default: () => null }));
vi.mock("@/components/forensics/LineageTab", () => ({ default: () => null }));
vi.mock("@/components/forensics/DeployerTab", () => ({ default: () => null }));
vi.mock("@/components/AnalysisProgress", () => ({ default: () => null }));
vi.mock("@/components/SearchBar", () => ({ SearchBar: () => null }));
vi.mock("@/components/CommandPalette", () => ({ addToHistory: vi.fn() }));
vi.mock("@/components/ChatPanel", () => ({ ChatPanel: () => null }));
vi.mock("@/components/BackButton", () => ({ default: () => null }));
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>>) =>
      React.createElement("div", props, children),
    section: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLElement>>) =>
      React.createElement("section", props, children),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => React.createElement(React.Fragment, null, children),
}));

// ── Import after mocks ────────────────────────────────────────────────────────

import LineagePage from "@/app/lineage/[mint]/page";
import { useLineageWS } from "@/lib/useLineageWS";
import { useAnalysisStream } from "@/lib/useAnalysisStream";
import { useWatchlist } from "@/hooks/useWatchlist";
import type { LineageResult } from "@/lib/api";

const mockUseLineageWS = vi.mocked(useLineageWS);
const mockUseAnalysisStream = vi.mocked(useAnalysisStream);
const mockUseWatchlist = vi.mocked(useWatchlist);

// ── Helper: default no-op hook returns ───────────────────────────────────────

const MINT = "TESTMINT111111111111111111111111111111111";

import type { TokenMetadata } from "@/lib/api";
import type { AnalysisStep, StepState } from "@/lib/useAnalysisStream";

const baseResult: LineageResult = {
  mint: MINT,
  root: { mint: MINT, name: "Test Token", symbol: "TEST" } as unknown as TokenMetadata,
  query_token: { mint: MINT, name: "Test Token", symbol: "TEST" } as unknown as TokenMetadata,
  confidence: 0.9,
  derivatives: [],
  family_size: 1,
  query_is_root: true,
};

function makeHooks(
  overrides: Partial<ReturnType<typeof useLineageWS>> = {},
) {
  const analyze = vi.fn();
  const restoreFromCache = vi.fn(() => false);

  mockUseLineageWS.mockReturnValue({
    data: null,
    isLoading: false,
    error: null,
    progress: null,
    analyze,
    restoreFromCache,
    ...overrides,
  });

  mockUseAnalysisStream.mockReturnValue({
    steps: {} as Record<AnalysisStep, StepState>,
    analysis: null,
    loading: false,
    error: null,
    retryCount: 0,
    retryNow: vi.fn(),
  });

  mockUseWatchlist.mockReturnValue({
    entries: [],
    isWatched: vi.fn(() => false),
    add: vi.fn(),
    remove: vi.fn(),
    toggle: vi.fn(),
    clear: vi.fn(),
    updateRiskScore: vi.fn(),
  });

  return { analyze, restoreFromCache };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("LineagePage — scan-age and Refresh button", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** Helper: now-aligned ISO string `offsetMs` milliseconds in the past/future */
  function isoAgo(offsetMs: number) {
    return new Date(Date.now() - offsetMs).toISOString();
  }

  it("shows 'Last scanned: unknown' when data.scanned_at is null", () => {
    makeHooks({ data: { ...baseResult, scanned_at: null } });
    render(<LineagePage />);
    expect(screen.getByText(/Last scanned: unknown/i)).toBeInTheDocument();
  });

  it("shows 'Last scanned: unknown' when data.scanned_at is undefined", () => {
    makeHooks({ data: { ...baseResult } }); // scanned_at omitted
    render(<LineagePage />);
    expect(screen.getByText(/Last scanned: unknown/i)).toBeInTheDocument();
  });

  it("shows 'Last scanned: Xs ago' for a scan 30 seconds ago", () => {
    makeHooks({ data: { ...baseResult, scanned_at: isoAgo(30_000) } });
    render(<LineagePage />);
    expect(screen.getByText(/Last scanned: \d+s ago/i)).toBeInTheDocument();
  });

  it("shows 'Last scanned: Xh ago' for a scan 2 hours ago", () => {
    makeHooks({ data: { ...baseResult, scanned_at: isoAgo(2 * 3600_000) } });
    render(<LineagePage />);
    expect(screen.getByText(/Last scanned: \d+h ago/i)).toBeInTheDocument();
  });

  it("shows 'Last scanned: Xd ago' for a scan 3 days ago", () => {
    makeHooks({ data: { ...baseResult, scanned_at: isoAgo(3 * 86_400_000) } });
    render(<LineagePage />);
    expect(screen.getByText(/Last scanned: \d+d ago/i)).toBeInTheDocument();
  });

  it("shows 'Last scanned: unknown' for a future scanned_at (clock-skew guard)", () => {
    // 10 minutes in the future
    makeHooks({ data: { ...baseResult, scanned_at: isoAgo(-600_000) } });
    render(<LineagePage />);
    expect(screen.getByText(/Last scanned: unknown/i)).toBeInTheDocument();
  });

  it("renders the 'Refresh data' button when data is loaded", () => {
    makeHooks({ data: baseResult });
    render(<LineagePage />);
    expect(screen.getByRole("button", { name: /Refresh data/i })).toBeInTheDocument();
  });

  it("clicking 'Refresh data' calls analyze(mint, true)", async () => {
    const user = userEvent.setup();
    const { analyze } = makeHooks({ data: baseResult });

    render(<LineagePage />);

    await user.click(screen.getByRole("button", { name: /Refresh data/i }));

    expect(analyze).toHaveBeenCalledWith(MINT, true);
  });

  it("'Refresh data' button is disabled while isLoading=true", () => {
    makeHooks({ data: baseResult, isLoading: true });
    render(<LineagePage />);

    const btn = screen.getByRole("button", { name: /Refresh data/i });
    expect(btn).toBeDisabled();
  });

  it("'Refresh data' button is enabled when isLoading=false", () => {
    makeHooks({ data: baseResult, isLoading: false });
    render(<LineagePage />);

    const btn = screen.getByRole("button", { name: /Refresh data/i });
    expect(btn).not.toBeDisabled();
  });
});
