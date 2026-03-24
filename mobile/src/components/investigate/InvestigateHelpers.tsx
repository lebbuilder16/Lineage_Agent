import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Timer } from 'lucide-react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { useInvestigateStore } from '../../store/investigate';
import { GlassCard } from '../ui/GlassCard';
import { RiskBadge } from '../ui/RiskBadge';
import { GaugeRing } from '../ui/GaugeRing';
import { SkeletonLoader, SkeletonBlock } from '../ui/SkeletonLoader';
import { tokens } from '../../theme/tokens';

// ─── Risk helpers ─────────────────────────────────────────────────────────────

type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

function riskColor(score: number): string {
  if (score >= 75) return tokens.risk?.critical ?? '#FF3366';
  if (score >= 50) return tokens.risk?.high ?? '#FF9933';
  if (score >= 25) return tokens.risk?.medium ?? '#F59E0B';
  return tokens.risk?.low ?? '#00FF88';
}

function riskLevel(score: number): RiskLevel {
  if (score >= 75) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 25) return 'medium';
  return 'low';
}

// ─── VerdictSkeleton ──────────────────────────────────────────────────────────

export function VerdictSkeleton() {
  return (
    <Animated.View entering={FadeIn.duration(200)}>
      <GlassCard>
        <View style={styles.verdictHeroCenter}>
          <SkeletonLoader width={100} height={100} borderRadius={50} />
          <View style={{ marginTop: 12, gap: 8, alignItems: 'center' }}>
            <SkeletonLoader width={120} height={14} />
            <SkeletonLoader width={80} height={12} />
          </View>
        </View>
        <View style={{ marginTop: 16 }}>
          <SkeletonBlock lines={3} />
        </View>
      </GlassCard>
    </Animated.View>
  );
}

// ─── HeuristicCard ────────────────────────────────────────────────────────────

export function HeuristicCard({ score }: { score: number }) {
  const color = riskColor(score);
  const level = riskLevel(score);
  return (
    <Animated.View entering={FadeInDown.duration(400).springify()}>
      <GlassCard>
        <View style={styles.verdictHeroCenter} accessibilityLabel={`Heuristic risk score ${score} out of 100, ${level} risk`}>
          <GaugeRing value={score / 100} color={color} size={100} strokeWidth={7} label={String(score)} sublabel="HEURISTIC" />
          <View style={styles.verdictBadgeRow}>
            <RiskBadge level={level} size="md" />
          </View>
        </View>
        <Text style={styles.heuristicInfo}>This is a rule-based pre-score. Upgrade to Pro to unlock AI-powered analysis with deeper insights.</Text>
      </GlassCard>
    </Animated.View>
  );
}

// ─── ElapsedTimer ─────────────────────────────────────────────────────────────

export function ElapsedTimer() {
  const startedAt = useInvestigateStore((s) => s.startedAt);
  const status = useInvestigateStore((s) => s.status);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startedAt) return;
    const frozen = status === 'done' || status === 'error' || status === 'cancelled';
    if (frozen) { setElapsed(Date.now() - startedAt); return; }
    const interval = setInterval(() => setElapsed(Date.now() - startedAt), 1000);
    return () => clearInterval(interval);
  }, [startedAt, status]);

  if (!startedAt) return null;
  const secs = Math.floor(elapsed / 1000);
  const mins = Math.floor(secs / 60);
  const display = mins > 0 ? `${mins}m ${secs % 60}s` : `${secs}s`;

  return (
    <View style={styles.timerRow}>
      <Timer size={12} color={tokens.textTertiary} />
      <Text style={styles.timerText}>{status === 'done' || status === 'error' ? `Completed in ${display}` : `Started ${display} ago`}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  verdictHeroCenter: { alignItems: 'center', gap: 8, marginBottom: 16 },
  verdictBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  heuristicInfo: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.small, color: tokens.white60, lineHeight: 20, textAlign: 'center' },
  timerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 12 },
  timerText: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.textTertiary, letterSpacing: 0.3 },
});
