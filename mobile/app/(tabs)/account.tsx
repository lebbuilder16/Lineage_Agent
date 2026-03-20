import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { User, Shield, Key, Zap, LogOut, ChevronRight, Activity, Crown, Wallet } from 'lucide-react-native';
import { AuroraBackground } from '../../src/components/ui/AuroraBackground';
import { GlassCard } from '../../src/components/ui/GlassCard';
import { HapticButton } from '../../src/components/ui/HapticButton';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { useAuthStore } from '../../src/store/auth';
import { useSubscriptionStore } from '../../src/store/subscription';
import { useOpenClawStore } from '../../src/store/openclaw';
import { isOpenClawAvailable } from '../../src/lib/openclaw';
import { tierLabel, tierColor } from '../../src/lib/tier-limits';
import { tokens } from '../../src/theme/tokens';

function InfoRow({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>{icon}</View>
      <View style={styles.infoBody}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue} numberOfLines={1}>{value}</Text>
      </View>
    </View>
  );
}

export default function AccountScreen() {
  const insets = useSafeAreaInsets();
  const apiKey = useAuthStore((s) => s.apiKey);
  const user = useAuthStore((s) => s.user);
  const watches = useAuthStore((s) => s.watches);
  const scanCount = useAuthStore((s) => s.scanCount);
  const setApiKey = useAuthStore((s) => s.setApiKey);
  const setUser = useAuthStore((s) => s.setUser);
  const ocConnected = useOpenClawStore((s) => s.connected);
  const ocHost = useOpenClawStore((s) => s.host);
  const subPlan = useSubscriptionStore((s) => s.plan);
  const expiresAt = useSubscriptionStore((s) => s.expiresAt);

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: () => {
          setApiKey(null);
          setUser(null);
          router.replace('/(auth)/welcome');
        },
      },
    ]);
  };

  const isAuthenticated = !!apiKey;
  const displayName = user?.username ?? user?.email ?? user?.privy_id ?? 'Agent';
  const walletAddr = user?.wallet_address;
  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : 'Unknown';

  return (
    <View style={styles.container}>
      <AuroraBackground />
      <View style={[styles.safe, { paddingTop: Math.max(insets.top, 16) }]}>
        <ScreenHeader
          icon={<User size={26} color={tokens.secondary} strokeWidth={2.5} />}
          title="Account"
          style={{ paddingHorizontal: 0 }}
        />

        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom + 100, 120) }]}
          showsVerticalScrollIndicator={false}
        >
          {isAuthenticated ? (
            <>
              {/* Profile card */}
              <Animated.View entering={FadeInDown.duration(400)}>
                <GlassCard style={styles.profileCard}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{displayName[0]?.toUpperCase() ?? 'A'}</Text>
                  </View>
                  <Text style={styles.profileName}>{displayName}</Text>
                  <Text style={styles.profileSince}>Member since {memberSince}</Text>
                </GlassCard>
              </Animated.View>

              {/* Plan */}
              <Animated.View entering={FadeInDown.delay(50).duration(400)}>
                <GlassCard style={styles.planCard}>
                  <View style={styles.planRow}>
                    <Crown size={18} color={tierColor(subPlan)} />
                    <View style={[styles.planBadge, { backgroundColor: `${tierColor(subPlan)}20`, borderColor: `${tierColor(subPlan)}40` }]}>
                      <Text style={[styles.planBadgeText, { color: tierColor(subPlan) }]}>
                        {tierLabel(subPlan)}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }} />
                    <HapticButton
                      variant="ghost"
                      size="sm"
                      onPress={() => router.push('/paywall' as any)}
                    >
                      <Text style={styles.managePlanText}>Manage Plan</Text>
                      <ChevronRight size={14} color={tokens.secondary} />
                    </HapticButton>
                  </View>
                  {expiresAt && subPlan !== 'free' && (
                    <Text style={styles.planExpiry}>
                      Expires {new Date(expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </Text>
                  )}
                </GlassCard>
              </Animated.View>

              {/* Stats */}
              <Animated.View entering={FadeInDown.delay(100).duration(400)} style={styles.statsRow}>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{scanCount}</Text>
                  <Text style={styles.statLabel}>Scans</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{watches.length}</Text>
                  <Text style={styles.statLabel}>Watching</Text>
                </View>
                <View style={styles.statCard}>
                  <View style={[styles.statusDot, { backgroundColor: ocConnected ? tokens.success : tokens.white35 }]} />
                  <Text style={styles.statLabel}>{ocConnected ? 'Online' : 'Offline'}</Text>
                </View>
              </Animated.View>

              {/* Info rows */}
              <Animated.View entering={FadeInDown.delay(200).duration(400)}>
                <GlassCard>
                  {walletAddr && (
                    <>
                      <InfoRow
                        label="Wallet"
                        value={`${walletAddr.slice(0, 6)}...${walletAddr.slice(-4)}`}
                        icon={<Wallet size={16} color={tokens.secondary} />}
                      />
                      <View style={styles.divider} />
                    </>
                  )}
                  <InfoRow
                    label="API Key"
                    value={apiKey ? `${apiKey.slice(0, 8)}••••${apiKey.slice(-4)}` : 'Not set'}
                    icon={<Key size={16} color={tokens.secondary} />}
                  />
                  <View style={styles.divider} />
                  <InfoRow
                    label="OpenClaw"
                    value={ocConnected ? (ocHost ?? 'Connected') : 'Not connected'}
                    icon={<Zap size={16} color={ocConnected ? tokens.success : tokens.white35} />}
                  />
                  <View style={styles.divider} />
                  <InfoRow
                    label="Node Status"
                    value={isOpenClawAvailable() ? 'Active' : 'Standby'}
                    icon={<Activity size={16} color={isOpenClawAvailable() ? tokens.success : tokens.white35} />}
                  />
                </GlassCard>
              </Animated.View>

              {/* Sign out */}
              <Animated.View entering={FadeInDown.delay(300).duration(400)} style={{ marginTop: 8 }}>
                <HapticButton variant="ghost" size="md" fullWidth onPress={handleLogout}>
                  <LogOut size={16} color={tokens.accent} />
                  <Text style={styles.logoutText}>Sign Out</Text>
                </HapticButton>
              </Animated.View>
            </>
          ) : (
            /* Not authenticated */
            <Animated.View entering={FadeInDown.duration(400)}>
              <GlassCard style={styles.noAuthCard}>
                <View style={styles.noAuthIconWrap}>
                  <Shield size={40} color={tokens.white35} strokeWidth={1.5} />
                </View>
                <Text style={styles.noAuthTitle}>Not Signed In</Text>
                <Text style={styles.noAuthSub}>
                  Sign in to sync your watchlist, receive alerts, and unlock all features.
                </Text>
                <HapticButton
                  variant="primary"
                  size="md"
                  fullWidth
                  onPress={() => router.push('/(auth)/login')}
                  style={{ marginTop: 16 }}
                >
                  <Text style={styles.signInBtnText}>Sign In</Text>
                </HapticButton>
              </GlassCard>
            </Animated.View>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.bgMain },
  safe: { flex: 1, paddingHorizontal: tokens.spacing.screenPadding },
  content: { gap: 12 },

  // Profile
  profileCard: { alignItems: 'center', paddingVertical: 24 },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: `${tokens.secondary}20`,
    borderWidth: 2,
    borderColor: `${tokens.secondary}40`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarText: {
    fontFamily: 'Lexend-Bold',
    fontSize: 24,
    color: tokens.secondary,
  },
  profileName: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.sectionHeader,
    color: tokens.white100,
    marginBottom: 4,
  },
  profileSince: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white35,
  },

  // Plan
  planCard: { paddingVertical: 14 },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  planBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
  },
  planBadgeText: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.small,
    letterSpacing: 0.5,
  },
  managePlanText: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.small,
    color: tokens.secondary,
  },
  planExpiry: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white35,
    marginTop: 8,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: tokens.bgGlass8,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.sectionHeader,
    color: tokens.white100,
  },
  statLabel: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white35,
    letterSpacing: 0.5,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginBottom: 2,
  },

  // Info rows
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  infoIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: tokens.bgGlass8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoBody: { flex: 1 },
  infoLabel: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white35,
    marginBottom: 2,
  },
  infoValue: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.body,
    color: tokens.white100,
  },
  divider: {
    height: 1,
    backgroundColor: tokens.borderSubtle,
    marginVertical: 8,
  },

  // Logout
  logoutText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.body,
    color: tokens.accent,
  },

  // Not authenticated
  noAuthCard: { alignItems: 'center', paddingVertical: 32 },
  noAuthIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: `${tokens.white100}08`,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  noAuthTitle: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.subheading,
    color: tokens.white60,
    marginBottom: 8,
  },
  noAuthSub: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.body,
    color: tokens.white35,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 16,
  },
  signInBtnText: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.body,
    color: tokens.white100,
  },
});
