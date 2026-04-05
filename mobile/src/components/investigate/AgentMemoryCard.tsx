import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Brain } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { useInvestigateStore } from '../../store/investigate';
import { GlassCard } from '../ui/GlassCard';
import { MemoryBadge } from '../ui/MemoryBadge';
import { tokens } from '../../theme/tokens';

export function AgentMemoryCard() {
  const verdict = useInvestigateStore((s) => s.verdict);
  if (!verdict) return null;

  const { memory_context, memory_depth, prediction_band } = verdict;

  // Only show if there's actual memory content
  if (!memory_context && memory_depth === 'first_encounter') return null;
  if (!memory_context && !prediction_band) return null;

  const depthColor =
    memory_depth === 'deep' ? tokens.risk.low
    : memory_depth === 'partial' ? tokens.risk.medium
    : tokens.textTertiary;

  return (
    <Animated.View entering={FadeInDown.duration(300).delay(200).springify()}>
      <GlassCard style={[styles.card, { borderLeftColor: `${depthColor}60`, borderLeftWidth: 2 }]}>
        <View style={styles.header}>
          <Brain size={14} color={depthColor} />
          <Text style={[styles.title, { color: depthColor }]}>Agent Memory</Text>
          {memory_depth && <MemoryBadge depth={memory_depth} size="sm" />}
        </View>

        {memory_context && (
          <Text style={styles.contextText}>{memory_context}</Text>
        )}

        {prediction_band && prediction_band.n >= 5 && (
          <View style={styles.bandRow}>
            <Text style={styles.bandLabel}>Prediction range</Text>
            <View style={styles.bandBar}>
              <View style={[styles.bandFill, {
                left: `${prediction_band.low}%`,
                width: `${prediction_band.high - prediction_band.low}%`,
                backgroundColor: `${depthColor}30`,
              }]} />
              <View style={[styles.bandDot, { left: `${verdict.risk_score}%` }]} />
            </View>
            <View style={styles.bandLabels}>
              <Text style={styles.bandValue}>{prediction_band.low}</Text>
              <Text style={styles.bandValue}>{prediction_band.high}</Text>
            </View>
            <Text style={styles.bandNote}>
              Based on {prediction_band.n} similar deployers
            </Text>
          </View>
        )}
      </GlassCard>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.small,
    flex: 1,
  },
  contextText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white80,
    lineHeight: 20,
  },
  bandRow: { gap: 6 },
  bandLabel: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.tiny,
    color: tokens.textTertiary,
    letterSpacing: 0.5,
  },
  bandBar: {
    height: 6,
    backgroundColor: tokens.bgGlass8,
    borderRadius: 3,
    position: 'relative',
    overflow: 'hidden',
  },
  bandFill: {
    position: 'absolute',
    top: 0,
    height: 6,
    borderRadius: 3,
  },
  bandDot: {
    position: 'absolute',
    top: -1,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: tokens.white100,
    marginLeft: -4,
    borderWidth: 1,
    borderColor: tokens.bgCard,
  },
  bandLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  bandValue: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.textTertiary,
  },
  bandNote: {
    fontFamily: 'Lexend-Regular',
    fontSize: 9,
    color: tokens.textTertiary,
    textAlign: 'center',
  },
});
