// ─────────────────────────────────────────────────────────────────────────────
// AgentHero — Hero section for the Agent tab
// Gradient card with avatar, status dot, compact stats, and sweep meta
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Bot, Eye, Search, Activity, Shield, AlertTriangle } from 'lucide-react-native';
import { tokens } from '../../theme/tokens';

// ── Props ────────────────────────────────────────────────────────────────────

export interface AgentHeroProps {
  wsConnected: boolean;
  watchCount: number;
  todayCount: number;
  totalCount: number;
  accuratePct: number | null;
  lastSweep: number | null;
  unreadFlags?: number;
}

// ── Internal: StatPill ───────────────────────────────────────────────────────

function StatPill({ icon: Icon, value, label, color }: { icon: any; value: number | string; label: string; color?: string }) {
  return (
    <View style={styles.statPill}>
      <Icon size={11} color={color ?? tokens.textTertiary} strokeWidth={2} />
      <Text style={[styles.statValue, color ? { color } : undefined]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export function AgentHero({
  wsConnected,
  watchCount,
  todayCount,
  totalCount,
  accuratePct,
  lastSweep,
  unreadFlags = 0,
}: AgentHeroProps) {
  // Format relative sweep time
  const sweepAgo = lastSweep ? _formatTimeAgo(lastSweep) : null;
  const nextSweep = lastSweep
    ? new Date(lastSweep + 2 * 3600_000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <Animated.View entering={FadeIn.duration(400)}>
      <LinearGradient
        colors={['rgba(207,230,228,0.10)', 'rgba(149,210,230,0.05)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroGradient}
      >
        <View style={styles.heroRow}>
          <View style={styles.heroAvatarWrap}>
            <LinearGradient
              colors={[tokens.violet, tokens.indigo]}
              style={styles.heroAvatar}
            >
              <Bot size={24} color={tokens.white100} strokeWidth={2} />
            </LinearGradient>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>Lineage Agent</Text>
            <View style={styles.heroStatusRow}>
              <View style={[styles.heroDot, { backgroundColor: wsConnected ? tokens.success : tokens.white35 }]} />
              <Text style={styles.heroStatusText}>
                {wsConnected ? 'Monitoring your watchlist' : 'Offline — reconnecting'}
              </Text>
            </View>
          </View>
        </View>

        {/* Compact stats */}
        <View style={styles.heroStats}>
          <StatPill icon={Eye} value={watchCount} label="Watching" />
          <StatPill icon={Search} value={todayCount} label="Today" />
          <StatPill icon={Activity} value={totalCount} label="Total" />
          {unreadFlags > 0 ? (
            <StatPill
              icon={AlertTriangle}
              value={unreadFlags}
              label="Flags"
              color={tokens.risk.high}
            />
          ) : accuratePct != null ? (
            <StatPill
              icon={Shield}
              value={`${accuratePct}%`}
              label="Accuracy"
              color={accuratePct >= 70 ? tokens.success : tokens.warning}
            />
          ) : null}
        </View>

        {sweepAgo && (
          <Text style={styles.sweepMeta}>
            Last sweep {sweepAgo}
            {nextSweep ? ` · next ~${nextSweep}` : ''}
          </Text>
        )}
      </LinearGradient>
    </Animated.View>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function _formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  heroGradient: {
    borderRadius: tokens.radius.lg,
    padding: 18,
    borderWidth: 1,
    borderColor: tokens.borderViolet,
  },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroAvatarWrap: {
    borderRadius: 22,
    overflow: 'hidden',
    ...tokens.shadow.violet,
  },
  heroAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.sectionHeader,
    color: tokens.white100,
    letterSpacing: -0.3,
  },
  heroStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  heroDot: { width: 6, height: 6, borderRadius: 3 },
  heroStatusText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.textTertiary,
  },
  heroStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    gap: 6,
  },
  statPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: tokens.radius.sm,
  },
  statValue: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.small,
    color: tokens.white80,
  },
  statLabel: {
    fontFamily: 'Lexend-Regular',
    fontSize: 9,
    color: tokens.textTertiary,
    letterSpacing: 0.3,
  },
  sweepMeta: {
    fontFamily: 'Lexend-Regular',
    fontSize: 9,
    color: tokens.white20,
    textAlign: 'center',
    marginTop: 12,
    letterSpacing: 0.5,
  },
});
