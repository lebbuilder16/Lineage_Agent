import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  withDelay,
  Easing,
  FadeIn,
  FadeInDown,
} from 'react-native-reanimated';
import { tokens } from '../../theme/tokens';
import { useReducedMotion } from '../../hooks/useReducedMotion';

type EmptyStateVariant = 'scan' | 'watchlist' | 'alerts' | 'search' | 'error';

interface AnimatedEmptyStateProps {
  variant: EmptyStateVariant;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

/**
 * Premium animated empty state with floating orbs + icon composition.
 * Replaces static text+icon empty states with an engaging visual.
 */
export function AnimatedEmptyState({
  variant,
  title,
  subtitle,
  action,
}: AnimatedEmptyStateProps) {
  const reducedMotion = useReducedMotion();

  // Floating orbs animation
  const float1 = useSharedValue(0);
  const float2 = useSharedValue(0);
  const float3 = useSharedValue(0);
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (reducedMotion) return;

    float1.value = withRepeat(
      withSequence(
        withTiming(-8, { duration: 2400, easing: Easing.inOut(Easing.ease) }),
        withTiming(8, { duration: 2400, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
    );
    float2.value = withRepeat(
      withDelay(300,
        withSequence(
          withTiming(10, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
          withTiming(-10, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
        ),
      ),
      -1,
    );
    float3.value = withRepeat(
      withDelay(600,
        withSequence(
          withTiming(-6, { duration: 2800, easing: Easing.inOut(Easing.ease) }),
          withTiming(6, { duration: 2800, easing: Easing.inOut(Easing.ease) }),
        ),
      ),
      -1,
    );
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.95, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
    );
  }, [reducedMotion]);

  const orb1Style = useAnimatedStyle(() => ({
    transform: [{ translateY: float1.value }, { translateX: float1.value * 0.5 }],
  }));
  const orb2Style = useAnimatedStyle(() => ({
    transform: [{ translateY: float2.value }, { translateX: -float2.value * 0.3 }],
  }));
  const orb3Style = useAnimatedStyle(() => ({
    transform: [{ translateY: float3.value }, { translateX: float3.value * 0.7 }],
  }));
  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
    opacity: 0.6 + (pulse.value - 0.95) * 2,
  }));

  const config = VARIANT_CONFIG[variant];

  return (
    <Animated.View entering={FadeIn.duration(500)} style={styles.container}>
      {/* Floating orbs composition */}
      <View style={styles.orbContainer}>
        <Animated.View style={[styles.orb, styles.orb1, { backgroundColor: config.orb1 }, orb1Style]} />
        <Animated.View style={[styles.orb, styles.orb2, { backgroundColor: config.orb2 }, orb2Style]} />
        <Animated.View style={[styles.orb, styles.orb3, { backgroundColor: config.orb3 }, orb3Style]} />

        {/* Center icon ring */}
        <Animated.View style={[styles.iconRing, { borderColor: config.ringColor }, pulseStyle]}>
          <View style={[styles.iconInner, { backgroundColor: config.innerBg }]}>
            <Text style={[styles.iconEmoji, { fontSize: 32 }]}>{config.emoji}</Text>
          </View>
        </Animated.View>
      </View>

      {/* Text */}
      <Animated.View entering={FadeInDown.delay(200).duration(400)} style={styles.textBlock}>
        <Text style={styles.title}>{title}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </Animated.View>

      {/* Action */}
      {action && (
        <Animated.View entering={FadeInDown.delay(400).duration(400)}>
          {action}
        </Animated.View>
      )}
    </Animated.View>
  );
}

const VARIANT_CONFIG: Record<EmptyStateVariant, {
  emoji: string;
  orb1: string;
  orb2: string;
  orb3: string;
  ringColor: string;
  innerBg: string;
}> = {
  scan: {
    emoji: '🔍',
    orb1: 'rgba(173, 200, 255, 0.15)',
    orb2: 'rgba(99, 102, 241, 0.12)',
    orb3: 'rgba(139, 92, 246, 0.10)',
    ringColor: 'rgba(173, 200, 255, 0.30)',
    innerBg: 'rgba(173, 200, 255, 0.08)',
  },
  watchlist: {
    emoji: '👁️',
    orb1: 'rgba(0, 255, 136, 0.12)',
    orb2: 'rgba(6, 182, 212, 0.10)',
    orb3: 'rgba(173, 200, 255, 0.12)',
    ringColor: 'rgba(0, 255, 136, 0.25)',
    innerBg: 'rgba(0, 255, 136, 0.06)',
  },
  alerts: {
    emoji: '🔔',
    orb1: 'rgba(255, 51, 102, 0.12)',
    orb2: 'rgba(255, 153, 51, 0.10)',
    orb3: 'rgba(139, 92, 246, 0.10)',
    ringColor: 'rgba(255, 51, 102, 0.25)',
    innerBg: 'rgba(255, 51, 102, 0.06)',
  },
  search: {
    emoji: '🧬',
    orb1: 'rgba(99, 102, 241, 0.15)',
    orb2: 'rgba(173, 200, 255, 0.12)',
    orb3: 'rgba(196, 181, 253, 0.10)',
    ringColor: 'rgba(99, 102, 241, 0.30)',
    innerBg: 'rgba(99, 102, 241, 0.08)',
  },
  error: {
    emoji: '⚠️',
    orb1: 'rgba(255, 51, 102, 0.15)',
    orb2: 'rgba(255, 0, 51, 0.10)',
    orb3: 'rgba(239, 68, 68, 0.12)',
    ringColor: 'rgba(255, 51, 102, 0.30)',
    innerBg: 'rgba(255, 51, 102, 0.08)',
  },
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 24,
  },
  orbContainer: {
    width: 160,
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orb: {
    position: 'absolute',
    borderRadius: 999,
  },
  orb1: {
    width: 100,
    height: 100,
    top: 5,
    left: 5,
  },
  orb2: {
    width: 70,
    height: 70,
    bottom: 10,
    right: 10,
  },
  orb3: {
    width: 50,
    height: 50,
    top: 30,
    right: 15,
  },
  iconRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconEmoji: {
    textAlign: 'center',
  },
  textBlock: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 32,
  },
  title: {
    fontFamily: 'SpaceGrotesk-SemiBold',
    fontSize: 20,
    color: tokens.white100,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.body,
    color: tokens.textTertiary,
    textAlign: 'center',
    lineHeight: 20,
  },
});
