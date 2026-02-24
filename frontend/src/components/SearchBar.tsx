"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Search, ArrowRight } from "lucide-react";
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
          "relative flex items-center rounded-lg border bg-card transition-all duration-200",
          focused
            ? "border-primary ring-2 ring-ring/20 shadow-sm"
            : "border-border hover:border-muted-foreground/30",
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
          placeholder="Paste a Solana mint address or search by name..."
          aria-label="Search for a Solana token by mint address or name"
          className={cn(
            "flex-1 bg-transparent pl-10 pr-28 text-sm outline-none placeholder:text-muted-foreground/60",
            compact ? "h-11" : "h-12 sm:h-14 sm:text-base"
          )}
        />
        <button
          type="submit"
          className={cn(
            "absolute right-1.5 inline-flex items-center gap-1.5 rounded-md px-4 font-medium text-sm",
            "bg-primary text-primary-foreground",
            "hover:bg-primary/90 active:scale-[0.97]",
            "transition-all duration-150",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
