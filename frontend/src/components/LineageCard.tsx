"use client";

import type { LineageResult } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Shield, Crown, Users } from "lucide-react";
import { RadialGauge } from "./RadialGauge";

interface Props {
  data: LineageResult;
}

export function LineageCard({ data }: Props) {
  const root = data.root;
  const pct = Math.round(data.confidence * 100);

  const level =
    data.confidence >= 0.7 ? "high"
    : data.confidence >= 0.4 ? "medium"
    : "low";

  return (
    <div className="rounded-2xl border border-white/5 bg-card p-6 animate-fade-in hover:border-neon/20 transition-all">
      <div className="flex items-center gap-2 mb-5">
        <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-neon/10 text-neon">
          <Shield className="h-4 w-4" />
        </div>
        <h2 className="display-heading font-bold text-base text-white uppercase tracking-wide">Lineage Summary</h2>
      </div>

      <div className="grid sm:grid-cols-3 gap-6 items-center">
        {/* Confidence — Radial Gauge */}
        <div className="flex flex-col items-center sm:items-start gap-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Confidence
          </p>
          <RadialGauge value={pct} level={level} size={108} />
        </div>

        {/* Root */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Crown className="h-3 w-3" />
            Root Token
          </p>
          <p className="font-semibold truncate">
            {root?.name || root?.symbol || "Unknown"}
          </p>
          <p className="address">{root?.mint ?? "—"}</p>
        </div>

        {/* Family size */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Users className="h-3 w-3" />
            Family Size
          </p>
          <p className={cn("text-3xl font-bold tabular-nums")}>{data.family_size}</p>
          <p className="text-xs text-muted-foreground">
            {data.derivatives.length} derivative{data.derivatives.length !== 1 ? "s" : ""} detected
          </p>
        </div>
      </div>
    </div>
  );
}

