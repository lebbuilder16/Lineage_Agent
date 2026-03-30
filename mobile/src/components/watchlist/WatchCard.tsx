import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Image, ActivityIndicator,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ChevronDown, ChevronUp, Search, Eye, Trash2 } from 'lucide-react-native';
import { GlassCard } from '../ui/GlassCard';
import { RiskSparkline } from './RiskSparkline';
import { RefVsNowPanel } from './RefVsNowPanel';
import { FlagTimeline } from './FlagTimeline';
import { flagLabel, flagColor } from '../../lib/flag-helpers';
import { tokens } from '../../theme/tokens';
import type { Watch, SweepFlag, WatchTimelineResult } from '../../types/api';

interface WatchCardProps {
  item: Watch;
  flags: SweepFlag[];
  timeline?: WatchTimelineResult | null;
  timelineLoading?: boolean;
  tokenMeta?: { name?: string; symbol?: string; image?: string };
  isExpanded: boolean;
  isUrgent: boolean;
  onToggleExpand: () => void;
  onInvestigate: (mint: string) => void;
  onViewDeployer?: (deployer: string) => void;
  onRemove: (id: string) => void;
  onPress: (watch: Watch) => void;
}

function TokenAvatar({ uri, symbol, type }: { uri?: string; symbol?: string; type: string }) {
  const [errored, setErrored] = useState(false);
  if (uri && !errored) {
    return (
      <Image source={{ uri }} style={styles.avatar} onError={() => setErrored(true)} />
    );
  }
  const bg = type === 'mint' ? `${tokens.secondary}20` : `${tokens.accent}20`;
  const fg = type === 'mint' ? tokens.secondary : tokens.accent;
  return (
    <View style={[styles.avatar, { backgroundColor: bg }]}>
      <Text style={[styles.avatarText, { color: fg }]}>
        {symbol?.[0]?.toUpperCase() ?? '?'}
      </Text>
    </View>
  );
}

function RiskBadge({ score }: { score: number }) {
  const color = score >= 75 ? tokens.risk.critical
    : score >= 50 ? tokens.risk.high
    : score >= 25 ? tokens.risk.medium
    : tokens.risk.low;
  return (
    <View style={[styles.riskBadge, { backgroundColor: `${color}18`, borderColor: `${color}40` }]}>
      <Text style={[styles.riskScore, { color }]}>{score}</Text>
    </View>
  );
}

export function WatchCard({
  item, flags, timeline, timelineLoading, tokenMeta, isExpanded, isUrgent,
  onToggleExpand, onInvestigate, onViewDeployer, onRemove, onPress,
}: WatchCardProps) {
  const unreadFlags = flags.filter((f) => !f.read);
  const criticalFlags = unreadFlags.filter((f) => f.severity === 'critical');

  // Extract metadata: tokenMeta prop > timeline > flags > address fallback
  const tokenName = tokenMeta?.name
    || (timeline?.flags?.[0]?.detail as any)?.token_name
    || (flags[0]?.detail as any)?.token_name
    || item.label || item.value.slice(0, 8);
  const tokenSymbol = tokenMeta?.symbol
    || (timeline?.flags?.[0]?.detail as any)?.symbol
    || (flags[0]?.detail as any)?.symbol || '';
  const tokenImage = tokenMeta?.image
    || (flags[0]?.detail as any)?.image_uri;

  const riskScore = timeline?.current?.risk_score
    ?? timeline?.last_investigation?.risk_score ?? 0;

  const sparklineData = timeline?.snapshots?.map((s) => s.risk_score) ?? [];

  const borderColor = isUrgent ? `${tokens.risk.critical}40` : tokens.borderSubtle;

  return (
    <GlassCard style={[styles.card, { borderColor, borderLeftWidth: isUrgent ? 2 : 0, borderLeftColor: `${tokens.risk.critical}80` }]}>
      {/* Collapsed row — tap to navigate, chevron to expand */}
      <TouchableOpacity
        onPress={() => onPress(item)}
        activeOpacity={0.7}
        style={styles.collapsedRow}
      >
        <TokenAvatar uri={tokenImage} symbol={tokenSymbol} type={item.sub_type} />

        <View style={styles.nameCol}>
          <Text style={styles.name} numberOfLines={1}>{tokenName}</Text>
          {tokenSymbol ? (
            <Text style={styles.symbol}>{tokenSymbol}</Text>
          ) : (
            <Text style={styles.symbol}>{item.value.slice(0, 6)}...{item.value.slice(-4)}</Text>
          )}
        </View>

        {sparklineData.length >= 2 && (
          <RiskSparkline dataPoints={sparklineData} width={50} height={22} />
        )}

        {riskScore > 0 && <RiskBadge score={riskScore} />}

        {/* Flag pill */}
        {unreadFlags.length > 0 && (
          <View style={[styles.flagPill, {
            backgroundColor: criticalFlags.length > 0 ? `${tokens.risk.critical}18` : `${tokens.risk.high}18`,
            borderColor: criticalFlags.length > 0 ? `${tokens.risk.critical}40` : `${tokens.risk.high}40`,
          }]}>
            <Text style={[styles.flagPillText, {
              color: criticalFlags.length > 0 ? tokens.risk.critical : tokens.risk.high,
            }]}>{unreadFlags.length}</Text>
          </View>
        )}

        <TouchableOpacity
          onPress={(e) => { e.stopPropagation(); onToggleExpand(); }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.chevronBtn}
        >
          {isExpanded ? (
            <ChevronUp size={16} color={tokens.textTertiary} />
          ) : (
            <ChevronDown size={16} color={tokens.textTertiary} />
          )}
        </TouchableOpacity>
      </TouchableOpacity>

      {/* Expanded panel */}
      {isExpanded && (
        <Animated.View entering={FadeInDown.duration(200)} style={styles.expandedPanel}>
          {/* Loading state */}
          {timelineLoading && !timeline && (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={tokens.secondary} />
              <Text style={styles.loadingText}>Loading intelligence...</Text>
            </View>
          )}

          {/* Narrative */}
          {timeline?.narrative && (
            <Text style={styles.narrative}>{timeline.narrative}</Text>
          )}

          {/* Reference vs Now */}
          {timeline?.reference && timeline?.current && (
            <RefVsNowPanel
              reference={timeline.reference}
              current={timeline.current}
              deltas={timeline.deltas ?? null}
            />
          )}

          {/* Flag timeline */}
          {flags.length > 0 && (
            <View style={styles.timelineSection}>
              <Text style={styles.sectionLabel}>RECENT FLAGS</Text>
              <FlagTimeline flags={flags} maxItems={5} />
            </View>
          )}

          {/* Investigation verdict */}
          {timeline?.last_investigation && (
            <View style={styles.verdictRow}>
              <Text style={styles.sectionLabel}>LAST INVESTIGATION</Text>
              <Text style={styles.verdictText} numberOfLines={2}>
                {timeline.last_investigation.verdict}
              </Text>
            </View>
          )}

          {/* Quick actions */}
          <View style={styles.actionsRow}>
            <TouchableOpacity
              onPress={() => onInvestigate(item.value)}
              style={styles.actionBtn}
              activeOpacity={0.7}
            >
              <Search size={13} color={tokens.secondary} />
              <Text style={styles.actionText}>Investigate</Text>
            </TouchableOpacity>

            {onViewDeployer && (
              <TouchableOpacity
                onPress={() => {
                  // Try deployer from timeline flags, then from item itself
                  const deployer = (timeline?.flags?.[0]?.detail as any)?.deployer
                    || (item.sub_type === 'deployer' ? item.value : null);
                  if (deployer) onViewDeployer(deployer);
                }}
                style={styles.actionBtn}
                activeOpacity={0.7}
              >
                <Eye size={13} color={tokens.secondary} />
                <Text style={styles.actionText}>Deployer</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              onPress={() => onRemove(item.id)}
              style={styles.removeBtn}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Remove from watchlist"
            >
              <Trash2 size={13} color={tokens.textTertiary} />
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden' },
  collapsedRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: tokens.spacing.cardPadding,
    paddingVertical: 12,
  },
  avatar: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontFamily: 'Lexend-SemiBold', fontSize: 16 },
  nameCol: { flex: 1 },
  name: { color: tokens.white100, fontFamily: 'Lexend-SemiBold', fontSize: 14 },
  symbol: { color: tokens.textTertiary, fontFamily: 'Lexend-Regular', fontSize: 11, marginTop: 1 },
  riskBadge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: tokens.radius.sm,
    borderWidth: 1,
  },
  riskScore: { fontFamily: 'Lexend-SemiBold', fontSize: 12 },
  chevronBtn: {
    padding: 6, borderRadius: tokens.radius.sm,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  flagPill: {
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: tokens.radius.pill,
    borderWidth: 1,
  },
  flagPillText: { fontFamily: 'Lexend-SemiBold', fontSize: 11 },
  expandedPanel: {
    paddingHorizontal: tokens.spacing.cardPadding,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: tokens.borderSubtle,
  },
  loadingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 16, justifyContent: 'center',
  },
  loadingText: {
    color: tokens.textTertiary, fontFamily: 'Lexend-Regular', fontSize: 12,
  },
  narrative: {
    color: tokens.white60, fontFamily: 'Lexend-Regular', fontSize: 12,
    marginTop: 10, lineHeight: 18,
  },
  timelineSection: { marginTop: 10 },
  sectionLabel: {
    color: tokens.white35, fontFamily: 'Lexend-SemiBold', fontSize: 10,
    letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6,
  },
  verdictRow: { marginTop: 10 },
  verdictText: { color: tokens.white60, fontFamily: 'Lexend-Regular', fontSize: 12, marginTop: 4 },
  actionsRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 12,
  },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: tokens.radius.pill,
    backgroundColor: `${tokens.secondary}12`,
    borderWidth: 1, borderColor: `${tokens.secondary}25`,
  },
  actionText: { color: tokens.secondary, fontFamily: 'Lexend-Medium', fontSize: 12 },
  removeBtn: {
    marginLeft: 'auto', padding: 8, borderRadius: tokens.radius.sm,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
});
