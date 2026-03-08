// src/components/forensics/ForensicSignalCards.tsx
// Cartes de signaux forensiques scrollables horizontalement

import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { GlassCard } from "@/src/components/ui/GlassCard";
import { RiskBadge } from "@/src/components/ui/RiskBadge";
import { RiskGauge } from "@/src/components/ui/RiskGauge";
import { colors } from "@/src/theme/colors";
import type { LineageResult, CartelCommunity } from "@/src/types/api";
import { router } from "expo-router";
import { getBundleReport, getSolTrace } from "@/src/lib/api";

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function Section({
  title,
  accent,
  children,
}: {
  title: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <GlassCard style={[styles.card, { borderColor: accent }]}>
      <Text style={[styles.cardTitle, { color: accent }]}>{title}</Text>
      {children}
    </GlassCard>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Individual signal cards
// ─────────────────────────────────────────────────────────────
export const RISK_SCORE: Record<string, number> = {
  low: 0.1,
  medium: 0.4,
  high: 0.7,
  critical: 0.95,
  first_rug: 0.9,
  insufficient_data: 0.2,
};

function DeathClockCard({ data }: { data: NonNullable<LineageResult["death_clock"]> }) {
  const score = RISK_SCORE[data.risk_level] ?? 0.2;
  const window = data.predicted_window_start
    ? new Date(data.predicted_window_start).toLocaleDateString()
    : "Unknown";
  return (
    <Section title="☠ DEATH CLOCK" accent={colors.accent.danger}>
      <View style={styles.gaugeWrap}>
        <RiskGauge score={score} size={64} strokeWidth={6} />
      </View>
      <Row label="Risk level" value={data.risk_level.replace("_", " ").toUpperCase()} />
      <Row label="Est. window" value={window} />
      {data.confidence_note ? (
        <Text style={styles.noteText} numberOfLines={3}>{data.confidence_note}</Text>
      ) : null}
    </Section>
  );
}

function ZombieCard({ data }: { data: NonNullable<LineageResult["zombie_alert"]> }) {
  const probMap = { confirmed: 0.95, probable: 0.7, possible: 0.45 };
  const prob = probMap[data.confidence] ?? 0.5;
  return (
    <Section title="🧟 ZOMBIE" accent={colors.accent.warning}>
      <View style={styles.gaugeWrap}>
        <RiskGauge score={prob} size={64} strokeWidth={6} />
      </View>
      <Row label="Confidence" value={data.confidence} />
      <Row label="Same deployer" value={data.same_deployer ? "Yes ✗" : "No"} />
      <Row label="Img similarity" value={`${Math.round(data.image_similarity * 100)}%`} />
    </Section>
  );
}

function BundleCard({ data }: { data: NonNullable<LineageResult["bundle_report"]> }) {
  const totalWallets = data.bundle_wallets?.length ?? 0;
  const teamWallets = (data.confirmed_team_wallets?.length ?? 0) + (data.suspected_team_wallets?.length ?? 0);
  const risk = totalWallets > 0 ? teamWallets / totalWallets : 0;
  return (
    <Section title="📦 BUNDLE" accent={colors.accent.ai}>
      <View style={styles.gaugeWrap}>
        <RiskGauge score={risk} size={64} strokeWidth={6} />
      </View>
      <Row label="Wallets" value={totalWallets} />
      <Row label="Team linked" value={teamWallets} />
      <Row label="SOL extracted" value={`${(data.total_sol_extracted_confirmed ?? 0).toFixed(1)}`} />
    </Section>
  );
}

function OperatorCard({ data }: { data: NonNullable<LineageResult["operator_fingerprint"]> }) {
  return (
    <Section title="🕵️ OPERATOR" accent="#9B8CF7">
      <Row label="Confidence" value={data.confidence} />
      <Row label="Linked wallets" value={data.linked_wallets?.length ?? 0} />
      <Row label="Upload svc" value={data.upload_service ?? "Unknown"} />
      <Row label="Fingerprint" value={data.fingerprint?.slice(0, 8) ?? "—"} />
    </Section>
  );
}

function LiquidityCard({ data }: { data: NonNullable<LineageResult["liquidity_arch"]> }) {
  const auth = data.authenticity_score ?? 0;
  return (
    <Section title="💧 LIQUIDITY" accent="#00C8FF">
      <View style={styles.gaugeWrap}>
        <RiskGauge score={auth} size={64} strokeWidth={6} />
      </View>
      <Row label="Authentic" value={`${Math.round(auth * 100)}%`} />
      <Row label="Pools" value={data.pool_count ?? 0} />
      <Row label="Total liq." value={`$${(data.total_liquidity_usd ?? 0).toLocaleString()}`} />
    </Section>
  );
}

function FactoryCard({ data }: { data: NonNullable<LineageResult["factory_rhythm"]> }) {
  const intervalH = data.median_interval_hours ?? 0;
  const ratePerDay = intervalH > 0 ? (24 / intervalH).toFixed(1) : "?";
  return (
    <Section title="🏭 FACTORY" accent="#FFB547">
      <Row label="Deploy rate" value={`${ratePerDay}/day`} />
      <Row label="Regularity" value={`${Math.round((data.regularity_score ?? 0) * 100)}%`} />
      <Row label="Tokens" value={data.tokens_launched ?? 0} />
      <Row label="Is factory" value={data.is_factory ? "Yes ⚠" : "No"} />
    </Section>
  );
}

function InsiderCard({ data }: { data: NonNullable<LineageResult["insider_sell"]> }) {
  return (
    <Section title="🐀 INSIDER" accent={colors.accent.danger}>
      <View style={styles.gaugeWrap}>
        <RiskGauge score={data.risk_score ?? 0} size={64} strokeWidth={6} />
      </View>
      <Row label="Risk" value={`${Math.round((data.risk_score ?? 0) * 100)}%`} />
      <Row label="Wallets" value={data.wallet_events?.length ?? 0} />
      <Row label="Deployer exited" value={data.deployer_exited ? "Yes ✗" : "No"} />
      <View style={{ marginTop: 8 }}>
        <RiskBadge label={String(data.verdict ?? "")} verdict={data.verdict as any} size="sm" />
      </View>
    </Section>
  );
}

function SolFlowCard({ data }: { data: NonNullable<LineageResult["sol_flow"]> }) {
  const usd = data.total_extracted_usd != null
    ? `$${data.total_extracted_usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    : "—";
  return (
    <Section title="💸 SOL FLOW" accent={colors.accent.warning}>
      <Row label="Extracted SOL" value={`${data.total_extracted_sol.toFixed(2)} SOL`} />
      <Row label="Extracted USD" value={usd} />
      <Row label="Hops" value={data.hop_count} />
      <Row label="Terminal wallets" value={data.terminal_wallets.length} />
      <Row label="CEX detected" value={data.known_cex_detected ? "Yes ⚠" : "No"} />
    </Section>
  );
}

function CartelCard({ data }: { data: NonNullable<CartelCommunity> }) {
  const confScore = data.confidence === "high" ? 0.9 : data.confidence === "medium" ? 0.5 : 0.2;
  return (
    <Section title="🕸 CARTEL" accent={colors.accent.danger}>
      <View style={styles.gaugeWrap}>
        <RiskGauge score={confScore} size={64} strokeWidth={6} />
      </View>
      <Row label="Tokens launched" value={data.total_tokens_launched} />
      <Row label="Total rugs" value={data.total_rugs} />
      <Row
        label="Extracted USD"
        value={`$${data.estimated_extracted_usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
      />
      <Row label="Signal" value={data.strongest_signal} />
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────
// Pending / null-state cards (analysis not yet complete)
// ─────────────────────────────────────────────────────────────
function PendingCard({
  title,
  accent,
  onTrigger,
}: {
  title: string;
  accent: string;
  onTrigger: () => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const trigger = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await onTrigger();
      setDone(true);
    } catch {
      // silently ignore — result will appear on next lineage refresh
    } finally {
      setLoading(false);
    }
  };

  return (
    <GlassCard style={[styles.card, { borderColor: accent }]}>
      <Text style={[styles.cardTitle, { color: accent }]}>{title}</Text>
      <View style={styles.pendingBody}>
        {loading ? (
          <ActivityIndicator color={accent} size="small" />
        ) : (
          <Text style={styles.pendingIcon}>{done ? "✓" : "⏳"}</Text>
        )}
        <Text style={styles.pendingText}>
          {done ? "Analysis queued\nRefresh for results" : "Not yet analyzed"}
        </Text>
      </View>
      {!done && (
        <TouchableOpacity
          onPress={trigger}
          style={[styles.triggerBtn, { borderColor: accent }]}
          accessibilityLabel={`Trigger ${title} analysis`}
        >
          <Text style={[styles.triggerTxt, { color: accent }]}>
            {loading ? "Running…" : "Run Analysis"}
          </Text>
        </TouchableOpacity>
      )}
    </GlassCard>
  );
}

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────
export function ForensicSignalCards({
  result,
  onRefresh,
}: {
  result: LineageResult;
  onRefresh?: () => void;
}) {
  const cards: React.ReactNode[] = [];

  if (result.death_clock) cards.push(<DeathClockCard key="dc" data={result.death_clock} />);
  if (result.zombie_alert) cards.push(<ZombieCard key="zb" data={result.zombie_alert} />);

  // Bundle: show real card when available, pending card otherwise
  if (result.bundle_report) {
    cards.push(<BundleCard key="bd" data={result.bundle_report} />);
  } else {
    cards.push(
      <PendingCard
        key="bd-pending"
        title="📦 BUNDLE"
        accent={colors.accent.ai}
        onTrigger={async () => {
          await getBundleReport(result.mint);
          onRefresh?.();
        }}
      />,
    );
  }

  if (result.operator_fingerprint) cards.push(<OperatorCard key="op" data={result.operator_fingerprint} />);
  if (result.liquidity_arch) cards.push(<LiquidityCard key="lq" data={result.liquidity_arch} />);
  if (result.factory_rhythm) cards.push(<FactoryCard key="fc" data={result.factory_rhythm} />);
  if (result.insider_sell) cards.push(<InsiderCard key="is" data={result.insider_sell} />);

  // SOL Flow: show real card when available, pending card otherwise
  if (result.sol_flow) {
    cards.push(<SolFlowCard key="sf" data={result.sol_flow} />);
  } else {
    cards.push(
      <PendingCard
        key="sf-pending"
        title="💸 SOL FLOW"
        accent={colors.accent.warning}
        onTrigger={async () => {
          await getSolTrace(result.mint);
          onRefresh?.();
        }}
      />,
    );
  }

  if (result.cartel_report?.deployer_community) cards.push(<CartelCard key="ct" data={result.cartel_report.deployer_community} />);

  const hasRealSignals = cards.some((c) => {
    // A "real" signal is one that isn't a pending card
    const k = (c as React.ReactElement).key;
    return typeof k === "string" && !k.endsWith("-pending");
  });

  return (
    <View>
      {!hasRealSignals && (
        <Text style={styles.emptyHint}>Analysis in progress — tap cards to trigger</Text>
      )}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {cards}
      </ScrollView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 16, gap: 12, paddingVertical: 4 },
  card: { width: 180, borderWidth: 1.5, padding: 14 },
  cardTitle: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 10,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginVertical: 2,
  },
  rowLabel: { color: colors.text.muted, fontSize: 11 },
  rowValue: { color: colors.text.primary, fontSize: 11, fontWeight: "600" },
  gaugeWrap: { alignItems: "center", marginBottom: 10 },
  noteText: { color: colors.text.secondary, fontSize: 10, marginTop: 6, lineHeight: 14 },
  empty: { alignItems: "center", padding: 24 },
  emptyText: { color: colors.text.muted, fontSize: 13 },
  emptyHint: {
    color: colors.text.muted,
    fontSize: 11,
    textAlign: "center",
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  pendingBody: { alignItems: "center", paddingVertical: 12, gap: 6 },
  pendingIcon: { fontSize: 22 },
  pendingText: { color: colors.text.muted, fontSize: 10, textAlign: "center", lineHeight: 15 },
  triggerBtn: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignItems: "center",
  },
  triggerTxt: { fontSize: 11, fontWeight: "700" },
});
