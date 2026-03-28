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
import { BookmarkPlus, Check, ScanLine } from 'lucide-react-native';
import { tokens } from '../../theme/tokens';
import { RiskBadge } from '../ui/RiskBadge';
import { useAddWatch } from '../../lib/query';
import { useAuthStore } from '../../store/auth';
import { useHistoryStore } from '../../store/history';
import { fmtMcap, fmtCount } from '../../lib/format';
import { deriveMarketRisk } from '../../lib/risk';
import type { TokenSearchResult } from '../../types/api';

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
  // Use forensic score from investigation history if available
  const forensic = useHistoryStore.getState().getByMint(token.mint);
  const risk = deriveMarketRisk(token, forensic ? { riskScore: forensic.riskScore } : undefined);

  const riskAccent =
    risk === 'critical' ? tokens.risk.critical
    : risk === 'high' ? tokens.risk.high
    : risk === 'medium' ? tokens.risk.medium
    : tokens.risk.low;

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
        <View style={[styles.tokenCard, { borderLeftColor: `${riskAccent}40`, borderLeftWidth: 3 }]}>
        {/* Rank */}
        {rank != null && (
          <View style={styles.rankBadge}>
            <Text style={[
              styles.rankText,
              rank === 1 && { color: '#FFD700' },
              rank === 2 && { color: '#C0C0C0' },
              rank === 3 && { color: '#CD7F32' },
            ]}>
              {rank}
            </Text>
          </View>
        )}

        {/* Avatar */}
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

        <View style={styles.tokenRight}>
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
    gap: 8,
    backgroundColor: tokens.bgGlass,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    paddingHorizontal: 10,
    paddingVertical: 8,
    overflow: 'hidden',
  },
  rankBadge: { width: 20, alignItems: 'center' },
  rankText: { fontFamily: 'Lexend-Bold', fontSize: 11, color: tokens.textTertiary },
  tokenImage: { width: 32, height: 32, borderRadius: 8 },
  tokenImageFallback: { backgroundColor: tokens.bgGlass12, alignItems: 'center', justifyContent: 'center' },
  tokenImageFallbackText: { fontFamily: 'Lexend-Bold', fontSize: 13, color: tokens.white60 },
  tokenInfo: { flex: 1, gap: 3 },
  tokenNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tokenName: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.body, color: tokens.white100, flexShrink: 1 },
  tokenMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tokenSymbol: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.small, color: tokens.textTertiary },
  tokenMcap: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.small, color: tokens.white60 },
  scanCountRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  scanCountText: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: `${tokens.secondary}70` },
  tokenRight: { alignItems: 'flex-end', gap: 6 },
  newBadge: { backgroundColor: `${tokens.secondary}15`, borderRadius: tokens.radius.pill, paddingHorizontal: 5, paddingVertical: 2 },
  newBadgeText: { fontFamily: 'Lexend-Bold', fontSize: 9, color: tokens.secondary, letterSpacing: 0.8 },
  watchBtn: {
    width: 24,
    height: 24,
    borderRadius: tokens.radius.xs,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  watchBtnActive: { borderColor: `${tokens.success}40`, backgroundColor: `${tokens.success}10` },
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
