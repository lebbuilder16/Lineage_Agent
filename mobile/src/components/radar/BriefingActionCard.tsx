import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import {
  Shield,
  ChevronRight,
  AlertTriangle,
  Eye,
  TrendingUp,
  Zap,
} from 'lucide-react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { GlassCard } from '../ui/GlassCard';
import { tokens } from '../../theme/tokens';
import type { BriefingSection } from '../../lib/openclaw-briefing';

// ── Props ────────────────────────────────────────────────────────────────────

interface BriefingActionCardProps {
  text: string;
  generatedAt: string | null;
  sections: BriefingSection[];
  unread: boolean;
  onMarkRead: () => void;
}

// ── Section icons ────────────────────────────────────────────────────────────

const SECTION_ICONS: Record<string, React.ReactNode> = {
  watchlist_alerts: <Eye size={12} color={tokens.risk.high} />,
  active_campaigns: <AlertTriangle size={12} color={tokens.accent} />,
  market_intel: <TrendingUp size={12} color={tokens.secondary} />,
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: tokens.risk.critical,
  high: tokens.risk.high,
  medium: tokens.risk.medium,
  low: tokens.risk.low,
  info: tokens.white60,
};

// ── Component ────────────────────────────────────────────────────────────────

export function BriefingActionCard({
  text,
  generatedAt,
  sections,
  unread,
  onMarkRead,
}: BriefingActionCardProps) {
  const [expanded, setExpanded] = useState(false);

  const handlePress = () => {
    setExpanded((v) => !v);
    if (unread) onMarkRead();
  };

  const hasSections = sections.length > 0;
  const threatCount = sections
    .filter((s) => s.type === 'watchlist_alerts' || s.type === 'active_campaigns')
    .reduce((sum, s) => sum + s.items.length, 0);

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.8}>
      <GlassCard style={styles.card} noPadding={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Shield size={13} color={tokens.secondary} />
            <Text style={styles.title}>BRIEFING</Text>
            {unread && <View style={styles.unreadDot} />}
            {threatCount > 0 && (
              <View style={styles.threatBadge}>
                <Zap size={9} color={tokens.risk.critical} />
                <Text style={styles.threatCount}>{threatCount}</Text>
              </View>
            )}
          </View>
          <ChevronRight
            size={14}
            color={tokens.textTertiary}
            style={expanded ? { transform: [{ rotate: '90deg' }] } : undefined}
          />
        </View>

        {/* Preview / Expanded text */}
        <Text
          style={expanded ? styles.contentFull : styles.contentPreview}
          numberOfLines={expanded ? undefined : 2}
          selectable={expanded}
        >
          {text}
        </Text>

        {/* Structured sections */}
        {expanded && hasSections && (
          <Animated.View entering={FadeIn.duration(200)} style={styles.sectionsWrap}>
            {sections.map((section, si) => (
              <View key={si} style={styles.section}>
                <View style={styles.sectionHeader}>
                  {SECTION_ICONS[section.type] ?? <Shield size={12} color={tokens.white60} />}
                  <Text style={styles.sectionTitle}>{section.title}</Text>
                </View>
                {section.items.map((item, ii) => {
                  const color = SEVERITY_COLORS[item.severity ?? 'info'] ?? tokens.white60;
                  const tappable = !!item.mint || !!item.action;
                  const content = (
                    <View style={styles.sectionItem}>
                      {item.severity && (
                        <View style={[styles.severityDot, { backgroundColor: color }]} />
                      )}
                      <Text style={styles.itemLabel} numberOfLines={1}>{item.label}</Text>
                      <Text style={[styles.itemValue, { color }]} numberOfLines={1}>{item.value}</Text>
                    </View>
                  );
                  if (tappable) {
                    return (
                      <TouchableOpacity
                        key={ii}
                        onPress={() => {
                          if (item.mint) router.push(`/token/${item.mint}` as any);
                          else if (item.action) router.push(item.action as any);
                        }}
                        activeOpacity={0.7}
                      >
                        {content}
                      </TouchableOpacity>
                    );
                  }
                  return <View key={ii}>{content}</View>;
                })}
              </View>
            ))}
          </Animated.View>
        )}

        {/* Timestamp */}
        {generatedAt && expanded && (
          <Text style={styles.meta}>
            {new Date(generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        )}
      </GlassCard>
    </TouchableOpacity>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: `${tokens.secondary}20`,
    backgroundColor: `${tokens.secondary}06`,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.tiny,
    color: tokens.secondary,
    letterSpacing: 1.2,
  },
  unreadDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: tokens.accent,
  },
  threatBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: `${tokens.risk.critical}15`,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: `${tokens.risk.critical}30`,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  threatCount: {
    fontFamily: 'Lexend-Bold',
    fontSize: 9,
    color: tokens.risk.critical,
  },
  contentPreview: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.textTertiary,
    lineHeight: 18,
    marginTop: 8,
  },
  contentFull: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white80,
    lineHeight: 20,
    marginTop: 8,
  },
  sectionsWrap: {
    marginTop: 12,
    gap: 10,
  },
  section: {
    backgroundColor: `${tokens.bgGlass8}`,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    padding: 10,
    gap: 6,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  sectionTitle: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.tiny,
    color: tokens.white60,
    letterSpacing: 0.6,
  },
  sectionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 3,
  },
  severityDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  itemLabel: {
    flex: 1,
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white60,
  },
  itemValue: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.tiny,
  },
  meta: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.textTertiary,
    marginTop: 8,
    letterSpacing: 0.3,
  },
});
