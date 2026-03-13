// src/components/lineage/ScanDeltaPanel.tsx
// Panneau d'évolution entre les deux derniers scans — adapté mobile

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import type { ScanDelta } from "@/src/types/api";
import { colors } from "@/src/theme/colors";
import { useTheme } from "@/src/theme/ThemeContext";

interface Props {
  delta: ScanDelta;
}

const TREND_CONFIG_STABLE_ICON = "→";

const FLAG_COLORS: Record<string, { bg: string; text: string }> = {
  BUNDLE_CONFIRMED:          { bg: `${colors.accent.danger}CC`,  text: "#fff" },
  BUNDLE_SUSPECTED:          { bg: `${colors.accent.warning}CC`, text: "#fff" },
  COORDINATED_DUMP:          { bg: `${colors.accent.amber}CC`,   text: "#000" },
  INSIDER_DUMP:              { bg: `${colors.accent.danger}CC`,  text: "#fff" },
  INSIDER_SUSPICIOUS:        { bg: `${colors.accent.warning}CC`, text: "#000" },
  ZOMBIE_ALERT:              { bg: `${colors.accent.aiLight}CC`, text: "#fff" },
  DEATH_CLOCK_CRITICAL:      { bg: `${colors.risk.critical}EE`,  text: "#fff" },
  DEATH_CLOCK_HIGH:          { bg: `${colors.accent.danger}CC`,  text: "#fff" },
  FACTORY_DETECTED:          { bg: "rgba(107,114,128,0.80)",     text: "#fff" },
  CARTEL_LINKED:             { bg: `${colors.accent.ai}CC`,      text: "#fff" },
  SERIAL_RUGGER:             { bg: `${colors.risk.critical}CC`,  text: "#fff" },
};

function flagLabel(flag: string): string {
  const map: Record<string, string> = {
    BUNDLE_CONFIRMED:     "Bundle confirmed",
    BUNDLE_SUSPECTED:     "Bundle suspected",
    COORDINATED_DUMP:     "Coordinated dump",
    INSIDER_DUMP:         "Insider dump",
    INSIDER_SUSPICIOUS:   "Insider suspicious",
    ZOMBIE_ALERT:         "Zombie alert",
    DEATH_CLOCK_CRITICAL: "Death clock critical",
    DEATH_CLOCK_HIGH:     "Death clock high",
    FACTORY_DETECTED:     "Factory detected",
    CARTEL_LINKED:        "Cartel linked",
    SERIAL_RUGGER:        "Serial rugger",
  };
  return map[flag] ?? flag.replace(/_/g, " ").toLowerCase();
}

/**
 * ScanDeltaPanel — affiche l'évolution entre les 2 derniers scans.
 * Nécessite ≥ 2 scans (delta fourni par l'API).
 */
export function ScanDeltaPanel({ delta }: Props) {
  const { colors: tc } = useTheme();

  const TREND_CONFIG = {
    worsening: { icon: "↑", color: tc.accent.danger, label: "Worsening", borderColor: `${tc.accent.danger}44`, bg: `${tc.accent.danger}12` },
    improving: { icon: "↓", color: tc.accent.safe,   label: "Improving", borderColor: `${tc.accent.safe}44`,   bg: `${tc.accent.safe}12` },
    stable:    { icon: TREND_CONFIG_STABLE_ICON, color: tc.text.muted, label: "Stable", borderColor: tc.glass.border, bg: tc.glass.bg },
  };

  const cfg = TREND_CONFIG[delta.trend as keyof typeof TREND_CONFIG];
  const prev = delta.previous_scan;
  const curr = delta.current_scan;
  const scoreDeltaStr = delta.risk_score_delta > 0
    ? `+${delta.risk_score_delta}`
    : String(delta.risk_score_delta);

  const scoreColor =
    delta.risk_score_delta > 5
      ? tc.accent.danger
      : delta.risk_score_delta < -5
      ? tc.accent.safe
      : tc.text.secondary;

  return (
    <Animated.View
      entering={FadeInDown.springify().damping(20)}
      style={[styles.container, { borderColor: cfg.borderColor, backgroundColor: cfg.bg }]}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={[styles.trendIcon, { color: cfg.color }]}>{cfg.icon}</Text>
          <Text style={[styles.trendLabel, { color: cfg.color }]}>{cfg.label}</Text>
          <Text style={[styles.scanNumbers, { color: tc.text.muted }]}>
            #{prev.scan_number} → #{curr.scan_number}
          </Text>
        </View>
        {/* Score arrow */}
        <View style={styles.scoreRow}>
          <Text style={[styles.scorePrev, { color: tc.text.muted }]}>{prev.risk_score}</Text>
          <Text style={[styles.scoreArrow, { color: tc.text.muted }]}>→</Text>
          <Text style={[styles.scoreCurr, { color: cfg.color }]}>{curr.risk_score}</Text>
          <Text style={[styles.scoreDelta, { color: scoreColor }]}>
            ({scoreDeltaStr})
          </Text>
        </View>
      </View>

      {/* New flags */}
      {delta.new_flags.length > 0 && (
        <View style={styles.flagRow}>
          {delta.new_flags.map((f: string) => {
            const fc = FLAG_COLORS[f] ?? { bg: "#4B5563CC", text: "#fff" };
            return (
              <View key={f} style={[styles.flagChip, { backgroundColor: fc.bg, borderColor: `${colors.accent.danger}66` }]}>
                <Text style={[styles.flagText, { color: fc.text }]}>🆕 {flagLabel(f)}</Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Resolved flags */}
      {delta.resolved_flags.length > 0 && (
        <View style={styles.flagRow}>
          {delta.resolved_flags.map((f: string) => (
            <View key={f} style={[styles.flagChip, { backgroundColor: `${colors.accent.safe}15`, borderColor: `${colors.accent.safe}33` }]}>
              <Text style={[styles.flagText, { color: colors.accent.safe }]}>✅ {flagLabel(f)}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Context changes */}
      {(delta.family_size_delta !== 0 || delta.rug_count_delta !== 0) && (
        <View style={styles.contextRow}>
          {delta.family_size_delta !== 0 && (
            <Text style={[styles.contextText, { color: tc.text.muted }]}>
              Family {delta.family_size_delta > 0 ? `+${delta.family_size_delta}` : delta.family_size_delta} clones
            </Text>
          )}
          {delta.rug_count_delta !== 0 && (
            <Text style={[styles.contextText, { color: tc.text.muted }]}>
              Deployer {delta.rug_count_delta > 0 ? `+${delta.rug_count_delta}` : delta.rug_count_delta} rugs
            </Text>
          )}
        </View>
      )}

      {/* LLM narrative */}
      {delta.narrative ? (
        <Text style={[styles.narrative, { color: tc.text.secondary, borderTopColor: tc.glass.border }]}>{delta.narrative}</Text>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  trendIcon: { fontSize: 14, fontWeight: "800" },
  trendLabel: { fontSize: 12, fontWeight: "700" },
  scanNumbers: { fontSize: 11 },
  scoreRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  scorePrev: { fontSize: 12, fontVariant: ["tabular-nums"] },
  scoreArrow: { fontSize: 11 },
  scoreCurr: { fontSize: 13, fontWeight: "700", fontVariant: ["tabular-nums"] },
  scoreDelta: { fontSize: 10, fontVariant: ["tabular-nums"] },
  flagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  flagChip: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  flagText: { fontSize: 10, fontWeight: "600" },
  contextRow: { flexDirection: "row", gap: 12 },
  contextText: { fontSize: 10 },
  narrative: {
    fontSize: 11,
    fontStyle: "italic",
    lineHeight: 16,
    borderTopWidth: 1,
    paddingTop: 8,
  },
});
