import React from 'react';
import { View, Text, StyleSheet, Share } from 'react-native';
import { router } from 'expo-router';
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  XOctagon,
  Share2,
  Eye,
  EyeOff,
} from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { useInvestigateStore } from '../../store/investigate';
import { useAuthStore } from '../../store/auth';
import { addWatch as apiAddWatch, deleteWatch as apiDeleteWatch } from '../../lib/api';
import { GlassCard } from '../ui/GlassCard';
import { RiskBadge } from '../ui/RiskBadge';
import { MemoryBadge } from '../ui/MemoryBadge';
import { GaugeRing } from '../ui/GaugeRing';
import { HapticButton } from '../ui/HapticButton';
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

function RiskIcon({ level, size = 14 }: { level: RiskLevel; size?: number }) {
  const color = tokens.risk?.[level] ?? tokens.white60;
  switch (level) {
    case 'low': return <ShieldCheck size={size} color={color} />;
    case 'medium': return <AlertTriangle size={size} color={color} />;
    case 'high': return <ShieldAlert size={size} color={color} />;
    case 'critical': return <XOctagon size={size} color={color} />;
  }
}

// ─── Finding helpers ──────────────────────────────────────────────────────────

import {
  TrendingDown,
  Network,
  Package,
  Fingerprint,
  Clock,
} from 'lucide-react-native';

const FINDING_CATEGORIES: Record<string, { color: string; icon: React.ElementType }> = {
  FINANCIAL:     { color: tokens.risk?.high ?? '#FF9933',     icon: TrendingDown },
  EXIT:          { color: tokens.risk?.critical ?? '#FF3366', icon: XOctagon },
  COORDINATION:  { color: tokens.risk?.critical ?? '#FF3366', icon: Network },
  DEPLOYMENT:    { color: tokens.risk?.medium ?? '#F59E0B',   icon: Package },
  IDENTITY:      { color: tokens.secondary,                   icon: Fingerprint },
  TIMING:        { color: tokens.risk?.medium ?? '#F59E0B',   icon: Clock },
};

function parseFinding(text: string): { category: string | null; body: string } {
  const match = text.match(/^\[([A-Z_]+)\]\s*(.*)$/);
  if (match) return { category: match[1], body: match[2] };
  return { category: null, body: text };
}

function FindingItem({ text }: { text: string }) {
  const { category, body } = parseFinding(text);
  const cat = category ? FINDING_CATEGORIES[category] : null;
  const CatIcon = cat?.icon;

  return (
    <View style={styles.findingRow}>
      {cat && CatIcon && (
        <View style={[styles.findingBadge, { backgroundColor: `${cat.color}1A`, borderColor: `${cat.color}50` }]}>
          <CatIcon size={10} color={cat.color} />
          <Text style={[styles.findingBadgeText, { color: cat.color }]}>{category}</Text>
        </View>
      )}
      <Text style={styles.findingBody}>{body}</Text>
    </View>
  );
}

// ─── VerdictHero ──────────────────────────────────────────────────────────────

export function VerdictHero() {
  const verdict = useInvestigateStore((s) => s.verdict);
  const mint = useInvestigateStore((s) => s.mint);
  const watches = useAuthStore((s) => s.watches);
  const storeAddWatch = useAuthStore((s) => s.addWatch);
  const storeRemoveWatch = useAuthStore((s) => s.removeWatch);
  const apiKey = useAuthStore((s) => s.apiKey);

  const existingWatch = watches.find((w) => w.value === mint && w.sub_type === 'mint');
  const isWatching = !!existingWatch;

  const handleWatchToggle = async () => {
    if (!apiKey || !mint) return;
    try {
      if (isWatching && existingWatch) {
        storeRemoveWatch(existingWatch.id);
        apiDeleteWatch(apiKey, existingWatch.id).catch((e) => console.warn('[VerdictHero] watch delete failed', e));
      } else {
        const newWatch = await apiAddWatch(apiKey, 'mint', mint);
        storeAddWatch(newWatch);
      }
    } catch {
      // best-effort
    }
  };

  if (!verdict) return null;

  const score = verdict.risk_score ?? 0;
  const color = riskColor(score);
  const level = riskLevel(score);

  return (
    <Animated.View entering={FadeInDown.duration(400).springify()}>
      <GlassCard>
        <View
          style={styles.verdictHeroCenter}
          accessibilityLabel={`Risk score ${score} out of 100, ${level} risk`}
          accessibilityRole="summary"
        >
          <GaugeRing
            value={score / 100}
            color={color}
            size={100}
            strokeWidth={7}
            label={String(score)}
            sublabel="RISK SCORE"
          />
          <View style={styles.verdictBadgeRow}>
            <RiskBadge level={level} size="md" />
            <RiskIcon level={level} size={16} />
          </View>
          {verdict.confidence && (() => {
            const conf = verdict.confidence as string;
            const confColor = conf === 'high' ? tokens.risk.low : conf === 'medium' ? tokens.risk.medium : tokens.white60;
            return (
              <View style={[styles.confBadge, { backgroundColor: `${confColor}15`, borderColor: `${confColor}40` }]}>
                <Text style={[styles.confText, { color: confColor }]}>
                  {conf.toUpperCase()} CONF.
                </Text>
              </View>
            );
          })()}
          {/* Prediction band — confidence interval */}
          {verdict.prediction_band && verdict.prediction_band.n >= 5 && (
            <View style={[styles.confBadge, { backgroundColor: `${tokens.secondary}12`, borderColor: `${tokens.secondary}30` }]}>
              <Text style={[styles.confText, { color: tokens.secondary }]}>
                RANGE {verdict.prediction_band.low}–{verdict.prediction_band.high} ({verdict.prediction_band.n} similar)
              </Text>
            </View>
          )}
          {/* Memory depth badge */}
          {verdict.memory_depth && (
            <MemoryBadge depth={verdict.memory_depth} size="md" />
          )}
        </View>
        <Text style={styles.verdictSummary}>{verdict.verdict_summary}</Text>

        {/* Key findings with category badges */}
        {Array.isArray(verdict.key_findings) && verdict.key_findings.length > 0 && (
          <View style={styles.findingsSection}>
            {verdict.key_findings.map((f: string, i: number) => (
              <FindingItem key={i} text={String(f)} />
            ))}
          </View>
        )}

        {verdict.conviction_chain ? (
          <Text style={styles.convictionText}>{verdict.conviction_chain}</Text>
        ) : null}

        {verdict.memory_context ? (
          <Text style={styles.memoryContextText}>{verdict.memory_context}</Text>
        ) : null}

        <View style={styles.verdictActions}>
          <HapticButton
            variant="primary"
            size="md"
            style={{ flex: 1 }}
            onPress={() => router.push(`/token/${mint}`)}
            accessibilityLabel="View full token report"
          >
            <Text style={styles.btnText}>VIEW REPORT</Text>
          </HapticButton>
          <HapticButton
            variant="ghost"
            size="md"
            onPress={() => {
              const text = `Lineage Investigation\n`
                + `Risk: ${verdict.risk_score}/100 — ${verdict.verdict_summary}\n`
                + `Key findings:\n${Array.isArray(verdict.key_findings) ? verdict.key_findings.map((f: string) => `- ${f}`).join('\n') : ''}\n`
                + `\nAnalyzed by Lineage Agent`;
              Share.share({ message: text });
            }}
            accessibilityLabel="Share verdict"
          >
            <Share2 size={18} color={tokens.secondary} />
          </HapticButton>
          <HapticButton
            variant="ghost"
            size="md"
            onPress={handleWatchToggle}
            accessibilityLabel={isWatching ? 'Remove from watchlist' : 'Add to watchlist'}
          >
            {isWatching
              ? <EyeOff size={18} color={tokens.secondary} />
              : <Eye size={18} color={tokens.white60} />
            }
          </HapticButton>
        </View>
      </GlassCard>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  verdictHeroCenter: {
    alignItems: 'center', gap: 8, marginBottom: 16,
  },
  verdictBadgeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4,
  },
  confBadge: {
    paddingHorizontal: 9, paddingVertical: 3,
    borderRadius: tokens.radius.pill, borderWidth: 1, marginTop: 6,
  },
  confText: {
    fontFamily: 'Lexend-Bold', fontSize: 9, letterSpacing: 0.7,
  },
  verdictSummary: {
    fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.subheading,
    color: tokens.white100, marginBottom: 12,
  },
  findingsSection: { gap: 8, marginBottom: 12 },
  findingRow: {
    gap: 6,
  },
  findingBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
  },
  findingBadgeText: {
    fontFamily: 'Lexend-Bold', fontSize: 9,
    letterSpacing: 0.5,
  },
  findingBody: {
    fontFamily: 'Lexend-Regular', fontSize: tokens.font.small,
    color: tokens.white80, lineHeight: 20,
  },
  convictionText: {
    fontFamily: 'Lexend-Regular', fontSize: tokens.font.small,
    color: tokens.white60, fontStyle: 'italic', marginBottom: 12, lineHeight: 20,
  },
  memoryContextText: {
    fontFamily: 'Lexend-Regular', fontSize: tokens.font.small,
    color: tokens.secondary, marginBottom: 16, lineHeight: 20,
  },
  verdictActions: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16,
  },
  btnText: {
    fontFamily: 'Lexend-Bold', fontSize: tokens.font.body,
    color: tokens.white100, letterSpacing: 0.5,
  },
});
