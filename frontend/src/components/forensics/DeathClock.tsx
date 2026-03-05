"use client";

import { motion } from "framer-motion";
import type { DeathClockForecast as DeathClockForecastType, MarketSignals } from "@/lib/api";
import { ForensicCard } from "./ForensicCard";

const RISK_CONFIG = {
  low: { color: "bg-green-500", text: "text-green-400", label: "Low Risk", widthPct: 15 },
  medium: { color: "bg-yellow-400", text: "text-yellow-400", label: "Medium Risk", widthPct: 45 },
  high: { color: "bg-orange-500", text: "text-orange-400", label: "High Risk", widthPct: 72 },
  critical: { color: "bg-red-500", text: "text-red-400", label: "Critical", widthPct: 95 },
  first_rug: { color: "bg-amber-400", text: "text-amber-400", label: "1st Rug on Record", widthPct: 50 },
  insufficient_data: { color: "bg-zinc-600", text: "text-zinc-400", label: "Insufficient Data", widthPct: 0 },
} as const;

interface Props {
  forecast: DeathClockForecastType | null | undefined;
}

export default function DeathClock({ forecast }: Props) {
  if (forecast === undefined) return null;
  if (forecast === null || forecast.risk_level === "insufficient_data") {
    return (
      <ForensicCard icon="☠️" title="Death Clock" empty emptyLabel="No prior rugs on record for this deployer">
        <></>
      </ForensicCard>
    );
  }
  const cfg = RISK_CONFIG[forecast.risk_level] ?? RISK_CONFIG.insufficient_data;
  const elapsedPct = Math.min(
    (forecast.elapsed_hours / (forecast.median_rug_hours || 1)) * 100,
    100,
  );

  return (
    <div className="w-full rounded-xl border border-zinc-800 bg-zinc-950/70 px-4 py-3 text-sm mb-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold uppercase tracking-widest text-zinc-400">
          ☠️ Death Clock
        </span>
        <span className={`text-xs font-semibold ${cfg.text}`}>{cfg.label}</span>
      </div>

      {/* Timeline bar */}
      <div className="relative h-3 rounded-full bg-zinc-800 overflow-hidden mb-2">
        {/* Risk zone */}
        <div
          className={`absolute left-0 top-0 h-full rounded-full opacity-30 ${cfg.color}`}
          style={{ width: `${cfg.widthPct}%` }}
        />
        {/* Elapsed cursor */}
        <motion.div
          className="absolute top-0 h-full rounded-full bg-white/80"
          style={{ width: 4, left: `calc(${elapsedPct}% - 2px)` }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        />
      </div>

      <div className="flex justify-between text-xs text-zinc-500 mb-2">
        <span>Launch</span>
        <span>Median rug ({Math.round(forecast.median_rug_hours / 24)}d)</span>
      </div>

      <p className="text-zinc-300 text-xs">
        Based on{" "}
        <span className="text-white font-medium">{forecast.historical_rug_count} prior rugs</span>{" "}
        by this deployer. Elapsed:{" "}
        <span className="font-medium">{Math.round(forecast.elapsed_hours)}h</span> •{" "}
        {forecast.predicted_window_start && forecast.predicted_window_end ? (
          <>
            Predicted window:{" "}
            <span className="text-zinc-200">
              {formatDate(forecast.predicted_window_start)} –{" "}
              {formatDate(forecast.predicted_window_end)}
            </span>
          </>
        ) : (
          <span className="text-zinc-500">{forecast.confidence_note}</span>
        )}
      </p>

      {forecast.market_signals && <MarketSignalsPanel signals={forecast.market_signals} />}
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function MarketSignalsPanel({ signals }: { signals: MarketSignals }) {
  const trend = signals.volume_trend;
  const trendColor =
    trend === "rising" ? "text-emerald-400" : trend === "declining" ? "text-red-400" : "text-zinc-400";
  const trendIcon = trend === "rising" ? "↑" : trend === "declining" ? "↓" : "→";

  const fmt = (v: number | null, decimals = 0, prefix = "") =>
    v == null ? "—" : `${prefix}${v.toLocaleString(undefined, { maximumFractionDigits: decimals })}`;

  const liqRatioColor =
    signals.liq_to_mcap_ratio != null && signals.liq_to_mcap_ratio < 0.005
      ? "text-red-400"
      : signals.liq_to_mcap_ratio != null && signals.liq_to_mcap_ratio < 0.01
      ? "text-orange-400"
      : "text-zinc-300";

  return (
    <div className="mt-3 border-t border-zinc-800 pt-3">
      <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">Market signals</p>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <p className="text-zinc-500">Liquidity</p>
          <p className="font-medium text-zinc-200">{fmt(signals.liquidity_usd, 0, "$")}</p>
        </div>
        <div>
          <p className="text-zinc-500">Market cap</p>
          <p className="font-medium text-zinc-200">{fmt(signals.market_cap_usd, 0, "$")}</p>
        </div>
        <div>
          <p className="text-zinc-500">Liq / MCap</p>
          <p className={`font-medium ${liqRatioColor}`}>
            {signals.liq_to_mcap_ratio != null
              ? `${(signals.liq_to_mcap_ratio * 100).toFixed(2)}%`
              : "—"}
          </p>
        </div>
        <div>
          <p className="text-zinc-500">1h price</p>
          <p
            className={`font-medium ${
              signals.price_change_h1_pct != null && signals.price_change_h1_pct < 0
                ? "text-red-400"
                : "text-emerald-400"
            }`}
          >
            {signals.price_change_h1_pct != null
              ? `${signals.price_change_h1_pct > 0 ? "+" : ""}${signals.price_change_h1_pct.toFixed(1)}%`
              : "—"}
          </p>
        </div>
        <div>
          <p className="text-zinc-500">Sell pressure</p>
          <p
            className={`font-medium ${
              signals.sell_pressure_pct != null && signals.sell_pressure_pct > 60
                ? "text-red-400"
                : "text-zinc-300"
            }`}
          >
            {fmt(signals.sell_pressure_pct, 0)}%
          </p>
        </div>
        <div>
          <p className="text-zinc-500">Vol trend</p>
          <p className={`font-medium ${trendColor}`}>
            {trendIcon} {trend}
          </p>
        </div>
      </div>
      {signals.adjusted_risk_boost > 0 && (
        <p className="mt-2 text-[10px] text-orange-400">
          ⚡ Risk boost +{signals.adjusted_risk_boost.toFixed(1)} from market signals
        </p>
      )}
    </div>
  );
}
