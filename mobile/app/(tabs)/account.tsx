// app/(tabs)/account.tsx
// Account — profil utilisateur, paramètres, plan, déconnexion

import React, { useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  ScrollView,
  Alert,
  Linking,
  Platform,
} from "react-native";
import Constants from "expo-constants";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { GlassCard } from "@/src/components/ui/GlassCard";
import { HapticButton } from "@/src/components/ui/HapticButton";
import { WalletBadge } from "@/src/components/ui/WalletBadge";
import { useTheme } from "@/src/theme/ThemeContext";
import { Fonts } from "@/src/theme/fonts";
import { LinearGradient } from "expo-linear-gradient";
import { useAuthStore } from "@/src/store/auth";
import { usePrivy } from "@privy-io/expo";
import { Ionicons } from "@expo/vector-icons";
import {
  getNotificationPrefs,
  updateNotificationPrefs,
  type NotificationPrefs,
} from "@/src/lib/api";

// ─── Play Store subscription management deep-link ────────────────────────────
const PLAY_SUBS_URL = "https://play.google.com/store/account/subscriptions?package=com.lineageagent.mobile";
const APPSTORE_SUBS_URL = "https://apps.apple.com/account/subscriptions";

function openSubscriptionManagement() {
  const url = Platform.OS === "ios" ? APPSTORE_SUBS_URL : PLAY_SUBS_URL;
  Linking.openURL(url).catch(() =>
    Alert.alert("Error", "Could not open subscription settings.")
  );
}

// ─── Components ───────────────────────────────────────────────────────────────

function PlanBadge({ plan }: { plan: "free" | "pro" }) {
  const { colors } = useTheme();
  const isPro = plan === "pro";
  const color = isPro ? colors.accent.ai : colors.text.muted;
  return (
    <View style={[styles.planBadge, { borderColor: `${color}60`, backgroundColor: `${color}20` }]}>
      <Text style={[styles.planText, { color }]}>{isPro ? "PRO" : "FREE"}</Text>
    </View>
  );
}

function SettingRow({
  label,
  description,
  value,
  onToggle,
}: {
  label: string;
  description?: string;
  value: boolean;
  onToggle: (v: boolean) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingInfo}>
        <Text style={[styles.settingLabel, { color: colors.text.primary }]}>{label}</Text>
        {description && <Text style={[styles.settingDesc, { color: colors.text.muted }]}>{description}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: colors.glass.bg, true: `${colors.accent.safe}60` }}
        thumbColor={value ? colors.accent.safe : colors.text.muted}
      />
    </View>
  );
}

function MenuRow({ label, onPress, danger = false }: { label: string; onPress: () => void; danger?: boolean }) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity style={styles.menuRow} onPress={onPress} activeOpacity={0.7}>
      <Text style={[styles.menuLabel, { color: danger ? colors.accent.danger : colors.text.primary }]}>{label}</Text>
      <Text style={[styles.menuArrow, { color: colors.text.muted }]}>›</Text>
    </TouchableOpacity>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function AccountScreen() {
  const { colors } = useTheme();
  const { user, isAuthenticated, isPro, logout } = useAuthStore();
  const { logout: privyLogout } = usePrivy();
  const queryClient = useQueryClient();

  // Load notification prefs from backend
  const { data: prefs } = useQuery<NotificationPrefs>({
    queryKey: ["notification-prefs"],
    queryFn: getNotificationPrefs,
    enabled: isAuthenticated,
    staleTime: 60_000,
    initialData: { rug: true, bundle: true, insider: true, zombie: false, death_clock: false },
  });

  // Local copy for optimistic updates
  const [localPrefs, setLocalPrefs] = React.useState<NotificationPrefs>(
    prefs ?? { rug: true, bundle: true, insider: true, zombie: false, death_clock: false }
  );

  // Sync with backend data when loaded
  useEffect(() => {
    if (prefs) setLocalPrefs(prefs);
  }, [prefs]);

  // Debounce: persist after 800ms idle
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { mutate: savePrefs } = useMutation({
    mutationFn: updateNotificationPrefs,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-prefs"] });
    },
  });

  const handlePrefToggle = useCallback(
    (key: keyof NotificationPrefs, value: boolean) => {
      const next = { ...localPrefs, [key]: value };
      setLocalPrefs(next);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => savePrefs(next), 800);
    },
    [localPrefs, savePrefs]
  );

  const handleLogout = () => {
    Alert.alert("Disconnect wallet?", "You will be logged out.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Disconnect",
        style: "destructive",
        onPress: async () => {
          try {
            await privyLogout();
          } catch {
            // Ignore Privy logout errors — clear local state regardless
          }
          await logout();
          router.replace("/auth");
        },
      },
    ]);
  };

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background.deep }]} edges={["top"]}>
        <View style={styles.guestGate}>
          <Text style={styles.guestIcon}>◉</Text>
          <Text style={[styles.guestTitle, { color: colors.text.primary }]}>Not connected</Text>
          <HapticButton
            label="Connect Wallet"
            onPress={() => router.push("/auth")}
            style={{ marginTop: 20 }}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background.deep }]} edges={["top"]}>
      {/* Header (Figma Make ProfileScreen) */}
      <View style={styles.pageHeader}>
        <View style={styles.pageTitleRow}>
          <View style={styles.pageIconWrap}>
            <Ionicons name="person-circle" size={26} color="#ADC8FF" />
            <View style={styles.pageIconGlow} />
          </View>
          <Text style={[styles.pageTitle, { color: colors.text.primary }]}>Profile</Text>
        </View>
        <Text style={[styles.pageSubtitle, { color: "rgba(255,255,255,0.6)" }]}>
          Manage your identity &amp; preferences
        </Text>
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Profile card */}
        <GlassCard elevated style={styles.profileCard}>
          {/* Gradient border avatar */}
          <LinearGradient
            colors={["#622EC3", "#4D65DB", "#379AEE", "#53E9F6"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.avatarGradient}
          >
            <View style={[styles.avatar, { backgroundColor: colors.background.surface }]}>
              <Text style={[styles.avatarText, { color: colors.accent.ai }]}>
                {user?.wallet_address
                  ? user.wallet_address.slice(0, 2).toUpperCase()
                  : (user?.email?.[0]?.toUpperCase() ?? "?")}
              </Text>
            </View>
          </LinearGradient>
          <View style={styles.profileInfo}>
            <WalletBadge
              address={user?.wallet_address}
              onLink={() => router.push("/auth")}
              style={styles.walletBadge}
            />
            <Text style={styles.email}>{user?.email ?? "Email not set"}</Text>
          </View>
          <PlanBadge plan={(user?.plan ?? "free") as "free" | "pro"} />
        </GlassCard>

        {/* Upgrade CTA (free users) */}
        {!isPro && (
          <TouchableOpacity
            onPress={() => router.push("/paywall")}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={["#622EC3", "#4D65DB", "#379AEE", "#53E9F6"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.upgradeCta}
            >
              <Text style={styles.upgradeText}>✦ Upgrade to Pro — unlock AI Chat, SOL Trace &amp; more</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}

        {/* Subscription management (pro users) */}
        {isPro && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.text.muted }]}>Subscription</Text>
            <GlassCard style={styles.settingsCard}>
              <View style={styles.proCard}>
                <View>
                  <Text style={[styles.proTitle, { color: colors.text.primary }]}>Pro Plan active ✦</Text>
                  <Text style={[styles.proSub, { color: colors.text.muted }]}>Manage or cancel via the store</Text>
                </View>
                <TouchableOpacity
                  style={[styles.manageBtn, { borderColor: `${colors.accent.ai}60` }]}
                  onPress={openSubscriptionManagement}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.manageBtnText, { color: colors.accent.ai }]}>Manage</Text>
                </TouchableOpacity>
              </View>
            </GlassCard>
          </>
        )}

        {/* Notification settings */}
        <Text style={[styles.sectionTitle, { color: colors.text.muted }]}>Push Notifications</Text>
        <GlassCard style={styles.settingsCard}>
          <SettingRow
            label="Rug Confirmed"
            description="Immediate alert when a rug is detected"
            value={localPrefs.rug}
            onToggle={(v) => handlePrefToggle("rug", v)}
          />
          <View style={styles.separator} />
          <SettingRow
            label="Bundle Detected"
            value={localPrefs.bundle}
            onToggle={(v) => handlePrefToggle("bundle", v)}
          />
          <View style={styles.separator} />
          <SettingRow
            label="Insider Sell"
            value={localPrefs.insider}
            onToggle={(v) => handlePrefToggle("insider", v)}
          />
          <View style={styles.separator} />
          <SettingRow
            label="Zombie Token"
            value={localPrefs.zombie}
            onToggle={(v) => handlePrefToggle("zombie", v)}
          />
          <View style={styles.separator} />
          <SettingRow
            label="Death Clock"
            description="Alert when a token's rug countdown hits critical"
            value={localPrefs.death_clock}
            onToggle={(v) => handlePrefToggle("death_clock", v)}
          />
        </GlassCard>

        {/* More */}
        <Text style={[styles.sectionTitle, { color: colors.text.muted }]}>More</Text>
        <GlassCard style={styles.settingsCard}>
          <MenuRow
            label="Privacy Policy"
            onPress={() =>
              Linking.openURL("https://lineageagent.io/privacy").catch(() =>
                Alert.alert("Error", "Could not open Privacy Policy.")
              )
            }
          />
          <View style={styles.separator} />
          <MenuRow
            label="Terms of Service"
            onPress={() =>
              Linking.openURL("https://lineageagent.io/terms").catch(() =>
                Alert.alert("Error", "Could not open Terms of Service.")
              )
            }
          />
          <View style={styles.separator} />
          <MenuRow
            label={`Version ${Constants.expoConfig?.version ?? "1.0.0"}`}
            onPress={() => {}}
          />
        </GlassCard>

        <View style={styles.logoutWrap}>
          <HapticButton
            label="Disconnect Wallet"
            variant="danger"
            hapticStyle="heavy"
            onPress={handleLogout}
            style={{ width: "100%" }}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  // Page header (Figma Make ProfileScreen)
  pageHeader: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 8 },
  pageTitleRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 4 },
  pageIconWrap: { width: 30, height: 30, alignItems: "center", justifyContent: "center", position: "relative" },
  pageIconGlow: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 15, backgroundColor: "#ADC8FF", opacity: 0.3 },
  pageTitle: { fontFamily: Fonts.bold, fontSize: 26, letterSpacing: -0.5 },
  pageSubtitle: { fontFamily: Fonts.regular, fontSize: 12, marginLeft: 42 },
  scroll: { padding: 20, paddingBottom: 100 },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 14,
    marginBottom: 12,
  },
  avatarGradient: {
    width: 56,
    height: 56,
    borderRadius: 28,
    padding: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontFamily: Fonts.bold, fontSize: 18 },
  profileInfo: { flex: 1, gap: 4 },
  walletBadge: {},
  email: { fontSize: 12 },
  planBadge: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },
  planText: { fontFamily: Fonts.bold, fontSize: 11, letterSpacing: 1 },
  upgradeCta: { borderRadius: 14, padding: 14, marginBottom: 20, alignItems: "center" },
  upgradeText: { fontFamily: Fonts.bold, color: "#FFFFFF", fontSize: 13, textAlign: "center" },
  proCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14 },
  proTitle: { fontFamily: Fonts.bold, fontSize: 15 },
  proSub: { fontSize: 12, marginTop: 3 },
  manageBtn: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 7 },
  manageBtnText: { fontFamily: Fonts.semiBold, fontSize: 13 },
  sectionTitle: { fontFamily: Fonts.bold, fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10, marginTop: 20 },
  settingsCard: { overflow: "hidden" },
  settingRow: { flexDirection: "row", alignItems: "center", padding: 14 },
  settingInfo: { flex: 1 },
  settingLabel: { fontFamily: Fonts.medium, fontSize: 14 },
  settingDesc: { fontSize: 11, marginTop: 2 },
  menuRow: { flexDirection: "row", alignItems: "center", padding: 14 },
  menuLabel: { flex: 1, fontSize: 14 },
  menuArrow: { fontSize: 18 },
  separator: { height: 1, marginHorizontal: 14 },
  logoutWrap: { marginTop: 32 },
  guestGate: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  guestIcon: { fontSize: 48, marginBottom: 16 },
  guestTitle: { fontFamily: Fonts.bold, fontSize: 20 },
});
