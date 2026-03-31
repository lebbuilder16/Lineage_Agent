import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { tokens } from '../../theme/tokens';
import { flagLabel, flagColor } from '../../lib/flag-helpers';
import type { SweepFlag } from '../../types/api';

interface FlagTimelineProps {
  flags: SweepFlag[];
  maxItems?: number;
}

function timeAgo(ts: number): string {
  const now = Date.now() / 1000;
  const diff = now - ts;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function FlagTimeline({ flags, maxItems = 5 }: FlagTimelineProps) {
  const visible = flags.slice(0, maxItems);
  if (!visible.length) return null;

  return (
    <View style={styles.container}>
      {visible.map((flag, i) => {
        const color = flagColor(flag.flagType, flag.severity);
        const isLast = i === visible.length - 1;
        return (
          <View key={flag.id} style={styles.row}>
            {/* Timeline line + dot */}
            <View style={styles.timeline}>
              <View style={[styles.dot, { backgroundColor: color }]} />
              {!isLast && <View style={[styles.line, { backgroundColor: `${color}40` }]} />}
            </View>
            {/* Content */}
            <View style={styles.content}>
              <Text style={[styles.title, { color }]} numberOfLines={1}>
                {flagLabel(flag.flagType)}
              </Text>
              {((flag.detail as any)?.narrative || (flag.title && flag.title !== flagLabel(flag.flagType))) && (
                <Text style={styles.detail} numberOfLines={2}>
                  {(flag.detail as any)?.narrative || flag.title}
                </Text>
              )}
              <Text style={styles.time}>{timeAgo(flag.createdAt)}</Text>
            </View>
          </View>
        );
      })}
      {flags.length > maxItems && (
        <Text style={styles.more}>+{flags.length - maxItems} more</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 2, paddingVertical: 4 },
  row: { flexDirection: 'row', minHeight: 36 },
  timeline: { width: 20, alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  line: { width: 1.5, flex: 1, marginTop: 2 },
  content: { flex: 1, paddingLeft: 8, paddingBottom: 8 },
  title: { fontFamily: 'Lexend-Medium', fontSize: 12 },
  detail: { fontFamily: 'Lexend-Regular', fontSize: 11, color: tokens.white60, marginTop: 1 },
  time: { fontFamily: 'Lexend-Regular', fontSize: 10, color: tokens.textTertiary, marginTop: 2 },
  more: { fontFamily: 'Lexend-Regular', fontSize: 11, color: tokens.textTertiary, paddingLeft: 28 },
});
