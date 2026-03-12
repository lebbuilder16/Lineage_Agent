"use client";

/**
 * AuthGate — blocks access to protected routes until the user authenticates via Privy.
 * The homepage "/" remains public (marketing page).
 *
 * Robustness: if Privy never signals `ready` (bad App ID, network error),
 * a 6-second timeout breaks out of the spinner so the user always sees UI.
 */

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";

const PUBLIC_PATHS = ["/"];
const PRIVY_TIMEOUT_MS = 6000;

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { ready, authenticated, login } = usePrivy();
  const [privyTimedOut, setPrivyTimedOut] = useState(false);

  // Safety valve — if Privy never becomes ready, unblock the UI after 6 s
  useEffect(() => {
    if (ready) return;
    const t = setTimeout(() => setPrivyTimedOut(true), PRIVY_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [ready]);

  // Public routes — always render
  if (PUBLIC_PATHS.includes(pathname ?? "/")) return <>{children}</>;

  // Privy still initialising and within timeout — show spinner
  if (!ready && !privyTimedOut) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="h-8 w-8 rounded-full border-2 border-[#622EC3]/30 border-t-[#622EC3] animate-spin" />
        <p className="text-xs text-white/30">Connecting to auth…</p>
      </div>
    );
  }

  // Authenticated — render children normally
  if (authenticated) return <>{children}</>;

  // Not authenticated (or Privy timed out) — show access wall
  // IMPORTANT: login() must be called synchronously within the click handler
  // to preserve the user gesture context. Awaiting state updates before login()
  // causes browsers to block the Privy popup silently.
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#622EC3] text-white text-2xl font-black font-display mb-6">
        L
      </div>

      <h1 className="text-2xl font-bold font-display text-white mb-2">
        Sign in to continue
      </h1>
      <p className="text-white/50 text-sm max-w-xs mb-8">
        Connect your Solana wallet or use your email to access Lineage intelligence.
      </p>

      <button
        onClick={() => { try { login(); } catch { /* popup blocked — user can retry */ } }}
        className="flex items-center gap-2 px-6 py-3 rounded-full bg-[#622EC3] text-white font-bold text-sm hover:bg-[#7B45E0] transition-colors shadow-[0_0_12px_rgba(98,46,195,0.4)]"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
        Connect wallet / email
      </button>

      <p className="mt-6 text-xs text-white/20">
        Solana wallet · Email · Free access
      </p>
    </div>
  );
}
