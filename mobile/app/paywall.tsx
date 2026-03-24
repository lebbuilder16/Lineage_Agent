import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, Stack } from 'expo-router';
import { X, Check, Lock } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { GlassCard } from '../src/components/ui/GlassCard';
import { HapticButton } from '../src/components/ui/HapticButton';
import { useToast } from '../src/components/ui/Toast';
import { tokens } from '../src/theme/tokens';

// ── Plan definitions ────────────────────────────────────────────────────────

interface PlanDef {
  key: string;
  name: string;
  color: string;
  monthlyPrice: number;
  yearlyPrice: number;
  monthlyUsdc: number;
  yearlyUsdc: number;
  popular?: boolean;
  features: { label: string; included: boolean }[];
}

const PLANS: PlanDef[] = [
  {
    key: 'pro',
    name: 'Pro',
    color: '#ADC8FF',
    monthlyPrice: 4.99,
    yearlyPrice: 47.88,
    monthlyUsdc: 4.49,
    yearlyUsdc: 43.09,
    features: [
      { label: 'Unlimited scans', included: true },
      { label: 'Full Death Clock', included: true },
      { label: 'AI Chat (Haiku)', included: true },
      { label: '10 Watchlist', included: true },
      { label: 'Daily Briefing', included: true },
      { label: 'SOL Flow', included: true },
      { label: 'Bundle Detection', included: true },
      { label: 'Deployer Profile', included: true },
      { label: 'Telegram & Discord', included: false },
      { label: 'Cartel Detection', included: false },
      { label: 'Compare Tokens', included: false },
      { label: 'API Access', included: false },
    ],
  },
  {
    key: 'pro_plus',
    name: 'Pro+',
    color: '#FF3366',
    monthlyPrice: 12.99,
    yearlyPrice: 124.68,
    monthlyUsdc: 11.69,
    yearlyUsdc: 112.21,
    popular: true,
    features: [
      { label: 'Unlimited scans', included: true },
      { label: 'Full Death Clock', included: true },
      { label: 'AI Chat (Sonnet)', included: true },
      { label: '50 Watchlist', included: true },
      { label: 'Daily Briefing', included: true },
      { label: 'SOL Flow', included: true },
      { label: 'Bundle Detection', included: true },
      { label: 'Deployer Profile', included: true },
      { label: 'Telegram & Discord', included: true },
      { label: 'Cartel Detection', included: true },
      { label: 'Operator Fingerprint', included: true },
      { label: 'Compare Tokens', included: true },
      { label: 'Export PDF', included: true },
      { label: 'API Access', included: false },
      { label: 'Batch Scan', included: false },
    ],
  },
  {
    key: 'whale',
    name: 'Whale',
    color: '#00FF88',
    monthlyPrice: 49.99,
    yearlyPrice: 479.88,
    monthlyUsdc: 44.99,
    yearlyUsdc: 431.89,
    features: [
      { label: 'Unlimited scans', included: true },
      { label: 'Full Death Clock', included: true },
      { label: 'AI Chat (Sonnet)', included: true },
      { label: '200 Watchlist', included: true },
      { label: '3 Briefings/day', included: true },
      { label: 'SOL Flow', included: true },
      { label: 'Bundle Detection', included: true },
      { label: 'Deployer Profile', included: true },
      { label: 'Telegram & Discord', included: true },
      { label: 'Cartel Detection', included: true },
      { label: 'Operator Fingerprint', included: true },
      { label: 'Compare Tokens', included: true },
      { label: 'Export PDF', included: true },
      { label: 'Batch Scan', included: true },
      { label: 'API Access', included: true },
      { label: 'Custom Webhooks', included: true },
    ],
  },
];

// ── Component ───────────────────────────────────────────────────────────────

export default function PaywallScreen() {
  const insets = useSafeAreaInsets();
  const [yearly, setYearly] = useState(false);
  const { showToast, toast } = useToast();
  const isAndroid = Platform.OS === 'android';

  const comingSoon = () => showToast('Coming soon \u2014 RevenueCat not yet configured');

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <X size={24} color={tokens.white100} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Choose Your Plan</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Billing Toggle ───────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.duration(300).springify()} style={styles.toggleRow}>
          <View style={styles.togglePill}>
            <TouchableOpacity
              onPress={() => setYearly(false)}
              style={[styles.toggleSegment, !yearly && styles.toggleActive]}
              activeOpacity={0.8}
            >
              <Text style={[styles.toggleText, !yearly && styles.toggleTextActive]}>Monthly</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setYearly(true)}
              style={[styles.toggleSegment, yearly && styles.toggleActive]}
              activeOpacity={0.8}
            >
              <Text style={[styles.toggleText, yearly && styles.toggleTextActive]}>Yearly</Text>
              <View style={styles.saveBadge}>
                <Text style={styles.saveBadgeText}>Save 20%</Text>
              </View>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* ── Plan Cards ───────────────────────────────────────────────── */}
        {PLANS.map((plan, idx) => (
          <Animated.View
            key={plan.key}
            entering={FadeInDown.duration(350).delay(idx * 80).springify()}
          >
            <GlassCard style={[styles.planCard, { borderColor: plan.color, borderWidth: 1.5 }]}>
              {/* Popular badge */}
              {plan.popular && (
                <View style={[styles.popularBadge, { backgroundColor: plan.color }]}>
                  <Text style={styles.popularBadgeText}>Most Popular</Text>
                </View>
              )}

              {/* Plan name + price */}
              <Text style={[styles.planName, { color: plan.color }]}>{plan.name}</Text>
              <Text style={styles.planPrice}>
                ${yearly
                  ? plan.yearlyPrice.toFixed(2)
                  : plan.monthlyPrice.toFixed(2)}
                <Text style={styles.planPeriod}>
                  {yearly ? '/yr' : '/mo'}
                </Text>
              </Text>
              {yearly && (
                <Text style={styles.planMonthly}>
                  ${(plan.yearlyPrice / 12).toFixed(2)}/mo billed yearly
                </Text>
              )}

              {/* Feature checklist */}
              <View style={styles.featureList}>
                {plan.features.map((feat) => (
                  <View key={feat.label} style={styles.featureRow}>
                    {feat.included ? (
                      <Check size={14} color={tokens.success} />
                    ) : (
                      <Lock size={14} color={tokens.textTertiary} />
                    )}
                    <Text
                      style={[
                        styles.featureText,
                        !feat.included && styles.featureTextLocked,
                      ]}
                    >
                      {feat.label}
                    </Text>
                  </View>
                ))}
              </View>

              {/* CTA: Subscribe */}
              <HapticButton variant="primary" fullWidth onPress={comingSoon}>
                <Text style={styles.ctaText}>Subscribe</Text>
              </HapticButton>

              {/* CTA: Pay with USDC (Android only) */}
              {isAndroid && (
                <View style={styles.usdcRow}>
                  <HapticButton
                    variant="ghost"
                    fullWidth
                    onPress={comingSoon}
                  >
                    <Text style={styles.usdcBtnText}>Pay with USDC</Text>
                    <Text style={styles.usdcPrice}>
                      ${yearly
                        ? plan.yearlyUsdc.toFixed(2)
                        : plan.monthlyUsdc.toFixed(2)}
                      {yearly ? '/yr' : '/mo'}
                    </Text>
                    <View style={styles.discountBadge}>
                      <Text style={styles.discountBadgeText}>-10%</Text>
                    </View>
                  </HapticButton>
                </View>
              )}
            </GlassCard>
          </Animated.View>
        ))}

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <Animated.View
          entering={FadeInDown.duration(350).delay(280).springify()}
          style={styles.footer}
        >
          <TouchableOpacity onPress={comingSoon}>
            <Text style={styles.footerLink}>Restore Purchases</Text>
          </TouchableOpacity>
          <View style={styles.footerLegal}>
            <TouchableOpacity onPress={comingSoon}>
              <Text style={styles.footerLegalText}>Terms of Service</Text>
            </TouchableOpacity>
            <Text style={styles.footerDot}>{'\u00B7'}</Text>
            <TouchableOpacity onPress={comingSoon}>
              <Text style={styles.footerLegalText}>Privacy Policy</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </ScrollView>

      {toast}
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.spacing.screenPadding,
    paddingBottom: 12,
  },
  headerTitle: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.sectionHeader,
    color: tokens.white100,
  },

  scrollContent: {
    paddingHorizontal: tokens.spacing.screenPadding,
    gap: 14,
  },

  // Billing toggle
  toggleRow: {
    alignItems: 'center',
    marginBottom: 4,
  },
  togglePill: {
    flexDirection: 'row',
    backgroundColor: tokens.bgGlass8,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    padding: 3,
  },
  toggleSegment: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: tokens.radius.pill,
    gap: 6,
  },
  toggleActive: {
    backgroundColor: tokens.bgGlass12,
  },
  toggleText: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.small,
    color: tokens.textTertiary,
  },
  toggleTextActive: {
    color: tokens.white100,
  },
  saveBadge: {
    backgroundColor: tokens.success,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  saveBadgeText: {
    fontFamily: 'Lexend-Bold',
    fontSize: 9,
    color: tokens.bgMain,
  },

  // Plan card
  planCard: {
    gap: 12,
  },
  popularBadge: {
    alignSelf: 'flex-start',
    borderRadius: tokens.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 2,
  },
  popularBadgeText: {
    fontFamily: 'Lexend-Bold',
    fontSize: 10,
    color: tokens.white100,
  },
  planName: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.heading,
  },
  planPrice: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.hero,
    color: tokens.white100,
  },
  planPeriod: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.body,
    color: tokens.white60,
  },
  planMonthly: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.textTertiary,
    marginTop: -6,
  },

  // Feature list
  featureList: {
    gap: 8,
    marginTop: 4,
    marginBottom: 4,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  featureText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.body,
    color: tokens.white80,
  },
  featureTextLocked: {
    color: tokens.textTertiary,
  },

  // CTA
  ctaText: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.body,
    color: tokens.white100,
  },

  // USDC
  usdcRow: {
    marginTop: -4,
  },
  usdcBtnText: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.small,
    color: tokens.white80,
  },
  usdcPrice: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white60,
  },
  discountBadge: {
    backgroundColor: tokens.success,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  discountBadgeText: {
    fontFamily: 'Lexend-Bold',
    fontSize: 9,
    color: tokens.bgMain,
  },

  // Footer
  footer: {
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
  footerLink: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.body,
    color: tokens.secondary,
  },
  footerLegal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  footerLegalText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.textTertiary,
  },
  footerDot: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.textTertiary,
  },
});
