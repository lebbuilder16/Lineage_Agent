"use client";

/**
 * AuthGate — blocks access to protected routes until the user authenticates via Privy.
 * The homepage "/" remains public (marketing page).
 */

import { usePathname } from "next/navigation";
import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";

const PUBLIC_PATHS = ["/"];

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { ready, authenticated, login } = usePrivy();
  const [loginLoading, setLoginLoading] = useState(false);

  // Public routes — always render
  if (PUBLIC_PATHS.includes(pathname ?? "/")) return <>{children}</>;

  // Privy initialising — show spinner (wait for real ready state)
  if (!ready) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="h-8 w-8 rounded-full border-2 border-neon/30 border-t-neon animate-spin" />
        <p className="text-xs text-white/30">Connecting to auth…</p>
      </div>
    );
  }

  // Authenticated — render children normally
  if (authenticated) return <>{children}</>;

  // Not authenticated — show access wall
  async function handleLogin() {
    setLoginLoading(true);
    try {
      await login();
    } finally {
      setLoginLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-neon text-black text-2xl font-black font-display mb-6">
        L
      </div>

      <h1 className="text-2xl font-bold font-display text-white mb-2">
        Sign in to continue
      </h1>
      <p className="text-white/50 text-sm max-w-xs mb-8">
        Connect your Solana wallet or use your email to access Lineage intelligence.
      </p>

      <button
        onClick={handleLogin}
        disabled={loginLoading}
        className="flex items-center gap-2 px-6 py-3 rounded-full bg-neon text-black font-bold text-sm hover:bg-neon/90 transition-colors disabled:opacity-60"
      >
        {loginLoading ? (
          <div className="h-4 w-4 rounded-full border-2 border-black/30 border-t-black animate-spin" />
        ) : (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        )}
        {loginLoading ? "Opening…" : "Connect wallet / email"}
      </button>

      <p className="mt-6 text-xs text-white/20">
        Solana wallet · Email · Free access
      </p>
    </div>
  );
}
