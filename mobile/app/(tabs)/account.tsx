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
import { colors } from "@/src/theme/colors";
import { useAuthStore } from "@/src/store/auth";
import { usePrivy } from "@privy-io/expo";
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
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingInfo}>
        <Text style={styles.settingLabel}>{label}</Text>
        {description && <Text style={styles.settingDesc}>{description}</Text>}
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
  return (
    <TouchableOpacity style={styles.menuRow} onPress={onPress} activeOpacity={0.7}>
      <Text style={[styles.menuLabel, danger && { color: colors.accent.danger }]}>{label}</Text>
      <Text style={styles.menuArrow}>›</Text>
    </TouchableOpacity>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function AccountScreen() {
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
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.guestGate}>
          <Text style={styles.guestIcon}>◉</Text>
          <Text style={styles.guestTitle}>Not connected</Text>
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
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Profile card */}
        <GlassCard elevated style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.wallet_address
                ? user.wallet_address.slice(0, 2).toUpperCase()
                : (user?.email?.[0]?.toUpperCase() ?? "?")}
            </Text>
          </View>
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
            style={styles.upgradeCta}
            onPress={() => router.push("/paywall")}
            activeOpacity={0.8}
          >
            <Text style={styles.upgradeText}>✦ Upgrade to Pro — unlock AI Chat, SOL Trace & more</Text>
          </TouchableOpacity>
        )}

        {/* Subscription management (pro users) */}
        {isPro && (
          <>
            <Text style={styles.sectionTitle}>Subscription</Text>
            <GlassCard style={styles.settingsCard}>
              <View style={styles.proCard}>
                <View>
                  <Text style={styles.proTitle}>Pro Plan active ✦</Text>
                  <Text style={styles.proSub}>Manage or cancel via the store</Text>
                </View>
                <TouchableOpacity
                  style={styles.manageBtn}
                  onPress={openSubscriptionManagement}
                  activeOpacity={0.8}
                >
                  <Text style={styles.manageBtnText}>Manage</Text>
                </TouchableOpacity>
              </View>
            </GlassCard>
          </>
        )}

        {/* Notification settings */}
        <Text style={styles.sectionTitle}>Push Notifications</Text>
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
        <Text style={styles.sectionTitle}>More</Text>
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
            label={`Version ${Constants.expoConfig?.version ?? Constants.manifest?.version ?? "1.0.0"}`}
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
  container: { flex: 1, backgroundColor: colors.background.deep },
  scroll: { padding: 20, paddingBottom: 100 },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 14,
    marginBottom: 12,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: `${colors.accent.ai}30`,
    borderWidth: 2,
    borderColor: `${colors.accent.ai}60`,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: colors.accent.ai, fontSize: 18, fontWeight: "700" },
  profileInfo: { flex: 1, gap: 4 },
  walletBadge: {},
  email: { color: colors.text.muted, fontSize: 12 },
  planBadge: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  planText: { fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  upgradeCta: {
    backgroundColor: `${colors.accent.ai}20`,
    borderWidth: 1,
    borderColor: `${colors.accent.ai}40`,
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },
  upgradeText: { color: colors.accent.ai, fontSize: 13, fontWeight: "600", textAlign: "center" },
  proCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
  },
  proTitle: { color: colors.text.primary, fontSize: 15, fontWeight: "700" },
  proSub: { color: colors.text.muted, fontSize: 12, marginTop: 3 },
  manageBtn: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: `${colors.accent.ai}60`,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  manageBtnText: { color: colors.accent.ai, fontSize: 13, fontWeight: "600" },
  sectionTitle: {
    color: colors.text.muted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 10,
    marginTop: 20,
  },
  settingsCard: { overflow: "hidden" },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
  },
  settingInfo: { flex: 1 },
  settingLabel: { color: colors.text.primary, fontSize: 14, fontWeight: "500" },
  settingDesc: { color: colors.text.muted, fontSize: 11, marginTop: 2 },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
  },
  menuLabel: { flex: 1, color: colors.text.primary, fontSize: 14 },
  menuArrow: { color: colors.text.muted, fontSize: 18 },
  separator: { height: 1, backgroundColor: colors.glass.border, marginHorizontal: 14 },
  logoutWrap: { marginTop: 32 },
  guestGate: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  guestIcon: { fontSize: 48, marginBottom: 16 },
  guestTitle: { color: colors.text.primary, fontSize: 20, fontWeight: "700" },
});
