"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { ZombieAlert as ZombieAlertType } from "@/lib/api";
import { ForensicCard } from "./ForensicCard";

const CONFIDENCE_CONFIG = {
  confirmed: {
    bg: "bg-red-950/80 border-red-500",
    badge: "bg-red-500 text-white",
    icon: "💀",
    label: "CONFIRMED ZOMBIE",
  },
  probable: {
    bg: "bg-orange-950/80 border-orange-500",
    badge: "bg-orange-500 text-white",
    icon: "⚠️",
    label: "PROBABLE ZOMBIE",
  },
  possible: {
    bg: "bg-yellow-950/60 border-yellow-600",
    badge: "bg-yellow-600 text-black",
    icon: "🔍",
    label: "POSSIBLE ZOMBIE",
  },
} as const;

interface Props {
  alert: ZombieAlertType | null | undefined;
}

export default function ZombieAlert({ alert }: Props) {
  // undefined → old backend, hide entirely
  if (alert === undefined) return null;
  // null → new backend, no zombie detected yet
  if (alert === null) {
    return (
      <ForensicCard icon="💀" title="Zombie Token" empty emptyLabel="No resurrections detected">
        <></>
      </ForensicCard>
    );
  }
  const cfg = CONFIDENCE_CONFIG[alert.confidence as keyof typeof CONFIDENCE_CONFIG] ?? CONFIDENCE_CONFIG.probable;

  return (
    <AnimatePresence>
      <motion.div
        key="zombie-alert"
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        className={`w-full rounded-xl border px-4 py-3 text-sm ${cfg.bg} backdrop-blur-sm mb-4`}
      >
        <div className="flex flex-wrap items-start gap-3">
          <span className="text-2xl leading-none">{cfg.icon}</span>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold tracking-wider ${cfg.badge}`}>
                {cfg.label}
              </span>
              {alert.same_deployer && (
                <span className="rounded-full bg-red-700/70 px-2 py-0.5 text-xs text-red-200">
                  Same Deployer
                </span>
              )}
            </div>
            <p className="text-zinc-200 leading-snug">
              This token appears to be a relaunch of{" "}
              <a
                href={`/lineage/${alert.original_mint}`}
                className="font-semibold underline underline-offset-2 hover:text-white"
              >
                {alert.original_name ?? alert.original_mint.slice(0, 8) + "…"}
              </a>
              {alert.original_rugged_at && (
                <> which rugged <span className="font-medium">{formatAge(alert.original_rugged_at)}</span> ago</>
              )}
              .{" "}
              Image similarity:{" "}
              <span className="font-semibold text-white">
                {Math.round(alert.image_similarity * 100)}%
              </span>
            </p>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function formatAge(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days < 1) return "< 1 day";
  if (days === 1) return "1 day";
  if (days < 60) return `${days} days`;
  return `${Math.floor(days / 30)} months`;
}
