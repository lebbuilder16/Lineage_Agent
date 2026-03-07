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
    // Full debug dump — visible in the browser DevTools console
    console.group("[error boundary] Uncaught render error");
    console.error("name   :", error.name);
    console.error("message:", error.message);
    console.error("digest :", error.digest ?? "(none)");
    console.error("stack  :", error.stack);
    console.error("error object:", error);
    console.groupEnd();
  }, [error]);

  const isDev = process.env.NODE_ENV === "development";

  return (
    <div className="flex flex-col items-center justify-center gap-6 py-32 text-center px-4">
      <span className="text-6xl">⚠️</span>
      <h2 className="text-2xl font-bold">Something went wrong</h2>
      <p className="text-muted-foreground max-w-md text-sm">
        An unexpected error occurred. This has been logged and we&apos;ll look into
        it.
      </p>

      {/* Show error details in dev mode so we can diagnose without opening DevTools */}
      {isDev && (
        <div className="w-full max-w-2xl rounded-xl border border-red-500/30 bg-red-950/20 p-4 text-left text-xs font-mono">
          <p className="text-red-400 font-bold mb-1">
            {error.name}: {error.message}
          </p>
          {error.digest && (
            <p className="text-red-400/60 mb-1">digest: {error.digest}</p>
          )}
          {error.stack && (
            <pre className="text-red-300/70 whitespace-pre-wrap break-all leading-relaxed overflow-auto max-h-64">
              {error.stack}
            </pre>
          )}
        </div>
      )}

      <button
        onClick={reset}
        className="rounded-lg bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-white hover:brightness-110 transition-all"
      >
        Try Again
      </button>
    </div>
  );
}
