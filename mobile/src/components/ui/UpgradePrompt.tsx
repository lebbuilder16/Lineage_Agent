/**
 * UpgradePrompt — reusable inline prompt to upgrade subscription.
 *
 * Two variants:
 * - compact: single-line with lock icon + "Upgrade to Pro" text
 * - card: full GlassCard with description and CTA button
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Lock, ArrowRight } from 'lucide-react-native';
import { router } from 'expo-router';
import { HapticButton } from './HapticButton';
import { GlassCard } from './GlassCard';
import { tierLabel, tierColor, type PlanTier } from '../../lib/tier-limits';
import { tokens } from '../../theme/tokens';

interface UpgradePromptProps {
  /** The feature that's locked */
  feature: string;
  /** Minimum plan needed */
  requiredPlan: PlanTier;
  /** compact = inline one-liner, card = full card with CTA */
  variant?: 'compact' | 'card';
}

export function UpgradePrompt({ feature, requiredPlan, variant = 'card' }: UpgradePromptProps) {
  const color = tierColor(requiredPlan);
  const label = tierLabel(requiredPlan);

  if (variant === 'compact') {
    return (
      <HapticButton
        variant="ghost"
        size="sm"
        onPress={() => router.push('/paywall' as any)}
        style={styles.compactBtn}
      >
        <Lock size={12} color={color} />
        <Text style={[styles.compactText, { color }]}>
          Upgrade to {label}
        </Text>
        <ArrowRight size={12} color={color} />
      </HapticButton>
    );
  }

  return (
    <GlassCard>
      <View style={styles.cardContent}>
        <View style={[styles.lockCircle, { backgroundColor: `${color}20` }]}>
          <Lock size={20} color={color} />
        </View>
        <Text style={styles.cardTitle}>{feature}</Text>
        <Text style={styles.cardDesc}>
          Unlock {feature.toLowerCase()} with the {label} plan
        </Text>
        <HapticButton
          variant="primary"
          size="md"
          fullWidth
          onPress={() => router.push('/paywall' as any)}
        >
          <Text style={styles.ctaText}>Upgrade to {label}</Text>
        </HapticButton>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  compactBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
  },
  compactText: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.tiny,
    letterSpacing: 0.3,
  },
  cardContent: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  lockCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.subheading,
    color: tokens.white100,
  },
  cardDesc: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white60,
    textAlign: 'center',
  },
  ctaText: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.body,
    color: tokens.white100,
  },
});
