import React, { useEffect, useState } from 'react';
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
  TrendingDown,
  CheckCircle,
  X,
} from 'lucide-react-native';
import Animated, { FadeInDown, FadeIn, SlideInUp } from 'react-native-reanimated';
import { tokens } from '../../theme/tokens';
import { useWalletMonitorStore } from '../../store/wallet-monitor';
import { useAgentPrefsStore } from '../../store/agent-prefs';
import { canAccess, type PlanTier } from '../../lib/tier-limits';
import type { ScanResult } from '../../store/wallet-monitor';

interface WalletHoldingsPanelProps {
  plan: PlanTier;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

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

function riskLabel(score: number): string {
  if (score >= 75) return 'Critical';
  if (score >= 50) return 'High';
  if (score >= 25) return 'Medium';
  return 'Safe';
}

function formatUsd(n: number | null | undefined): string {
  if (n == null || n === 0) return '$0';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toPrecision(3)}`;
}

function formatAmount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  if (n >= 1) return n.toFixed(1);
  return n.toPrecision(3);
}

// ── Scan Toast ───────────────────────────────────────────────────────────────

function ScanToast({ result, onDismiss }: { result: ScanResult; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 5000);
    return () => clearTimeout(t);
  }, []);

  return (
    <Animated.View entering={SlideInUp.duration(300)} style={s.toast}>
      <CheckCircle size={14} color={tokens.success} />
      <Text style={s.toastText}>
        {result.holdings_count} tokens scanned
        {result.risky_count > 0 ? ` · ${result.risky_count} risky` : ' · all safe'}
        {result.alerts_sent > 0 ? ` · ${result.alerts_sent} alert${result.alerts_sent > 1 ? 's' : ''} sent` : ''}
      </Text>
      <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <X size={12} color={tokens.white35} />
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Portfolio Summary Card ───────────────────────────────────────────────────

function PortfolioSummary({
  portfolioUsd,
  riskyUsd,
  totalHoldings,
  riskDist,
  lastSweep,
}: {
  portfolioUsd: number;
  riskyUsd: number;
  totalHoldings: number;
  riskDist: { low: number; medium: number; high: number; critical: number };
  lastSweep: number | null;
}) {
  const riskyPct = portfolioUsd > 0 ? Math.round((riskyUsd / portfolioUsd) * 100) : 0;
  const total = riskDist.low + riskDist.medium + riskDist.high + riskDist.critical;

  return (
    <Animated.View entering={FadeIn.duration(300)}>
      <View style={s.summaryCard}>
        {/* Top: Portfolio value */}
        <View style={s.summaryTop}>
          <View>
            <Text style={s.summaryLabel}>PORTFOLIO VALUE</Text>
            <Text style={s.summaryValue}>{formatUsd(portfolioUsd)}</Text>
          </View>
          {riskyUsd > 0 && (
            <View style={s.riskyBlock}>
              <TrendingDown size={12} color={tokens.risk.high} />
              <View>
                <Text style={s.riskyValue}>{formatUsd(riskyUsd)}</Text>
                <Text style={s.riskyLabel}>{riskyPct}% at risk</Text>
              </View>
            </View>
          )}
        </View>

        {/* Risk distribution bar */}
        {total > 0 && (
          <View style={s.distRow}>
            {(['critical', 'high', 'medium', 'low'] as const).map((level) => {
              const count = riskDist[level];
              if (count === 0) return null;
              const pct = Math.max(8, (count / total) * 100);
              const color = level === 'critical' ? tokens.risk.critical
                : level === 'high' ? tokens.risk.high
                : level === 'medium' ? tokens.risk.medium
                : tokens.risk.low;
              return (
                <View key={level} style={[s.distSegment, { width: `${pct}%`, backgroundColor: color }]}>
                  <Text style={s.distCount}>{count}</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Footer */}
        <Text style={s.summaryMeta}>
          {totalHoldings} token{totalHoldings !== 1 ? 's' : ''}
          {lastSweep ? ` · scanned ${timeAgo(lastSweep)}` : ''}
        </Text>
      </View>
    </Animated.View>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function WalletHoldingsPanel({ plan }: WalletHoldingsPanelProps) {
  const {
    holdings, totalHoldings, totalRisky, lastSweep, loading, scanning,
    triggerScan, fetchHoldings, portfolioUsd, riskyUsd, riskDistribution,
    lastScanResult, clearScanResult,
  } = useWalletMonitorStore();
  const enabled = useAgentPrefsStore((s) => s.walletMonitorEnabled);

  useEffect(() => {
    if (canAccess(plan, 'pro_plus')) fetchHoldings();
  }, []);

  if (!canAccess(plan, 'pro_plus')) {
    return (
      <View style={s.emptyWrap}>
        <Shield size={28} color={tokens.gold} />
        <Text style={s.emptyTitle}>Pro+ Feature</Text>
        <Text style={s.emptySub}>Wallet monitoring is available on Pro+ and Whale plans.</Text>
        <TouchableOpacity onPress={() => router.push('/paywall' as any)} style={s.upgradeCta} activeOpacity={0.7}>
          <Text style={s.upgradeCtaText}>Upgrade</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!enabled && holdings.length === 0) {
    return (
      <View style={s.emptyWrap}>
        <Wallet size={28} color={tokens.white20} />
        <Text style={s.emptyTitle}>Wallet monitoring disabled</Text>
        <Text style={s.emptySub}>Enable it in Settings, add a wallet, and scan to see your holdings with risk scores.</Text>
      </View>
    );
  }

  if (loading && holdings.length === 0) {
    return (
      <View style={s.emptyWrap}>
        <ActivityIndicator color={tokens.secondary} />
        <Text style={s.emptySub}>Loading holdings...</Text>
      </View>
    );
  }

  if (holdings.length === 0) {
    return (
      <View style={s.emptyWrap}>
        <Wallet size={28} color={tokens.white20} />
        <Text style={s.emptyTitle}>No holdings found</Text>
        <Text style={s.emptySub}>Add a wallet in Settings and run a scan.</Text>
        <TouchableOpacity onPress={() => triggerScan()} style={s.scanCta} activeOpacity={0.7}>
          <Search size={14} color={tokens.secondary} />
          <Text style={s.scanCtaText}>Scan Now</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={s.root}>
      {/* Scan result toast */}
      {lastScanResult && (
        <ScanToast result={lastScanResult} onDismiss={clearScanResult} />
      )}

      {/* Portfolio summary */}
      <PortfolioSummary
        portfolioUsd={portfolioUsd}
        riskyUsd={riskyUsd}
        totalHoldings={totalHoldings}
        riskDist={riskDistribution}
        lastSweep={lastSweep}
      />

      {/* Actions bar */}
      <View style={s.actionsBar}>
        <Text style={s.actionsTitle}>
          {totalHoldings} token{totalHoldings !== 1 ? 's' : ''}
          {totalRisky > 0 && <Text style={{ color: tokens.risk.high }}> · {totalRisky} risky</Text>}
        </Text>
        <TouchableOpacity onPress={() => triggerScan()} style={s.refreshBtn} activeOpacity={0.7} disabled={scanning}>
          {scanning ? <ActivityIndicator size="small" color={tokens.secondary} /> : <RefreshCw size={14} color={tokens.secondary} />}
        </TouchableOpacity>
      </View>

      {/* Holdings list */}
      {holdings.map((h, i) => {
        const score = h.risk_score ?? 0;
        const rc = score > 0 ? riskColor(score) : tokens.white20;
        const usdVal = h.usd_value;

        return (
          <Animated.View key={`${h.wallet_address}-${h.mint}`} entering={FadeInDown.delay(i * 25).duration(200)}>
            <TouchableOpacity onPress={() => router.push(`/investigate/${h.mint}` as any)} activeOpacity={0.7} style={s.holdingCard}>
              {/* Token image */}
              {h.image_uri ? (
                <Image source={{ uri: h.image_uri }} style={s.tokenImg} />
              ) : (
                <View style={[s.tokenImg, s.tokenImgPlaceholder]}>
                  <Coins size={14} color={tokens.white20} />
                </View>
              )}

              {/* Info */}
              <View style={s.holdingInfo}>
                <View style={s.holdingTopRow}>
                  <Text style={s.holdingName} numberOfLines={1}>{h.token_name || h.mint.slice(0, 8)}</Text>
                  {h.token_symbol ? <Text style={s.holdingSymbol}>${h.token_symbol}</Text> : null}
                </View>
                <Text style={s.holdingMeta}>
                  {formatAmount(h.ui_amount)}
                  {usdVal != null && usdVal > 0 ? ` · ${formatUsd(usdVal)}` : ''}
                  {h.liquidity_usd ? ` · Liq ${formatUsd(h.liquidity_usd)}` : ''}
                </Text>
              </View>

              {/* Risk badge */}
              {score > 0 ? (
                <View style={[s.riskBadge, { backgroundColor: `${rc}12`, borderColor: `${rc}30` }]}>
                  {score >= 50 && <AlertTriangle size={9} color={rc} />}
                  <Text style={[s.riskScore, { color: rc }]}>{score}</Text>
                  <Text style={[s.riskLabelText, { color: rc }]}>{riskLabel(score)}</Text>
                </View>
              ) : (
                <View style={[s.riskBadge, { backgroundColor: `${tokens.success}08`, borderColor: `${tokens.success}20` }]}>
                  <Text style={[s.riskScore, { color: tokens.success }]}>--</Text>
                  <Text style={[s.riskLabelText, { color: tokens.success }]}>Safe</Text>
                </View>
              )}
            </TouchableOpacity>
          </Animated.View>
        );
      })}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { gap: 8 },

  // Toast
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: `${tokens.success}12`,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: `${tokens.success}30`,
  },
  toastText: {
    flex: 1,
    fontFamily: 'Lexend-Medium',
    fontSize: tokens.font.small,
    color: tokens.success,
  },

  // Portfolio summary
  summaryCard: {
    backgroundColor: tokens.bgGlass,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    padding: 16,
    gap: 12,
  },
  summaryTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  summaryLabel: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: 9,
    color: tokens.textTertiary,
    letterSpacing: 1,
  },
  summaryValue: {
    fontFamily: 'Lexend-Bold',
    fontSize: 24,
    color: tokens.white100,
    marginTop: 2,
  },
  riskyBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: `${tokens.risk.high}10`,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: `${tokens.risk.high}20`,
  },
  riskyValue: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.small,
    color: tokens.risk.high,
  },
  riskyLabel: {
    fontFamily: 'Lexend-Regular',
    fontSize: 9,
    color: tokens.risk.high,
  },
  distRow: {
    flexDirection: 'row',
    height: 20,
    borderRadius: 10,
    overflow: 'hidden',
    gap: 2,
  },
  distSegment: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  distCount: {
    fontFamily: 'Lexend-Bold',
    fontSize: 9,
    color: tokens.white100,
  },
  summaryMeta: {
    fontFamily: 'Lexend-Regular',
    fontSize: 9,
    color: tokens.textTertiary,
  },

  // Actions bar
  actionsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  actionsTitle: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.small,
    color: tokens.white80,
  },
  refreshBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: `${tokens.secondary}10`,
    borderWidth: 1,
    borderColor: `${tokens.secondary}25`,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Holding card
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
  tokenImg: { width: 34, height: 34, borderRadius: 17 },
  tokenImgPlaceholder: {
    backgroundColor: tokens.bgGlass8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  holdingInfo: { flex: 1, gap: 2 },
  holdingTopRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
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
    alignItems: 'center',
    gap: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    minWidth: 44,
  },
  riskScore: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.small,
  },
  riskLabelText: {
    fontFamily: 'Lexend-Regular',
    fontSize: 8,
    letterSpacing: 0.3,
  },

  // Empty states
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
