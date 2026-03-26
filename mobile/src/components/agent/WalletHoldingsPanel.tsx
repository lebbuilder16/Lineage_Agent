import React, { useEffect, useState, useMemo } from 'react';
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
  TrendingUp,
  CheckCircle,
  X,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from 'lucide-react-native';
import Animated, { FadeInDown, FadeIn, SlideInUp } from 'react-native-reanimated';
import { tokens } from '../../theme/tokens';
import { useWalletMonitorStore } from '../../store/wallet-monitor';
import { useAgentPrefsStore } from '../../store/agent-prefs';
import { canAccess, type PlanTier } from '../../lib/tier-limits';
import type { WalletHolding, ScanResult } from '../../store/wallet-monitor';

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

type SortKey = 'risk' | 'value' | 'liquidity';

function sortHoldings(items: WalletHolding[], key: SortKey): WalletHolding[] {
  return [...items].sort((a, b) => {
    switch (key) {
      case 'risk':
        return (b.risk_score ?? -1) - (a.risk_score ?? -1);
      case 'value':
        return (b.usd_value ?? 0) - (a.usd_value ?? 0);
      case 'liquidity':
        return (b.liquidity_usd ?? 0) - (a.liquidity_usd ?? 0);
    }
  });
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
        {result.holdings_count} scanned
        {result.risky_count > 0 ? ` · ${result.risky_count} risky` : ' · all safe'}
        {result.alerts_sent > 0 ? ` · ${result.alerts_sent} alert${result.alerts_sent > 1 ? 's' : ''}` : ''}
      </Text>
      <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <X size={12} color={tokens.white35} />
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Portfolio Summary ────────────────────────────────────────────────────────

function PortfolioSummary({
  portfolioUsd, riskyUsd, totalHoldings, riskDist, lastSweep,
}: {
  portfolioUsd: number; riskyUsd: number; totalHoldings: number;
  riskDist: { low: number; medium: number; high: number; critical: number };
  lastSweep: number | null;
}) {
  const riskyPct = portfolioUsd > 0 ? Math.round((riskyUsd / portfolioUsd) * 100) : 0;
  const total = riskDist.low + riskDist.medium + riskDist.high + riskDist.critical;

  return (
    <Animated.View entering={FadeIn.duration(300)}>
      <View style={s.summaryCard}>
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

        {total > 0 && (
          <View style={s.distRow}>
            {(['critical', 'high', 'medium', 'low'] as const).map((level) => {
              const count = riskDist[level];
              if (count === 0) return null;
              const pct = Math.max(8, (count / total) * 100);
              const color = level === 'critical' ? tokens.risk.critical
                : level === 'high' ? tokens.risk.high
                : level === 'medium' ? tokens.risk.medium : tokens.risk.low;
              return (
                <View key={level} style={[s.distSegment, { width: `${pct}%`, backgroundColor: color }]}>
                  <Text style={s.distCount}>{count}</Text>
                </View>
              );
            })}
          </View>
        )}

        <Text style={s.summaryMeta}>
          {totalHoldings} token{totalHoldings !== 1 ? 's' : ''}
          {lastSweep ? ` · scanned ${timeAgo(lastSweep)}` : ''}
        </Text>
      </View>
    </Animated.View>
  );
}

// ── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status, prevScore, score }: { status: string; prevScore: number | null; score: number }) {
  if (status === 'new') {
    return (
      <View style={[s.statusBadge, { backgroundColor: `${tokens.cyan}15`, borderColor: `${tokens.cyan}30` }]}>
        <Sparkles size={8} color={tokens.cyan} />
        <Text style={[s.statusText, { color: tokens.cyan }]}>NEW</Text>
      </View>
    );
  }
  if (status === 'risk_up') {
    const delta = prevScore != null ? score - prevScore : 0;
    return (
      <View style={[s.statusBadge, { backgroundColor: `${tokens.risk.critical}12`, borderColor: `${tokens.risk.critical}25` }]}>
        <TrendingUp size={8} color={tokens.risk.critical} />
        <Text style={[s.statusText, { color: tokens.risk.critical }]}>+{delta}</Text>
      </View>
    );
  }
  if (status === 'risk_down') {
    const delta = prevScore != null ? prevScore - score : 0;
    return (
      <View style={[s.statusBadge, { backgroundColor: `${tokens.success}12`, borderColor: `${tokens.success}25` }]}>
        <TrendingDown size={8} color={tokens.success} />
        <Text style={[s.statusText, { color: tokens.success }]}>-{delta}</Text>
      </View>
    );
  }
  return null;
}

// ── Holding Card ─────────────────────────────────────────────────────────────

function HoldingCard({ h, index }: { h: WalletHolding; index: number }) {
  const score = h.risk_score ?? 0;
  const rc = score > 0 ? riskColor(score) : tokens.success;

  return (
    <Animated.View entering={FadeInDown.delay(index * 25).duration(200)}>
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
            <StatusBadge status={h.status} prevScore={h.prev_risk_score} score={score} />
          </View>
          <Text style={s.holdingMeta}>
            {formatAmount(h.ui_amount)}
            {h.usd_value != null && h.usd_value > 0 ? ` · ${formatUsd(h.usd_value)}` : ''}
            {h.liquidity_usd ? ` · Liq ${formatUsd(h.liquidity_usd)}` : ''}
          </Text>
          {/* Inline risk flags */}
          {h.risk_flags && h.risk_flags.length > 0 && (
            <View style={s.flagsRow}>
              {h.risk_flags.slice(0, 3).map((flag, fi) => (
                <View key={fi} style={[s.flagPill, { borderColor: `${rc}25`, backgroundColor: `${rc}08` }]}>
                  <Text style={[s.flagText, { color: rc }]}>{flag}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Risk badge */}
        <View style={[s.riskBadge, { backgroundColor: `${rc}12`, borderColor: `${rc}30` }]}>
          {score >= 50 && <AlertTriangle size={9} color={rc} />}
          <Text style={[s.riskScore, { color: rc }]}>{score > 0 ? score : '--'}</Text>
          <Text style={[s.riskLabelText, { color: rc }]}>{score > 0 ? riskLabel(score) : 'Safe'}</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Sort Bar ─────────────────────────────────────────────────────────────────

function SortBar({ current, onChange }: { current: SortKey; onChange: (k: SortKey) => void }) {
  return (
    <View style={s.sortBar}>
      {([
        { key: 'risk' as SortKey, label: 'Risk' },
        { key: 'value' as SortKey, label: 'Value' },
        { key: 'liquidity' as SortKey, label: 'Liquidity' },
      ]).map(({ key, label }) => (
        <TouchableOpacity
          key={key}
          onPress={() => onChange(key)}
          style={[s.sortChip, current === key && s.sortChipActive]}
          activeOpacity={0.7}
        >
          {current === key && <ArrowUpDown size={9} color={tokens.secondary} />}
          <Text style={[s.sortChipText, current === key && s.sortChipTextActive]}>{label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ── Per-wallet Section ───────────────────────────────────────────────────────

function WalletSection({
  address, label, holdings, startIndex,
}: {
  address: string; label: string; holdings: WalletHolding[]; startIndex: number;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const risky = holdings.filter((h) => (h.risk_score ?? 0) >= 50).length;

  return (
    <View style={s.walletSection}>
      <TouchableOpacity onPress={() => setCollapsed(!collapsed)} style={s.walletHeader} activeOpacity={0.7}>
        <Wallet size={12} color={tokens.textTertiary} />
        <Text style={s.walletLabel}>{label}</Text>
        <Text style={s.walletAddr}>{address.slice(0, 6)}…{address.slice(-4)}</Text>
        <Text style={s.walletCount}>
          {holdings.length}
          {risky > 0 && <Text style={{ color: tokens.risk.high }}> · {risky} risky</Text>}
        </Text>
        {collapsed ? <ChevronDown size={12} color={tokens.white20} /> : <ChevronUp size={12} color={tokens.white20} />}
      </TouchableOpacity>
      {!collapsed && holdings.map((h, i) => (
        <HoldingCard key={`${h.wallet_address}-${h.mint}`} h={h} index={startIndex + i} />
      ))}
    </View>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function WalletHoldingsPanel({ plan }: WalletHoldingsPanelProps) {
  const {
    holdings, totalHoldings, totalRisky, lastSweep, loading, scanning,
    triggerScan, fetchHoldings, portfolioUsd, riskyUsd, riskDistribution,
    lastScanResult, clearScanResult, wallets,
  } = useWalletMonitorStore();
  const enabled = useAgentPrefsStore((s) => s.walletMonitorEnabled);
  const [sortKey, setSortKey] = useState<SortKey>('risk');

  useEffect(() => {
    if (canAccess(plan, 'pro_plus')) {
      fetchHoldings();
    }
  }, []);

  const sorted = useMemo(() => sortHoldings(holdings, sortKey), [holdings, sortKey]);

  // Group by wallet for multi-wallet view
  const hasMultipleWallets = wallets.length > 1;
  const groupedByWallet = useMemo(() => {
    if (!hasMultipleWallets) return null;
    const groups: Record<string, { label: string; holdings: WalletHolding[] }> = {};
    for (const h of sorted) {
      if (!groups[h.wallet_address]) {
        const w = wallets.find((w) => w.address === h.wallet_address);
        groups[h.wallet_address] = {
          label: w?.label || (w?.source === 'embedded' ? 'My Wallet' : 'External'),
          holdings: [],
        };
      }
      groups[h.wallet_address].holdings.push(h);
    }
    return groups;
  }, [sorted, hasMultipleWallets, wallets]);

  // ── Empty states ─────────────────────────────────────────────────────────

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

  // ── Main render ──────────────────────────────────────────────────────────

  let idx = 0;

  return (
    <View style={s.root}>
      {lastScanResult && <ScanToast result={lastScanResult} onDismiss={clearScanResult} />}

      <PortfolioSummary
        portfolioUsd={portfolioUsd} riskyUsd={riskyUsd}
        totalHoldings={totalHoldings} riskDist={riskDistribution} lastSweep={lastSweep}
      />

      {/* Actions + sort */}
      <View style={s.actionsBar}>
        <SortBar current={sortKey} onChange={setSortKey} />
        <TouchableOpacity onPress={() => triggerScan()} style={s.refreshBtn} activeOpacity={0.7} disabled={scanning}>
          {scanning ? <ActivityIndicator size="small" color={tokens.secondary} /> : <RefreshCw size={14} color={tokens.secondary} />}
        </TouchableOpacity>
      </View>

      {/* Per-wallet grouped OR flat list */}
      {groupedByWallet ? (
        Object.entries(groupedByWallet).map(([addr, { label, holdings: wHoldings }]) => {
          const si = idx;
          idx += wHoldings.length;
          return (
            <WalletSection key={addr} address={addr} label={label} holdings={wHoldings} startIndex={si} />
          );
        })
      ) : (
        sorted.map((h, i) => <HoldingCard key={`${h.wallet_address}-${h.mint}`} h={h} index={i} />)
      )}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { gap: 8 },

  // Toast
  toast: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 10, paddingHorizontal: 14,
    backgroundColor: `${tokens.success}12`, borderRadius: tokens.radius.sm,
    borderWidth: 1, borderColor: `${tokens.success}30`,
  },
  toastText: { flex: 1, fontFamily: 'Lexend-Medium', fontSize: tokens.font.small, color: tokens.success },

  // Portfolio summary
  summaryCard: {
    backgroundColor: tokens.bgGlass, borderRadius: tokens.radius.md,
    borderWidth: 1, borderColor: tokens.borderSubtle, padding: 16, gap: 12,
  },
  summaryTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  summaryLabel: { fontFamily: 'Lexend-SemiBold', fontSize: 9, color: tokens.textTertiary, letterSpacing: 1 },
  summaryValue: { fontFamily: 'Lexend-Bold', fontSize: 24, color: tokens.white100, marginTop: 2 },
  riskyBlock: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: `${tokens.risk.high}10`, borderRadius: tokens.radius.sm,
    paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: `${tokens.risk.high}20`,
  },
  riskyValue: { fontFamily: 'Lexend-Bold', fontSize: tokens.font.small, color: tokens.risk.high },
  riskyLabel: { fontFamily: 'Lexend-Regular', fontSize: 9, color: tokens.risk.high },
  distRow: { flexDirection: 'row', height: 20, borderRadius: 10, overflow: 'hidden', gap: 2 },
  distSegment: { alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  distCount: { fontFamily: 'Lexend-Bold', fontSize: 9, color: tokens.white100 },
  summaryMeta: { fontFamily: 'Lexend-Regular', fontSize: 9, color: tokens.textTertiary },

  // Sort bar
  sortBar: { flexDirection: 'row', gap: 6, flex: 1 },
  sortChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: tokens.radius.pill, backgroundColor: tokens.bgGlass8,
    borderWidth: 1, borderColor: tokens.borderSubtle,
  },
  sortChipActive: { backgroundColor: `${tokens.secondary}12`, borderColor: `${tokens.secondary}30` },
  sortChipText: { fontFamily: 'Lexend-Medium', fontSize: 10, color: tokens.textTertiary },
  sortChipTextActive: { color: tokens.secondary },

  // Actions bar
  actionsBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 2 },
  refreshBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: `${tokens.secondary}10`, borderWidth: 1, borderColor: `${tokens.secondary}25`,
    alignItems: 'center', justifyContent: 'center',
  },

  // Status badges
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    paddingHorizontal: 5, paddingVertical: 1, borderRadius: tokens.radius.pill, borderWidth: 1,
  },
  statusText: { fontFamily: 'Lexend-Bold', fontSize: 8 },

  // Holding card
  holdingCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: tokens.bgGlass, borderRadius: tokens.radius.sm,
    borderWidth: 1, borderColor: tokens.borderSubtle,
    paddingVertical: 10, paddingHorizontal: 12,
  },
  tokenImg: { width: 34, height: 34, borderRadius: 17 },
  tokenImgPlaceholder: { backgroundColor: tokens.bgGlass8, alignItems: 'center', justifyContent: 'center' },
  holdingInfo: { flex: 1, gap: 2 },
  holdingTopRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  holdingName: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.small, color: tokens.white100, flexShrink: 1 },
  holdingSymbol: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.textTertiary },
  holdingMeta: { fontFamily: 'Lexend-Regular', fontSize: 9, color: tokens.white35 },

  // Risk flags inline
  flagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 3, marginTop: 3 },
  flagPill: {
    paddingHorizontal: 5, paddingVertical: 1, borderRadius: tokens.radius.pill, borderWidth: 1,
  },
  flagText: { fontFamily: 'Lexend-Medium', fontSize: 8 },

  // Risk badge
  riskBadge: {
    alignItems: 'center', gap: 1, paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: tokens.radius.sm, borderWidth: 1, minWidth: 44,
  },
  riskScore: { fontFamily: 'Lexend-Bold', fontSize: tokens.font.small },
  riskLabelText: { fontFamily: 'Lexend-Regular', fontSize: 8, letterSpacing: 0.3 },

  // Per-wallet section
  walletSection: { gap: 6 },
  walletHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 6, paddingHorizontal: 4,
  },
  walletLabel: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.small, color: tokens.white80 },
  walletAddr: { fontFamily: 'Lexend-Regular', fontSize: 9, color: tokens.white20, flex: 1 },
  walletCount: { fontFamily: 'Lexend-Medium', fontSize: 10, color: tokens.textTertiary },

  // Empty states
  emptyWrap: {
    alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24,
    backgroundColor: tokens.bgGlass, borderRadius: tokens.radius.md,
    borderWidth: 1, borderColor: tokens.borderSubtle, gap: 8,
  },
  emptyTitle: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.body, color: tokens.white60, marginTop: 4 },
  emptySub: {
    fontFamily: 'Lexend-Regular', fontSize: tokens.font.small, color: tokens.textTertiary,
    textAlign: 'center', maxWidth: 260, lineHeight: 18,
  },
  upgradeCta: {
    paddingHorizontal: 18, paddingVertical: 8, borderRadius: tokens.radius.pill,
    backgroundColor: `${tokens.gold}15`, borderWidth: 1, borderColor: `${tokens.gold}40`, marginTop: 4,
  },
  upgradeCtaText: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.small, color: tokens.gold },
  scanCta: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 18, paddingVertical: 10, borderRadius: tokens.radius.pill,
    borderWidth: 1, borderColor: `${tokens.secondary}40`, backgroundColor: `${tokens.secondary}08`, marginTop: 4,
  },
  scanCtaText: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.small, color: tokens.secondary },
});
