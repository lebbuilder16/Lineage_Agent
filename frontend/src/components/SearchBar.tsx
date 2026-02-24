"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function SearchBar() {
  const router = useRouter();
  const [value, setValue] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;

    // If it looks like a Solana address (base58, 32-44 chars) → lineage page
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed)) {
      router.push(`/lineage/${trimmed}`);
    } else {
      // Otherwise treat it as a name search
      router.push(`/search?q=${encodeURIComponent(trimmed)}`);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto">
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Enter a Solana mint address or token name…"
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)]
                     px-5 py-4 pr-28 text-base outline-none
                     placeholder:text-[var(--muted)]
                     focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/25
                     transition-all"
        />
        <button
          type="submit"
          className="absolute right-2 top-1/2 -translate-y-1/2
                     rounded-lg bg-[var(--accent)] px-5 py-2 text-sm font-semibold
                     text-white hover:brightness-110 active:scale-95 transition-all"
        >
          Analyze
        </button>
      </div>
    </form>
  );
}
