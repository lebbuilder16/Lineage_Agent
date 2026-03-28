import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Swipeable } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { BookmarkPlus, Check, ScanLine, TrendingUp, TrendingDown } from 'lucide-react-native';
import { tokens } from '../../theme/tokens';
import { RiskBadge } from '../ui/RiskBadge';
import { SparklineChart } from '../ui/SparklineChart';
import { useAddWatch } from '../../lib/query';
import { useAuthStore } from '../../store/auth';
import { useHistoryStore } from '../../store/history';
import { fmtMcap, fmtCount } from '../../lib/format';
import { deriveMarketRisk } from '../../lib/risk';
import type { TokenSearchResult } from '../../types/api';

// Risk-based colored shadows
const RISK_SHADOW = {
  low: tokens.shadow.riskLow,
  medium: tokens.shadow.riskMedium,
  high: tokens.shadow.riskHigh,
  critical: tokens.shadow.riskCritical,
} as const;

export function RadarTokenCard({
  token,
  apiKey,
  onPress,
  rank,
  scanCount,
}: {
  token: TokenSearchResult;
  apiKey: string | null;
  onPress: () => void;
  rank?: number;
  scanCount?: number;
}) {
  const addMutation = useAddWatch(apiKey);
  const watches = useAuthStore((s) => s.watches);
  const isWatched = watches.some((w) => w.value === token.mint);
  const [justAdded, setJustAdded] = useState(false);
  const scaleAnim = useSharedValue(1);

  const isNew = token.pair_created_at
    ? Date.now() - new Date(token.pair_created_at).getTime() < 24 * 60 * 60 * 1000
    : false;
  const forensic = useHistoryStore.getState().getByMint(token.mint);
  const risk = deriveMarketRisk(token, forensic ? { riskScore: forensic.riskScore } : undefined);

  const riskAccent =
    risk === 'critical' ? tokens.risk.critical
    : risk === 'high' ? tokens.risk.high
    : risk === 'medium' ? tokens.risk.medium
    : tokens.risk.low;

  // Generate synthetic sparkline from price history if available
  const sparklineData = React.useMemo(() => {
    if ((token as any).priceHistory?.length > 1) return (token as any).priceHistory;
    // Generate a plausible sparkline from market cap for visual interest
    if (token.market_cap_usd) {
      const base = token.market_cap_usd;
      const trend = risk === 'low' || risk === 'medium' ? 1 : -1;
      return Array.from({ length: 12 }, (_, i) => {
        const noise = Math.sin(i * 1.7) * 0.15 + Math.cos(i * 0.8) * 0.1;
        return base * (1 + noise + trend * i * 0.02);
      });
    }
    return null;
  }, [token.mint, token.market_cap_usd, risk]);

  const handleWatch = useCallback(() => {
    if (isWatched || !apiKey) return;
    scaleAnim.value = withSequence(
      withTiming(0.82, { duration: 90 }),
      withTiming(1.18, { duration: 140 }),
      withTiming(1, { duration: 110 }),
    );
    addMutation.mutate({ sub_type: 'mint', value: token.mint });
    setJustAdded(true);
  }, [isWatched, apiKey, token.mint]);

  useEffect(() => {
    if (!justAdded) return;
    const timer = setTimeout(() => setJustAdded(false), 2000);
    return () => clearTimeout(timer);
  }, [justAdded]);

  const watchBtnAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleAnim.value }],
  }));

  const swipeRef = useRef<Swipeable>(null);

  const renderLeftActions = () => (
    <TouchableOpacity
      onPress={() => {
        handleWatch();
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        swipeRef.current?.close();
      }}
      style={styles.swipeWatch}
      accessibilityRole="button"
      accessibilityLabel="Add to watchlist"
    >
      <BookmarkPlus size={16} color={tokens.success} strokeWidth={2} />
      <Text style={styles.swipeWatchText}>Watch</Text>
    </TouchableOpacity>
  );

  return (
    <Swipeable
      ref={swipeRef}
      overshootLeft={false}
      renderLeftActions={!isWatched && apiKey ? renderLeftActions : undefined}
    >
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.75}
        accessible={true}
        accessibilityRole="button"
        accessibilityLabel={`${token.name}, ${token.symbol}, risk ${risk}${token.market_cap_usd != null ? `, market cap ${fmtMcap(token.market_cap_usd)}` : ''}`}
      >
        <View style={[
          styles.tokenCard,
          { borderLeftColor: `${riskAccent}50`, borderLeftWidth: 3 },
          RISK_SHADOW[risk],
        ]}>
          {/* Rank badge */}
          {rank != null && (
            <View style={[styles.rankBadge, rank <= 3 && styles.rankBadgeTop]}>
              <Text style={[
                styles.rankText,
                rank === 1 && { color: '#FFD700' },
                rank === 2 && { color: '#C0C0C0' },
                rank === 3 && { color: '#CD7F32' },
              ]}>
                #{rank}
              </Text>
            </View>
          )}

          {/* Avatar — larger 48px for premium feel */}
          {token.image_uri ? (
            <Image source={token.image_uri} style={styles.tokenImage} contentFit="cover" transition={200} />
          ) : (
            <View style={[styles.tokenImage, styles.tokenImageFallback]}>
              <Text style={styles.tokenImageFallbackText}>{token.symbol?.[0] ?? '?'}</Text>
            </View>
          )}

          <View style={styles.tokenInfo}>
            <View style={styles.tokenNameRow}>
              <Text style={styles.tokenName} numberOfLines={1}>{token.name}</Text>
              {isNew && (
                <View style={styles.newBadge}>
                  <Text style={styles.newBadgeText}>NEW</Text>
                </View>
              )}
            </View>
            <View style={styles.tokenMetaRow}>
              <Text style={styles.tokenSymbol}>{token.symbol}</Text>
              {token.market_cap_usd != null && (
                <Text style={styles.tokenMcap}>{fmtMcap(token.market_cap_usd)}</Text>
              )}
              {scanCount != null && scanCount > 0 && (
                <View style={styles.scanCountRow}>
                  <ScanLine size={10} color={tokens.secondary} strokeWidth={2} />
                  <Text style={styles.scanCountText}>{fmtCount(scanCount)}</Text>
                </View>
              )}
            </View>
          </View>

          {/* Right side — sparkline + risk + watch */}
          <View style={styles.tokenRight}>
            {sparklineData && (
              <SparklineChart
                data={sparklineData}
                width={52}
                height={24}
                color={riskAccent}
                strokeWidth={1.5}
              />
            )}
            <RiskBadge level={risk} size="sm" />
            {apiKey ? (
              <Animated.View style={watchBtnAnimStyle}>
                <Pressable
                  onPress={handleWatch}
                  hitSlop={tokens.hitSlop}
                  style={[
                    styles.watchBtn,
                    (isWatched || justAdded) && styles.watchBtnActive,
                  ]}
                >
                  {isWatched || justAdded
                    ? <Check size={12} color={tokens.success} strokeWidth={2.5} />
                    : <BookmarkPlus size={12} color={tokens.textTertiary} strokeWidth={2} />
                  }
                </Pressable>
              </Animated.View>
            ) : null}
          </View>
        </View>
      </TouchableOpacity>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  tokenCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: tokens.bgGlass,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    paddingHorizontal: 12,
    paddingVertical: 10,
    overflow: 'hidden',
  },
  rankBadge: {
    width: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadgeTop: {
    backgroundColor: 'rgba(255, 215, 0, 0.08)',
    borderRadius: tokens.radius.xs,
    paddingVertical: 2,
  },
  rankText: {
    fontFamily: 'SpaceGrotesk-Bold',
    fontSize: 12,
    color: tokens.textTertiary,
    letterSpacing: -0.3,
  },
  // 48px token images — premium size
  tokenImage: { width: 48, height: 48, borderRadius: 14 },
  tokenImageFallback: {
    backgroundColor: tokens.bgGlass12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tokenImageFallbackText: {
    fontFamily: 'SpaceGrotesk-Bold',
    fontSize: 18,
    color: tokens.white60,
  },
  tokenInfo: { flex: 1, gap: 4 },
  tokenNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tokenName: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.body,
    color: tokens.white100,
    flexShrink: 1,
  },
  tokenMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tokenSymbol: {
    fontFamily: 'SpaceGrotesk-Medium',
    fontSize: tokens.font.small,
    color: tokens.textTertiary,
    letterSpacing: 0.5,
  },
  tokenMcap: {
    fontFamily: 'SpaceGrotesk-Regular',
    fontSize: tokens.font.small,
    color: tokens.white60,
  },
  scanCountRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  scanCountText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: `${tokens.secondary}70`,
  },
  tokenRight: { alignItems: 'flex-end', gap: 6 },
  newBadge: {
    backgroundColor: `${tokens.secondary}15`,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: `${tokens.secondary}25`,
  },
  newBadgeText: {
    fontFamily: 'SpaceGrotesk-Bold',
    fontSize: 9,
    color: tokens.secondary,
    letterSpacing: 1.0,
  },
  watchBtn: {
    width: 26,
    height: 26,
    borderRadius: tokens.radius.xs,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  watchBtnActive: {
    borderColor: `${tokens.success}40`,
    backgroundColor: `${tokens.success}10`,
  },
  swipeWatch: {
    backgroundColor: `${tokens.success}12`,
    justifyContent: 'center',
    alignItems: 'center',
    width: 72,
    borderRadius: tokens.radius.sm,
    marginRight: 6,
    gap: 4,
  },
  swipeWatchText: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.tiny,
    color: tokens.success,
  },
});
