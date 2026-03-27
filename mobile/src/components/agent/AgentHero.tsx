// ─────────────────────────────────────────────────────────────────────────────
// AgentHero — Slim inline bar for the Agent tab
// Compact single-row: avatar + name + stats + status dot
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Bot, Eye, Search, AlertTriangle } from 'lucide-react-native';
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

// ── Inline stat chip ─────────────────────────────────────────────────────────

function Chip({ icon: Icon, value, color }: { icon: any; value: number | string; color?: string }) {
  return (
    <View style={s.chip}>
      <Icon size={10} color={color ?? tokens.white35} strokeWidth={2.5} />
      <Text style={[s.chipValue, color ? { color } : undefined]}>{value}</Text>
    </View>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export function AgentHero({
  wsConnected,
  watchCount,
  todayCount,
  unreadFlags = 0,
  lastSweep,
}: AgentHeroProps) {
  const sweepAgo = lastSweep ? _formatTimeAgo(lastSweep) : null;

  return (
    <Animated.View entering={FadeIn.duration(300)}>
      <LinearGradient
        colors={['rgba(139,92,246,0.10)', 'rgba(99,102,241,0.04)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={s.bar}
      >
        {/* Avatar */}
        <LinearGradient colors={[tokens.violet, tokens.indigo]} style={s.avatar}>
          <Bot size={16} color={tokens.white100} strokeWidth={2.5} />
        </LinearGradient>

        {/* Title + status */}
        <View style={s.titleCol}>
          <Text style={s.title}>Lineage Agent</Text>
          <View style={s.statusRow}>
            <View style={[s.dot, { backgroundColor: wsConnected ? tokens.success : tokens.white35 }]} />
            <Text style={s.statusText}>
              {wsConnected ? (sweepAgo ? `Sweep ${sweepAgo}` : 'Live') : 'Offline'}
            </Text>
          </View>
        </View>

        {/* Inline stats */}
        <View style={s.chips}>
          <Chip icon={Eye} value={watchCount} />
          <Chip icon={Search} value={todayCount} />
          {unreadFlags > 0 && (
            <Chip icon={AlertTriangle} value={unreadFlags} color={tokens.risk.high} />
          )}
        </View>
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

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: tokens.radius.sm,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: tokens.borderViolet,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    ...tokens.shadow.violet,
  },
  titleCol: { flex: 1, gap: 2 },
  title: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.body,
    color: tokens.white100,
    letterSpacing: -0.3,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
  statusText: {
    fontFamily: 'Lexend-Regular',
    fontSize: 9,
    color: tokens.textTertiary,
  },
  chips: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: tokens.radius.pill,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  chipValue: {
    fontFamily: 'Lexend-Bold',
    fontSize: 10,
    color: tokens.white80,
  },
});
