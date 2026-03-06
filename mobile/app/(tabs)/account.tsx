// app/(tabs)/account.tsx
// Account — profil utilisateur, paramètres, plan, déconnexion

import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  ScrollView,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { GlassCard } from "@/src/components/ui/GlassCard";
import { HapticButton } from "@/src/components/ui/HapticButton";
import { colors } from "@/src/theme/colors";
import { useAuthStore } from "@/src/store/auth";

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

export default function AccountScreen() {
  const { user, isAuthenticated, isPro, logout } = useAuthStore();

  const [notifRug, setNotifRug] = React.useState(true);
  const [notifBundle, setNotifBundle] = React.useState(true);
  const [notifInsider, setNotifInsider] = React.useState(true);
  const [notifZombie, setNotifZombie] = React.useState(false);

  const handleLogout = () => {
    Alert.alert("Disconnect wallet?", "You will be logged out.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Disconnect",
        style: "destructive",
        onPress: async () => {
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
              {user?.wallet_address?.slice(0, 2).toUpperCase() ?? "??"}
            </Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.walletAddr}>
              {user?.wallet_address?.slice(0, 8)}…{user?.wallet_address?.slice(-6)}
            </Text>
            <Text style={styles.email}>{user?.email ?? "No email"}</Text>
          </View>
          <PlanBadge plan={user?.plan ?? "free"} />
        </GlassCard>

        {/* Upgrade CTA for free users */}
        {!isPro && (
          <TouchableOpacity
            style={styles.upgradeCta}
            onPress={() => router.push("/paywall")}
            activeOpacity={0.8}
          >
            <Text style={styles.upgradeText}>✦ Upgrade to Pro — unlock AI Chat, SOL Trace & more</Text>
          </TouchableOpacity>
        )}

        {/* Notification settings */}
        <Text style={styles.sectionTitle}>Push Notifications</Text>
        <GlassCard style={styles.settingsCard}>
          <SettingRow label="Rug Confirmed" description="Immediate alert when a rug is detected" value={notifRug} onToggle={setNotifRug} />
          <View style={styles.separator} />
          <SettingRow label="Bundle Detected" value={notifBundle} onToggle={setNotifBundle} />
          <View style={styles.separator} />
          <SettingRow label="Insider Sell" value={notifInsider} onToggle={setNotifInsider} />
          <View style={styles.separator} />
          <SettingRow label="Zombie Token" value={notifZombie} onToggle={setNotifZombie} />
        </GlassCard>

        {/* More */}
        <Text style={styles.sectionTitle}>More</Text>
        <GlassCard style={styles.settingsCard}>
          <MenuRow label="Privacy Policy" onPress={() => {}} />
          <View style={styles.separator} />
          <MenuRow label="Terms of Service" onPress={() => {}} />
          <View style={styles.separator} />
          <MenuRow label="Version 1.0.0" onPress={() => {}} />
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
  profileInfo: { flex: 1 },
  walletAddr: { color: colors.text.primary, fontSize: 14, fontWeight: "600", fontFamily: "monospace" },
  email: { color: colors.text.muted, fontSize: 12, marginTop: 3 },
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
