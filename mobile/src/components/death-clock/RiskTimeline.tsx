import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { tokens } from '../../theme/tokens';
import type { DeathClockForecast } from '../../types/api';
import { fmtHours } from './fmtHours';

interface RiskTimelineProps {
  dc: DeathClockForecast;
  riskColor: string;
  localElapsed: number;
  confidence: 'low' | 'medium' | 'high';
}

export function RiskTimeline({ dc, riskColor, localElapsed, confidence }: RiskTimelineProps) {
  const scale = useSharedValue(0.8);

  useEffect(() => {
    scale.value = withRepeat(
      withTiming(1.3, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      -1, true,
    );
  }, []);

  const markerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const total = Math.max(dc.median_rug_hours + dc.stdev_rug_hours + 24, localElapsed + 12);
  const nowPct = localElapsed / total;
  const winStartPct = Math.max((dc.median_rug_hours - dc.stdev_rug_hours) / total, 0);
  const winEndPct = Math.min((dc.median_rug_hours + dc.stdev_rug_hours) / total, 0.98);

  const pastWindow = localElapsed > (dc.median_rug_hours + dc.stdev_rug_hours);
  const windowColor = pastWindow ? tokens.white35 : riskColor;
  const inWindow = localElapsed >= Math.max(dc.median_rug_hours - dc.stdev_rug_hours, 0)
    && localElapsed <= (dc.median_rug_hours + dc.stdev_rug_hours);
  const markerColor = inWindow ? riskColor : pastWindow ? tokens.white35 : tokens.secondary;

  const hoursRemaining = Math.max(dc.median_rug_hours - dc.stdev_rug_hours, 0) - localElapsed;

  return (
    <View
      style={styles.timelineWrap}
      accessibilityLabel={`Risk timeline: ${fmtHours(localElapsed)} elapsed${inWindow ? ', rug window currently open' : pastWindow ? ', past rug window' : `, rug window in ${fmtHours(hoursRemaining)}`}`}
    >
      <View style={styles.timelineTrack}>
        <View style={[styles.timelineSegment, {
          left: 0, width: `${winStartPct * 100}%`,
          backgroundColor: `${tokens.risk.low}20`,
        }]} />
        <View style={[styles.timelineSegment, {
          left: `${winStartPct * 100}%`,
          width: `${(winEndPct - winStartPct) * 100}%`,
          backgroundColor: `${windowColor}30`,
          borderLeftWidth: 1, borderRightWidth: 1,
          borderColor: `${windowColor}50`,
        }]} />
        <View style={[styles.timelineMarkerWrap, { left: `${nowPct * 100}%` }]}>
          <Animated.View style={[styles.timelineMarker, { backgroundColor: markerColor }, markerStyle]} />
        </View>
      </View>
      <View style={styles.timelineLabels}>
        <Text style={styles.tlLabel}>Launch</Text>
        <Text style={[styles.tlLabel, { color: markerColor }]}>Now</Text>
        {dc.median_rug_hours > 0 && (
          <Text style={[styles.tlLabel, { color: `${windowColor}80` }]}>
            ~{Math.round(dc.median_rug_hours)}h
          </Text>
        )}
      </View>
      {confidence === 'low' && (
        <Text style={styles.timelineWarning}>
          {dc.basis_breakdown && Object.keys(dc.basis_breakdown).some(m => m === 'liquidity_drain_rug')
            ? 'Estimate includes soft rugs — window is approximate'
            : dc.sample_count <= 1
              ? 'Based on 1 sample — treat as indicative only'
              : `${dc.sample_count} samples — estimate may vary`}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  timelineWrap: { marginBottom: 14, gap: 6 },
  timelineTrack: {
    height: 6,
    backgroundColor: tokens.white10,
    borderRadius: 3,
    overflow: 'visible',
    position: 'relative',
  },
  timelineSegment: {
    position: 'absolute',
    top: 0,
    height: '100%',
    borderRadius: 3,
  },
  timelineMarkerWrap: {
    position: 'absolute',
    top: '50%',
    marginTop: -6,
    marginLeft: -6,
    width: 12,
    height: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineMarker: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  timelineLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  tlLabel: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.textTertiary,
  },
  timelineWarning: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.textTertiary,
    fontStyle: 'italic',
    textAlign: 'center',
  },
});
