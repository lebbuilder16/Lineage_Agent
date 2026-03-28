import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import {
  Bell,
  AlertTriangle,
  Zap,
  Skull,
  BookMarked,
  Trash2,
  ChevronDown,
  ChevronUp,
  Bot,
  Search,
  Bookmark,
  Rocket,
} from 'lucide-react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { GlassCard, type GlassCardVariant } from '../ui/GlassCard';
import { tokens } from '../../theme/tokens';
import { timeAgo } from '../../lib/format';
import { haptic } from '../../lib/haptics';
import type { AlertItem } from '../../types/api';

// ── Constants ────────────────────────────────────────────────────────────────

const CHANNEL_COLORS: Record<string, string> = {
  telegram: '#2AABEE',
  whatsapp: '#25D366',
  discord: '#5865F2',
  push: tokens.secondary,
};

const ALERT_ICONS: Record<string, React.ReactNode> = {
  rug: <AlertTriangle size={18} color={tokens.risk.critical} />,
  bundle: <Zap size={18} color={tokens.risk.high} />,
  insider: <Zap size={18} color={tokens.risk.medium} />,
  zombie: <Skull size={18} color={tokens.accent} />,
  death_clock: <Skull size={18} color={tokens.risk.critical} />,
  deployer: <BookMarked size={18} color={tokens.secondary} />,
  narrative: <Bell size={18} color={tokens.secondary} />,
  token_graduated: <Rocket size={18} color={tokens.success} />,
  deployer_launch: <Rocket size={18} color={tokens.warning} />,
  wallet_risk: <AlertTriangle size={18} color={tokens.risk.high} />,
};

// Map alert types to card variants for visual differentiation
const ALERT_VARIANT: Record<string, GlassCardVariant> = {
  rug: 'alert',
  death_clock: 'alert',
  bundle: 'alert',
  insider: 'alert',
  zombie: 'alert',
  wallet_risk: 'alert',
  token_graduated: 'success',
  deployer: 'token',
  deployer_launch: 'token',
  narrative: 'ai',
};

// Accent stripe colors per alert severity
const ALERT_ACCENT: Record<string, string> = {
  rug: tokens.risk.critical,
  death_clock: tokens.risk.critical,
  bundle: tokens.risk.high,
  insider: tokens.risk.medium,
  zombie: tokens.accent,
  wallet_risk: tokens.risk.high,
  token_graduated: tokens.success,
  deployer: tokens.secondary,
  deployer_launch: tokens.warning,
  narrative: tokens.violet,
};

// ── Props ────────────────────────────────────────────────────────────────────

export interface AlertCardProps {
  item: AlertItem;
  isExpanded: boolean;
  groupHeader?: string;
  onPress: (alert: AlertItem) => void;
  onToggleEnrichment: (id: string) => void;
  onDelete: (id: string) => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export function AlertCard({
  item,
  isExpanded,
  groupHeader,
  onPress,
  onToggleEnrichment,
  onDelete,
}: AlertCardProps) {
  const variant = ALERT_VARIANT[item.type] ?? 'default';
  const accentColor = ALERT_ACCENT[item.type] ?? tokens.secondary;

  return (
    <>
      {groupHeader != null && (
        <View style={styles.groupHeader}>
          <Text style={styles.groupHeaderText}>{groupHeader}</Text>
        </View>
      )}
      <Swipeable
        key={item.id}
        containerStyle={styles.swipeContainer}
        renderRightActions={() => (
          <TouchableOpacity
            style={styles.deleteAction}
            onPress={() => {
              Alert.alert(
                'Delete alert?',
                undefined,
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => { haptic.heavy(); onDelete(item.id); },
                  },
                ],
              );
            }}
            activeOpacity={0.8}
          >
            <Trash2 color={tokens.white100} size={20} />
          </TouchableOpacity>
        )}
      >
        <TouchableOpacity
          onPress={() => onPress(item)}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={`${item.type} alert: ${item.title ?? item.token_name ?? item.type}. ${item.read ? 'Read' : 'Unread'}`}
        >
          <GlassCard
            variant={variant}
            style={[styles.alertCard, !item.read && styles.alertCardUnread]}
            noPadding
          >
            {/* Accent stripe — left edge color-coded by alert type */}
            <View style={[styles.accentStripe, { backgroundColor: accentColor }]} />

            {/* Main row */}
            <View style={styles.alertInner}>
              <View style={[styles.alertIcon, { backgroundColor: `${accentColor}12` }]}>
                {item.image_uri ? (
                  <Image source={item.image_uri} style={styles.alertTokenImg} contentFit="cover" transition={200} />
                ) : (
                  ALERT_ICONS[item.type] ?? <Bell size={18} color={tokens.primary} />
                )}
              </View>
              <View style={styles.alertBody}>
                <Text style={styles.alertTitle} numberOfLines={1}>
                  {item.title ?? item.token_name ?? item.type.toUpperCase()}
                </Text>
                <Text style={styles.alertMessage} numberOfLines={2}>
                  {item.message}
                </Text>
                {/* Delivered channel pills */}
                {item.deliveredChannels && item.deliveredChannels.length > 0 && (
                  <View style={styles.channelRow}>
                    {item.deliveredChannels.map((ch) => (
                      <View
                        key={ch}
                        style={[styles.channelPill, { borderColor: `${CHANNEL_COLORS[ch] ?? tokens.white35}50` }]}
                      >
                        <Text style={[styles.channelPillText, { color: CHANNEL_COLORS[ch] ?? tokens.white60 }]}>
                          {ch}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
              <View style={styles.alertMeta}>
                <Text style={styles.alertTime}>
                  {timeAgo(item.timestamp ?? item.created_at ?? '')}
                </Text>
                {!item.read && <View style={[styles.unreadDot, { backgroundColor: accentColor }]} />}
                {/* Risk delta badge */}
                {item.enrichedData?.riskDelta != null && item.enrichedData.riskDelta !== 0 && (
                  <View style={[styles.riskDeltaBadge, {
                    backgroundColor: item.enrichedData.riskDelta > 0 ? `${tokens.risk.critical}20` : `${tokens.risk.low}20`,
                    borderColor: item.enrichedData.riskDelta > 0 ? `${tokens.risk.critical}50` : `${tokens.risk.low}50`,
                  }]}>
                    <Text style={[styles.riskDeltaText, {
                      color: item.enrichedData.riskDelta > 0 ? tokens.risk.critical : tokens.risk.low,
                    }]}>
                      {item.enrichedData.riskDelta > 0 ? '+' : ''}{item.enrichedData.riskDelta}
                    </Text>
                  </View>
                )}
                {/* AI enrichment toggle */}
                {item.enrichedData && (
                  <TouchableOpacity
                    onPress={(e) => { e.stopPropagation?.(); onToggleEnrichment(item.id); }}
                    hitSlop={tokens.hitSlop}
                    accessibilityRole="button"
                    accessibilityLabel={isExpanded ? 'Collapse AI enrichment' : 'Expand AI enrichment'}
                  >
                    {isExpanded
                      ? <ChevronUp size={14} color={tokens.secondary} />
                      : <ChevronDown size={14} color={tokens.secondary} />}
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Quick actions — Investigate / Watch */}
            {item.mint && (
              <View style={styles.quickActions}>
                <TouchableOpacity
                  style={[styles.quickActionBtn, { borderColor: `${accentColor}30` }]}
                  onPress={(e) => {
                    e.stopPropagation?.();
                    router.push(`/investigate/${item.mint}` as any);
                  }}
                  activeOpacity={0.7}
                >
                  <Search size={12} color={tokens.secondary} />
                  <Text style={styles.quickActionText}>Investigate</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.quickActionBtn}
                  onPress={(e) => {
                    e.stopPropagation?.();
                    router.push(`/token/${item.mint}` as any);
                  }}
                  activeOpacity={0.7}
                >
                  <Bookmark size={12} color={tokens.white60} />
                  <Text style={styles.quickActionText}>View Token</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* AI enrichment panel */}
            {item.enrichedData && isExpanded && (
              <View style={styles.enrichPanel}>
                <View style={styles.enrichHeader}>
                  <Bot size={12} color={tokens.lavender} />
                  <Text style={styles.enrichLabel}>AI Context</Text>
                </View>
                <Text style={styles.enrichSummary}>{item.enrichedData.summary}</Text>
                {item.enrichedData.recommendedAction && (
                  <Text style={styles.enrichAction}>
                    → {item.enrichedData.recommendedAction}
                  </Text>
                )}
                {item.actions && item.actions.length > 0 && (
                  <View style={styles.actionsRow}>
                    {item.actions.map((act, i) => (
                      <TouchableOpacity
                        key={i}
                        style={styles.actionBtn}
                        onPress={() => {
                          if (act.action === 'lineage.navigate' && act.params.path) {
                            router.push(act.params.path as any);
                          } else if (act.action === 'lineage.scan_batch' && act.params.mints) {
                            const first = act.params.mints.split(',')[0];
                            if (first) router.push(`/token/${first}` as any);
                          }
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.actionBtnText}>{act.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            )}
          </GlassCard>
        </TouchableOpacity>
      </Swipeable>
    </>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  alertCard: { borderWidth: 0 },
  alertCardUnread: { borderWidth: 1, borderColor: 'rgba(173, 200, 255, 0.20)' },
  // Left accent stripe for visual type identification
  accentStripe: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    borderTopLeftRadius: tokens.radius.lg,
    borderBottomLeftRadius: tokens.radius.lg,
  },
  alertInner: {
    flexDirection: 'row',
    padding: tokens.spacing.cardPadding,
    paddingLeft: tokens.spacing.cardPadding + 4, // account for accent stripe
    gap: 12,
    alignItems: 'flex-start',
  },
  alertIcon: {
    width: 40,
    height: 40,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  alertTokenImg: {
    width: 40,
    height: 40,
    borderRadius: tokens.radius.md,
  },
  alertBody: { flex: 1 },
  alertTitle: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.body,
    color: tokens.white100,
  },
  alertMessage: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white60,
    marginTop: 4,
    lineHeight: 17,
  },
  alertMeta: { alignItems: 'flex-end', gap: 6 },
  alertTime: {
    fontFamily: 'SpaceGrotesk-Medium',
    fontSize: tokens.font.tiny,
    color: tokens.textTertiary,
    letterSpacing: 0.3,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  riskDeltaBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
  },
  riskDeltaText: {
    fontFamily: 'SpaceGrotesk-Bold',
    fontSize: 10,
    letterSpacing: 0.3,
  },
  swipeContainer: {
    borderRadius: tokens.radius.xl,
    overflow: 'hidden',
    marginBottom: 0,
  },
  deleteAction: {
    backgroundColor: tokens.risk.critical,
    justifyContent: 'center',
    alignItems: 'center',
    width: 70,
    borderTopRightRadius: tokens.radius.xl,
    borderBottomRightRadius: tokens.radius.xl,
  },

  // Channel delivery pills
  channelRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 6,
  },
  channelPill: {
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  channelPillText: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.tiny,
    textTransform: 'capitalize',
  },

  // AI enrichment panel
  enrichPanel: {
    marginHorizontal: tokens.spacing.cardPadding,
    marginLeft: tokens.spacing.cardPadding + 4,
    marginBottom: tokens.spacing.cardPadding,
    backgroundColor: 'rgba(139, 92, 246, 0.06)',
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.20)',
    padding: 10,
    gap: 6,
  },
  enrichHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  enrichLabel: {
    fontFamily: 'SpaceGrotesk-SemiBold',
    fontSize: tokens.font.tiny,
    color: tokens.lavender,
    letterSpacing: 0.8,
  },
  enrichSummary: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white80,
    lineHeight: 18,
  },
  enrichAction: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.small,
    color: tokens.secondary,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  actionBtn: {
    backgroundColor: `${tokens.secondary}18`,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: `${tokens.secondary}30`,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  actionBtnText: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.tiny,
    color: tokens.secondary,
  },
  quickActions: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingLeft: 20,
    paddingBottom: 12,
  },
  quickActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    backgroundColor: tokens.bgGlass8,
  },
  quickActionText: {
    fontFamily: 'Lexend-Medium',
    fontSize: tokens.font.tiny,
    color: tokens.white60,
  },
  groupHeader: {
    paddingVertical: 6,
    paddingHorizontal: 4,
    marginTop: 8,
  },
  groupHeaderText: {
    fontFamily: 'SpaceGrotesk-SemiBold',
    fontSize: tokens.font.tiny,
    color: tokens.textTertiary,
    letterSpacing: 1.0,
    textTransform: 'uppercase',
  },
});
