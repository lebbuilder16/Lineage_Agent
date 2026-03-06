// src/components/forensics/ForensicSignalCards.tsx
// Cartes de signaux forensiques scrollables horizontalement

import React from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
} from "react-native";
import { GlassCard } from "@/src/components/ui/GlassCard";
import { RiskBadge } from "@/src/components/ui/RiskBadge";
import { RiskGauge } from "@/src/components/ui/RiskGauge";
import { colors } from "@/src/theme/colors";
import type { LineageResult } from "@/src/types/api";
import { router } from "expo-router";

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
function DeathClockCard({ data }: { data: NonNullable<LineageResult["death_clock"]> }) {
  const died = data.predicted_death
    ? new Date(data.predicted_death).toLocaleDateString()
    : "Unknown";
  return (
    <Section title="☠ DEATH CLOCK" accent={colors.accent.danger}>
      <View style={styles.gaugeWrap}>
        <RiskGauge score={data.confidence ?? 0.5} size={64} strokeWidth={6} />
      </View>
      <Row label="Est. death" value={died} />
      <Row label="Confidence" value={`${Math.round((data.confidence ?? 0) * 100)}%`} />
      {data.reason && (
        <Text style={styles.noteText} numberOfLines={3}>{data.reason}</Text>
      )}
    </Section>
  );
}

function ZombieCard({ data }: { data: NonNullable<LineageResult["zombie_alert"]> }) {
  return (
    <Section title="🧟 ZOMBIE" accent={colors.accent.warning}>
      <View style={styles.gaugeWrap}>
        <RiskGauge score={data.zombie_probability ?? 0} size={64} strokeWidth={6} />
      </View>
      <Row label="Prob." value={`${Math.round((data.zombie_probability ?? 0) * 100)}%`} />
      <Row label="V. before" value={`$${(data.volume_before ?? 0).toLocaleString()}`} />
      <Row label="V. after" value={`$${(data.volume_after ?? 0).toLocaleString()}`} />
    </Section>
  );
}

function BundleCard({ data }: { data: NonNullable<LineageResult["bundle_report"]> }) {
  const risk = data.bundle_risk_score ?? 0;
  return (
    <Section title="📦 BUNDLE" accent={colors.accent.ai}>
      <View style={styles.gaugeWrap}>
        <RiskGauge score={risk} size={64} strokeWidth={6} />
      </View>
      <Row label="Risk score" value={`${Math.round(risk * 100)}%`} />
      <Row label="Bundles" value={data.bundle_count ?? 0} />
      <Row label="Suspicious %" value={`${Math.round((data.suspicious_bundle_pct ?? 0) * 100)}%`} />
    </Section>
  );
}

function OperatorCard({ data }: { data: NonNullable<LineageResult["operator_fingerprint"]> }) {
  return (
    <Section title="🕵️ OPERATOR" accent="#9B8CF7">
      <Row label="Pattern" value={data.pattern ?? "Unknown"} />
      <Row label="Wallets" value={data.operator_wallets?.length ?? 0} />
      <Row label="Chain" value={data.chain ?? "Solana"} />
      {data.similar_tokens && data.similar_tokens.length > 0 && (
        <Row label="Similar" value={data.similar_tokens.length} />
      )}
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
      <Row label="Locked" value={data.is_locked ? "Yes ✓" : "No ✗"} />
    </Section>
  );
}

function FactoryCard({ data }: { data: NonNullable<LineageResult["factory_rhythm"]> }) {
  return (
    <Section title="🏭 FACTORY" accent="#FFB547">
      <Row label="Deploy rate" value={`${data.deploy_rate_per_day?.toFixed(1) ?? "?"}/day`} />
      <Row label="Regularity" value={`${Math.round((data.regularity_score ?? 0) * 100)}%`} />
      <Row label="Variants" value={data.template_variants ?? 0} />
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
      <Row label="Wallets" value={data.insider_wallet_count ?? 0} />
      <Row label="Sold %" value={`${Math.round((data.pct_supply_sold ?? 0) * 100)}%`} />
      <RiskBadge verdict={data.verdict as any} size="sm" style={{ marginTop: 8 }} />
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────
export function ForensicSignalCards({ result }: { result: LineageResult }) {
  const cards: React.ReactNode[] = [];

  if (result.death_clock) cards.push(<DeathClockCard key="dc" data={result.death_clock} />);
  if (result.zombie_alert) cards.push(<ZombieCard key="zb" data={result.zombie_alert} />);
  if (result.bundle_report) cards.push(<BundleCard key="bd" data={result.bundle_report} />);
  if (result.operator_fingerprint) cards.push(<OperatorCard key="op" data={result.operator_fingerprint} />);
  if (result.liquidity_arch) cards.push(<LiquidityCard key="lq" data={result.liquidity_arch} />);
  if (result.factory_rhythm) cards.push(<FactoryCard key="fc" data={result.factory_rhythm} />);
  if (result.insider_sell) cards.push(<InsiderCard key="is" data={result.insider_sell} />);

  if (cards.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No forensic signals detected</Text>
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scroll}
    >
      {cards}
    </ScrollView>
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
});
