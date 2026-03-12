"use client";

/**
 * /account — user account page.
 *
 * Shows:
 *   - Connected wallet / email
 *   - Current plan
 *   - API key (masked, click to reveal/copy)
 *   - Web watchlist (synced with backend)
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://lineage-agent.fly.dev";

interface Watch {
  id: number;
  sub_type: string;
  value: string;
  created_at: number;
}

export default function AccountPage() {
  const { ready, authenticated, authUser, apiKey, login, logout } = useAuth();
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [watches, setWatches] = useState<Watch[]>([]);
  const [loadingWatches, setLoadingWatches] = useState(false);

  // Fetch server-side watches
  useEffect(() => {
    if (!apiKey) return;
    setLoadingWatches(true);
    fetch(`${API_BASE}/auth/watches`, {
      headers: { "X-API-Key": apiKey },
    })
      .then((r) => r.json())
      .then((data) => setWatches(data.watches ?? []))
      .catch(() => {})
      .finally(() => setLoadingWatches(false));
  }, [apiKey]);

  const copyApiKey = useCallback(() => {
    if (!authUser?.api_key) return;
    navigator.clipboard.writeText(authUser.api_key).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [authUser?.api_key]);

  const removeWatch = useCallback(
    async (id: number) => {
      if (!apiKey) return;
      await fetch(`${API_BASE}/auth/watches/${id}`, {
        method: "DELETE",
        headers: { "X-API-Key": apiKey },
      });
      setWatches((prev) => prev.filter((w) => w.id !== id));
    },
    [apiKey],
  );

  if (!ready) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="h-6 w-6 rounded-full border-2 border-[#622EC3]/30 border-t-[#622EC3] animate-spin" />
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-6 text-center">
        <div className="text-4xl">🔒</div>
        <h1 className="text-2xl font-display font-bold text-white">My Account</h1>
        <p className="text-white/50 max-w-sm">
          Connect your wallet or email to manage alerts, view your API key and sync your watchlist.
        </p>
        <button
          onClick={login}
          className="px-6 py-3 rounded-full bg-[#622EC3] text-white font-bold font-display hover:bg-[#7B45E0] transition-colors shadow-[0_0_12px_rgba(98,46,195,0.4)]"
        >
          Connect
        </button>
      </div>
    );
  }

  const maskedKey = authUser?.api_key
    ? authUser.api_key.slice(0, 8) + "••••••••••••••••••••••••••••••••"
    : "";

  return (
    <div className="max-w-2xl mx-auto py-10 space-y-8">
      <h1 className="text-3xl font-display font-bold text-white">My Account</h1>

      {/* Identity */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
        <h2 className="text-sm font-semibold text-white/40 uppercase tracking-widest">Identity</h2>
        {authUser?.wallet_address && (
          <div>
            <p className="text-xs text-white/40 mb-0.5">Wallet</p>
            <p className="font-mono text-sm text-white break-all">{authUser.wallet_address}</p>
          </div>
        )}
        {authUser?.email && (
          <div>
            <p className="text-xs text-white/40 mb-0.5">Email</p>
            <p className="text-sm text-white">{authUser.email}</p>
          </div>
        )}
        <div className="flex items-center gap-2">
          <p className="text-xs text-white/40">Plan</p>
          {authUser?.plan === "pro" ? (
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-[#622EC3]/20 text-[#B370F0]">PRO</span>
          ) : (
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-white/10 text-white/40">FREE</span>
          )}
        </div>
        <button
          onClick={logout}
          className="text-sm text-red-400 hover:text-red-300 transition-colors"
        >
          Disconnect →
        </button>
      </section>

      {/* API Key */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
        <h2 className="text-sm font-semibold text-white/40 uppercase tracking-widest">API Key</h2>
        <p className="text-xs text-white/40">
          Use this key in the <code className="text-[#53E9F6]">X-API-Key</code> header to access authenticated endpoints.
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 font-mono text-xs bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white break-all">
            {revealed ? authUser?.api_key : maskedKey}
          </code>
          <button
            onClick={() => setRevealed((r) => !r)}
            className="px-3 py-2 rounded-lg border border-white/10 text-xs text-white/50 hover:text-white hover:border-white/20 transition-colors flex-shrink-0"
          >
            {revealed ? "Hide" : "Show"}
          </button>
          <button
            onClick={copyApiKey}
            className="px-3 py-2 rounded-lg border border-white/10 text-xs text-white/50 hover:text-[#53E9F6] hover:border-[#53E9F6]/30 transition-colors flex-shrink-0"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </section>

      {/* Watchlist */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
        <h2 className="text-sm font-semibold text-white/40 uppercase tracking-widest">
          Watches
          {watches.length > 0 && (
            <span className="ml-2 text-[#53E9F6]">{watches.length}</span>
          )}
        </h2>

        {loadingWatches ? (
          <div className="h-4 w-4 rounded-full border-2 border-[#622EC3]/30 border-t-[#622EC3] animate-spin" />
        ) : watches.length === 0 ? (
          <p className="text-sm text-white/30">
            No watches yet. Add deployers or tokens from scan results.
          </p>
        ) : (
          <ul className="space-y-2">
            {watches.map((w) => (
              <li
                key={w.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2"
              >
                <div>
                  <span className="text-[10px] font-bold text-white/30 uppercase mr-2">
                    {w.sub_type}
                  </span>
                  <Link
                    href={`/token/${w.value}`}
                    className="font-mono text-xs text-white/70 hover:text-[#53E9F6] transition-colors"
                  >
                    {w.value.slice(0, 8)}…{w.value.slice(-6)}
                  </Link>
                </div>
                <button
                  onClick={() => removeWatch(w.id)}
                  className="text-white/20 hover:text-red-400 transition-colors"
                  title="Remove"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
