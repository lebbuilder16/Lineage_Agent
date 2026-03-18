import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { Shield, Radar, GitBranch, Zap } from 'lucide-react-native';
import { AuroraBackground } from '../../src/components/ui/AuroraBackground';
import { HapticButton } from '../../src/components/ui/HapticButton';
import { tokens } from '../../src/theme/tokens';

const FEATURES = [
  { icon: Radar, label: 'Neural Detection' },
  { icon: GitBranch, label: 'Lineage Mapping' },
  { icon: Zap, label: 'Real-time Alerts' },
] as const;

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <AuroraBackground />
      <View style={[styles.content, { paddingTop: Math.max(insets.top + 40, 80), paddingBottom: Math.max(insets.bottom + 24, 40) }]}>

        {/* Shield icon with glow */}
        <Animated.View entering={FadeIn.delay(200).duration(800)} style={styles.iconSection}>
          <View style={styles.shieldGlow}>
            <LinearGradient
              colors={['rgba(9, 26, 122, 0.6)', 'rgba(173, 200, 255, 0.15)', 'transparent']}
              style={styles.shieldGlowGradient}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
            />
          </View>
          <View style={styles.shieldOuter}>
            <View style={styles.shieldInner}>
              <Shield size={40} color={tokens.secondary} strokeWidth={1.5} />
            </View>
          </View>
        </Animated.View>

        {/* Title */}
        <Animated.View entering={FadeInDown.delay(400).duration(600)} style={styles.titleSection}>
          <Text style={styles.title}>
            <Text style={styles.titleBold}>LINEAGE </Text>
            <Text style={styles.titleAccent}>AGENT</Text>
          </Text>
          <Text style={styles.subtitle}>
            Advanced On-Chain Intelligence{'\n'}for Solana Traders
          </Text>
        </Animated.View>

        {/* Feature pills */}
        <Animated.View entering={FadeInDown.delay(600).duration(600)} style={styles.features}>
          {FEATURES.map(({ icon: Icon, label }, i) => (
            <Animated.View key={label} entering={FadeInDown.delay(700 + i * 100).duration(400)}>
              <View style={styles.featurePill}>
                <Icon size={14} color={tokens.secondary} strokeWidth={2} />
                <Text style={styles.featureText}>{label}</Text>
              </View>
            </Animated.View>
          ))}
        </Animated.View>

        {/* Spacer */}
        <View style={{ flex: 1 }} />

        {/* CTA */}
        <Animated.View entering={FadeInDown.delay(1000).duration(600)} style={styles.ctaSection}>
          <HapticButton
            variant="primary"
            size="lg"
            fullWidth
            onPress={() => router.push('/(auth)/login')}
          >
            <Text style={styles.ctaText}>INITIALIZE NODE</Text>
            <Text style={styles.ctaArrow}>  →</Text>
          </HapticButton>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.bgMain },
  content: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: tokens.spacing.screenPadding + 8,
  },

  // Shield icon
  iconSection: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
    marginTop: 40,
  },
  shieldGlow: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    overflow: 'hidden',
  },
  shieldGlowGradient: {
    width: '100%',
    height: '100%',
  },
  shieldOuter: {
    width: 88,
    height: 88,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: `${tokens.secondary}30`,
    backgroundColor: `${tokens.primary}60`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shieldInner: {
    width: 60,
    height: 60,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: `${tokens.secondary}50`,
    backgroundColor: `${tokens.primary}90`,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Title
  titleSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 32,
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: 12,
  },
  titleBold: {
    fontFamily: 'Lexend-Bold',
    color: tokens.white100,
  },
  titleAccent: {
    fontFamily: 'Lexend-Bold',
    color: tokens.secondary,
  },
  subtitle: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.body,
    color: tokens.white60,
    textAlign: 'center',
    lineHeight: 22,
  },

  // Feature pills
  features: {
    alignItems: 'center',
    gap: 10,
  },
  featurePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: tokens.bgGlass8,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  featureText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white80,
  },

  // CTA
  ctaSection: {
    width: '100%',
  },
  ctaText: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.body,
    color: tokens.white100,
    letterSpacing: 1.5,
  },
  ctaArrow: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.body,
    color: tokens.white100,
  },
});
