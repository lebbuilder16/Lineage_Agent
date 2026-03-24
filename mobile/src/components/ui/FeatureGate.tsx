/**
 * FeatureGate — wraps content that requires a minimum subscription plan.
 *
 * When the user's plan is sufficient, renders children normally.
 * When insufficient, renders a blurred version with an upgrade overlay.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Lock } from 'lucide-react-native';
import { router } from 'expo-router';
import { HapticButton } from './HapticButton';
import { GlassCard } from './GlassCard';
import { useSubscriptionStore } from '../../store/subscription';
import { canAccess, tierLabel, type PlanTier } from '../../lib/tier-limits';
import { tokens } from '../../theme/tokens';

interface FeatureGateProps {
  /** Human-readable feature name (e.g. "AI Chat", "SOL Flow") */
  feature: string;
  /** Minimum plan required to access this feature */
  requiredPlan: PlanTier;
  /** Content to render (or blur) */
  children: React.ReactNode;
  /** Optional compact mode (single line instead of card) */
  compact?: boolean;
}

export function FeatureGate({ feature, requiredPlan, children, compact }: FeatureGateProps) {
  const plan = useSubscriptionStore((s) => s.plan);

  if (canAccess(plan, requiredPlan)) {
    return <>{children}</>;
  }

  if (compact) {
    return (
      <View style={styles.compactWrap}>
        <Lock size={14} color={tokens.textTertiary} />
        <Text style={styles.compactText}>
          {feature} requires {tierLabel(requiredPlan)}
        </Text>
        <HapticButton
          variant="ghost"
          size="sm"
          onPress={() => router.push('/paywall' as any)}
        >
          <Text style={styles.upgradeLink}>Upgrade</Text>
        </HapticButton>
      </View>
    );
  }

  return (
    <View style={styles.gateWrap}>
      {/* Blurred preview of the content */}
      <View style={styles.blurLayer} pointerEvents="none">
        <View style={styles.blurOverlay} />
        {children}
      </View>

      {/* Overlay */}
      <View style={styles.overlay}>
        <GlassCard>
          <View style={styles.overlayContent}>
            <View style={styles.lockCircle}>
              <Lock size={24} color={tokens.white100} />
            </View>
            <Text style={styles.overlayTitle}>Unlock {feature}</Text>
            <Text style={styles.overlayDesc}>
              This feature requires the {tierLabel(requiredPlan)} plan or higher.
            </Text>
            <HapticButton
              variant="secondary"
              size="md"
              fullWidth
              onPress={() => router.push('/paywall' as any)}
            >
              <Text style={styles.upgradeBtnText}>
                Upgrade to {tierLabel(requiredPlan)}
              </Text>
            </HapticButton>
          </View>
        </GlassCard>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  compactWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  compactText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.textTertiary,
    flex: 1,
  },
  upgradeLink: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.small,
    color: tokens.secondary,
  },
  gateWrap: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: tokens.radius.md,
  },
  blurLayer: {
    opacity: 0.3,
  },
  blurOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: tokens.bgMain,
    opacity: 0.6,
    zIndex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  overlayContent: {
    alignItems: 'center',
    gap: 12,
  },
  lockCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: `${tokens.secondary}20`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayTitle: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.subheading,
    color: tokens.white100,
  },
  overlayDesc: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white60,
    textAlign: 'center',
  },
  upgradeBtnText: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.body,
    color: tokens.white100,
  },
});
