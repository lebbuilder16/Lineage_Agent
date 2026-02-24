"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Search, ArrowRight, ClipboardPaste } from "lucide-react";
import { cn } from "@/lib/utils";

export function SearchBar({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;

    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed)) {
      router.push(`/lineage/${trimmed}`);
    } else {
      router.push(`/search?q=${encodeURIComponent(trimmed)}`);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto">
      <div
        className={cn(
          "relative flex items-center rounded-2xl border bg-card transition-all duration-200",
          focused
            ? "border-neon/50 ring-2 ring-neon/10 shadow-[0_0_20px_rgba(57,255,20,0.07)]"
            : "border-white/10 hover:border-white/20",
          compact ? "h-11" : "h-12 sm:h-14"
        )}
      >
        <Search className="absolute left-3.5 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Paste a mint address or search by name..."
          aria-label="Search for a Solana token by mint address or name"
          className={cn(
            "flex-1 bg-transparent pl-10 text-sm outline-none placeholder:text-muted-foreground/60",
            compact ? "h-11 pr-24" : "h-12 sm:h-14 sm:text-base pr-24 sm:pr-28"
          )}
        />
        {/* Mobile paste button — only visible when field is empty */}
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
  );
}
