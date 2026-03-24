import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CheckCircle, XOctagon } from 'lucide-react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { useInvestigateStore } from '../../store/investigate';
import { useHistoryStore } from '../../store/history';
import { GlassCard } from '../ui/GlassCard';
import { HapticButton } from '../ui/HapticButton';
import { tokens } from '../../theme/tokens';

export function VerdictFeedback() {
  const mint = useInvestigateStore((s) => s.mint);
  const verdict = useInvestigateStore((s) => s.verdict);
  const previous = useHistoryStore((s) => mint ? s.getByMint(mint) : undefined);
  const setFeedback = useHistoryStore((s) => s.setFeedback);

  if (!verdict || !mint) return null;
  if (previous?.feedback) {
    return (
      <Animated.View entering={FadeIn.duration(200)}>
        <View style={styles.feedbackDone}>
          <CheckCircle size={14} color={tokens.success} />
          <Text style={styles.feedbackDoneText}>
            Feedback recorded: {previous.feedback === 'accurate' ? 'Accurate' : 'Incorrect'}
          </Text>
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View entering={FadeInDown.duration(300).springify()}>
      <GlassCard>
        <Text style={styles.feedbackTitle}>Was this verdict accurate?</Text>
        <View style={styles.feedbackRow}>
          <HapticButton
            variant="ghost"
            size="sm"
            style={styles.feedbackBtn}
            onPress={() => setFeedback(mint, 'accurate')}
          >
            <CheckCircle size={16} color={tokens.success} />
            <Text style={[styles.feedbackBtnText, { color: tokens.success }]}>Accurate</Text>
          </HapticButton>
          <HapticButton
            variant="ghost"
            size="sm"
            style={styles.feedbackBtn}
            onPress={() => setFeedback(mint, 'incorrect')}
          >
            <XOctagon size={16} color={tokens.risk?.high ?? '#FF6B6B'} />
            <Text style={[styles.feedbackBtnText, { color: tokens.risk?.high ?? '#FF6B6B' }]}>Incorrect</Text>
          </HapticButton>
        </View>
      </GlassCard>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  feedbackTitle: {
    fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.small,
    color: tokens.white60, textAlign: 'center', marginBottom: 10,
  },
  feedbackRow: {
    flexDirection: 'row', justifyContent: 'center', gap: 16,
  },
  feedbackBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  feedbackBtnText: {
    fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.small,
  },
  feedbackDone: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 8,
  },
  feedbackDoneText: {
    fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny,
    color: tokens.textTertiary,
  },
});
