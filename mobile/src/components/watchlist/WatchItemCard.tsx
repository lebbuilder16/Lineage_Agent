import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { GlassCard } from '../ui/GlassCard';
import { RiskBadge } from '../ui/RiskBadge';
import { MemoryBadge } from '../ui/MemoryBadge';
import { tokens } from '../../theme/tokens';
import { useHistoryStore } from '../../store/history';
import { queryClient } from '../../lib/query-client';
import { QK } from '../../lib/query';
import { RiskSparkline } from './RiskSparkline';
import type { Watch } from '../../types/api';
import type { LineageResult } from '../../types/api';

export interface WatchItemCardProps {
  item: Watch;
  onPress: (w: Watch) => void;
  onCopy: (v: string) => void;
  flagCount?: number;
  flagTypeList?: string[];
  tokenMetaOverride?: { name?: string; symbol?: string; image?: string };
  memoryDepth?: 'deep' | 'partial' | 'first_encounter';
  sparklineData?: number[];
}

const FLAG_LABELS: Record<string, string> = {
  SOL_EXTRACTION_NEW: 'SOL extracted',
  SOL_EXTRACTION_INCREASED: 'SOL extraction ↑',
  DEPLOYER_EXITED: 'Deployer exited',
  INSIDER_DUMP_DETECTED: 'Insider dump',
  BUNDLE_DETECTED: 'Bundle detected',
  BUNDLE_WALLETS_NEW: 'New bundle wallets',
  CARTEL_DETECTED: 'Cartel detected',
  CARTEL_EXPANDED: 'Cartel expanded',
  RISK_ESCALATION: 'Risk escalated',
  DEPLOYER_NEW_RUG: 'New rug by deployer',
  SELL_PRESSURE_SPIKE: 'Sell pressure spike',
  BUNDLE_WALLET_EXIT: 'Bundle wallet sold',
  BUNDLE_WALLETS_ALL_EXITED: 'All bundles exited',
  CORRELATED_FORENSIC_MARKET: 'Forensic × Market',
  FORENSIC_ACTIVITY: 'Forensic activity',
  MARKET_STRESS: 'Market stress',
  PRICE_CRASH: 'Price crash',
  LIQUIDITY_DRAIN: 'Liquidity drain',
};

export function WatchItemCard({ item, onPress, onCopy, flagCount = 0, flagTypeList, tokenMetaOverride, memoryDepth, sparklineData }: WatchItemCardProps) {
  // Try to get token name/symbol from: 1) override from flags, 2) react-query cache, 3) item label
  const cached = item.sub_type === 'mint'
    ? queryClient.getQueryData<LineageResult>(QK.lineage(item.value))
    : undefined;
  const qt = (cached as Record<string, unknown> | undefined)?.query_token as Record<string, unknown> | undefined;
  const tokenName = tokenMetaOverride?.name || (qt?.name as string) || item.label || item.identifier || null;
  const tokenSymbol = tokenMetaOverride?.symbol || (qt?.symbol as string) || null;
  const imageUri = tokenMetaOverride?.image || (qt?.image_uri as string) || null;

  // Risk badge from investigation history
  const prev = useHistoryStore.getState().getByMint(item.value);
  const riskLevel = prev
    ? prev.riskScore >= 75 ? 'critical' : prev.riskScore >= 50 ? 'high' : prev.riskScore >= 25 ? 'medium' : 'low'
    : null;

  const isMint = item.sub_type === 'mint';
  const accentColor = isMint ? tokens.secondary : tokens.accent;

  return (
    <GlassCard style={styles.watchCard} noPadding>
      <TouchableOpacity
        style={styles.watchInner}
        onPress={() => onPress(item)}
        onLongPress={() => onCopy(item.value)}
        delayLongPress={400}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={`${tokenName ?? item.value.slice(0, 8)} ${tokenSymbol ?? (isMint ? 'token' : 'deployer')}${riskLevel ? `, ${riskLevel} risk` : ''}`}
        accessibilityHint="Tap to view details, long press to copy address"
      >
        {/* Token image or type badge */}
        {imageUri ? (
          <View style={styles.tokenImgWrap}>
            <Image source={imageUri} style={styles.tokenImg} contentFit="cover" transition={200} />
          </View>
        ) : (
          <View style={[styles.tokenImgWrap, { backgroundColor: `${accentColor}15` }]}>
            <Text style={[styles.tokenImgFallback, { color: accentColor }]}>
              {tokenSymbol?.[0]?.toUpperCase() ?? (isMint ? 'T' : 'D')}
            </Text>
          </View>
        )}

        {/* Name + address */}
        <View style={styles.watchBody}>
          <View style={styles.watchNameRow}>
            <Text style={styles.watchLabel} numberOfLines={1}>
              {tokenName ?? `${item.value.slice(0, 6)}…${item.value.slice(-4)}`}
            </Text>
            {tokenSymbol && (
              <Text style={styles.watchSymbol}>{tokenSymbol}</Text>
            )}
            {!tokenSymbol && (
              <View style={[styles.typeBadge, { backgroundColor: `${accentColor}18` }]}>
                <Text style={[styles.typeText, { color: accentColor }]}>
                  {isMint ? 'TOKEN' : 'DEPLOYER'}
                </Text>
              </View>
            )}
          </View>
          <View style={styles.watchAddressRow}>
            <Text style={styles.watchAddress} numberOfLines={1}>
              {item.value.slice(0, 8)}…{item.value.slice(-6)}
            </Text>
            {riskLevel && <RiskBadge level={riskLevel} size="sm" />}
            {memoryDepth && <MemoryBadge depth={memoryDepth} size="sm" />}
            {flagCount > 0 && flagTypeList && flagTypeList.length > 0 ? (
              <View style={styles.flagRow}>
                {flagTypeList.slice(0, 2).map((ft, i) => (
                  <View key={i} style={[styles.flagPill, ft.includes('CRITICAL') || ft.includes('EXITED') || ft.includes('RUG') || ft.includes('DUMP')
                    ? { backgroundColor: `${tokens.risk.critical}15`, borderColor: `${tokens.risk.critical}30` }
                    : { backgroundColor: `${tokens.warning}15`, borderColor: `${tokens.warning}30` }
                  ]}>
                    <Text style={[styles.flagPillText, ft.includes('CRITICAL') || ft.includes('EXITED') || ft.includes('RUG') || ft.includes('DUMP')
                      ? { color: tokens.risk.critical }
                      : { color: tokens.warning }
                    ]}>{FLAG_LABELS[ft] || ft.replace(/_/g, ' ').toLowerCase()}</Text>
                  </View>
                ))}
                {flagTypeList.length > 2 && (
                  <Text style={styles.flagMore}>+{flagTypeList.length - 2}</Text>
                )}
              </View>
            ) : flagCount > 0 ? (
              <View style={styles.flagBadge}>
                <Text style={styles.flagBadgeText}>{flagCount} flag{flagCount > 1 ? 's' : ''}</Text>
              </View>
            ) : null}
          </View>
        </View>
        {sparklineData && sparklineData.length >= 2 && (
          <RiskSparkline dataPoints={sparklineData} width={50} height={22} />
        )}
      </TouchableOpacity>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  watchCard: {},
  watchInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: tokens.spacing.cardPadding,
    gap: 12,
    flex: 1,
  },
  tokenImgWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
  },
  tokenImg: { width: 40, height: 40 },
  tokenImgFallback: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.subheading,
  },
  watchBody: { flex: 1, gap: 3 },
  watchNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  watchLabel: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.body,
    color: tokens.white100,
  },
  watchSymbol: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.textTertiary,
  },
  typeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: tokens.radius.pill,
    marginBottom: 2,
  },
  typeText: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.tiny,
    letterSpacing: 0.5,
  },
  watchAddressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  watchAddress: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.textTertiary,
    flex: 1,
  },
  flagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 2,
  },
  flagPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
  },
  flagPillText: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: 8,
  },
  flagMore: {
    fontFamily: 'Lexend-Regular',
    fontSize: 8,
    color: tokens.textTertiary,
    alignSelf: 'center',
  },
  flagBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${tokens.warning}18`,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: `${tokens.warning}35`,
  },
  flagBadgeText: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.badge,
    color: tokens.warning,
  },
});
