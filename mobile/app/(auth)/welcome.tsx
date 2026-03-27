import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeInDown, FadeIn, FadeInUp,
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence, Easing,
} from 'react-native-reanimated';
import { Shield, Radar, GitBranch, Zap, ChevronRight, Fingerprint, Search } from 'lucide-react-native';
import { HapticButton } from '../../src/components/ui/HapticButton';
import { tokens } from '../../src/theme/tokens';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const FEATURES = [
  { icon: Radar, label: 'Neural Detection', desc: 'AI-powered rug pull detection', color: tokens.secondary },
  { icon: GitBranch, label: 'Lineage Mapping', desc: 'On-chain deployer tracing', color: tokens.success },
  { icon: Zap, label: 'Real-time Alerts', desc: 'Instant threat notifications', color: tokens.accent },
] as const;

// ── Breathing Orb ───────────────────────────────────────────────────────────

function BreathingOrb() {
  const scale = useSharedValue(1);
  const glowOpacity = useSharedValue(0.08);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      ),
      -1, false,
    );
    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(0.15, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.06, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      ),
      -1, false,
    );
  }, []);

  const orbStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  return (
    <View style={styles.orbContainer}>
      <Animated.View style={[styles.orbGlowOuter, glowStyle]}>
        <LinearGradient
          colors={['rgba(173, 200, 255, 0.5)', 'rgba(9, 26, 122, 0.6)', 'transparent']}
          style={styles.orbGradient}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
        />
      </Animated.View>
      <Animated.View style={[styles.orbRing, orbStyle]}>
        <LinearGradient
          colors={[`${tokens.primary}90`, `${tokens.secondary}30`]}
          style={styles.orbRingGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
        <View style={styles.orbCore}>
          <Shield size={36} color={tokens.secondary} strokeWidth={1.5} />
        </View>
      </Animated.View>
    </View>
  );
}

// ── Main ────────────────────────────────────────────────────────────────────

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top + 24, 64), paddingBottom: Math.max(insets.bottom + 16, 32) }]}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >

        {/* Hero */}
        <View style={styles.heroSection}>
          <Animated.View entering={FadeIn.delay(200).duration(1000)}>
            <BreathingOrb />
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(400).duration(600)} style={styles.titleBlock}>
            <Text style={styles.titleLine1}>LINEAGE</Text>
            <Text style={styles.titleLine2}>AGENT</Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(550).duration(500)}>
            <Text style={styles.tagline}>On-Chain Intelligence for Solana</Text>
          </Animated.View>
        </View>

        {/* Social proof strip */}
        <Animated.View entering={FadeInDown.delay(650).duration(400)} style={styles.proofStrip}>
          <View style={styles.proofItem}>
            <Text style={styles.proofVal}>50K+</Text>
            <Text style={styles.proofLabel}>Tokens analyzed</Text>
          </View>
          <View style={styles.proofDivider} />
          <View style={styles.proofItem}>
            <Text style={styles.proofVal}>3.8K</Text>
            <Text style={styles.proofLabel}>Rugs detected</Text>
          </View>
          <View style={styles.proofDivider} />
          <View style={styles.proofItem}>
            <Text style={styles.proofVal}>24/7</Text>
            <Text style={styles.proofLabel}>Live monitoring</Text>
          </View>
        </Animated.View>

        {/* Feature cards */}
        <Animated.View entering={FadeInDown.delay(750).duration(500)} style={styles.featureGrid}>
          {FEATURES.map(({ icon: Icon, label, desc, color }, i) => (
            <Animated.View key={label} entering={FadeInDown.delay(800 + i * 80).duration(400)}>
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

        {/* Bottom CTAs */}
        <Animated.View entering={FadeInUp.delay(1000).duration(600)} style={styles.ctaBlock}>
          <View style={styles.trustRow}>
            <Fingerprint size={12} color={tokens.textTertiary} strokeWidth={1.5} />
            <Text style={styles.trustText}>Encrypted & non-custodial</Text>
          </View>

          <HapticButton variant="primary" size="lg" fullWidth onPress={() => router.push('/(auth)/login')}>
            <Text style={styles.ctaBtnText}>Get Started</Text>
            <ChevronRight size={18} color={tokens.white100} strokeWidth={2.5} />
          </HapticButton>

          {/* Explore first CTA */}
          <HapticButton variant="ghost" size="md" fullWidth onPress={() => router.replace('/(tabs)/radar')}>
            <Search size={14} color={tokens.white60} strokeWidth={2} />
            <Text style={styles.exploreBtnText}>Explore without account</Text>
          </HapticButton>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.bgMain },
  content: { flexGrow: 1, paddingHorizontal: tokens.spacing.screenPadding + 4 },

  // Hero
  heroSection: { alignItems: 'center', marginTop: 16 },
  orbContainer: { alignItems: 'center', justifyContent: 'center', marginBottom: 28 },
  orbGlowOuter: { position: 'absolute', width: 200, height: 200, borderRadius: 100, overflow: 'hidden' },
  orbGradient: { width: '100%', height: '100%' },
  orbRing: {
    width: 96, height: 96, borderRadius: 32,
    borderWidth: 1, borderColor: `${tokens.secondary}25`,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  orbRingGradient: { ...StyleSheet.absoluteFillObject, opacity: 0.5 },
  orbCore: {
    width: 64, height: 64, borderRadius: 22,
    backgroundColor: `${tokens.primary}AA`,
    borderWidth: 1, borderColor: `${tokens.secondary}40`,
    alignItems: 'center', justifyContent: 'center',
  },

  // Title
  titleBlock: { alignItems: 'center', marginBottom: 10 },
  titleLine1: { fontFamily: 'Lexend-Bold', fontSize: 42, color: tokens.white100, letterSpacing: 6, lineHeight: 48 },
  titleLine2: { fontFamily: 'Lexend-Light', fontSize: 42, color: tokens.secondary, letterSpacing: 10, lineHeight: 48 },
  tagline: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.body, color: tokens.textTertiary, textAlign: 'center', letterSpacing: 0.5, marginTop: 4 },

  // Social proof
  proofStrip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: tokens.bgGlass8, borderRadius: tokens.radius.md,
    borderWidth: 1, borderColor: tokens.borderSubtle,
    paddingVertical: 14, paddingHorizontal: 8, marginTop: 28,
  },
  proofItem: { flex: 1, alignItems: 'center', gap: 2 },
  proofVal: { fontFamily: 'Lexend-Bold', fontSize: tokens.font.subheading, color: tokens.white100 },
  proofLabel: { fontFamily: 'Lexend-Regular', fontSize: 9, color: tokens.textTertiary, letterSpacing: 0.2 },
  proofDivider: { width: 1, height: 24, backgroundColor: tokens.borderSubtle },

  // Features
  featureGrid: { marginTop: 20, gap: 8 },
  featureCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: tokens.bgGlass, borderRadius: tokens.radius.md,
    borderWidth: 1, borderColor: tokens.borderSubtle,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  featureIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  featureTextBlock: { flex: 1 },
  featureLabel: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.body, color: tokens.white100, marginBottom: 2 },
  featureDesc: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.small, color: tokens.textTertiary },

  // CTA
  ctaBlock: { gap: 10, alignItems: 'center', marginTop: 32 },
  trustRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  trustText: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.textTertiary, letterSpacing: 0.3 },
  ctaBtnText: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.subheading, color: tokens.white100, letterSpacing: 0.5 },
  exploreBtnText: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.small, color: tokens.white60 },
});
