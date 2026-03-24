import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeIn, FadeInUp } from 'react-native-reanimated';
import { Shield, Radar, GitBranch, Zap, ChevronRight, Fingerprint } from 'lucide-react-native';
import { HapticButton } from '../../src/components/ui/HapticButton';
import { GlassCard } from '../../src/components/ui/GlassCard';
import { tokens } from '../../src/theme/tokens';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const FEATURES = [
  {
    icon: Radar,
    label: 'Neural Detection',
    desc: 'AI-powered rug pull detection',
    color: tokens.secondary,
  },
  {
    icon: GitBranch,
    label: 'Lineage Mapping',
    desc: 'On-chain deployer tracing',
    color: tokens.success,
  },
  {
    icon: Zap,
    label: 'Real-time Alerts',
    desc: 'Instant threat notifications',
    color: tokens.accent,
  },
] as const;

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.content,
          {
            paddingTop: Math.max(insets.top + 24, 64),
            paddingBottom: Math.max(insets.bottom + 16, 32),
          },
        ]}
      >
        {/* Hero section */}
        <View style={styles.heroSection}>
          {/* Animated shield orb */}
          <Animated.View entering={FadeIn.delay(200).duration(1000)} style={styles.orbContainer}>
            <View style={styles.orbGlowOuter}>
              <LinearGradient
                colors={['rgba(173, 200, 255, 0.12)', 'rgba(9, 26, 122, 0.25)', 'transparent']}
                style={styles.orbGradient}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
              />
            </View>
            <View style={styles.orbRing}>
              <LinearGradient
                colors={[`${tokens.primary}90`, `${tokens.secondary}30`]}
                style={styles.orbRingGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              />
              <View style={styles.orbCore}>
                <Shield size={36} color={tokens.secondary} strokeWidth={1.5} />
              </View>
            </View>
          </Animated.View>

          {/* Title */}
          <Animated.View entering={FadeInDown.delay(400).duration(600)} style={styles.titleBlock}>
            <Text style={styles.titleLine1}>LINEAGE</Text>
            <Text style={styles.titleLine2}>AGENT</Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(550).duration(500)}>
            <Text style={styles.tagline}>
              On-Chain Intelligence for Solana
            </Text>
          </Animated.View>
        </View>

        {/* Feature cards */}
        <Animated.View entering={FadeInDown.delay(700).duration(500)} style={styles.featureGrid}>
          {FEATURES.map(({ icon: Icon, label, desc, color }, i) => (
            <Animated.View
              key={label}
              entering={FadeInDown.delay(750 + i * 80).duration(400)}
            >
              <View style={styles.featureCard}>
                <View style={[styles.featureIconWrap, { backgroundColor: `${color}12` }]}>
                  <Icon size={16} color={color} strokeWidth={2} />
                </View>
                <View style={styles.featureTextBlock}>
                  <Text style={styles.featureLabel}>{label}</Text>
                  <Text style={styles.featureDesc}>{desc}</Text>
                </View>
              </View>
            </Animated.View>
          ))}
        </Animated.View>

        {/* Spacer */}
        <View style={{ flex: 1, minHeight: 24 }} />

        {/* Bottom CTA */}
        <Animated.View entering={FadeInUp.delay(1000).duration(600)} style={styles.ctaBlock}>
          <View style={styles.trustRow}>
            <Fingerprint size={12} color={tokens.textTertiary} strokeWidth={1.5} />
            <Text style={styles.trustText}>Encrypted & non-custodial</Text>
          </View>

          <HapticButton
            variant="primary"
            size="lg"
            fullWidth
            onPress={() => router.push('/(auth)/login')}
          >
            <Text style={styles.ctaBtnText}>Get Started</Text>
            <ChevronRight size={18} color={tokens.white100} strokeWidth={2.5} />
          </HapticButton>

          <Text style={styles.versionText}>v1.0 — Solana Mainnet</Text>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  content: {
    flex: 1,
    paddingHorizontal: tokens.spacing.screenPadding + 4,
  },

  // Hero
  heroSection: {
    alignItems: 'center',
    marginTop: 16,
  },
  orbContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  orbGlowOuter: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    overflow: 'hidden',
  },
  orbGradient: { width: '100%', height: '100%' },
  orbRing: {
    width: 96,
    height: 96,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: `${tokens.secondary}25`,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  orbRingGradient: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.5,
  },
  orbCore: {
    width: 64,
    height: 64,
    borderRadius: 22,
    backgroundColor: `${tokens.primary}AA`,
    borderWidth: 1,
    borderColor: `${tokens.secondary}40`,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Title
  titleBlock: { alignItems: 'center', marginBottom: 10 },
  titleLine1: {
    fontFamily: 'Lexend-Bold',
    fontSize: 42,
    color: tokens.white100,
    letterSpacing: 6,
    lineHeight: 48,
  },
  titleLine2: {
    fontFamily: 'Lexend-Light',
    fontSize: 42,
    color: tokens.secondary,
    letterSpacing: 10,
    lineHeight: 48,
  },
  tagline: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.body,
    color: tokens.textTertiary,
    textAlign: 'center',
    letterSpacing: 0.5,
    marginTop: 4,
  },

  // Features
  featureGrid: {
    marginTop: 32,
    gap: 10,
  },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: tokens.bgGlass,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  featureIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTextBlock: { flex: 1 },
  featureLabel: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.body,
    color: tokens.white100,
    marginBottom: 2,
  },
  featureDesc: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.textTertiary,
  },

  // CTA
  ctaBlock: {
    gap: 12,
    alignItems: 'center',
  },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  trustText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.textTertiary,
    letterSpacing: 0.3,
  },
  ctaBtnText: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.subheading,
    color: tokens.white100,
    letterSpacing: 0.5,
  },
  versionText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white20,
    marginTop: 4,
  },
});
