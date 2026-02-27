"use client";

import { useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

/* ── Types ─────────────────────────────────────────────────────────── */

export interface TabDef {
  id: string;
  label: string;
  badge?: string | number | null;
  disabled?: boolean;
  icon?: string;
  content: ReactNode;
}

interface Props {
  tabs: TabDef[];
  defaultTab?: string;
}

/* ── Component ─────────────────────────────────────────────────────── */

export default function ForensicTabs({ tabs, defaultTab }: Props) {
  const activeTabs = tabs.filter((t) => !t.disabled);
  const [active, setActive] = useState(
    defaultTab ?? activeTabs[0]?.id ?? tabs[0]?.id,
  );
  const current = tabs.find((t) => t.id === active);

  return (
    <div>
      {/* ── Tab bar ──────────────────────────────────────────────── */}
      <div className="relative flex items-center gap-1 overflow-x-auto scrollbar-hide border-b border-zinc-800 pb-px mb-4">
        {tabs.map((tab) => {
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              disabled={tab.disabled}
              onClick={() => !tab.disabled && setActive(tab.id)}
              className={cn(
                "relative flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-xs font-medium transition-colors rounded-t-lg",
                isActive
                  ? "text-white"
                  : tab.disabled
                    ? "text-zinc-700 cursor-not-allowed"
                    : "text-zinc-500 hover:text-zinc-300",
              )}
            >
              {tab.icon && <span className="text-sm">{tab.icon}</span>}
              {tab.label}
              {tab.badge != null && tab.badge !== "" && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-px text-[9px] font-bold tabular-nums",
                    isActive
                      ? "bg-neon/20 text-neon"
                      : tab.disabled
                        ? "bg-zinc-900 text-zinc-700"
                        : "bg-zinc-800 text-zinc-500",
                  )}
                >
                  {tab.badge}
                </span>
              )}
              {/* Animated underline */}
              {isActive && (
                <motion.div
                  layoutId="forensic-tab-indicator"
                  className="absolute bottom-0 left-0 right-0 h-[2px] bg-neon rounded-full"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* ── Tab content ──────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {current && (
          <motion.div
            key={current.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
          >
            {current.content}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
