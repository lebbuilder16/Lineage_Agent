import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Dna, ChevronRight, Zap } from 'lucide-react-native';
import { GlassCard } from '../ui/GlassCard';
import { tokens } from '../../theme/tokens';

interface OperatorDamageCardProps {
  data: any;
}

function fmtUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export function OperatorDamageCard({ data }: OperatorDamageCardProps) {
  const op = data?.operator_impact;
  if (!op || op.total_rug_count <= 0) return null;

  const isActive = op.is_campaign_active;
  const accentColor = isActive ? tokens.risk.critical : tokens.risk.high;
  const walletCount = op.linked_wallets?.length ?? 0;

  return (
    <TouchableOpacity
      onPress={() => op.fingerprint && router.push(`/operator/${op.fingerprint}` as any)}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel="View operator profile"
    >
      <GlassCard style={[styles.card, { borderColor: `${accentColor}35`, borderWidth: 1 }]}>
        <View style={styles.header}>
          <View style={[styles.iconWrap, { backgroundColor: `${accentColor}18` }]}>
            <Dna size={14} color={accentColor} />
          </View>
          <Text style={[styles.title, { color: accentColor }]}>OPERATOR FINGERPRINT</Text>
          {isActive && (
            <View style={[styles.activeBadge, { backgroundColor: `${tokens.risk.critical}20`, borderColor: `${tokens.risk.critical}50` }]}>
              <Zap size={9} color={tokens.risk.critical} />
              <Text style={styles.activeBadgeText}>ACTIVE</Text>
            </View>
          )}
          <ChevronRight size={14} color={tokens.textTertiary} style={styles.chevron} />
        </View>

        <Text style={styles.summary}>
          {walletCount > 0 ? `${walletCount} wallet${walletCount > 1 ? 's' : ''}` : null}
          {op.total_tokens_launched > 0 ? ` · ${op.total_tokens_launched} tokens` : null}
          {op.rug_rate_pct != null ? ` · ${op.rug_rate_pct.toFixed(0)}% rug rate` : null}
          {op.estimated_extracted_usd > 0 ? ` · ~${fmtUsd(op.estimated_extracted_usd)} extracted` : null}
        </Text>

        {Array.isArray(op.narrative_sequence) && op.narrative_sequence.length > 0 && (
          <View style={styles.narrativeRow}>
            {op.narrative_sequence.slice(0, 5).map((n: string, i: number) => (
              <React.Fragment key={n}>
                <Text style={styles.narrativeChip}>{n}</Text>
                {i < Math.min(op.narrative_sequence.length, 5) - 1 && (
                  <Text style={styles.narrativeArrow}>→</Text>
                )}
              </React.Fragment>
            ))}
          </View>
        )}
      </GlassCard>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {},
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  iconWrap: {
    width: 28, height: 28, borderRadius: tokens.radius.xs,
    alignItems: 'center', justifyContent: 'center',
  },
  title: {
    fontFamily: 'Lexend-Bold', fontSize: tokens.font.tiny, letterSpacing: 0.8, flex: 1,
  },
  activeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 7, paddingVertical: 3,
    borderRadius: tokens.radius.pill, borderWidth: 1,
  },
  activeBadgeText: {
    fontFamily: 'Lexend-Bold', fontSize: 9,
    color: tokens.risk.critical, letterSpacing: 0.5,
  },
  chevron: { marginLeft: 2 },
  summary: {
    fontFamily: 'Lexend-Regular', fontSize: tokens.font.small,
    color: tokens.white80, lineHeight: 18,
  },
  narrativeRow: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap',
    gap: 4, marginTop: 8,
  },
  narrativeChip: {
    fontFamily: 'Lexend-SemiBold', fontSize: 9,
    color: tokens.secondary, letterSpacing: 0.5,
    backgroundColor: `${tokens.secondary}15`,
    paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: tokens.radius.pill,
  },
  narrativeArrow: {
    fontFamily: 'Lexend-Regular', fontSize: 9, color: tokens.textTertiary,
  },
});
