"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Search, Clock, TrendingUp, ArrowRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

const HISTORY_KEY = "lineage_history";
const MAX_HISTORY = 8;

interface HistoryEntry {
  mint: string;
  name: string;
  ts: number;
}

function getHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function addToHistory(mint: string, name: string) {
  try {
    const prev = getHistory().filter((h) => h.mint !== mint);
    const next = [{ mint, name, ts: Date.now() }, ...prev].slice(0, MAX_HISTORY);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {}
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  // Open on ⌘K / Ctrl+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || e.key === "/") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  useEffect(() => {
    if (open) setHistory(getHistory());
  }, [open]);

  const navigate = useCallback(
    (mint: string) => {
      setOpen(false);
      setQuery("");
      router.push(`/lineage/${mint}`);
    },
    [router]
  );

  const handleSubmit = useCallback(() => {
    const trimmed = query.trim();
    if (!trimmed) return;
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed)) {
      navigate(trimmed);
    } else {
      setOpen(false);
      setQuery("");
      router.push(`/search?q=${encodeURIComponent(trimmed)}`);
    }
  }, [query, navigate, router]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4"
      onClick={() => setOpen(false)}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />

      {/* Panel */}
      <div
        className="relative w-full max-w-lg rounded-2xl border border-white/10 bg-[#0f0f0f] shadow-2xl overflow-hidden animate-fade-in-scale"
        onClick={(e) => e.stopPropagation()}
      >
        <Command shouldFilter={false} className="[&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-display [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:text-white/30 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5">

          {/* Input */}
          <div className="flex items-center border-b border-white/5 px-3 gap-2">
            <Search className="h-4 w-4 text-neon shrink-0" />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder="Paste a mint address or search by name..."
              className="flex-1 bg-transparent py-3.5 text-sm outline-none placeholder:text-muted-foreground/60"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit();
              }}
            />
            {query && (
              <button onClick={() => setQuery("")} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <kbd className="hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground ml-1">
              ESC
            </kbd>
          </div>

          <Command.List className="max-h-72 overflow-y-auto py-1.5">
            <Command.Empty className="py-8 text-center text-sm text-muted-foreground">
              No results — press Enter to search
            </Command.Empty>

            {/* Direct navigation for mint addresses */}
            {query && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(query.trim()) && (
              <Command.Group heading="Analyse">
                <Command.Item
                  onSelect={() => navigate(query.trim())}
                  className={itemClass}
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-neon/10 text-neon shrink-0">
                    <ArrowRight className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Analyse this token</p>
                    <p className="text-xs text-muted-foreground font-mono truncate">{query.trim()}</p>
                  </div>
                </Command.Item>
              </Command.Group>
            )}

            {/* History */}
            {history.length > 0 && !query && (
              <Command.Group heading="Recent">
                {history.map((h) => (
                  <Command.Item
                    key={h.mint}
                    onSelect={() => navigate(h.mint)}
                    className={itemClass}
                  >
                    <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-white/5 text-white/40 shrink-0">
                      <Clock className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{h.name}</p>
                      <p className="text-xs text-muted-foreground font-mono truncate">{h.mint.slice(0, 16)}…</p>
                    </div>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* Search suggestion when text query */}
            {query && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(query.trim()) && (
              <Command.Group heading="Search">
                <Command.Item
                  onSelect={handleSubmit}
                  className={itemClass}
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-white/5 text-neon shrink-0">
                    <TrendingUp className="h-3.5 w-3.5" />
                  </div>
                  <p className="text-sm">
                    Search for{" "}
                    <span className="font-medium text-foreground">&quot;{query}&quot;</span>
                  </p>
                </Command.Item>
              </Command.Group>
            )}
          </Command.List>
        </Command>

        {/* Footer hint */}
        <div className="border-t border-white/5 px-3 py-2 flex items-center gap-3 text-[10px] text-white/30">
          <span><kbd className="font-mono">↑↓</kbd> navigate</span>
          <span><kbd className="font-mono">↵</kbd> select</span>
          <span><kbd className="font-mono">esc</kbd> close</span>
          <span className="ml-auto hidden sm:inline text-neon/60">⌘K to open anywhere</span>
        </div>
      </div>
    </div>
  );
}

const itemClass = cn(
  "flex items-center gap-3 px-3 py-2 rounded-xl mx-1.5 cursor-pointer",
  "transition-colors data-[selected=true]:bg-white/5 data-[selected=true]:text-white",
  "hover:bg-white/5"
);
