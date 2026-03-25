import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  Brain,
  Database,
  BookOpen,
  Crosshair,
  Activity,
  Clock,
  TrendingUp,
  Zap,
  Target,
} from 'lucide-react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { GlassCard } from '../ui/GlassCard';
import { tokens } from '../../theme/tokens';
import type { AgentMemoryResult } from '../../lib/api';

// ── Props ────────────────────────────────────────────────────────────────────

interface MemoryLensPanelProps {
  data: AgentMemoryResult;
}

// ── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ icon: Icon, value, label, color, subtitle }: {
  icon: any; value: string | number; label: string; color: string; subtitle?: string;
}) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: `${color}12` }]}>
        <Icon size={14} color={color} strokeWidth={2} />
      </View>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {subtitle && <Text style={styles.statSublabel}>{subtitle}</Text>}
    </View>
  );
}

function TimelineEntry({ event, index }: { event: any; index: number }) {
  const riskColor = (event.risk_score ?? 0) >= 70
    ? tokens.risk.critical
    : (event.risk_score ?? 0) >= 40
      ? tokens.risk.high
      : tokens.risk.low;

  return (
    <Animated.View entering={FadeInDown.delay(index * 50).duration(200)} style={styles.timelineEntry}>
      <View style={styles.timelineDotWrap}>
        <View style={[styles.timelineDot, { backgroundColor: riskColor }]} />
        {index < 4 && <View style={styles.timelineLine} />}
      </View>
      <View style={styles.timelineContent}>
        <View style={styles.timelineRow}>
          <Text style={styles.timelineType} numberOfLines={1}>
            {String(event.event_type ?? event.type ?? 'Event').replace(/_/g, ' ')}
          </Text>
          {event.risk_score != null && (
            <Text style={[styles.timelineRisk, { color: riskColor }]}>{event.risk_score}</Text>
          )}
        </View>
        {event.mint && (
          <Text style={styles.timelineMint}>
            {String(event.mint).slice(0, 8)}…
          </Text>
        )}
        {event.event_at && (
          <Text style={styles.timelineDate}>
            {new Date(event.event_at * 1000).toLocaleDateString(undefined, {
              month: 'short', day: 'numeric',
            })}
          </Text>
        )}
      </View>
    </Animated.View>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export function MemoryLensPanel({ data }: MemoryLensPanelProps) {
  const entity = data.entity_memory;
  const profile = entity?.profile as Record<string, unknown> | null;

  // Extract key stats
  const totalTokens = profile?.total_tokens as number | undefined;
  const totalRugs = profile?.total_rugs as number | undefined;
  const avgRisk = profile?.avg_risk_score as number | undefined;
  const totalExtracted = profile?.total_extracted_sol as number | undefined;
  const preferredNarratives = profile?.preferred_narratives as string[] | undefined;
  const typicalPattern = profile?.typical_rug_pattern as string | undefined;
  const launchVelocity = profile?.launch_velocity as number | undefined;
  const firstSeen = profile?.first_seen as number | undefined;
  const lastSeen = profile?.last_seen as number | undefined;

  const timeline = (data.timeline ?? entity?.timeline ?? []) as any[];
  const hasProfile = profile && (totalTokens != null || totalRugs != null || avgRisk != null);
  const depthLabel = data.memory_depth === 'full'
    ? 'Deep intelligence'
    : data.memory_depth === 'partial'
      ? 'Partial intelligence'
      : 'No prior intelligence';
  const depthColor = data.memory_depth === 'full'
    ? tokens.success
    : data.memory_depth === 'partial'
      ? tokens.warning
      : tokens.textTertiary;

  return (
    <View style={styles.root}>
      {/* Header card */}
      <Animated.View entering={FadeIn.duration(300)}>
        <GlassCard style={styles.headerCard}>
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Brain size={18} color={tokens.violet} />
            </View>
            <View style={styles.headerInfo}>
              <Text style={styles.headerTitle}>Agent Memory</Text>
              <View style={styles.depthRow}>
                <View style={[styles.depthDot, { backgroundColor: depthColor }]} />
                <Text style={[styles.depthText, { color: depthColor }]}>{depthLabel}</Text>
              </View>
            </View>
            {data.prior_episodes > 0 && (
              <View style={styles.episodeBadge}>
                <Text style={styles.episodeCount}>{data.prior_episodes}</Text>
                <Text style={styles.episodeLabel}>scans</Text>
              </View>
            )}
          </View>

          {/* Entity type */}
          {entity?.entity_type && (
            <View style={styles.entityRow}>
              <Text style={styles.entityType}>
                {entity.entity_type === 'deployer' ? 'Deployer' : 'Operator'}
              </Text>
              <Text style={styles.entityId}>
                {entity.entity_id?.slice(0, 12)}…{entity.entity_id?.slice(-6)}
              </Text>
            </View>
          )}

          {/* Activity window */}
          {firstSeen && lastSeen && (
            <View style={styles.timeWindow}>
              <Clock size={10} color={tokens.textTertiary} />
              <Text style={styles.timeWindowText}>
                Active {new Date(firstSeen * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                {' — '}
                {new Date(lastSeen * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </Text>
            </View>
          )}
        </GlassCard>
      </Animated.View>

      {/* Intel Brief */}
      {data.memory_brief && (
        <Animated.View entering={FadeInDown.delay(100).duration(300)}>
          <GlassCard style={styles.briefCard}>
            <View style={styles.briefHeader}>
              <BookOpen size={12} color={tokens.secondary} />
              <Text style={styles.briefLabel}>INTEL BRIEF</Text>
            </View>
            <Text style={styles.briefText}>{data.memory_brief}</Text>
          </GlassCard>
        </Animated.View>
      )}

      {/* Entity Stats grid */}
      {hasProfile && (
        <Animated.View entering={FadeInDown.delay(150).duration(300)}>
          <View style={styles.statsGrid}>
            {totalTokens != null && (
              <StatCard
                icon={Database}
                value={totalTokens}
                label="Tokens"
                color={tokens.secondary}
              />
            )}
            {totalRugs != null && (
              <StatCard
                icon={Crosshair}
                value={totalRugs}
                label="Rugs"
                color={tokens.risk.critical}
                subtitle={totalTokens ? `${((totalRugs / totalTokens) * 100).toFixed(0)}% rate` : undefined}
              />
            )}
            {avgRisk != null && (
              <StatCard
                icon={Activity}
                value={avgRisk.toFixed(0)}
                label="Avg Risk"
                color={avgRisk >= 70 ? tokens.risk.critical : avgRisk >= 40 ? tokens.risk.high : tokens.risk.low}
              />
            )}
            {totalExtracted != null && (
              <StatCard
                icon={TrendingUp}
                value={`${totalExtracted.toFixed(1)}`}
                label="SOL extracted"
                color={tokens.risk.high}
              />
            )}
            {launchVelocity != null && (
              <StatCard
                icon={Zap}
                value={launchVelocity.toFixed(1)}
                label="Launch/week"
                color={tokens.violet}
              />
            )}
          </View>
        </Animated.View>
      )}

      {/* Narratives + Pattern */}
      {((preferredNarratives && preferredNarratives.length > 0) || typicalPattern) && (
        <Animated.View entering={FadeInDown.delay(200).duration(300)}>
          <GlassCard style={styles.patternCard}>
            {preferredNarratives && preferredNarratives.length > 0 && (
              <View>
                <Text style={styles.patternSectionLabel}>PREFERRED NARRATIVES</Text>
                <View style={styles.narrativesRow}>
                  {preferredNarratives.slice(0, 5).map((n) => (
                    <View key={n} style={styles.narrativePill}>
                      <Text style={styles.narrativeText}>{n}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
            {typicalPattern && (
              <View style={preferredNarratives?.length ? styles.patternDivider : undefined}>
                <Text style={styles.patternSectionLabel}>TYPICAL RUG PATTERN</Text>
                <View style={styles.patternRow}>
                  <Target size={12} color={tokens.risk.critical} />
                  <Text style={styles.patternText}>{typicalPattern.replace(/_/g, ' ')}</Text>
                </View>
              </View>
            )}
          </GlassCard>
        </Animated.View>
      )}

      {/* Calibration Rules */}
      {data.calibration_rules.length > 0 && (
        <Animated.View entering={FadeInDown.delay(250).duration(300)}>
          <GlassCard style={styles.calibCard}>
            <Text style={styles.calibTitle}>LEARNED ADJUSTMENTS</Text>
            <Text style={styles.calibSub}>Rules learned from your feedback</Text>
            {data.calibration_rules.slice(0, 4).map((rule, i) => (
              <View key={i} style={styles.calibRule}>
                <View style={styles.calibAdjWrap}>
                  <Text style={styles.calibAdj}>{rule.adjustment}</Text>
                </View>
                <View style={styles.calibInfo}>
                  <Text style={styles.calibReason}>{rule.reason}</Text>
                  <Text style={styles.calibMeta}>
                    {rule.rule_type.replace(/_/g, ' ')} · {rule.entity_type}
                  </Text>
                </View>
              </View>
            ))}
          </GlassCard>
        </Animated.View>
      )}

      {/* Timeline */}
      {timeline.length > 0 && (
        <Animated.View entering={FadeInDown.delay(300).duration(300)}>
          <GlassCard style={styles.timelineCard}>
            <Text style={styles.timelineTitle}>CAMPAIGN TIMELINE</Text>
            {timeline.slice(0, 5).map((event: any, i: number) => (
              <TimelineEntry key={i} event={event} index={i} />
            ))}
          </GlassCard>
        </Animated.View>
      )}

      {/* Empty state */}
      {data.memory_depth === 'none' && !data.memory_brief && !hasProfile && (
        <GlassCard style={styles.emptyCard}>
          <Brain size={24} color={tokens.white20} />
          <Text style={styles.emptyText}>
            No prior intelligence on this entity. Each investigation builds the agent's memory — scan more tokens linked to this deployer.
          </Text>
        </GlassCard>
      )}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    gap: 10,
  },
  headerCard: {
    borderWidth: 1,
    borderColor: `${tokens.violet}20`,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: tokens.radius.sm,
    backgroundColor: `${tokens.violet}15`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerInfo: { flex: 1 },
  headerTitle: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.body,
    color: tokens.white100,
  },
  depthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  depthDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  depthText: {
    fontFamily: 'Lexend-Medium',
    fontSize: tokens.font.tiny,
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
  entityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: tokens.borderSubtle,
  },
  entityType: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.tiny,
    color: tokens.violet,
    backgroundColor: `${tokens.violet}12`,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: tokens.radius.pill,
  },
  entityId: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white60,
    flex: 1,
  },
  timeWindow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 8,
  },
  timeWindowText: {
    fontFamily: 'Lexend-Regular',
    fontSize: 9,
    color: tokens.textTertiary,
  },
  briefCard: {
    borderWidth: 1,
    borderColor: `${tokens.secondary}15`,
    backgroundColor: `${tokens.secondary}04`,
  },
  briefHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 8,
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
    lineHeight: 20,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statCard: {
    flex: 1,
    minWidth: '28%',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 12,
    paddingHorizontal: 8,
    backgroundColor: tokens.bgGlass,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
  },
  statIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.sectionHeader,
  },
  statLabel: {
    fontFamily: 'Lexend-Regular',
    fontSize: 9,
    color: tokens.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  statSublabel: {
    fontFamily: 'Lexend-Regular',
    fontSize: 9,
    color: tokens.white20,
  },
  patternCard: {
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
  },
  patternSectionLabel: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: 9,
    color: tokens.textTertiary,
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  narrativesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  narrativePill: {
    backgroundColor: `${tokens.accent}12`,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: `${tokens.accent}25`,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  narrativeText: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: 10,
    color: tokens.accent,
    textTransform: 'capitalize',
  },
  patternDivider: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: tokens.borderSubtle,
  },
  patternRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  patternText: {
    fontFamily: 'Lexend-Medium',
    fontSize: tokens.font.small,
    color: tokens.white80,
    textTransform: 'capitalize',
    flex: 1,
  },
  calibCard: {
    borderWidth: 1,
    borderColor: `${tokens.violet}15`,
  },
  calibTitle: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: 9,
    color: tokens.violet,
    letterSpacing: 0.8,
  },
  calibSub: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.textTertiary,
    marginBottom: 8,
  },
  calibRule: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: `${tokens.violet}06`,
    borderRadius: tokens.radius.xs,
    padding: 10,
    borderWidth: 1,
    borderColor: `${tokens.violet}12`,
    marginTop: 6,
  },
  calibAdjWrap: {
    backgroundColor: `${tokens.violet}15`,
    borderRadius: tokens.radius.xs,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  calibAdj: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.small,
    color: tokens.violet,
  },
  calibInfo: {
    flex: 1,
    gap: 2,
  },
  calibReason: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white80,
    lineHeight: 17,
  },
  calibMeta: {
    fontFamily: 'Lexend-Regular',
    fontSize: 9,
    color: tokens.textTertiary,
    textTransform: 'capitalize',
  },
  timelineCard: {
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
  },
  timelineTitle: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: 9,
    color: tokens.textTertiary,
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  timelineEntry: {
    flexDirection: 'row',
    gap: 10,
  },
  timelineDotWrap: {
    alignItems: 'center',
    width: 12,
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 2,
  },
  timelineLine: {
    width: 1,
    flex: 1,
    backgroundColor: tokens.borderSubtle,
    marginVertical: 2,
  },
  timelineContent: {
    flex: 1,
    paddingBottom: 12,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timelineType: {
    fontFamily: 'Lexend-Medium',
    fontSize: tokens.font.small,
    color: tokens.white80,
    textTransform: 'capitalize',
    flex: 1,
  },
  timelineRisk: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.tiny,
  },
  timelineMint: {
    fontFamily: 'Lexend-Regular',
    fontSize: 9,
    color: tokens.white20,
    marginTop: 1,
  },
  timelineDate: {
    fontFamily: 'Lexend-Regular',
    fontSize: 9,
    color: tokens.textTertiary,
    marginTop: 1,
  },
  emptyCard: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 24,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
  },
  emptyText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.textTertiary,
    textAlign: 'center',
    maxWidth: 260,
    lineHeight: 18,
  },
});
