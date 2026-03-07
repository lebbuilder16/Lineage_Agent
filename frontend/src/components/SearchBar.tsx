"use client";

import { useRouter } from "next/navigation";
import { useState, useRef, useCallback, type FormEvent, useEffect } from "react";
import { Search, ArrowRight, ClipboardPaste, TrendingUp, AlertTriangle } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { useDebouncedSearch } from "@/hooks/useDebouncedSearch";

function formatMcap(v: number | null): string {
  if (v == null) return "—";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function isMintAddress(q: string) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(q.trim());
}

export function SearchBar({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { results, isLoading } = useDebouncedSearch(value);
  const showDropdown =
    focused && value.trim().length >= 2 && !isMintAddress(value) && (isLoading || results.length > 0);

  // Reset active index when suggestions change
  useEffect(() => {
    setActiveIdx(-1);
  }, [results]);

  function navigateTo(mint: string) {
    setValue("");
    setActiveIdx(-1);
    router.push(`/lineage/${mint}`);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (activeIdx >= 0 && results[activeIdx]) {
      navigateTo(results[activeIdx].mint);
      return;
    }
    const trimmed = value.trim();
    if (!trimmed) return;
    setValue("");
    if (isMintAddress(trimmed)) {
      router.push(`/lineage/${trimmed}`);
    } else {
      router.push(`/search?q=${encodeURIComponent(trimmed)}`);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showDropdown) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, -1));
    } else if (e.key === "Escape") {
      setActiveIdx(-1);
      inputRef.current?.blur();
    }
  }

  // Close dropdown when clicking outside
  const handleMouseDown = useCallback((e: MouseEvent) => {
    if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
      setFocused(false);
    }
  }, []);

  useEffect(() => {
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [handleMouseDown]);

  return (
    <div ref={containerRef} className="w-full max-w-2xl mx-auto relative">
      <form onSubmit={handleSubmit}>
        <div
          className={cn(
            "relative flex items-center rounded-2xl border bg-card transition-all duration-200",
            showDropdown ? "rounded-b-none border-b-0" : "",
            focused
              ? "border-neon/50 ring-2 ring-neon/10 shadow-[0_0_20px_rgba(57,255,20,0.07)]"
              : "border-white/10 hover:border-white/20",
            compact ? "h-11" : "h-12 sm:h-14"
          )}
        >
          <Search
            className={cn(
              "absolute left-3.5 h-4 w-4 pointer-events-none transition-colors",
              isLoading ? "text-neon/70 animate-pulse" : "text-muted-foreground"
            )}
          />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setFocused(true)}
            onKeyDown={handleKeyDown}
            placeholder="Paste a mint address or search by name..."
            aria-label="Search for a Solana token by mint address or name"
            aria-autocomplete="list"
            aria-expanded={showDropdown}
            aria-controls={showDropdown ? "search-suggestions" : undefined}
            aria-activedescendant={activeIdx >= 0 ? `suggestion-${activeIdx}` : undefined}
            autoComplete="off"
            className={cn(
              "flex-1 bg-transparent pl-10 text-sm outline-none placeholder:text-muted-foreground/60",
              compact ? "h-11 pr-24" : "h-12 sm:h-14 sm:text-base pr-24 sm:pr-28"
            )}
          />

          {/* Mobile paste button — only when field is empty */}
          {!value && (
            <button
              type="button"
              onClick={async () => {
                try {
                  const text = await navigator.clipboard.readText();
                  if (text) setValue(text.trim());
                } catch {}
              }}
              className={cn(
                "absolute right-[4.5rem] inline-flex items-center justify-center rounded-md",
                "text-muted-foreground hover:text-foreground transition-colors sm:hidden",
                compact ? "h-8 w-8" : "h-9 w-9"
              )}
              aria-label="Paste from clipboard"
            >
              <ClipboardPaste className="h-3.5 w-3.5" />
            </button>
          )}

          <button
            type="submit"
            className={cn(
              "absolute right-1.5 inline-flex items-center gap-1.5 rounded-full px-4 font-display font-bold text-sm",
              "bg-neon text-black",
              "hover:bg-neon/90 active:scale-[0.97]",
              "transition-all duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon/50",
              compact ? "h-8" : "h-9"
            )}
          >
            Analyze
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </form>

      {/* Autocomplete dropdown */}
      {showDropdown && (
        <div
          className={cn(
            "absolute left-0 right-0 z-50",
            "bg-card border border-neon/50 border-t-0 rounded-b-2xl",
            "shadow-[0_8px_32px_rgba(0,0,0,0.5)]",
            "overflow-hidden"
          )}
        >
          {isLoading && results.length === 0 ? (
            <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
              <span className="h-3 w-3 rounded-full border-2 border-neon/50 border-t-neon animate-spin" />
              Searching...
            </div>
          ) : (
            <ul id="search-suggestions" role="listbox" className="divide-y divide-white/5">
              {results.map((token, idx) => (
                <li
                  key={token.mint}
                  id={`suggestion-${idx}`}
                  role="option"
                  aria-selected={idx === activeIdx}
                  onMouseEnter={() => setActiveIdx(idx)}
                  onMouseDown={(e) => {
                    e.preventDefault(); // prevent input blur
                    navigateTo(token.mint);
                  }}
                  className={cn(
                    "flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors",
                    idx === activeIdx
                      ? "bg-neon/10 text-foreground"
                      : "hover:bg-white/5 text-foreground/80"
                  )}
                >
                  {/* Token image */}
                  <div className="relative h-8 w-8 shrink-0 rounded-full overflow-hidden bg-white/5 flex items-center justify-center">
                    {token.image_uri ? (
                      <Image
                        src={token.image_uri}
                        alt={token.symbol}
                        fill
                        sizes="32px"
                        className="object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <span className="text-xs font-bold text-muted-foreground">
                        {token.symbol.slice(0, 2)}
                      </span>
                    )}
                  </div>

                  {/* Name + symbol */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-sm truncate">{token.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{token.symbol}</span>
                    </div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {token.mint.slice(0, 8)}…{token.mint.slice(-6)}
                    </div>
                  </div>

                  {/* Market cap + low liquidity warning */}
                  <div className="shrink-0 text-right">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <TrendingUp className="h-3 w-3" />
                      <span>{formatMcap(token.market_cap_usd)}</span>
                    </div>
                    {token.liquidity_usd != null && token.liquidity_usd < 5000 && (
                      <div className="flex items-center gap-0.5 text-[10px] text-amber-400/80 justify-end">
                        <AlertTriangle className="h-2.5 w-2.5" />
                        <span>Low liq.</span>
                      </div>
                    )}
                  </div>
                </li>
              ))}

              {/* Footer hint */}
              <li className="px-4 py-2 text-[11px] text-muted-foreground/50 flex justify-between">
                <span>↑↓ navigate · Enter to analyze</span>
                <span>{results.length} result{results.length !== 1 ? "s" : ""}</span>
              </li>
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
