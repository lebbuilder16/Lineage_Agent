"use client";

import type { LineageResult } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Shield, Crown, Users, CheckCircle2, Copy } from "lucide-react";
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

  const isOriginal = data.query_is_root;
  const queryName  = data.query_token?.name || data.query_token?.symbol || data.mint.slice(0, 8);
  const rootName   = data.root?.name || data.root?.symbol || data.root?.mint?.slice(0, 8) || "Unknown";

  return (
    <div className="rounded-2xl border border-white/10 bg-card p-6 animate-fade-in hover:border-[#622EC3]/40 shadow-[0_0_32px_rgba(98,46,195,0.06)] transition-all">
      {/* Original / Clone banner */}
      {isOriginal ? (
        <div className="flex items-center gap-2 mb-4 rounded-lg border border-[#5BC763]/30 bg-[#5BC763]/10 px-3 py-2">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-[#5BC763]" />
          <span className="text-xs font-semibold text-[#5BC763]">Original token</span>
          <span className="ml-auto text-[10px] text-[#5BC763]/60 font-mono">{queryName}</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 mb-4 rounded-lg border border-[#F1AD4B]/30 bg-[#F1AD4B]/10 px-3 py-2">
          <Copy className="h-4 w-4 shrink-0 text-[#F1AD4B]" />
          <span className="text-xs font-semibold text-[#F1AD4B]">Clone</span>
          <span className="text-xs text-[#F1AD4B]/60">of</span>
          <span className="text-xs font-semibold text-[#F1AD4B]/90 truncate max-w-[180px]">{rootName}</span>
        </div>
      )}

      <div className="flex items-center gap-2 mb-5">
        <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-[#622EC3]/20 text-[#B370F0]">
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

