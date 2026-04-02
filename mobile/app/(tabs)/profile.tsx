/**
 * Profile tab — composes Account content + Agent Settings + Wallet Monitor.
 *
 * This delegates to the existing AccountScreen for the profile/wallet/usage sections,
 * and adds AgentSettingsPanel and WalletHoldingsPanel below.
 *
 * For now, this simply re-exports the existing account screen since it already
 * has profile, wallet, usage, and settings functionality. The Agent Settings
 * and Wallet Monitor panels will be accessed via dedicated sections.
 */
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { User, Settings, Wallet, Bell, ChevronDown, ChevronUp } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { GlassCard } from '../../src/components/ui/GlassCard';
import { useAuthStore } from '../../src/store/auth';
import { useSubscriptionStore } from '../../src/store/subscription';
import { AgentSettingsPanel, NotificationPreferencesSection, WalletHoldingsPanel } from '../../src/components/agent';
import { tokens } from '../../src/theme/tokens';
import { router } from 'expo-router';

/* ─── Collapsible section ─── */
function CollapsibleSection({ title, icon, defaultOpen = false, children }: {
  title: string; icon: React.ReactNode; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={styles.section}>
      <TouchableOpacity onPress={() => setOpen(!open)} style={styles.sectionHeader} activeOpacity={0.7}>
        {icon}
        <Text style={styles.sectionTitle}>{title}</Text>
        {open ? <ChevronUp size={16} color={tokens.textTertiary} /> : <ChevronDown size={16} color={tokens.textTertiary} />}
      </TouchableOpacity>
      {open && (
        <Animated.View entering={FadeInDown.duration(200)}>
          {children}
        </Animated.View>
      )}
    </View>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const apiKey = useAuthStore((s) => s.apiKey);
  const user = useAuthStore((s) => s.user);
  const plan = useSubscriptionStore((s) => s.plan);

  const displayName = user?.display_name ?? user?.username ?? user?.email?.split('@')[0] ?? 'Agent';

  if (!apiKey) {
    return (
      <View style={styles.container}>
        <View style={[styles.safe, { paddingTop: Math.max(insets.top, 16) }]}>
          <ScreenHeader icon={<User size={26} color={tokens.secondary} strokeWidth={2.5} />} title="Profile" />
          <View style={styles.lockout}>
            <User size={48} color={tokens.white20} />
            <Text style={styles.lockoutTitle}>Sign in to access settings</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.safe, { paddingTop: Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + 8 : 16) }]}>
        <ScreenHeader
          icon={<User size={26} color={tokens.secondary} strokeWidth={2.5} />}
          title="Profile"
          rightAction={
            <TouchableOpacity
              onPress={() => router.push('/account' as any)}
              style={styles.accountBtn}
              activeOpacity={0.7}
            >
              <Text style={styles.accountBtnText}>Account</Text>
            </TouchableOpacity>
          }
        />

        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom + 100, 120) }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Quick profile card */}
          <Animated.View entering={FadeInDown.duration(300)}>
            <GlassCard style={styles.profileCard}>
              <View style={styles.profileRow}>
                <View style={styles.profileAvatar}>
                  <Text style={styles.profileAvatarText}>{displayName[0]?.toUpperCase() ?? 'A'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.profileName}>{displayName}</Text>
                  <Text style={styles.profilePlan}>{plan === 'free' ? 'Free' : plan === 'pro' ? 'Pro' : plan === 'pro_plus' ? 'Pro+' : 'Whale'} Plan</Text>
                </View>
                <TouchableOpacity onPress={() => router.push('/paywall' as any)} style={styles.upgradePill}>
                  <Text style={styles.upgradeText}>Upgrade</Text>
                </TouchableOpacity>
              </View>
            </GlassCard>
          </Animated.View>

          {/* Agent Settings (collapsible) */}
          <Animated.View entering={FadeInDown.delay(100).duration(300)}>
            <CollapsibleSection
              title="Agent Settings"
              icon={<Settings size={16} color={tokens.secondary} />}
              defaultOpen
            >
              <AgentSettingsPanel plan={plan} />
            </CollapsibleSection>
          </Animated.View>

          {/* Notifications (collapsible) */}
          <Animated.View entering={FadeInDown.delay(150).duration(300)}>
            <CollapsibleSection
              title="Notifications"
              icon={<Bell size={16} color={tokens.secondary} />}
            >
              <NotificationPreferencesSection plan={plan} />
            </CollapsibleSection>
          </Animated.View>

          {/* Wallet Monitor (collapsible) */}
          <Animated.View entering={FadeInDown.delay(250).duration(300)}>
            <CollapsibleSection
              title="Wallet Monitor"
              icon={<Wallet size={16} color={tokens.secondary} />}
            >
              <WalletHoldingsPanel plan={plan} />
            </CollapsibleSection>
          </Animated.View>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.bgMain },
  safe: { flex: 1 },
  content: { paddingHorizontal: tokens.spacing.screenPadding, gap: 12 },
  lockout: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  lockoutTitle: { fontFamily: 'Lexend-Medium', fontSize: 15, color: tokens.white60 },
  // Profile card
  profileCard: { overflow: 'hidden' },
  profileRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: tokens.spacing.cardPadding, paddingVertical: 16,
  },
  profileAvatar: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: `${tokens.violet}20`,
    alignItems: 'center', justifyContent: 'center',
  },
  profileAvatarText: { fontFamily: 'Lexend-SemiBold', fontSize: 18, color: tokens.violet },
  profileName: { fontFamily: 'Lexend-SemiBold', fontSize: 16, color: tokens.white100 },
  profilePlan: { fontFamily: 'Lexend-Regular', fontSize: 12, color: tokens.textTertiary, marginTop: 1 },
  upgradePill: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: tokens.radius.pill,
    backgroundColor: `${tokens.secondary}15`,
    borderWidth: 1, borderColor: `${tokens.secondary}40`,
  },
  upgradeText: { fontFamily: 'Lexend-SemiBold', fontSize: 11, color: tokens.secondary },
  accountBtn: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.bgGlass8,
    borderWidth: 1, borderColor: tokens.borderSubtle,
  },
  accountBtnText: { fontFamily: 'Lexend-Medium', fontSize: 12, color: tokens.white60 },
  // Collapsible sections
  section: { gap: 0 },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 14, paddingHorizontal: 4,
  },
  sectionTitle: {
    flex: 1, fontFamily: 'Lexend-SemiBold', fontSize: 14, color: tokens.white80,
  },
});
