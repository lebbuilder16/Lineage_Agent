import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  Brain,
  Database,
  BookOpen,
  Crosshair,
  Activity,
} from 'lucide-react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { GlassCard } from '../ui/GlassCard';
import { tokens } from '../../theme/tokens';
import type { AgentMemoryResult } from '../../lib/api';

// ── Props ────────────────────────────────────────────────────────────────────

interface MemoryLensPanelProps {
  data: AgentMemoryResult;
}

// ── Component ────────────────────────────────────────────────────────────────

export function MemoryLensPanel({ data }: MemoryLensPanelProps) {
  const entity = data.entity_memory;
  const profile = entity?.profile as Record<string, unknown> | null;

  // Extract key stats from entity profile
  const totalTokens = profile?.total_tokens as number | undefined;
  const totalRugs = profile?.total_rugs as number | undefined;
  const avgRisk = profile?.avg_risk_score as number | undefined;
  const preferredNarratives = profile?.preferred_narratives as string[] | undefined;
  const typicalPattern = profile?.typical_rug_pattern as string | undefined;

  return (
    <Animated.View entering={FadeIn.duration(300)}>
      <GlassCard style={styles.card}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <Brain size={16} color={tokens.violet} />
          </View>
          <View style={styles.headerInfo}>
            <Text style={styles.headerTitle}>AGENT MEMORY</Text>
            <Text style={styles.headerSub}>
              {data.memory_depth === 'full'
                ? 'Deep intelligence available'
                : data.memory_depth === 'partial'
                  ? 'Partial intelligence'
                  : 'No prior intelligence'}
            </Text>
          </View>
          {data.prior_episodes > 0 && (
            <View style={styles.episodeBadge}>
              <Text style={styles.episodeCount}>{data.prior_episodes}</Text>
              <Text style={styles.episodeLabel}>scans</Text>
            </View>
          )}
        </View>

        {/* Memory Brief */}
        {data.memory_brief && (
          <View style={styles.briefSection}>
            <View style={styles.briefHeader}>
              <BookOpen size={11} color={tokens.secondary} />
              <Text style={styles.briefLabel}>INTEL BRIEF</Text>
            </View>
            <Text style={styles.briefText}>{data.memory_brief}</Text>
          </View>
        )}

        {/* Entity Stats */}
        {profile && (totalTokens != null || totalRugs != null || avgRisk != null) && (
          <View style={styles.statsRow}>
            {totalTokens != null && (
              <View style={styles.statItem}>
                <Database size={11} color={tokens.white60} />
                <Text style={styles.statValue}>{totalTokens}</Text>
                <Text style={styles.statLabel}>tokens</Text>
              </View>
            )}
            {totalRugs != null && (
              <View style={styles.statItem}>
                <Crosshair size={11} color={tokens.risk.critical} />
                <Text style={[styles.statValue, { color: tokens.risk.critical }]}>{totalRugs}</Text>
                <Text style={styles.statLabel}>rugs</Text>
              </View>
            )}
            {avgRisk != null && (
              <View style={styles.statItem}>
                <Activity size={11} color={avgRisk >= 70 ? tokens.risk.critical : avgRisk >= 40 ? tokens.risk.medium : tokens.risk.low} />
                <Text style={[styles.statValue, {
                  color: avgRisk >= 70 ? tokens.risk.critical : avgRisk >= 40 ? tokens.risk.medium : tokens.risk.low,
                }]}>
                  {avgRisk.toFixed(0)}
                </Text>
                <Text style={styles.statLabel}>avg risk</Text>
              </View>
            )}
          </View>
        )}

        {/* Preferred Narratives */}
        {preferredNarratives && preferredNarratives.length > 0 && (
          <View style={styles.narrativesRow}>
            {preferredNarratives.slice(0, 4).map((n) => (
              <View key={n} style={styles.narrativePill}>
                <Text style={styles.narrativeText}>{n}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Typical Rug Pattern */}
        {typicalPattern && (
          <Text style={styles.patternText}>Pattern: {typicalPattern}</Text>
        )}

        {/* Calibration Rules */}
        {data.calibration_rules.length > 0 && (
          <View style={styles.calibSection}>
            <Text style={styles.calibTitle}>LEARNED ADJUSTMENTS</Text>
            {data.calibration_rules.slice(0, 3).map((rule, i) => (
              <View key={i} style={styles.calibRule}>
                <Text style={styles.calibAdj}>{rule.adjustment}</Text>
                <Text style={styles.calibReason}>{rule.reason}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Empty state */}
        {data.memory_depth === 'none' && !data.memory_brief && (
          <Text style={styles.emptyText}>
            No prior intelligence on this entity. Scan tokens to build the agent's memory.
          </Text>
        )}
      </GlassCard>
    </Animated.View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: `${tokens.violet}20`,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIcon: {
    width: 34,
    height: 34,
    borderRadius: tokens.radius.sm,
    backgroundColor: `${tokens.violet}15`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerInfo: { flex: 1 },
  headerTitle: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.tiny,
    color: tokens.violet,
    letterSpacing: 1,
  },
  headerSub: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white60,
    marginTop: 2,
  },
  episodeBadge: {
    alignItems: 'center',
    backgroundColor: `${tokens.secondary}12`,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: `${tokens.secondary}25`,
  },
  episodeCount: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.body,
    color: tokens.secondary,
  },
  episodeLabel: {
    fontFamily: 'Lexend-Regular',
    fontSize: 9,
    color: tokens.textTertiary,
  },
  briefSection: {
    marginTop: 12,
    backgroundColor: `${tokens.secondary}08`,
    borderRadius: tokens.radius.sm,
    padding: 10,
    borderWidth: 1,
    borderColor: `${tokens.secondary}15`,
  },
  briefHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 6,
  },
  briefLabel: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: 9,
    color: tokens.secondary,
    letterSpacing: 0.8,
  },
  briefText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white80,
    lineHeight: 18,
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: tokens.borderSubtle,
    gap: 0,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  statValue: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.body,
    color: tokens.white100,
  },
  statLabel: {
    fontFamily: 'Lexend-Regular',
    fontSize: 9,
    color: tokens.textTertiary,
  },
  narrativesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 10,
  },
  narrativePill: {
    backgroundColor: `${tokens.accent}12`,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: `${tokens.accent}25`,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  narrativeText: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: 9,
    color: tokens.accent,
    textTransform: 'capitalize',
  },
  patternText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white60,
    marginTop: 8,
    fontStyle: 'italic',
  },
  calibSection: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: tokens.borderSubtle,
    gap: 6,
  },
  calibTitle: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: 9,
    color: tokens.textTertiary,
    letterSpacing: 0.8,
  },
  calibRule: {
    backgroundColor: `${tokens.violet}08`,
    borderRadius: tokens.radius.xs,
    padding: 8,
    borderWidth: 1,
    borderColor: `${tokens.violet}15`,
  },
  calibAdj: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.tiny,
    color: tokens.violet,
  },
  calibReason: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white60,
    marginTop: 2,
  },
  emptyText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.textTertiary,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
  },
});
