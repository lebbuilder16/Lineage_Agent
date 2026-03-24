import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import { Radar } from 'lucide-react-native';
import { tokens } from '../../theme/tokens';
import { useReducedMotion } from '../../hooks/useReducedMotion';

const SONAR_SIZE = 140;
const BLIPS = [
  { r: 0.45, a: 42 },
  { r: 0.68, a: 145 },
  { r: 0.55, a: 235 },
];

export function SonarSweep() {
  const rotation = useSharedValue(0);
  const blip1 = useSharedValue(0);
  const blip2 = useSharedValue(0);
  const blip3 = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      // Static: arm at 45deg, blips visible
      rotation.value = 0.125;
      blip1.value = 0.8;
      blip2.value = 0.8;
      blip3.value = 0.8;
      return;
    }
    const CYCLE = 3000;
    rotation.value = withRepeat(withTiming(1, { duration: CYCLE, easing: Easing.linear }), -1, false);
    const blipAnim = (sv: typeof blip1, delay: number) => {
      sv.value = withDelay(delay, withRepeat(
        withTiming(1, { duration: 600, easing: Easing.out(Easing.quad) }),
        -1,
        true,
      ));
    };
    blipAnim(blip1, 0);
    blipAnim(blip2, 1100);
    blipAnim(blip3, 2200);
  }, [reducedMotion]);

  const armStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(rotation.value, [0, 1], [0, 360])}deg` }],
  }));
  const trail1Style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(rotation.value, [0, 1], [-20, 340])}deg` }],
    opacity: 0.45,
  }));
  const trail2Style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(rotation.value, [0, 1], [-40, 320])}deg` }],
    opacity: 0.18,
  }));
  const b1Style = useAnimatedStyle(() => ({ opacity: blip1.value, transform: [{ scale: interpolate(blip1.value, [0, 1], [0.6, 1]) }] }));
  const b2Style = useAnimatedStyle(() => ({ opacity: blip2.value, transform: [{ scale: interpolate(blip2.value, [0, 1], [0.6, 1]) }] }));
  const b3Style = useAnimatedStyle(() => ({ opacity: blip3.value, transform: [{ scale: interpolate(blip3.value, [0, 1], [0.6, 1]) }] }));
  const blipStyles = [b1Style, b2Style, b3Style];

  const R = SONAR_SIZE / 2;

  return (
    <View style={styles.sonarContainer} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {[0.33, 0.6, 0.88].map((ratio, i) => (
        <View
          key={i}
          style={[
            styles.sonarRing,
            { width: SONAR_SIZE * ratio, height: SONAR_SIZE * ratio, borderRadius: (SONAR_SIZE * ratio) / 2 },
          ]}
        />
      ))}
      <View style={[styles.sonarCross, { width: SONAR_SIZE, height: 1 }]} />
      <View style={[styles.sonarCross, { width: 1, height: SONAR_SIZE }]} />
      <Animated.View style={[styles.sonarArmWrap, trail2Style]}>
        <View style={[styles.sonarArm, { backgroundColor: `${tokens.secondary}30` }]} />
      </Animated.View>
      <Animated.View style={[styles.sonarArmWrap, trail1Style]}>
        <View style={[styles.sonarArm, { backgroundColor: `${tokens.secondary}55` }]} />
      </Animated.View>
      <Animated.View style={[styles.sonarArmWrap, armStyle]}>
        <View style={styles.sonarArm} />
      </Animated.View>
      {BLIPS.map((bp, i) => {
        const rad = (bp.a * Math.PI) / 180;
        const bx = R + bp.r * R * Math.cos(rad) - 4;
        const by = R + bp.r * R * Math.sin(rad) - 4;
        return (
          <Animated.View
            key={i}
            style={[styles.sonarBlip, { left: bx, top: by }, blipStyles[i]]}
          />
        );
      })}
      <View style={styles.sonarDot}>
        <Radar size={18} color={tokens.secondary} strokeWidth={2} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sonarContainer: { width: SONAR_SIZE, height: SONAR_SIZE, alignItems: 'center', justifyContent: 'center' },
  sonarRing: { position: 'absolute', borderWidth: 1, borderColor: `${tokens.secondary}12` },
  sonarCross: { position: 'absolute', backgroundColor: `${tokens.secondary}08` },
  sonarArmWrap: { position: 'absolute', width: 0, height: 0, left: SONAR_SIZE / 2, top: SONAR_SIZE / 2 },
  sonarArm: { position: 'absolute', left: 0, top: 0, width: SONAR_SIZE / 2, height: 1.5, backgroundColor: tokens.secondary },
  sonarBlip: { position: 'absolute', width: 7, height: 7, borderRadius: 4, backgroundColor: tokens.secondary },
  sonarDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: `${tokens.secondary}14`,
    borderWidth: 1,
    borderColor: `${tokens.secondary}40`,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
