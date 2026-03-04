"use client";

/**
 * AuthGate — blocks access to protected routes until the user authenticates via Privy.
 * The homepage "/" remains public (marketing page).
 *
 * Robustness: if Privy never signals `ready` (bad App ID, network error),
 * a 6-second timeout breaks out of the spinner so the user always sees UI.
 */

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";

const PUBLIC_PATHS = ["/"];
const PRIVY_TIMEOUT_MS = 6000;

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { ready, authenticated, login } = usePrivy();
  const [privyTimedOut, setPrivyTimedOut] = useState(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [loginError, setLoginError] = useState<string | null>(null);
  const mountTime = useRef(Date.now());

  const addLog = (msg: string) => {
    const t = ((Date.now() - mountTime.current) / 1000).toFixed(1);
    setDebugLogs(prev => [...prev.slice(-12), `[+${t}s] ${msg}`]);
  };

  useEffect(() => {
    addLog(`mount | ready=${ready} auth=${authenticated}`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Log every ready/authenticated change
  useEffect(() => {
    addLog(`ready=${ready} auth=${authenticated}`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, authenticated]);

  // Safety valve — if Privy never becomes ready, unblock the UI after 6 s
  useEffect(() => {
    if (ready) return;
    const t = setTimeout(() => {
      setPrivyTimedOut(true);
      addLog("TIMEOUT — privy never became ready");
    }, PRIVY_TIMEOUT_MS);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Public routes — always render
  if (PUBLIC_PATHS.includes(pathname ?? "/")) return <>{children}</>;

  // Privy still initialising and within timeout — show spinner
  if (!ready && !privyTimedOut) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="h-8 w-8 rounded-full border-2 border-neon/30 border-t-neon animate-spin" />
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
        onClick={() => {
          addLog("login() called");
          setLoginError(null);
          try {
            const p = login();
            if (p && typeof p.then === "function") {
              p.then(() => addLog("login() resolved"))
               .catch((e: unknown) => {
                 const msg = e instanceof Error ? e.message : String(e);
                 addLog(`login() REJECTED: ${msg}`);
                 setLoginError(msg);
               });
            } else {
              addLog("login() returned non-promise");
            }
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            addLog(`login() THREW: ${msg}`);
            setLoginError(msg);
          }
        }}
        className="flex items-center gap-2 px-6 py-3 rounded-full bg-neon text-black font-bold text-sm hover:bg-neon/90 transition-colors"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
        Connect wallet / email
      </button>

      <p className="mt-6 text-xs text-white/20">
        Solana wallet · Email · Free access
      </p>

      {/* ── On-screen debug panel — remove after fix ── */}
      {loginError && (
        <div className="mt-4 w-full max-w-sm rounded-lg bg-red-900/60 border border-red-500/40 px-3 py-2 text-left">
          <p className="text-xs font-bold text-red-400 mb-1">Login error</p>
          <p className="text-xs text-red-300 break-all">{loginError}</p>
        </div>
      )}
      <div className="mt-4 w-full max-w-sm rounded-lg bg-black/60 border border-white/10 px-3 py-2 text-left">
        <p className="text-[10px] font-bold text-white/30 mb-1">
          DEBUG — ready={String(ready)} auth={String(authenticated)} timedOut={String(privyTimedOut)}
        </p>
        {debugLogs.map((l, i) => (
          <p key={i} className="text-[10px] text-white/40 font-mono leading-tight">{l}</p>
        ))}
      </div>
    </div>
  );
}
