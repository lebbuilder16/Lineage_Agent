// app/paywall.tsx
// Modal paywall freemium — plans Free vs Pro

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
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
import { useTheme } from "@/src/theme/ThemeContext";
import { colors } from "@/src/theme/colors";
import { LinearGradient } from "expo-linear-gradient";
import { GlassCard } from "@/src/components/ui/GlassCard";
import { HapticButton } from "@/src/components/ui/HapticButton";
import { useAuthStore } from "@/src/store/auth";
import {
  fetchCurrentOffering,
  purchasePackage,
  restorePurchases,
  isPremiumActive,
} from "@/src/lib/purchases";
import { syncSubscription } from "@/src/lib/api";
import type { PurchasesPackage, PurchasesOffering } from "react-native-purchases";

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
  const { colors } = useTheme();
  return (
    <View style={styles.featureRow}>
      <Text style={styles.featureIcon}>{icon}</Text>
      <Text style={[styles.featureLabel, { color: colors.text.primary }]}>{label}</Text>
      <View style={styles.featureFree}>
        {free === true ? (
          <Text style={[styles.featureCheck, { color: colors.accent.safe }]}>✓</Text>
        ) : free === false ? (
          <Text style={[styles.featureCheck, { color: colors.text.muted }]}>—</Text>
        ) : (
          <Text style={[styles.featureLimited, { color: colors.text.muted }]}>{free}</Text>
        )}
      </View>
      <View style={styles.featurePro}>
        {pro === true ? (
          <Text style={[styles.featureCheck, { color: colors.accent.ai }]}>✓</Text>
        ) : (
          <Text style={[styles.featureLimited, { color: colors.text.muted }]}>{pro}</Text>
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
  const { colors } = useTheme();
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
          style={selected ? [styles.planCard, styles.planCardSelected] : styles.planCard}
          elevated={selected}
          borderColor={selected ? colors.accent.ai : undefined}
        >
          {plan.badge && (
            <View style={[styles.planBadge, { backgroundColor: colors.accent.ai }]}>
              <Text style={[styles.planBadgeText, { color: colors.background.deep }]}>{plan.badge}</Text>
            </View>
          )}
          <Text style={[styles.planLabel, { color: colors.text.secondary }]}>{plan.label}</Text>
          <Text style={[styles.planPrice, { color: colors.text.primary }]}>{plan.price}</Text>
          <Text style={[styles.planPeriod, { color: colors.text.muted }]}>{plan.period}</Text>
        </GlassCard>
      </Animated.View>
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────
export default function PaywallScreen() {
  const { colors } = useTheme();
  const [selectedPlan, setSelectedPlan] = useState<string>("yearly");
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);

  const { user, upgradeToPro, refreshUser } = useAuthStore();

  // Load RC offering on mount to get real prices
  useEffect(() => {
    fetchCurrentOffering().then(setOffering).catch(() => null);
  }, []);

  /** Find the RC package matching a plan id (monthly / yearly). */
  const getPackage = (planId: string): PurchasesPackage | undefined => {
    if (!offering) return undefined;
    return offering.availablePackages.find((p) =>
      planId === "monthly"
        ? p.packageType === "MONTHLY"
        : p.packageType === "ANNUAL"
    );
  };

  const handleSubscribe = async () => {
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const pkg = getPackage(selectedPlan);

      if (!pkg) {
        // RC not configured or no offering loaded — dev fallback
        if (__DEV__) {
          upgradeToPro();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          router.back();
          return;
        }
        Alert.alert("Not available", "Store products are loading, please try again.");
        setLoading(false);
        return;
      }

      const result = await purchasePackage(pkg);

      if (!result.success) {
        if (!result.cancelled) {
          Alert.alert("Purchase failed", result.error);
        }
        setLoading(false);
        return;
      }

      // Optimistic update — instant UI feedback
      upgradeToPro();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Sync plan with backend in background (non-blocking)
      if (result.customerInfo && user) {
        syncSubscription(result.customerInfo.originalAppUserId)
          .then(refreshUser)
          .catch(() => null);
      }

      router.back();
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const info = await restorePurchases();
      if (info && isPremiumActive(info)) {
        upgradeToPro();
        if (user) {
          syncSubscription(info.originalAppUserId)
            .then(refreshUser)
            .catch(() => null);
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("Restored!", "Your Pro subscription has been restored.", [
          { text: "OK", onPress: () => router.back() },
        ]);
      } else {
        Alert.alert("Nothing to restore", "No active Pro subscription found.");
      }
    } catch {
      Alert.alert("Restore failed", "Please try again.");
    } finally {
      setRestoring(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background.mid }]} edges={["bottom"]}>
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
          <LinearGradient
            colors={["#622EC3", "#4D65DB", "#379AEE", "#53E9F6"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.proOrb}
          >
            <Text style={[styles.proOrbText, { color: "#fff" }]}>PRO</Text>
          </LinearGradient>
          <Text style={[styles.heroTitle, { color: colors.text.primary }]}>Unlock everything</Text>
          <Text style={[styles.heroSubtitle, { color: colors.text.secondary }]}>
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
            <Text style={[styles.featureHeaderText, { flex: 1, color: colors.text.muted }]}>Features</Text>
            <Text style={[styles.featureHeaderText, styles.featureFree, { color: colors.text.muted }]}>Free</Text>
            <Text style={[styles.featureHeaderText, styles.featurePro, { color: colors.accent.ai }]}>
              Pro
            </Text>
          </View>
          <View style={[styles.divider, { backgroundColor: colors.glass.border }]} />
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
            disabled={loading || restoring}
            style={styles.cta}
          >
            {loading && <ActivityIndicator color={colors.background.deep} />}
          </HapticButton>

          <Text style={[styles.legal, { color: colors.text.muted }]}>
            Recurring billing. Cancel anytime. Prices in USD.{"\n"}
            Managed via Google Play / App Store.
          </Text>

          <TouchableOpacity onPress={handleRestore} disabled={restoring} style={{ marginBottom: 6 }}>
            {restoring ? (
              <ActivityIndicator color={colors.text.muted} size="small" />
            ) : (
              <Text style={[styles.restore, { color: colors.text.muted }]}>Restore purchases</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.back()}>
            <Text style={[styles.skip, { color: colors.text.secondary }]}>Continue with Free</Text>
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
  safe: { flex: 1 },
  content: { padding: 20, gap: 24, paddingBottom: 60 },

  hero: { alignItems: "center", gap: 10, paddingVertical: 16 },
  proOrb: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.accent.ai,
    shadowRadius: 20,
    shadowOpacity: 0.5,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  proOrbText: { fontSize: 20, fontWeight: "900", letterSpacing: 2 },
  heroTitle: { fontSize: 28, fontWeight: "800" },
  heroSubtitle: { fontSize: 14, textAlign: "center", lineHeight: 22, paddingHorizontal: 16 },

  plans: { flexDirection: "row", gap: 12 },
  planCard: { padding: 16, alignItems: "center", gap: 4, overflow: "visible" },
  planCardSelected: { borderWidth: 2 },
  planBadge: {
    position: "absolute",
    top: -10,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  planBadgeText: { fontSize: 10, fontWeight: "800" },
  planLabel: { fontSize: 12, fontWeight: "600", marginTop: 8 },
  planPrice: { fontSize: 26, fontWeight: "800" },
  planPeriod: { fontSize: 12 },

  featureTable: { gap: 0 },
  featureHeader: { flexDirection: "row", paddingVertical: 8, paddingHorizontal: 4 },
  featureHeaderText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  divider: { height: 1, marginBottom: 4 },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  featureIcon: { fontSize: 16, width: 28 },
  featureLabel: { fontSize: 13, flex: 1 },
  featureFree: { width: 48, alignItems: "center" },
  featurePro: { width: 48, alignItems: "center" },
  featureCheck: { fontSize: 16, fontWeight: "700" },
  featureLimited: { fontSize: 11, textAlign: "center" },

  ctaWrap: { gap: 12, alignItems: "center" },
  cta: { width: "100%" },
  legal: { fontSize: 11, textAlign: "center", lineHeight: 16, paddingHorizontal: 16 },
  restore: { fontSize: 13, textDecorationLine: "underline", paddingVertical: 4 },
  skip: { fontSize: 14, paddingVertical: 8 },
});
