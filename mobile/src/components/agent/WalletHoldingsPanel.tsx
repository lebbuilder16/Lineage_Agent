import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import {
  Wallet,
  Search,
  RefreshCw,
  AlertTriangle,
  Shield,
  Coins,
} from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { tokens } from '../../theme/tokens';
import { useWalletMonitorStore } from '../../store/wallet-monitor';
import { useAgentPrefsStore } from '../../store/agent-prefs';
import { canAccess, type PlanTier } from '../../lib/tier-limits';

interface WalletHoldingsPanelProps {
  plan: PlanTier;
}

function timeAgo(ts: number | null): string {
  if (!ts) return 'never';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function riskColor(score: number): string {
  if (score >= 75) return tokens.risk.critical;
  if (score >= 50) return tokens.risk.high;
  if (score >= 25) return tokens.risk.medium;
  return tokens.risk.low;
}

function formatAmount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  if (n >= 1) return n.toFixed(1);
  return n.toPrecision(3);
}

function formatUsd(n: number | null): string {
  if (n == null || n === 0) return '';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export function WalletHoldingsPanel({ plan }: WalletHoldingsPanelProps) {
  const { holdings, totalHoldings, totalRisky, lastSweep, loading, scanning, triggerScan, fetchHoldings } =
    useWalletMonitorStore();
  const enabled = useAgentPrefsStore((s) => s.walletMonitorEnabled);

  // Auto-fetch holdings on mount
  React.useEffect(() => {
    if (canAccess(plan, 'pro_plus')) {
      fetchHoldings();
    }
  }, []);

  if (!canAccess(plan, 'pro_plus')) {
    return (
      <View style={styles.emptyWrap}>
        <Shield size={28} color={tokens.gold} />
        <Text style={styles.emptyTitle}>Pro+ Feature</Text>
        <Text style={styles.emptySub}>
          Wallet monitoring is available on Pro+ and Whale plans.
        </Text>
        <TouchableOpacity
          onPress={() => router.push('/paywall' as any)}
          style={styles.upgradeCta}
          activeOpacity={0.7}
        >
          <Text style={styles.upgradeCtaText}>Upgrade</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!enabled && holdings.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Wallet size={28} color={tokens.white20} />
        <Text style={styles.emptyTitle}>Wallet monitoring disabled</Text>
        <Text style={styles.emptySub}>
          Enable it in Settings to scan your holdings for risk automatically.
        </Text>
      </View>
    );
  }

  if (loading && holdings.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <ActivityIndicator color={tokens.secondary} />
        <Text style={styles.emptySub}>Loading holdings...</Text>
      </View>
    );
  }

  if (holdings.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Wallet size={28} color={tokens.white20} />
        <Text style={styles.emptyTitle}>No holdings found</Text>
        <Text style={styles.emptySub}>
          Add a wallet in Settings and run a scan to see your holdings with risk scores.
        </Text>
        <TouchableOpacity
          onPress={() => triggerScan()}
          style={styles.scanCta}
          activeOpacity={0.7}
        >
          <Search size={14} color={tokens.secondary} />
          <Text style={styles.scanCtaText}>Scan Now</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>
            {totalHoldings} token{totalHoldings !== 1 ? 's' : ''}
            {totalRisky > 0 && (
              <Text style={styles.headerRisky}> · {totalRisky} risky</Text>
            )}
          </Text>
          <Text style={styles.headerSub}>Last scan {timeAgo(lastSweep)}</Text>
        </View>
        <TouchableOpacity
          onPress={() => triggerScan()}
          style={styles.refreshBtn}
          activeOpacity={0.7}
          disabled={scanning}
        >
          {scanning ? (
            <ActivityIndicator size="small" color={tokens.secondary} />
          ) : (
            <RefreshCw size={16} color={tokens.secondary} />
          )}
        </TouchableOpacity>
      </View>

      {/* Holdings list */}
      {holdings.map((h, i) => {
        const score = h.risk_score ?? 0;
        const rc = score > 0 ? riskColor(score) : tokens.white20;

        return (
          <Animated.View key={`${h.wallet_address}-${h.mint}`} entering={FadeInDown.delay(i * 30).duration(200)}>
            <TouchableOpacity
              onPress={() => router.push(`/investigate/${h.mint}` as any)}
              activeOpacity={0.7}
              style={styles.holdingCard}
            >
              {/* Token image */}
              {h.image_uri ? (
                <Image source={{ uri: h.image_uri }} style={styles.tokenImg} />
              ) : (
                <View style={[styles.tokenImg, styles.tokenImgPlaceholder]}>
                  <Coins size={14} color={tokens.white20} />
                </View>
              )}

              {/* Info */}
              <View style={styles.holdingInfo}>
                <View style={styles.holdingTopRow}>
                  <Text style={styles.holdingName} numberOfLines={1}>
                    {h.token_name || h.mint.slice(0, 8)}
                  </Text>
                  {h.token_symbol ? (
                    <Text style={styles.holdingSymbol}>${h.token_symbol}</Text>
                  ) : null}
                </View>
                <Text style={styles.holdingMeta}>
                  {formatAmount(h.ui_amount)}
                  {h.liquidity_usd ? ` · Liq ${formatUsd(h.liquidity_usd)}` : ''}
                  {h.last_scanned ? ` · ${timeAgo(h.last_scanned * 1000)}` : ''}
                </Text>
              </View>

              {/* Risk badge */}
              {score > 0 ? (
                <View style={[styles.riskBadge, { backgroundColor: `${rc}12`, borderColor: `${rc}30` }]}>
                  {score >= 50 && <AlertTriangle size={9} color={rc} />}
                  <Text style={[styles.riskText, { color: rc }]}>{score}</Text>
                </View>
              ) : (
                <View style={[styles.riskBadge, { backgroundColor: tokens.bgGlass8, borderColor: tokens.borderSubtle }]}>
                  <Text style={[styles.riskText, { color: tokens.white20 }]}>—</Text>
                </View>
              )}
            </TouchableOpacity>
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 6 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  headerTitle: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.body,
    color: tokens.white100,
  },
  headerRisky: {
    color: tokens.risk.high,
  },
  headerSub: {
    fontFamily: 'Lexend-Regular',
    fontSize: 9,
    color: tokens.textTertiary,
    marginTop: 2,
  },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: `${tokens.secondary}10`,
    borderWidth: 1,
    borderColor: `${tokens.secondary}25`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  holdingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: tokens.bgGlass,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  tokenImg: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  tokenImgPlaceholder: {
    backgroundColor: tokens.bgGlass8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  holdingInfo: {
    flex: 1,
    gap: 2,
  },
  holdingTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  holdingName: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.small,
    color: tokens.white100,
    flexShrink: 1,
  },
  holdingSymbol: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.textTertiary,
  },
  holdingMeta: {
    fontFamily: 'Lexend-Regular',
    fontSize: 9,
    color: tokens.white35,
  },
  riskBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
  },
  riskText: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.tiny,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
    backgroundColor: tokens.bgGlass,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    gap: 8,
  },
  emptyTitle: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.body,
    color: tokens.white60,
    marginTop: 4,
  },
  emptySub: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.textTertiary,
    textAlign: 'center',
    maxWidth: 260,
    lineHeight: 18,
  },
  upgradeCta: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: tokens.radius.pill,
    backgroundColor: `${tokens.gold}15`,
    borderWidth: 1,
    borderColor: `${tokens.gold}40`,
    marginTop: 4,
  },
  upgradeCtaText: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.small,
    color: tokens.gold,
  },
  scanCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: `${tokens.secondary}40`,
    backgroundColor: `${tokens.secondary}08`,
    marginTop: 4,
  },
  scanCtaText: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.small,
    color: tokens.secondary,
  },
});
