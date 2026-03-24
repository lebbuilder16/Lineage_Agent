import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Eye, Search, AlertTriangle, XOctagon, Info } from 'lucide-react-native';
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

// ── Component ────────────────────────────────────────────────────────────────

export function AgentActivityFeed({ feedItems }: AgentActivityFeedProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (feedItems.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <View style={styles.emptyIconCircle}>
          <Eye size={28} color={tokens.white20} />
        </View>
        <Text style={styles.emptyTitle}>No activity yet</Text>
        <Text style={styles.emptySub}>Scan a token or add to watchlist.</Text>
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

  return (
    <>
      {feedItems.map((item, i) => {
        const Icon = item.icon;
        const isExpanded = expandedId === item.id;
        const catColor =
          item.category === 'investigation'
            ? tokens.violet
            : item.category === 'alert'
              ? tokens.risk.high
              : tokens.cyan;

        return (
          <Animated.View
            key={item.id}
            entering={FadeInDown.delay(i * 40)
              .duration(250)
              .springify()}
          >
            <TouchableOpacity
              onPress={() => setExpandedId(isExpanded ? null : item.id)}
              activeOpacity={0.75}
              style={[
                styles.feedCard,
                isExpanded && { borderColor: `${item.color}30` },
              ]}
            >
              <View style={[styles.feedDot, { backgroundColor: item.color }]} />

              {/* Category tag + time */}
              <View style={styles.feedHeader}>
                <View style={[styles.catTag, { backgroundColor: `${catColor}15` }]}>
                  <Icon size={10} color={catColor} strokeWidth={2.5} />
                  <Text style={[styles.catLabel, { color: catColor }]}>
                    {item.categoryLabel}
                  </Text>
                </View>
                <Text style={styles.feedTime}>{timeAgoShort(item.time)}</Text>
              </View>

              {/* Token identity */}
              <View style={styles.feedTokenRow}>
                <Text style={styles.feedTokenName} numberOfLines={1}>
                  {item.tokenName}
                </Text>
                {item.tokenSymbol !== '' && (
                  <Text style={styles.feedTokenSymbol}>{item.tokenSymbol}</Text>
                )}
                {item.riskScore != null && (
                  <View
                    style={[
                      styles.feedScorePill,
                      {
                        backgroundColor: `${item.color}15`,
                        borderColor: `${item.color}30`,
                      },
                    ]}
                  >
                    <Text style={[styles.feedScoreText, { color: item.color }]}>
                      {item.riskScore}
                    </Text>
                  </View>
                )}
              </View>

              {/* Summary */}
              <Text style={styles.feedSummary} numberOfLines={isExpanded ? 4 : 1}>
                {item.summary}
              </Text>

              {/* Expanded: detail + actions */}
              {isExpanded && (
                <View style={styles.feedExpanded}>
                  {item.detail && (
                    <Text style={styles.feedDetail} numberOfLines={2}>
                      {item.detail}
                    </Text>
                  )}
                  <Text style={styles.feedMint}>
                    {item.mint.slice(0, 12)}…{item.mint.slice(-6)}
                  </Text>
                  <View style={styles.feedActions}>
                    {item.mint && (
                      <TouchableOpacity
                        onPress={() =>
                          router.push(`/investigate/${item.mint}` as any)
                        }
                        style={styles.feedActionBtn}
                        activeOpacity={0.7}
                      >
                        <Search
                          size={12}
                          color={tokens.secondary}
                          strokeWidth={2.5}
                        />
                        <Text style={styles.feedActionText}>Investigate</Text>
                      </TouchableOpacity>
                    )}
                    {item.mint && (
                      <TouchableOpacity
                        onPress={() =>
                          router.push(`/token/${item.mint}` as any)
                        }
                        style={[
                          styles.feedActionBtn,
                          {
                            borderColor: tokens.borderSubtle,
                            backgroundColor: tokens.bgGlass8,
                          },
                        ]}
                        activeOpacity={0.7}
                      >
                        <Eye size={12} color={tokens.white60} strokeWidth={2} />
                        <Text
                          style={[styles.feedActionText, { color: tokens.white60 }]}
                        >
                          View Token
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              )}
            </TouchableOpacity>
          </Animated.View>
        );
      })}
    </>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  feedCard: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    paddingLeft: 18,
    backgroundColor: tokens.bgGlass,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    gap: 6,
    overflow: 'hidden',
  },
  feedDot: {
    width: 3,
    height: '100%',
    borderRadius: 2,
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
  feedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  catTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: tokens.radius.pill,
  },
  catLabel: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: 9,
    letterSpacing: 0.5,
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
  feedScorePill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    marginLeft: 'auto',
  },
  feedScoreText: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.tiny,
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
  feedActionBtn: {
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
  feedActionText: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.tiny,
    color: tokens.secondary,
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
