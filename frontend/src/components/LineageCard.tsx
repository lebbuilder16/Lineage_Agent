"use client";

import type { LineageResult } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Shield, Crown, Users } from "lucide-react";

interface Props {
  data: LineageResult;
}

export function LineageCard({ data }: Props) {
  const root = data.root;
  const pct = Math.round(data.confidence * 100);

  const level =
    data.confidence >= 0.7
      ? "high"
      : data.confidence >= 0.4
        ? "medium"
        : "low";

  const levelColors = {
    high: "text-success",
    medium: "text-warning",
    low: "text-destructive",
  };

  const barColors = {
    high: "bg-success",
    medium: "bg-warning",
    low: "bg-destructive",
  };

  return (
    <div className="rounded-lg border border-border bg-card p-6 animate-fade-in">
      <div className="flex items-center gap-2 mb-5">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Shield className="h-4 w-4" />
        </div>
        <h2 className="font-semibold text-lg">Lineage Summary</h2>
      </div>

      <div className="grid sm:grid-cols-3 gap-6">
        {/* Confidence */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Confidence
          </p>
          <p className={cn("text-3xl font-bold tabular-nums", levelColors[level])}>
            {pct}%
          </p>
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all duration-700 ease-out", barColors[level])}
              style={{ width: `${pct}%` }}
            />
          </div>
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
          <p className="font-mono text-xs text-muted-foreground truncate">
            {root?.mint ?? "—"}
          </p>
        </div>

        {/* Family size */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Users className="h-3 w-3" />
            Family Size
          </p>
          <p className="text-3xl font-bold tabular-nums">{data.family_size}</p>
          <p className="text-xs text-muted-foreground">
            {data.derivatives.length} derivative{data.derivatives.length !== 1 ? "s" : ""} detected
          </p>
        </div>
      </div>
    </div>
  );
}
