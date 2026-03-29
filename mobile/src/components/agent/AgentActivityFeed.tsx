import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import {
  Eye,
  Search,
  AlertTriangle,
  Shield,
  Filter,
} from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { tokens } from '../../theme/tokens';
import { tokenName as fmtName, tokenSymbol as fmtSym } from '../../lib/token-display';

// ── Types ────────────────────────────────────────────────────────────────────

export interface FeedItem {
  id: string;
  category: 'investigation' | 'alert' | 'flag';
  categoryLabel: string;
  icon: any;
  tokenName: string;
  tokenSymbol: string;
  mint: string;
  summary: string;
  detail?: string;
  riskScore?: number;
  time: number;
  color: string;
  read?: boolean;
}

interface AgentActivityFeedProps {
  feedItems: FeedItem[];
}

type FilterKey = 'all' | 'critical' | 'high' | 'recent';

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeAgoShort(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function riskLabel(score: number): string {
  if (score >= 75) return 'Critical';
  if (score >= 50) return 'High';
  if (score >= 25) return 'Medium';
  return 'Low';
}

function riskColor(score: number): string {
  if (score >= 75) return tokens.risk.critical;
  if (score >= 50) return tokens.risk.high;
  if (score >= 25) return tokens.risk.medium;
  return tokens.risk.low;
}

// ── Filter Bar ───────────────────────────────────────────────────────────────

function FilterBar({
  active,
  onChange,
  counts,
}: {
  active: FilterKey;
  onChange: (k: FilterKey) => void;
  counts: { all: number; critical: number; high: number; recent: number };
}) {
  const filters: { key: FilterKey; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'critical', label: 'Critical', count: counts.critical },
    { key: 'high', label: 'High', count: counts.high },
    { key: 'recent', label: '24h', count: counts.recent },
  ];

  return (
    <View style={s.filterBar}>
      {filters.map(({ key, label, count }) => {
        const isActive = active === key;
        return (
          <TouchableOpacity
            key={key}
            onPress={() => onChange(key)}
            style={[s.filterChip, isActive && s.filterChipActive]}
            activeOpacity={0.7}
          >
            <Text style={[s.filterText, isActive && s.filterTextActive]}>
              {label}
            </Text>
            {count > 0 && key !== 'all' && (
              <View style={[s.filterBadge, isActive && s.filterBadgeActive]}>
                <Text style={s.filterBadgeText}>{count > 9 ? '9+' : count}</Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── Compact Card (Low/Medium risk) ───────────────────────────────────────────

function CompactCard({ item, index }: { item: FeedItem; index: number }) {
  const Icon = item.icon;
  const score = item.riskScore ?? 0;
  const rc = score > 0 ? riskColor(score) : tokens.white35;
  const [expanded, setExpanded] = useState(false);

  const handlePress = () => setExpanded((e) => !e);

  return (
    <Animated.View entering={FadeInDown.delay(index * 20).duration(200)}>
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.7}
        style={s.compactCard}
      >
        <View style={[s.compactDot, { backgroundColor: item.color }]} />
        <Icon size={12} color={item.color} strokeWidth={2.5} />
        <View style={s.compactBody}>
          <Text style={s.compactName} numberOfLines={1}>
            {fmtName(item.tokenName, item.tokenSymbol, item.mint)}
            {item.tokenSymbol ? ` ${fmtSym(item.tokenSymbol)}` : ''}
          </Text>
          <Text style={s.compactSummary} numberOfLines={expanded ? 20 : 1}>{item.summary}</Text>
        </View>
        {score > 0 && (
          <Text style={[s.compactScore, { color: rc }]}>{score}</Text>
        )}
        <Text style={s.compactTime}>{timeAgoShort(item.time)}</Text>
      </TouchableOpacity>
      {expanded && (
        <View style={s.expandedDetail}>
          {item.detail && <Text style={s.expandedText}>{item.detail}</Text>}
          <TouchableOpacity onPress={() => router.push(`/investigate/${item.mint}` as any)} activeOpacity={0.7} style={s.expandedCta}>
            <Text style={s.expandedCtaText}>{item.category === 'investigation' ? 'View Report' : 'Investigate'}</Text>
          </TouchableOpacity>
        </View>
      )}
    </Animated.View>
  );
}

// ── Prominent Card (High/Critical risk) ──────────────────────────────────────

function PromCard({ item, index }: { item: FeedItem; index: number }) {
  const Icon = item.icon;
  const score = item.riskScore ?? 0;
  const rc = score > 0 ? riskColor(score) : item.color;
  const [expanded, setExpanded] = useState(false);

  const handlePress = () => setExpanded((e) => !e);

  return (
    <Animated.View entering={FadeInDown.delay(index * 25).duration(250)}>
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.7}
        style={[s.promCard, { borderColor: `${rc}25` }]}
      >
        {/* Accent */}
        <View style={[s.promAccent, { backgroundColor: rc }]} />

        <View style={s.promBody}>
          {/* Header: icon + name + score + time */}
          <View style={s.promHeader}>
            <View style={[s.promIconWrap, { backgroundColor: `${rc}15` }]}>
              <Icon size={14} color={rc} strokeWidth={2.5} />
            </View>
            <View style={s.promNameCol}>
              <Text style={s.promName} numberOfLines={1}>
                {item.tokenName}
                {item.tokenSymbol ? ` $${item.tokenSymbol}` : ''}
              </Text>
              <Text style={[s.promCategory, { color: rc }]}>{item.categoryLabel}</Text>
            </View>
            {score > 0 && (
              <View style={[s.promScorePill, { backgroundColor: `${rc}12`, borderColor: `${rc}30` }]}>
                <Text style={[s.promScoreNum, { color: rc }]}>{score}</Text>
                <Text style={[s.promScoreLabel, { color: rc }]}>{riskLabel(score)}</Text>
              </View>
            )}
            <Text style={s.promTime}>{timeAgoShort(item.time)}</Text>
          </View>

          {/* Summary */}
          <Text style={s.promSummary} numberOfLines={expanded ? 20 : 2}>{item.summary}</Text>

          {/* Detail (if available) */}
          {item.detail && (
            <Text style={s.promDetail} numberOfLines={expanded ? 20 : 1}>{item.detail}</Text>
          )}

          {/* Expanded: CTA to view full report */}
          {expanded && (
            <View style={s.expandedDetail}>
              <TouchableOpacity onPress={() => router.push(`/investigate/${item.mint}` as any)} activeOpacity={0.7} style={s.expandedCta}>
                <Text style={s.expandedCtaText}>{item.category === 'investigation' ? 'View Report' : 'Full Investigation'}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function AgentActivityFeed({ feedItems }: AgentActivityFeedProps) {
  const [filter, setFilter] = useState<FilterKey>('all');

  // Counts for filter badges
  const counts = useMemo(() => {
    const now = Date.now();
    return {
      all: feedItems.length,
      critical: feedItems.filter((i) => (i.riskScore ?? 0) >= 75).length,
      high: feedItems.filter((i) => (i.riskScore ?? 0) >= 50).length,
      recent: feedItems.filter((i) => now - i.time < 24 * 3600 * 1000).length,
    };
  }, [feedItems]);

  // Apply filter
  const filtered = useMemo(() => {
    const now = Date.now();
    switch (filter) {
      case 'critical':
        return feedItems.filter((i) => (i.riskScore ?? 0) >= 75);
      case 'high':
        return feedItems.filter((i) => (i.riskScore ?? 0) >= 50);
      case 'recent':
        return feedItems.filter((i) => now - i.time < 24 * 3600 * 1000);
      default:
        return feedItems;
    }
  }, [feedItems, filter]);

  if (feedItems.length === 0) {
    return (
      <View style={s.emptyWrap}>
        <View style={s.emptyIconCircle}>
          <Shield size={28} color={tokens.white20} />
        </View>
        <Text style={s.emptyTitle}>No activity yet</Text>
        <Text style={s.emptySub}>
          Add tokens to your watchlist or scan a token to start building intelligence.
        </Text>
        <TouchableOpacity
          onPress={() => router.push('/(tabs)/scan' as any)}
          style={s.emptyCta}
          activeOpacity={0.75}
        >
          <Search size={14} color={tokens.secondary} />
          <Text style={s.emptyCtaText}>Scan a token</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <FilterBar active={filter} onChange={setFilter} counts={counts} />

      {filtered.length === 0 && (
        <View style={s.noResults}>
          <Filter size={18} color={tokens.white20} />
          <Text style={s.noResultsText}>No items match this filter</Text>
        </View>
      )}

      {filtered.map((item, i) => {
        const score = item.riskScore ?? 0;
        // High/Critical → prominent card, rest → compact
        return score >= 50 ? (
          <PromCard key={item.id} item={item} index={i} />
        ) : (
          <CompactCard key={item.id} item={item} index={i} />
        );
      })}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { gap: 6 },

  // Filter bar
  filterBar: { flexDirection: 'row', gap: 6, marginBottom: 4 },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.bgGlass8,
    borderWidth: 1, borderColor: tokens.borderSubtle,
  },
  filterChipActive: {
    backgroundColor: `${tokens.secondary}12`,
    borderColor: `${tokens.secondary}30`,
  },
  filterText: { fontFamily: 'Lexend-Medium', fontSize: 11, color: tokens.textTertiary },
  filterTextActive: { color: tokens.secondary },
  filterBadge: {
    minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: tokens.bgGlass12,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4,
  },
  filterBadgeActive: { backgroundColor: `${tokens.secondary}25` },
  filterBadgeText: { fontFamily: 'Lexend-Bold', fontSize: 8, color: tokens.white80 },

  // Compact card (low/medium risk — 1 line)
  compactCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 10, paddingHorizontal: 12,
    backgroundColor: tokens.bgGlass,
    borderRadius: tokens.radius.sm,
    borderWidth: 1, borderColor: tokens.borderSubtle,
  },
  compactDot: { width: 4, height: 4, borderRadius: 2 },
  compactBody: { flex: 1, gap: 1 },
  compactName: {
    fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.small,
    color: tokens.white80,
  },
  compactSummary: {
    fontFamily: 'Lexend-Regular', fontSize: 9,
    color: tokens.white35,
  },
  compactScore: { fontFamily: 'Lexend-Bold', fontSize: tokens.font.small },
  compactTime: { fontFamily: 'Lexend-Regular', fontSize: 9, color: tokens.white20 },

  // Prominent card (high/critical — multi-line)
  promCard: {
    backgroundColor: tokens.bgGlass,
    borderRadius: tokens.radius.sm,
    borderWidth: 1, overflow: 'hidden',
  },
  promAccent: { height: 3 },
  promBody: { padding: 12, gap: 6 },
  promHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  promIconWrap: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  promNameCol: { flex: 1 },
  promName: {
    fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.body,
    color: tokens.white100,
  },
  promCategory: { fontFamily: 'Lexend-Medium', fontSize: 9, letterSpacing: 0.3 },
  promScorePill: {
    alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: tokens.radius.sm, borderWidth: 1, minWidth: 40,
  },
  promScoreNum: { fontFamily: 'Lexend-Bold', fontSize: tokens.font.small },
  promScoreLabel: { fontFamily: 'Lexend-Regular', fontSize: 7, letterSpacing: 0.3 },
  promTime: { fontFamily: 'Lexend-Regular', fontSize: 9, color: tokens.white20 },
  promSummary: {
    fontFamily: 'Lexend-Regular', fontSize: tokens.font.small,
    color: tokens.white60, lineHeight: 17,
  },
  promDetail: {
    fontFamily: 'Lexend-Regular', fontSize: 9,
    color: tokens.textTertiary, lineHeight: 14,
  },

  // Empty state
  emptyWrap: {
    alignItems: 'center', paddingVertical: 48, gap: 10,
  },
  emptyIconCircle: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: tokens.bgGlass8,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: tokens.borderSubtle, marginBottom: 4,
  },
  emptyTitle: {
    fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.body, color: tokens.white60,
  },
  emptySub: {
    fontFamily: 'Lexend-Regular', fontSize: tokens.font.small,
    color: tokens.textTertiary, textAlign: 'center', maxWidth: 260, lineHeight: 18,
  },
  emptyCta: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8,
    paddingHorizontal: 18, paddingVertical: 10,
    borderRadius: tokens.radius.pill, borderWidth: 1,
    borderColor: `${tokens.secondary}40`, backgroundColor: `${tokens.secondary}08`,
  },
  emptyCtaText: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.small, color: tokens.secondary },

  // No results for filter
  noResults: {
    alignItems: 'center', paddingVertical: 32, gap: 8,
  },
  noResultsText: {
    fontFamily: 'Lexend-Regular', fontSize: tokens.font.small, color: tokens.white35,
  },
  expandedDetail: {
    marginTop: 8, paddingTop: 8, borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  expandedText: {
    fontFamily: 'Lexend-Regular', fontSize: tokens.font.small,
    color: tokens.white60, lineHeight: 20, marginBottom: 8,
  },
  expandedCta: {
    alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1, borderColor: 'rgba(207,230,228,0.2)',
    backgroundColor: 'rgba(207,230,228,0.06)',
  },
  expandedCtaText: {
    fontFamily: 'Lexend-Medium', fontSize: 12, color: tokens.secondary,
  },
});
