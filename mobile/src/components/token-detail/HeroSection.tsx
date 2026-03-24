import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import {
  Copy,
  TrendingUp,
  HelpCircle,
} from 'lucide-react-native';
import { GlassCard } from '../ui/GlassCard';
import { RiskBadge } from '../ui/RiskBadge';
import { GaugeRing } from '../ui/GaugeRing';
import { HapticButton } from '../ui/HapticButton';
import { tokens } from '../../theme/tokens';

// ─── Types ────────────────────────────────────────────────────────────────────

type RiskLevel = 'low' | 'medium' | 'high' | 'critical' | 'first_rug' | 'insufficient_data';

interface HeroSectionProps {
  data: any;
  mint: string;
  riskScore: number | null;
  riskColor: string;
  displayRiskLevel: RiskLevel;
  watching: boolean;
  onCopy: (value: string, label?: string) => void;
  onWatch: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMcap(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function shortAddr(addr: string): string {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

// ─── Hero Image ───────────────────────────────────────────────────────────────

function HeroImage({ uri, symbol, name }: { uri?: string; symbol?: string; name?: string }) {
  const [errored, setErrored] = useState(false);
  const label = `${name ?? 'Token'} logo`;
  const hasUri = !!uri && uri.trim() !== '' && !errored;
  if (hasUri) {
    return <Image source={uri} style={styles.heroImg} contentFit="cover" transition={200} onError={() => setErrored(true)} accessibilityLabel={label} />;
  }
  return (
    <View style={[styles.heroImg, styles.heroImgFallback]} accessibilityLabel={label}>
      <Text style={styles.heroImgText}>{symbol?.[0]?.toUpperCase() ?? '?'}</Text>
    </View>
  );
}

// ─── HeroSection ──────────────────────────────────────────────────────────────

export function HeroSection({
  data,
  mint,
  riskScore,
  riskColor,
  displayRiskLevel,
  watching,
  onCopy,
  onWatch,
}: HeroSectionProps) {
  const mcap = data?.query_token?.market_cap_usd;

  return (
    <GlassCard style={styles.heroCard}>
      <View style={styles.heroRow}>
        <HeroImage uri={data.query_token?.image_uri} symbol={data.query_token?.symbol} name={data.query_token?.name} />

        <View style={styles.heroInfo}>
          <Text style={styles.heroName} numberOfLines={2}>
            {data.query_token?.name ?? 'Unknown'}
          </Text>
          <Text style={styles.heroSymbol}>{data.query_token?.symbol ?? '—'}</Text>

          <View style={styles.heroMeta}>
            {mcap != null && mcap > 0 && (
              <View style={styles.mcapPill}>
                <TrendingUp size={10} color={tokens.secondary} strokeWidth={2} />
                <Text style={styles.mcapText}>{fmtMcap(mcap)}</Text>
              </View>
            )}
            {displayRiskLevel !== 'insufficient_data' ? (
              <RiskBadge
                level={displayRiskLevel === 'first_rug' ? 'high' : displayRiskLevel as any}
                size="sm"
              />
            ) : (
              <View style={styles.unverifiedBadge}>
                <Text style={styles.unverifiedText}>UNVERIFIED</Text>
              </View>
            )}
          </View>

          <TouchableOpacity
            onPress={() => onCopy(mint ?? '', 'Mint address')}
            hitSlop={tokens.hitSlop}
            style={[styles.mintRow, { minHeight: tokens.minTouchSize, justifyContent: 'center' }]}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Copy mint address"
          >
            <Text style={styles.mintAddr}>{shortAddr(mint ?? '')}</Text>
            <Copy size={11} color={tokens.textTertiary} />
          </TouchableOpacity>
        </View>

        {/* Gauge */}
        {riskScore != null ? (
          <GaugeRing
            value={riskScore}
            color={riskColor}
            size={76}
            strokeWidth={6}
            label={(displayRiskLevel === 'first_rug' ? 'FIRST' : displayRiskLevel?.toUpperCase() ?? '—').split(' ')[0]}
            sublabel="RISK"
          />
        ) : (
          <View style={styles.noDataGauge}>
            <HelpCircle size={22} color={tokens.textTertiary} strokeWidth={1.5} />
            <Text style={styles.noDataLabel}>NO{'\n'}DATA</Text>
          </View>
        )}
      </View>

      {/* Watch */}
      {watching ? (
        <View style={styles.watchingBadge}>
          <Text style={styles.watchingText}>Watching ✓</Text>
        </View>
      ) : (
        <HapticButton
          variant="secondary"
          size="sm"
          onPress={onWatch}
          style={{ marginTop: 14 }}
        >
          <Text style={styles.btnSecondaryText}>Watch Token</Text>
        </HapticButton>
      )}
    </GlassCard>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  heroCard: {},
  heroRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  heroImg: { width: 72, height: 72, borderRadius: tokens.radius.md },
  heroImgFallback: { backgroundColor: tokens.bgGlass12, alignItems: 'center', justifyContent: 'center' },
  heroImgText: { fontFamily: 'Lexend-Bold', fontSize: tokens.font.subheading, color: tokens.white60 },
  heroInfo: { flex: 1, gap: 4 },
  heroName: { fontFamily: 'Lexend-Bold', fontSize: tokens.font.subheading, color: tokens.white100, lineHeight: 22 },
  heroSymbol: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.small, color: tokens.white60 },
  heroMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  mcapPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: `${tokens.secondary}15`, borderRadius: tokens.radius.pill,
    paddingHorizontal: 7, paddingVertical: 3,
    borderWidth: 1, borderColor: `${tokens.secondary}25`,
  },
  mcapText: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.tiny, color: tokens.secondary },
  mintRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  mintAddr: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.textTertiary, letterSpacing: 0.3 },
  noDataGauge: {
    width: 76, height: 76, alignItems: 'center', justifyContent: 'center', gap: 4,
    borderRadius: 38, borderWidth: 1.5, borderColor: tokens.borderSubtle, borderStyle: 'dashed',
  },
  noDataLabel: {
    fontFamily: 'Lexend-Regular', fontSize: 9, color: tokens.textTertiary,
    textAlign: 'center', letterSpacing: 0.5, lineHeight: 11,
  },
  watchingBadge: {
    marginTop: 14, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: tokens.radius.pill,
    backgroundColor: `${tokens.success}15`, borderWidth: 1, borderColor: `${tokens.success}35`,
  },
  watchingText: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.small, color: tokens.success },
  unverifiedBadge: {
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: tokens.radius.pill,
    backgroundColor: `${tokens.white35}12`,
    borderWidth: 1, borderColor: `${tokens.white35}30`,
  },
  unverifiedText: {
    fontFamily: 'Lexend-Bold', fontSize: tokens.font.tiny,
    color: tokens.textTertiary, letterSpacing: 0.8,
  },
  btnSecondaryText: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.small, color: tokens.primary },
});
