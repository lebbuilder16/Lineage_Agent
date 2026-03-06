// app/paywall.tsx
// Modal paywall freemium — plans Free vs Pro

import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { router, Stack } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { colors } from "@/src/theme/colors";
import { GlassCard } from "@/src/components/ui/GlassCard";
import { HapticButton } from "@/src/components/ui/HapticButton";

// ─────────────────────────────────────────────────────────────
// Data
// ─────────────────────────────────────────────────────────────
const FEATURES = [
  { icon: "🔍", label: "Unlimited token analysis", pro: true, free: false },
  { icon: "🧬", label: "Full lineage tree", pro: true, free: false },
  { icon: "🤖", label: "AI Chat forensics", pro: true, free: false },
  { icon: "📦", label: "Bundle detection", pro: true, free: true },
  { icon: "📡", label: "Real-time alerts", pro: true, free: "5/day" },
  { icon: "👁", label: "Watchlist", pro: "unlimited", free: "3 tokens" },
  { icon: "🐀", label: "Insider sell tracker", pro: true, free: false },
  { icon: "☠️", label: "Death Clock forecast", pro: true, free: false },
  { icon: "🔔", label: "Push notifications", pro: true, free: false },
];

const PLANS = [
  {
    id: "monthly",
    label: "Monthly",
    price: "$9.99",
    period: "/month",
    badge: null,
    skuId: "pro_monthly",
  },
  {
    id: "yearly",
    label: "Yearly",
    price: "$79.99",
    period: "/year",
    badge: "Save 33%",
    skuId: "pro_yearly",
  },
];

// ─────────────────────────────────────────────────────────────
// Feature row
// ─────────────────────────────────────────────────────────────
function FeatureRow({
  icon,
  label,
  free,
  pro,
}: (typeof FEATURES)[number]) {
  return (
    <View style={styles.featureRow}>
      <Text style={styles.featureIcon}>{icon}</Text>
      <Text style={styles.featureLabel}>{label}</Text>
      <View style={styles.featureFree}>
        {free === true ? (
          <Text style={[styles.featureCheck, { color: colors.accent.safe }]}>✓</Text>
        ) : free === false ? (
          <Text style={[styles.featureCheck, { color: colors.text.muted }]}>—</Text>
        ) : (
          <Text style={styles.featureLimited}>{free}</Text>
        )}
      </View>
      <View style={styles.featurePro}>
        {pro === true ? (
          <Text style={[styles.featureCheck, { color: colors.accent.ai }]}>✓</Text>
        ) : (
          <Text style={styles.featureLimited}>{pro}</Text>
        )}
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Plan card
// ─────────────────────────────────────────────────────────────
function PlanCard({
  plan,
  selected,
  onSelect,
}: {
  plan: (typeof PLANS)[number];
  selected: boolean;
  onSelect: () => void;
}) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePress = () => {
    scale.value = withSpring(0.96, {}, () => { scale.value = withSpring(1); });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSelect();
  };

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.85} style={{ flex: 1 }}>
      <Animated.View style={style}>
        <GlassCard
          style={[styles.planCard, selected && styles.planCardSelected]}
          elevated={selected}
          borderColor={selected ? colors.accent.ai : undefined}
        >
          {plan.badge && (
            <View style={styles.planBadge}>
              <Text style={styles.planBadgeText}>{plan.badge}</Text>
            </View>
          )}
          <Text style={styles.planLabel}>{plan.label}</Text>
          <Text style={styles.planPrice}>{plan.price}</Text>
          <Text style={styles.planPeriod}>{plan.period}</Text>
        </GlassCard>
      </Animated.View>
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────
export default function PaywallScreen() {
  const [selectedPlan, setSelectedPlan] = useState<string>("yearly");
  const [loading, setLoading] = useState(false);

  const handleSubscribe = async () => {
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // TODO: integrate expo-in-app-purchases
    // const { results } = await InAppPurchases.purchaseItemAsync(sku);
    // → validate receipt with backend → setUser with pro: true
    await new Promise((r) => setTimeout(r, 1500)); // placeholder
    setLoading(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  };

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <Stack.Screen
        options={{
          title: "Upgrade to Pro",
          presentation: "modal",
          headerStyle: { backgroundColor: colors.background.mid },
          headerTintColor: colors.text.primary,
        }}
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <Animated.View entering={FadeInDown.duration(400)} style={styles.hero}>
          <View style={styles.proOrb}>
            <Text style={styles.proOrbText}>PRO</Text>
          </View>
          <Text style={styles.heroTitle}>Unlock everything</Text>
          <Text style={styles.heroSubtitle}>
            Full forensic intelligence. Real-time AI. Zero limits.
          </Text>
        </Animated.View>

        {/* Plan selector */}
        <Animated.View
          entering={FadeInDown.duration(400).delay(80)}
          style={styles.plans}
        >
          {PLANS.map((p) => (
            <PlanCard
              key={p.id}
              plan={p}
              selected={selectedPlan === p.id}
              onSelect={() => setSelectedPlan(p.id)}
            />
          ))}
        </Animated.View>

        {/* Feature table */}
        <Animated.View
          entering={FadeInDown.duration(400).delay(160)}
          style={styles.featureTable}
        >
          {/* Header */}
          <View style={styles.featureHeader}>
            <Text style={[styles.featureHeaderText, { flex: 1 }]}>Features</Text>
            <Text style={[styles.featureHeaderText, styles.featureFree]}>Free</Text>
            <Text style={[styles.featureHeaderText, styles.featurePro, { color: colors.accent.ai }]}>
              Pro
            </Text>
          </View>
          <View style={styles.divider} />
          {FEATURES.map((f) => (
            <FeatureRow key={f.label} {...f} />
          ))}
        </Animated.View>

        {/* CTA */}
        <Animated.View
          entering={FadeInDown.duration(400).delay(240)}
          style={styles.ctaWrap}
        >
          <HapticButton
            label={loading ? "" : `Start Pro — ${PLANS.find((p) => p.id === selectedPlan)?.price}`}
            onPress={handleSubscribe}
            variant="primary"
            disabled={loading}
            style={styles.cta}
          >
            {loading && <ActivityIndicator color={colors.background.deep} />}
          </HapticButton>

          <Text style={styles.legal}>
            Recurring billing. Cancel anytime. Prices in USD.
            Managed via Google Play / App Store.
          </Text>

          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.skip}>Continue with Free</Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background.mid },
  content: { padding: 20, gap: 24, paddingBottom: 60 },

  hero: { alignItems: "center", gap: 10, paddingVertical: 16 },
  proOrb: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: `${colors.accent.ai}22`,
    borderWidth: 2,
    borderColor: colors.accent.ai,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.accent.ai,
    shadowRadius: 20,
    shadowOpacity: 0.5,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  proOrbText: { color: colors.accent.ai, fontSize: 20, fontWeight: "900", letterSpacing: 2 },
  heroTitle: { color: colors.text.primary, fontSize: 28, fontWeight: "800" },
  heroSubtitle: {
    color: colors.text.secondary,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 16,
  },

  plans: { flexDirection: "row", gap: 12 },
  planCard: { padding: 16, alignItems: "center", gap: 4, overflow: "visible" },
  planCardSelected: { borderWidth: 2 },
  planBadge: {
    position: "absolute",
    top: -10,
    backgroundColor: colors.accent.ai,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  planBadgeText: { color: colors.background.deep, fontSize: 10, fontWeight: "800" },
  planLabel: { color: colors.text.secondary, fontSize: 12, fontWeight: "600", marginTop: 8 },
  planPrice: { color: colors.text.primary, fontSize: 26, fontWeight: "800" },
  planPeriod: { color: colors.text.muted, fontSize: 12 },

  featureTable: { gap: 0 },
  featureHeader: {
    flexDirection: "row",
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  featureHeaderText: {
    color: colors.text.muted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  divider: {
    height: 1,
    backgroundColor: colors.glass.border,
    marginBottom: 4,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: `${colors.glass.border}66`,
  },
  featureIcon: { fontSize: 16, width: 28 },
  featureLabel: { color: colors.text.primary, fontSize: 13, flex: 1 },
  featureFree: { width: 48, alignItems: "center" },
  featurePro: { width: 48, alignItems: "center" },
  featureCheck: { fontSize: 16, fontWeight: "700" },
  featureLimited: { color: colors.text.muted, fontSize: 11, textAlign: "center" },

  ctaWrap: { gap: 12, alignItems: "center" },
  cta: { width: "100%" },
  legal: {
    color: colors.text.muted,
    fontSize: 11,
    textAlign: "center",
    lineHeight: 16,
    paddingHorizontal: 16,
  },
  skip: { color: colors.text.secondary, fontSize: 14, paddingVertical: 8 },
});
