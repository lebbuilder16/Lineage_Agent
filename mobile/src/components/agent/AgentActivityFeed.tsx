import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import {
  Eye,
  Search,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
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
}

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

// ── Section Component ────────────────────────────────────────────────────────

function FeedSection({
  title,
  color,
  items,
  startIndex,
}: {
  title: string;
  color: string;
  items: FeedItem[];
  startIndex: number;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (items.length === 0) return null;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionDot, { backgroundColor: color }]} />
        <Text style={[styles.sectionTitle, { color }]}>{title}</Text>
        <Text style={styles.sectionCount}>{items.length}</Text>
      </View>
      {items.map((item, i) => {
        const Icon = item.icon;
        const isExpanded = expandedId === item.id;
        const isUnread = item.read === false;

        return (
          <Animated.View
            key={item.id}
            entering={FadeInDown.delay((startIndex + i) * 30).duration(250).springify()}
          >
            <TouchableOpacity
              onPress={() => setExpandedId(isExpanded ? null : item.id)}
              activeOpacity={0.75}
              style={[
                styles.feedCard,
                isExpanded && { borderColor: `${item.color}30` },
                isUnread && styles.feedCardUnread,
              ]}
            >
              {/* Left accent bar */}
              <View style={[styles.feedAccent, { backgroundColor: item.color }]} />

              {/* Main content */}
              <View style={styles.feedBody}>
                {/* Top row: category + time */}
                <View style={styles.feedTopRow}>
                  <View style={styles.feedCategoryWrap}>
                    <Icon size={10} color={item.color} strokeWidth={2.5} />
                    <Text style={[styles.feedCategoryLabel, { color: item.color }]}>
                      {item.categoryLabel}
                    </Text>
                  </View>
                  <Text style={styles.feedTime}>{timeAgoShort(item.time)}</Text>
                </View>

                {/* Token row */}
                <View style={styles.feedTokenRow}>
                  <Text style={styles.feedTokenName} numberOfLines={1}>
                    {item.tokenName}
                  </Text>
                  {item.tokenSymbol !== '' && (
                    <Text style={styles.feedTokenSymbol}>${item.tokenSymbol}</Text>
                  )}
                  {item.riskScore != null && (
                    <View style={[styles.riskPill, { backgroundColor: `${riskColor(item.riskScore)}12`, borderColor: `${riskColor(item.riskScore)}30` }]}>
                      <Text style={[styles.riskPillText, { color: riskColor(item.riskScore) }]}>
                        {item.riskScore} {riskLabel(item.riskScore)}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Summary */}
                <Text style={styles.feedSummary} numberOfLines={isExpanded ? 6 : 2}>
                  {item.summary}
                </Text>

                {/* Expanded section */}
                {isExpanded && (
                  <View style={styles.feedExpanded}>
                    {item.detail && (
                      <Text style={styles.feedDetail}>{item.detail}</Text>
                    )}
                    <Text style={styles.feedMint}>
                      {item.mint.slice(0, 16)}…{item.mint.slice(-8)}
                    </Text>
                    <View style={styles.feedActions}>
                      {item.mint && (
                        <TouchableOpacity
                          onPress={() => router.push(`/investigate/${item.mint}` as any)}
                          style={styles.feedActionPrimary}
                          activeOpacity={0.7}
                        >
                          <Search size={12} color={tokens.secondary} strokeWidth={2.5} />
                          <Text style={styles.feedActionPrimaryText}>Investigate</Text>
                        </TouchableOpacity>
                      )}
                      {item.mint && (
                        <TouchableOpacity
                          onPress={() => router.push(`/token/${item.mint}` as any)}
                          style={styles.feedActionSecondary}
                          activeOpacity={0.7}
                        >
                          <ExternalLink size={12} color={tokens.white60} strokeWidth={2} />
                          <Text style={styles.feedActionSecondaryText}>Details</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                )}

                {/* Expand indicator */}
                <View style={styles.expandHint}>
                  {isExpanded
                    ? <ChevronUp size={12} color={tokens.white20} />
                    : <ChevronDown size={12} color={tokens.white20} />}
                </View>
              </View>
            </TouchableOpacity>
          </Animated.View>
        );
      })}
    </View>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export function AgentActivityFeed({ feedItems }: AgentActivityFeedProps) {
  // Separate items by category for sectioned display
  const { flags, investigations, alertItems } = useMemo(() => {
    const flags = feedItems.filter((i) => i.category === 'flag');
    const investigations = feedItems.filter((i) => i.category === 'investigation');
    const alertItems = feedItems.filter((i) => i.category === 'alert');
    return { flags, investigations, alertItems };
  }, [feedItems]);

  if (feedItems.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <View style={styles.emptyIconCircle}>
          <Eye size={28} color={tokens.white20} />
        </View>
        <Text style={styles.emptyTitle}>No activity yet</Text>
        <Text style={styles.emptySub}>
          Add tokens to your watchlist or scan a token to start building your agent's intelligence.
        </Text>
        <TouchableOpacity
          onPress={() => router.push('/(tabs)/scan' as any)}
          style={styles.emptyCta}
          activeOpacity={0.75}
        >
          <Search size={14} color={tokens.secondary} />
          <Text style={styles.emptyCtaText}>Scan a token</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Show sections — flags first (most actionable), then investigations, then alerts
  let idx = 0;

  return (
    <View style={styles.feedContainer}>
      {flags.length > 0 && (
        <FeedSection
          title="SWEEP FLAGS"
          color={tokens.risk.high}
          items={flags}
          startIndex={(() => { const s = idx; idx += flags.length; return s; })()}
        />
      )}
      {investigations.length > 0 && (
        <FeedSection
          title="INVESTIGATIONS"
          color={tokens.violet}
          items={investigations}
          startIndex={(() => { const s = idx; idx += investigations.length; return s; })()}
        />
      )}
      {alertItems.length > 0 && (
        <FeedSection
          title="ALERTS"
          color={tokens.cyan}
          items={alertItems}
          startIndex={(() => { const s = idx; idx += alertItems.length; return s; })()}
        />
      )}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  feedContainer: {
    gap: 16,
  },
  section: {
    gap: 6,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
    paddingHorizontal: 2,
  },
  sectionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  sectionTitle: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: 10,
    letterSpacing: 1,
    flex: 1,
  },
  sectionCount: {
    fontFamily: 'Lexend-Medium',
    fontSize: 10,
    color: tokens.textTertiary,
  },
  feedCard: {
    flexDirection: 'row',
    backgroundColor: tokens.bgGlass,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    overflow: 'hidden',
  },
  feedCardUnread: {
    borderColor: `${tokens.risk.high}25`,
    backgroundColor: `${tokens.risk.high}04`,
  },
  feedAccent: {
    width: 3,
  },
  feedBody: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 5,
  },
  feedTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  feedCategoryWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  feedCategoryLabel: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: 9,
    letterSpacing: 0.3,
  },
  feedTime: {
    fontFamily: 'Lexend-Regular',
    fontSize: 9,
    color: tokens.textTertiary,
  },
  feedTokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  feedTokenName: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.body,
    color: tokens.white100,
    flexShrink: 1,
  },
  feedTokenSymbol: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.textTertiary,
  },
  riskPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  riskPillText: {
    fontFamily: 'Lexend-Bold',
    fontSize: 9,
  },
  feedSummary: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white60,
    lineHeight: 17,
  },
  feedExpanded: {
    gap: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: tokens.borderSubtle,
    marginTop: 4,
  },
  feedDetail: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.textTertiary,
    lineHeight: 15,
  },
  feedMint: {
    fontFamily: 'Lexend-Regular',
    fontSize: 9,
    color: tokens.white20,
    letterSpacing: 0.3,
  },
  feedActions: {
    flexDirection: 'row',
    gap: 8,
  },
  feedActionPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: `${tokens.secondary}40`,
    backgroundColor: `${tokens.secondary}08`,
  },
  feedActionPrimaryText: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.tiny,
    color: tokens.secondary,
  },
  feedActionSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    backgroundColor: tokens.bgGlass8,
  },
  feedActionSecondaryText: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.tiny,
    color: tokens.white60,
  },
  expandHint: {
    alignItems: 'center',
    marginTop: 2,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 10,
  },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: tokens.bgGlass8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    marginBottom: 4,
  },
  emptyTitle: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.body,
    color: tokens.white60,
  },
  emptySub: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.textTertiary,
    textAlign: 'center',
    maxWidth: 260,
    lineHeight: 18,
  },
  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: `${tokens.secondary}40`,
    backgroundColor: `${tokens.secondary}08`,
  },
  emptyCtaText: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.small,
    color: tokens.secondary,
  },
});
