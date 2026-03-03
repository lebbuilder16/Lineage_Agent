"use client";

/**
 * WalletButton — connect / disconnect button for the nav bar.
 * Shows a Privy login modal on click, or a dropdown when connected.
 */

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";

function shortenAddress(addr: string | null): string {
  if (!addr) return "";
  return addr.slice(0, 4) + "…" + addr.slice(-4);
}

export default function WalletButton() {
  const { ready, authenticated, authUser, loading, login, logout } = useAuth();
  const [open, setOpen] = useState(false);
  // After 3 s without Privy being ready, show the Connect button anyway
  const [timedOut, setTimedOut] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ready) return;
    const t = setTimeout(() => setTimedOut(true), 3000);
    return () => clearTimeout(t);
  }, [ready]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Show skeleton only during the short init window
  if (!ready && !timedOut) {
    return (
      <div className="h-[38px] w-[90px] rounded-full bg-white/5 border border-white/10 animate-pulse" />
    );
  }

  if (!authenticated) {
    return (
      <button
        onClick={login}
        disabled={loading}
        className="flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-full border border-white/10 bg-white/5 text-white/70 text-sm hover:text-white hover:border-neon/40 hover:bg-neon/5 transition-colors disabled:opacity-50"
        title="Connect wallet or email"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
        <span className="hidden sm:inline">{loading ? "…" : "Connect"}</span>
      </button>
    );
  }

  const displayName =
    shortenAddress(authUser?.wallet_address ?? null) ||
    authUser?.email?.split("@")[0] ||
    "Account";

  const planBadge = authUser?.plan === "pro" ? (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-neon/20 text-neon">PRO</span>
  ) : (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/10 text-white/40">FREE</span>
  );

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-full border border-neon/30 bg-neon/5 text-neon text-sm hover:bg-neon/10 transition-colors"
        title="Account"
      >
        {/* Avatar dot */}
        <span className="h-2 w-2 rounded-full bg-neon flex-shrink-0" />
        <span className="hidden sm:inline font-mono text-xs">{displayName}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-white/10 bg-[#111] shadow-xl z-50 py-1">
          <div className="px-4 py-2 border-b border-white/5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/40">Plan</span>
              {planBadge}
            </div>
            {authUser?.wallet_address && (
              <p className="text-xs text-white/50 font-mono mt-0.5 truncate">
                {authUser.wallet_address}
              </p>
            )}
          </div>

          <Link
            href="/account"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-4 py-2 text-sm text-white/60 hover:text-white hover:bg-white/5 transition-colors"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            My account
          </Link>

          <button
            onClick={() => { logout(); setOpen(false); }}
            className="flex w-full items-center gap-2 px-4 py-2 text-sm text-white/60 hover:text-red-400 hover:bg-white/5 transition-colors"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
