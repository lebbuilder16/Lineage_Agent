"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Uncaught error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-6 py-32 text-center">
      <span className="text-6xl">⚠️</span>
      <h2 className="text-2xl font-bold">Something went wrong</h2>
      <p className="text-[var(--muted)] max-w-md">
        An unexpected error occurred. This has been logged and we&apos;ll look into
        it.
      </p>
      <button
        onClick={reset}
        className="rounded-lg bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-white hover:brightness-110 transition-all"
      >
        Try Again
      </button>
    </div>
  );
}
