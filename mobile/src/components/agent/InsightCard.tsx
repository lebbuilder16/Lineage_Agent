import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Link2, AlertTriangle, Rocket } from 'lucide-react-native';
import { GlassCard } from '../ui/GlassCard';
import { tokens } from '../../theme/tokens';
import type { Insight } from '../../types/api';

interface InsightCardProps {
  insight: Insight;
  onPress?: () => void;
}

const ICON_MAP: Record<string, typeof Link2> = {
  shared_deployer: Link2,
  cartel_activity: AlertTriangle,
  deployer_new_launch: Rocket,
};

const COLOR_MAP: Record<string, string> = {
  critical: tokens.risk.critical,
  warning: tokens.risk.high,
  info: tokens.secondary,
};

export function InsightCard({ insight, onPress }: InsightCardProps) {
  const Icon = ICON_MAP[insight.type] ?? AlertTriangle;
  const accentColor = COLOR_MAP[insight.severity] ?? tokens.secondary;

  const detail = (insight.detail ?? {}) as Record<string, unknown>;
  const mints = (detail.mints as string[]) ?? [];
  const deployer = detail.deployer as string | undefined;
  const rugCount = detail.rug_count as number | undefined;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={onPress ? 0.7 : 1} disabled={!onPress}>
      <GlassCard style={[styles.card, { borderLeftWidth: 3, borderLeftColor: accentColor }]}>
        <View style={styles.row}>
          <View style={[styles.iconWrap, { backgroundColor: `${accentColor}15` }]}>
            <Icon size={16} color={accentColor} />
          </View>
          <View style={styles.body}>
            <Text style={[styles.title, { color: accentColor }]} numberOfLines={2}>
              {insight.title}
            </Text>
            {rugCount != null && rugCount > 0 && (
              <Text style={styles.detail}>
                {rugCount} confirmed rug{rugCount > 1 ? 's' : ''} by this deployer
              </Text>
            )}
            {mints.length > 0 && (
              <View style={styles.mintRow}>
                {mints.slice(0, 3).map((m) => (
                  <View key={m} style={styles.mintPill}>
                    <Text style={styles.mintText}>{m.slice(0, 6)}...{m.slice(-4)}</Text>
                  </View>
                ))}
                {mints.length > 3 && (
                  <Text style={styles.mintMore}>+{mints.length - 3}</Text>
                )}
              </View>
            )}
          </View>
        </View>
      </GlassCard>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden' },
  row: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    paddingHorizontal: tokens.spacing.cardPadding, paddingVertical: 14,
  },
  iconWrap: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  body: { flex: 1 },
  title: { fontFamily: 'Lexend-Medium', fontSize: 13, lineHeight: 18 },
  detail: {
    fontFamily: 'Lexend-Regular', fontSize: 11,
    color: tokens.white60, marginTop: 3,
  },
  mintRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  mintPill: {
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: tokens.radius.pill,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  mintText: { fontFamily: 'Lexend-Regular', fontSize: 10, color: tokens.white60 },
  mintMore: { fontFamily: 'Lexend-Regular', fontSize: 10, color: tokens.textTertiary, alignSelf: 'center' },
});
