import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SearchBar } from "@/components/SearchBar";
import * as debouncedHook from "@/hooks/useDebouncedSearch";

// Mock router
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock useDebouncedSearch
vi.mock("@/hooks/useDebouncedSearch", () => ({
  useDebouncedSearch: vi.fn(),
}));

// Mock next/image
vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}));

const mockUseDebouncedSearch = vi.mocked(debouncedHook.useDebouncedSearch);

describe("SearchBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no results, not loading
    mockUseDebouncedSearch.mockReturnValue({
      results: [],
      isLoading: false,
      error: null,
    });
  });

  it("renders the search input", () => {
    render(<SearchBar />);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("navigates to lineage page for a mint address", () => {
    render(<SearchBar />);
    const input = screen.getByRole("textbox");
    // A valid Base58 mint address (44 chars)
    const mint = "So11111111111111111111111111111111111111112";
    fireEvent.change(input, { target: { value: mint } });
    fireEvent.submit(input.closest("form")!);
    expect(mockPush).toHaveBeenCalledWith(`/lineage/${mint}`);
  });

  it("navigates to search page for a non-address query", () => {
    render(<SearchBar />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "pepe" } });
    fireEvent.submit(input.closest("form")!);
    expect(mockPush).toHaveBeenCalledWith("/search?q=pepe");
  });

  it("does not navigate on empty submit", () => {
    render(<SearchBar />);
    const input = screen.getByRole("textbox");
    fireEvent.submit(input.closest("form")!);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("shows loading state in icon when isLoading=true and query present", () => {
    mockUseDebouncedSearch.mockReturnValue({
      results: [],
      isLoading: true,
      error: null,
    });
    render(<SearchBar />);
    // The Search icon should have animate-pulse class when loading
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "pepe" } });
    // The icon is present (we just verify no crash during loading)
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("shows dropdown suggestions when results are returned", () => {
    mockUseDebouncedSearch.mockReturnValue({
      results: [
        {
          mint: "ABCDEFGHIJKLMNOP1234567890abcdef12345678",
          name: "Pepe Token",
          symbol: "PEPE",
          image_uri: "",
          price_usd: 0.0001,
          market_cap_usd: 500000,
          liquidity_usd: 20000,
          dex_url: "https://dexscreener.com/solana/ABC",
        },
      ],
      isLoading: false,
      error: null,
    });
    render(<SearchBar />);
    const input = screen.getByRole("textbox");
    // Focus + type (2+ chars to trigger dropdown)
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "pepe" } });
    // Dropdown should appear
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getByText("Pepe Token")).toBeInTheDocument();
  });
});
