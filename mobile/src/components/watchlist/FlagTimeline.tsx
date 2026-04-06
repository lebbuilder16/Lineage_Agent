import React, { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { tokens } from '../../theme/tokens';
import { flagLabel, flagColor } from '../../lib/flag-helpers';
import { useSweepFlagsStore } from '../../store/sweep-flags';
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

function FlagRow({ flag, isLast }: { flag: SweepFlag; isLast: boolean }) {
  const swipeRef = useRef<Swipeable>(null);
  const submitFeedback = useSweepFlagsStore((s) => s.submitFeedback);
  const color = flagColor(flag.flagType, flag.severity);

  const handleSnooze = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    submitFeedback(flag.id, 'snoozed', 24);
    swipeRef.current?.close();
  }, [flag.id, submitFeedback]);

  const handleLongPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Alert.alert(
      flagLabel(flag.flagType),
      flag.title,
      [
        { text: 'Useful', onPress: () => submitFeedback(flag.id, 'useful') },
        { text: 'Not useful', onPress: () => submitFeedback(flag.id, 'not_useful') },
        { text: 'Snooze 24h', onPress: () => submitFeedback(flag.id, 'snoozed', 24) },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  }, [flag.id, flag.flagType, flag.title, submitFeedback]);

  return (
    <Swipeable
      ref={swipeRef}
      renderRightActions={() => (
        <TouchableOpacity style={styles.snoozeAction} onPress={handleSnooze} activeOpacity={0.8}>
          <Text style={styles.snoozeText}>Snooze</Text>
        </TouchableOpacity>
      )}
      overshootRight={false}
    >
      <TouchableOpacity onLongPress={handleLongPress} delayLongPress={400} activeOpacity={0.8}>
        <View style={styles.row}>
          <View style={styles.timeline}>
            <View style={[styles.dot, { backgroundColor: color }]} />
            {!isLast && <View style={[styles.line, { backgroundColor: `${color}40` }]} />}
          </View>
          <View style={styles.content}>
            <Text style={[styles.title, { color }]} numberOfLines={1}>
              {flagLabel(flag.flagType)}
            </Text>
            {((flag.detail as any)?.narrative || flag.title) && (
              <Text style={styles.detail} numberOfLines={3}>
                {(flag.detail as any)?.narrative || flag.title}
              </Text>
            )}
            <Text style={styles.time}>{timeAgo(flag.createdAt)}</Text>
          </View>
        </View>
      </TouchableOpacity>
    </Swipeable>
  );
}

export function FlagTimeline({ flags, maxItems = 5 }: FlagTimelineProps) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? flags : flags.slice(0, maxItems);
  const hiddenCount = flags.length - maxItems;
  if (!visible.length) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.header}>RECENT FLAGS</Text>
      {visible.map((flag, i) => (
        <FlagRow key={flag.id} flag={flag} isLast={i === visible.length - 1} />
      ))}
      {hiddenCount > 0 && !expanded && (
        <TouchableOpacity onPress={() => setExpanded(true)} activeOpacity={0.6}>
          <Text style={styles.more}>Show {hiddenCount} more flags</Text>
        </TouchableOpacity>
      )}
      {expanded && hiddenCount > 0 && (
        <TouchableOpacity onPress={() => setExpanded(false)} activeOpacity={0.6}>
          <Text style={styles.more}>Show less</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 2, paddingVertical: 4 },
  header: { fontFamily: 'Lexend-Medium', fontSize: 10, color: tokens.textTertiary, letterSpacing: 1.2, paddingLeft: 28, marginBottom: 6 },
  row: { flexDirection: 'row', minHeight: 36 },
  timeline: { width: 20, alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  line: { width: 1.5, flex: 1, marginTop: 2 },
  content: { flex: 1, paddingLeft: 8, paddingBottom: 8 },
  title: { fontFamily: 'Lexend-Medium', fontSize: 12 },
  detail: { fontFamily: 'Lexend-Regular', fontSize: 11, color: tokens.white60, marginTop: 1 },
  time: { fontFamily: 'Lexend-Regular', fontSize: 10, color: tokens.textTertiary, marginTop: 2 },
  more: { fontFamily: 'Lexend-Medium', fontSize: 12, color: tokens.secondary, paddingLeft: 28, paddingVertical: 6 },
  snoozeAction: {
    backgroundColor: tokens.risk.medium,
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    borderRadius: 8,
    marginVertical: 2,
  },
  snoozeText: {
    fontFamily: 'Lexend-Medium',
    fontSize: 12,
    color: tokens.white100,
  },
});
