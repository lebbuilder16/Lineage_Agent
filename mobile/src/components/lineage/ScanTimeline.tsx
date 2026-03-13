// src/components/lineage/ScanTimeline.tsx
// Bande horizontale défilante des scans précédents — adaptée mobile (React Native)

import React from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import type { ScanSnapshot } from "@/src/types/api";
import { colors } from "@/src/theme/colors";
import { useTheme } from "@/src/theme/ThemeContext";

interface Props {
  snapshots: ScanSnapshot[];
}

function riskBucket(score: number): { label: string; bg: string; text: string } {
  if (score >= 85) return { label: "EXTREME", bg: colors.risk.critical,  text: "#fff" };
  if (score >= 75) return { label: "HIGH",    bg: colors.accent.warning, text: "#fff" };
  if (score >= 50) return { label: "MED",     bg: colors.accent.amber,   text: "#000" };
  return                  { label: "LOW",     bg: colors.risk.low,       text: "#fff" };
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/**
 * ScanTimeline — strip horizontale des scans passés.
 * Affiché uniquement si ≥ 1 snapshot.
 */
export function ScanTimeline({ snapshots }: Props) {
  const { colors: tc } = useTheme();
  if (snapshots.length === 0) return null;

  return (
    <View style={styles.wrapper}>
      <Text style={[styles.label, { color: tc.text.muted }]}>HISTORY</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}
      >
        {snapshots.map((snap) => {
          const bucket = riskBucket(snap.risk_score);
          return (
            <View key={snap.snapshot_id} style={styles.item}>
              <View style={[styles.badge, { backgroundColor: bucket.bg }]}>
                <Text style={[styles.badgeScore, { color: bucket.text }]}>
                  {snap.risk_score}
                </Text>
              </View>
              <Text style={[styles.time, { color: tc.text.muted }]}>{formatRelative(snap.scanned_at)}</Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  label: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.5,
    flexShrink: 0,
  },
  strip: {
    flexDirection: "row",
    gap: 8,
    paddingRight: 4,
  },
  item: {
    alignItems: "center",
    gap: 3,
  },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    minWidth: 36,
    alignItems: "center",
  },
  badgeScore: {
    fontSize: 11,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  time: {
    fontSize: 9,
  },
});
