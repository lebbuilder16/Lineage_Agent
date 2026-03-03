"use client";

/**
 * AlertBell — notification bell shown in the nav header.
 *
 * Displays an unread badge, opens a dropdown panel listing recent alerts,
 * and marks them as read on open.
 */

import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import Link from "next/link";
import { useAlerts } from "@/hooks/useAlerts";
import { cn } from "@/lib/utils";

function relativeTime(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const TYPE_ICON: Record<string, string> = {
  deployer: "🏭",
  narrative: "📰",
  rug: "🚨",
  info: "ℹ️",
};

export default function AlertBell() {
  const { alerts, unreadCount, markAllRead, dismiss } = useAlerts();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleOpen = () => {
    setOpen((v) => !v);
    if (!open && unreadCount > 0) markAllRead();
  };

  return (
    <div ref={ref} className="relative">
      {/* Bell button */}
      <button
        onClick={handleOpen}
        title="Notifications"
        className={cn(
          "relative flex h-8 w-8 items-center justify-center rounded-full",
          "border border-white/10 bg-white/5 hover:bg-white/10 transition-colors",
        )}
      >
        <Bell className="h-3.5 w-3.5 text-muted-foreground" />
        {unreadCount > 0 && (
          <span
            className={cn(
              "absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center",
              "rounded-full bg-neon text-[9px] font-bold text-black",
              "animate-pulse",
            )}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className={cn(
            "absolute right-0 top-10 z-50 w-80 rounded-xl",
            "border border-white/10 bg-zinc-950 shadow-2xl",
            "overflow-hidden",
          )}
        >
          <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Alerts
            </span>
            {alerts.length > 0 && (
              <button
                onClick={() => alerts.forEach((a) => dismiss(a.id))}
                className="text-[10px] text-muted-foreground hover:text-white transition-colors"
              >
                Clear all
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {alerts.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                No alerts yet.{" "}
                <Link href="/search" className="text-neon hover:underline" onClick={() => setOpen(false)}>
                  Watch a deployer
                </Link>{" "}
                to get notified.
              </p>
            ) : (
              alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={cn(
                    "flex items-start gap-3 border-b border-white/5 px-4 py-3",
                    "hover:bg-white/5 transition-colors group",
                    !alert.read && "bg-neon/5",
                  )}
                >
                  <span className="mt-0.5 text-base leading-none">
                    {TYPE_ICON[alert.type] ?? "ℹ️"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-xs font-medium truncate">{alert.title}</p>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {relativeTime(alert.timestamp)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2">
                      {alert.body}
                    </p>
                    {alert.mint && (
                      <Link
                        href={`/lineage/${alert.mint}`}
                        className="mt-1 inline-block text-[10px] text-neon hover:underline"
                        onClick={() => setOpen(false)}
                      >
                        View report →
                      </Link>
                    )}
                  </div>
                  <button
                    onClick={() => dismiss(alert.id)}
                    className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-white text-xs leading-none transition-opacity"
                    title="Dismiss"
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
