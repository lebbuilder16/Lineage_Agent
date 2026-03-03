"use client";

/**
 * /dashboard — Analytics dashboard
 *
 * Shows:
 * - Recently analysed tokens (from CommandPalette history in localStorage)
 * - Watchlisted tokens with their stored risk scores
 * - Alert feed from the local useAlerts hook
 * - Quick stats summary
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { Trash2, ExternalLink, Star, Bell, Clock, TrendingUp } from "lucide-react";
import { useWatchlist } from "@/hooks/useWatchlist";
import { useAlerts } from "@/hooks/useAlerts";
import { cn } from "@/lib/utils";
import WatchButton from "@/components/WatchButton";

// ── History helpers (mirrors CommandPalette.tsx storage) ─────────────────────
interface HistoryEntry {
  mint: string;
  name: string;
  ts: number;
}
const HISTORY_KEY = "lineage:history";

function readHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

function relativeTime(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function RiskBadge({ score }: { score?: number }) {
  if (score == null) return null;
  const color =
    score >= 75
      ? "bg-red-500/15 text-red-400 border-red-500/30"
      : score >= 55
        ? "bg-orange-500/15 text-orange-400 border-orange-500/30"
        : score >= 31
          ? "bg-yellow-500/15 text-yellow-400 border-yellow-500/30"
          : "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";

  return (
    <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold", color)}>
      {score}
    </span>
  );
}

const TYPE_ICON: Record<string, string> = {
  deployer: "🏭",
  narrative: "📰",
  rug: "🚨",
  info: "ℹ️",
};

// ── Page ─────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const { entries: watchlist, remove: removeWatch, clear: clearWatch } = useWatchlist();
  const { alerts, unreadCount, markAllRead, dismiss, requestPermission } = useAlerts();

  useEffect(() => {
    setHistory(readHistory());
  }, []);

  const clearHistory = () => {
    localStorage.removeItem(HISTORY_KEY);
    setHistory([]);
  };

  const totalAnalyses = history.length;
  const avgRisk =
    watchlist.filter((e) => e.riskScore != null).length > 0
      ? Math.round(
          watchlist
            .filter((e) => e.riskScore != null)
            .reduce((sum, e) => sum + (e.riskScore ?? 0), 0) /
            watchlist.filter((e) => e.riskScore != null).length,
        )
      : null;
  const highRiskCount = watchlist.filter((e) => (e.riskScore ?? 0) >= 75).length;

  return (
    <div className="space-y-8 py-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-display font-bold">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your personal forensic intelligence hub.
        </p>
      </div>

      {/* ── Quick stats ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          {
            icon: <Clock className="h-4 w-4" />,
            label: "Analyses",
            value: totalAnalyses,
            color: "text-blue-400",
          },
          {
            icon: <Star className="h-4 w-4" />,
            label: "Watchlist",
            value: watchlist.length,
            color: "text-amber-400",
          },
          {
            icon: <Bell className="h-4 w-4" />,
            label: "Unread alerts",
            value: unreadCount,
            color: "text-neon",
          },
          {
            icon: <TrendingUp className="h-4 w-4" />,
            label: highRiskCount > 0 ? "High-risk watched" : "Avg risk watched",
            value: highRiskCount > 0 ? `${highRiskCount} 🔴` : avgRisk != null ? avgRisk : "—",
            color: highRiskCount > 0 ? "text-red-400" : "text-muted-foreground",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-white/5 bg-card p-4 space-y-1"
          >
            <div className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", stat.color)}>
              {stat.icon}
              <span>{stat.label}</span>
            </div>
            <p className="text-2xl font-display font-bold">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* ── Grid: watchlist + history ──────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Watchlist */}
        <section className="rounded-xl border border-white/5 bg-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Star className="h-4 w-4 text-amber-400" />
              Watchlist
            </h2>
            {watchlist.length > 0 && (
              <button
                onClick={clearWatch}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-white transition-colors"
              >
                <Trash2 className="h-3 w-3" />
                Clear
              </button>
            )}
          </div>
          <div className="divide-y divide-white/5">
            {watchlist.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-muted-foreground">
                No tokens watched yet.{" "}
                <Link href="/search" className="text-neon hover:underline">
                  Find a token
                </Link>{" "}
                and star it.
              </p>
            ) : (
              watchlist.map((entry) => (
                <div
                  key={entry.mint}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/lineage/${entry.mint}`}
                        className="font-medium text-sm truncate hover:text-neon transition-colors"
                      >
                        {entry.name}
                      </Link>
                      {entry.symbol && (
                        <span className="text-[10px] text-muted-foreground uppercase">
                          {entry.symbol}
                        </span>
                      )}
                      <RiskBadge score={entry.riskScore} />
                    </div>
                    <p className="text-[10px] text-muted-foreground font-mono truncate">
                      {entry.mint}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Link
                      href={`/lineage/${entry.mint}`}
                      className="text-muted-foreground hover:text-white transition-colors"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                    <button
                      onClick={() => removeWatch(entry.mint)}
                      className="text-muted-foreground hover:text-red-400 transition-colors"
                      title="Remove"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Recent analyses */}
        <section className="rounded-xl border border-white/5 bg-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Clock className="h-4 w-4 text-blue-400" />
              Recent analyses
            </h2>
            {history.length > 0 && (
              <button
                onClick={clearHistory}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-white transition-colors"
              >
                <Trash2 className="h-3 w-3" />
                Clear
              </button>
            )}
          </div>
          <div className="divide-y divide-white/5">
            {history.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-muted-foreground">
                No analyses yet.{" "}
                <Link href="/search" className="text-neon hover:underline">
                  Start your first analysis.
                </Link>
              </p>
            ) : (
              history.slice(0, 20).map((entry) => (
                <div
                  key={`${entry.mint}-${entry.ts}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/lineage/${entry.mint}`}
                      className="font-medium text-sm truncate hover:text-neon transition-colors block"
                    >
                      {entry.name}
                    </Link>
                    <p className="text-[10px] text-muted-foreground font-mono truncate">
                      {entry.mint}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-muted-foreground">{relativeTime(entry.ts)}</span>
                    <WatchButton mint={entry.mint} name={entry.name} />
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* ── Alert feed ─────────────────────────────────────────────── */}
      <section className="rounded-xl border border-white/5 bg-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Bell className="h-4 w-4 text-neon" />
            Alert feed
            {unreadCount > 0 && (
              <span className="rounded-full bg-neon px-1.5 py-0.5 text-[9px] font-bold text-black">
                {unreadCount} new
              </span>
            )}
          </h2>
          <div className="flex items-center gap-3">
            <button
              onClick={requestPermission}
              className="text-xs text-muted-foreground hover:text-white transition-colors"
              title="Enable browser push notifications"
            >
              Enable push
            </button>
            {alerts.length > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-muted-foreground hover:text-white transition-colors"
              >
                Mark all read
              </button>
            )}
          </div>
        </div>

        {alerts.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <Bell className="mx-auto h-8 w-8 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No alerts yet.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Use{" "}
              <code className="rounded bg-white/5 px-1 py-0.5 font-mono">/watch deployer</code>{" "}
              in Telegram to monitor wallets.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className={cn(
                  "flex items-start gap-3 px-4 py-3 group hover:bg-white/5 transition-colors",
                  !alert.read && "bg-neon/5",
                )}
              >
                <span className="mt-0.5 text-base leading-none shrink-0">
                  {TYPE_ICON[alert.type] ?? "ℹ️"}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <p className="text-sm font-medium truncate">{alert.title}</p>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {relativeTime(alert.timestamp)}
                    </span>
                    {!alert.read && (
                      <span className="h-1.5 w-1.5 rounded-full bg-neon shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    {alert.body}
                  </p>
                  {alert.mint && (
                    <Link
                      href={`/lineage/${alert.mint}`}
                      className="mt-1 inline-block text-xs text-neon hover:underline"
                    >
                      View report →
                    </Link>
                  )}
                </div>
                <button
                  onClick={() => dismiss(alert.id)}
                  className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-white text-xs transition-opacity"
                  title="Dismiss"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
