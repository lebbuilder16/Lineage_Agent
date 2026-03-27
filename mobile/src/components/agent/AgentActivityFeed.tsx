import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import {
  Search,
  Shield,
  Filter,
  ChevronDown,
  ChevronRight,
} from 'lucide-react-native';
import Animated, {
  FadeInDown,
  Layout,
} from 'react-native-reanimated';
import { tokens } from '../../theme/tokens';

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
  onMarkRead?: (id: string) => void;
}

type SourceFilter = 'all' | 'investigation' | 'alert' | 'flag';

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
  if (score >= 75) return 'CRIT';
  if (score >= 50) return 'HIGH';
  if (score >= 25) return 'MED';
  return 'LOW';
}

function riskColor(score: number): string {
  if (score >= 75) return tokens.risk.critical;
  if (score >= 50) return tokens.risk.high;
  if (score >= 25) return tokens.risk.medium;
  return tokens.risk.low;
}

type TimeSection = 'today' | 'yesterday' | 'week' | 'older';

function getTimeSection(ts: number): TimeSection {
  const now = new Date();
  const d = new Date(ts);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86_400_000;
  const weekStart = todayStart - 6 * 86_400_000;
  if (ts >= todayStart) return 'today';
  if (ts >= yesterdayStart) return 'yesterday';
  if (ts >= weekStart) return 'week';
  return 'older';
}

const SECTION_LABELS: Record<TimeSection, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  week: 'This week',
  older: 'Earlier',
};

// ── Source Filter Bar ────────────────────────────────────────────────────────

function SourceFilterBar({
  active,
  onChange,
  counts,
}: {
  active: SourceFilter;
  onChange: (k: SourceFilter) => void;
  counts: Record<SourceFilter, number>;
}) {
  const filters: { key: SourceFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'investigation', label: 'My Scans' },
    { key: 'alert', label: 'Alerts' },
    { key: 'flag', label: 'Flags' },
  ];

  return (
    <View style={s.filterBar}>
      {filters.map(({ key, label }) => {
        const isActive = active === key;
        const count = counts[key];
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

// ── Section Header ───────────────────────────────────────────────────────────

function SectionHeader({
  label,
  count,
  collapsed,
  onToggle,
}: {
  label: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const Chevron = collapsed ? ChevronRight : ChevronDown;
  return (
    <TouchableOpacity onPress={onToggle} activeOpacity={0.6} style={s.sectionHeader}>
      <Chevron size={12} color={tokens.white35} strokeWidth={2.5} />
      <Text style={s.sectionLabel}>{label}</Text>
      {collapsed && (
        <Text style={s.sectionCount}>{count} item{count !== 1 ? 's' : ''}</Text>
      )}
    </TouchableOpacity>
  );
}

// ── Risk Pill (shared by both card types) ────────────────────────────────────

function RiskPill({ score }: { score: number }) {
  const rc = riskColor(score);
  return (
    <View style={[s.riskPill, { backgroundColor: `${rc}12`, borderColor: `${rc}25` }]}>
      <Text style={[s.riskPillScore, { color: rc }]}>{score}</Text>
      <Text style={[s.riskPillLabel, { color: rc }]}>{riskLabel(score)}</Text>
    </View>
  );
}

// ── Swipeable Compact Card ───────────────────────────────────────────────────

function CompactCard({
  item,
  index,
  onMarkRead,
}: {
  item: FeedItem;
  index: number;
  onMarkRead?: (id: string) => void;
}) {
  const isUnread = item.read === false;
  const Icon = item.icon;
  const score = item.riskScore ?? 0;

  const handlePress = useCallback(() => {
    if (isUnread) onMarkRead?.(item.id);
    router.push(`/token/${item.mint}` as any);
  }, [item.id, item.mint, isUnread, onMarkRead]);

  return (
    <Animated.View entering={index < 15 ? FadeInDown.delay(index * 15).duration(180) : undefined} layout={Layout.springify()}>
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.7}
        style={s.compactCard}
      >
        {/* Unread dot */}
        {isUnread && <View style={s.unreadDot} />}

        {/* Category dot */}
        <View style={[s.catDot, { backgroundColor: item.color }]} />
        <Icon size={12} color={item.color} strokeWidth={2.5} />

        <View style={s.compactBody}>
          <Text style={s.compactName} numberOfLines={1}>
            {item.tokenName}
            {item.tokenSymbol ? ` $${item.tokenSymbol}` : ''}
          </Text>
          <Text style={s.compactSummary} numberOfLines={2}>{item.summary}</Text>
        </View>

        {/* Right column: risk + time stacked */}
        <View style={s.compactRight}>
          {score > 0 && <RiskPill score={score} />}
          <Text style={s.compactTime}>{timeAgoShort(item.time)}</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Prominent Card (High/Critical risk) ──────────────────────────────────────

function PromCard({
  item,
  index,
}: {
  item: FeedItem;
  index: number;
}) {
  const Icon = item.icon;
  const score = item.riskScore ?? 0;
  const rc = score > 0 ? riskColor(score) : item.color;
  const isUnread = item.read === false;

  return (
    <Animated.View entering={FadeInDown.delay(index * 20).duration(220)}>
      <TouchableOpacity
        onPress={() => router.push(`/token/${item.mint}` as any)}
        activeOpacity={0.7}
        style={[s.promCard, { borderColor: `${rc}20` }]}
      >
        {/* Accent bar */}
        <View style={[s.promAccent, { backgroundColor: rc }]} />

        <View style={s.promBody}>
          {/* Header row */}
          <View style={s.promHeader}>
            {isUnread && <View style={s.unreadDot} />}
            <View style={[s.promIconWrap, { backgroundColor: `${rc}12` }]}>
              <Icon size={14} color={rc} strokeWidth={2.5} />
            </View>
            <View style={s.promNameCol}>
              <Text style={s.promName} numberOfLines={1}>
                {item.tokenName}
                {item.tokenSymbol ? ` $${item.tokenSymbol}` : ''}
              </Text>
              <Text style={[s.promCategory, { color: rc }]}>{item.categoryLabel}</Text>
            </View>
            <View style={s.promRight}>
              {score > 0 && <RiskPill score={score} />}
              <Text style={s.promTime}>{timeAgoShort(item.time)}</Text>
            </View>
          </View>

          {/* Summary */}
          <Text style={s.promSummary} numberOfLines={2}>{item.summary}</Text>

          {/* Detail */}
          {item.detail && (
            <Text style={s.promDetail} numberOfLines={1}>{item.detail}</Text>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function AgentActivityFeed({ feedItems, onMarkRead }: AgentActivityFeedProps) {
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [collapsed, setCollapsed] = useState<Record<TimeSection, boolean>>({
    today: false,
    yesterday: true,
    week: true,
    older: true,
  });

  // Source counts
  const sourceCounts = useMemo<Record<SourceFilter, number>>(() => ({
    all: feedItems.length,
    investigation: feedItems.filter((i) => i.category === 'investigation').length,
    alert: feedItems.filter((i) => i.category === 'alert').length,
    flag: feedItems.filter((i) => i.category === 'flag').length,
  }), [feedItems]);

  // Filtered by source
  const filtered = useMemo(() => {
    if (sourceFilter === 'all') return feedItems;
    return feedItems.filter((i) => i.category === sourceFilter);
  }, [feedItems, sourceFilter]);

  // Group by time section
  const sections = useMemo(() => {
    const groups: { key: TimeSection; label: string; items: FeedItem[] }[] = [];
    const buckets: Record<TimeSection, FeedItem[]> = { today: [], yesterday: [], week: [], older: [] };

    for (const item of filtered) {
      buckets[getTimeSection(item.time)].push(item);
    }

    const order: TimeSection[] = ['today', 'yesterday', 'week', 'older'];
    for (const key of order) {
      if (buckets[key].length > 0) {
        groups.push({ key, label: SECTION_LABELS[key], items: buckets[key] });
      }
    }
    return groups;
  }, [filtered]);

  const toggleSection = useCallback((key: TimeSection) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // ── Empty state ──────────────────────────────────────────────────────────

  if (feedItems.length === 0) {
    return (
      <View style={s.emptyWrap}>
        <View style={s.emptyIconCircle}>
          <Shield size={28} color={tokens.white20} />
        </View>
        <Text style={s.emptyTitle}>No activity yet</Text>
        <Text style={s.emptySub}>
          Scan a token or add to your watchlist to start building intelligence.
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

  // ── No results for current filter ──────────────────────────────────────

  if (filtered.length === 0) {
    return (
      <View style={s.root}>
        <SourceFilterBar active={sourceFilter} onChange={setSourceFilter} counts={sourceCounts} />
        <View style={s.noResults}>
          <Filter size={18} color={tokens.white20} />
          <Text style={s.noResultsText}>No items match this filter</Text>
        </View>
      </View>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────

  let globalIdx = 0;

  return (
    <View style={s.root}>
      <SourceFilterBar active={sourceFilter} onChange={setSourceFilter} counts={sourceCounts} />

      {sections.map((section) => {
        const isCollapsed = collapsed[section.key] ?? false;

        return (
          <View key={section.key} style={s.section}>
            <SectionHeader
              label={section.label}
              count={section.items.length}
              collapsed={isCollapsed}
              onToggle={() => toggleSection(section.key)}
            />

            {!isCollapsed &&
              section.items.map((item) => {
                const idx = globalIdx++;
                const score = item.riskScore ?? 0;
                return score >= 50 ? (
                  <PromCard key={item.id} item={item} index={idx} />
                ) : (
                  <CompactCard
                    key={item.id}
                    item={item}
                    index={idx}
                    onMarkRead={onMarkRead}
                  />
                );
              })}
          </View>
        );
      })}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { gap: 4 },

  // Filter bar
  filterBar: { flexDirection: 'row', gap: 6, marginBottom: 6 },
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

  // Section
  section: { gap: 4, marginTop: 2 },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 6, paddingHorizontal: 2,
  },
  sectionLabel: {
    fontFamily: 'Lexend-SemiBold', fontSize: 11,
    color: tokens.white60, letterSpacing: 0.3,
  },
  sectionCount: {
    fontFamily: 'Lexend-Regular', fontSize: 9,
    color: tokens.white20, marginLeft: 2,
  },

  // Unread dot
  unreadDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: tokens.secondary,
    position: 'absolute', left: 4, top: '50%',
    marginTop: -3,
  },

  // Compact card
  compactCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 10, paddingLeft: 16, paddingRight: 12,
    backgroundColor: '#0a1128',
    borderRadius: tokens.radius.sm,
    borderWidth: 1, borderColor: tokens.borderSubtle,
  },
  catDot: { width: 4, height: 4, borderRadius: 2 },
  compactBody: { flex: 1, gap: 2 },
  compactName: {
    fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.small,
    color: tokens.white80,
  },
  compactSummary: {
    fontFamily: 'Lexend-Regular', fontSize: 10,
    color: tokens.white35, lineHeight: 14,
  },
  compactRight: { alignItems: 'flex-end', gap: 4, minWidth: 44 },
  compactTime: { fontFamily: 'Lexend-Regular', fontSize: 9, color: tokens.white20 },

  // Risk pill (shared)
  riskPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: tokens.radius.xs, borderWidth: 1,
  },
  riskPillScore: { fontFamily: 'Lexend-Bold', fontSize: 10 },
  riskPillLabel: { fontFamily: 'Lexend-Medium', fontSize: 7, letterSpacing: 0.3 },

  // Prominent card (high/critical)
  promCard: {
    backgroundColor: '#0a1128',
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
  promRight: { alignItems: 'flex-end', gap: 4, minWidth: 44 },
  promNameCol: { flex: 1 },
  promName: {
    fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.body,
    color: tokens.white100,
  },
  promCategory: { fontFamily: 'Lexend-Medium', fontSize: 9, letterSpacing: 0.3 },
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
  emptyWrap: { alignItems: 'center', paddingVertical: 48, gap: 10 },
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

  // No results
  noResults: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  noResultsText: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.small, color: tokens.white35 },
});
