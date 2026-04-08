import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Alert, Pressable, Image, Modal, ActivityIndicator,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Animated2, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  User, Crown, ChevronRight, LogOut, Key, Bell, RefreshCw, Shield, Scan, Eye, Award, Camera, Trash2,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { GlassCard } from '../../src/components/ui/GlassCard';
import { HapticButton } from '../../src/components/ui/HapticButton';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { WalletCard } from '../../src/components/ui/WalletCard';
import { UsageBar } from '../../src/components/ui/UsageBar';
import { EditProfileSheet } from '../../src/components/ui/EditProfileSheet';
import { ReceiveSheet } from '../../src/components/ui/ReceiveSheet';
import { SendSheet } from '../../src/components/ui/SendSheet';
import { AlertPrefsSheet } from '../../src/components/ui/AlertPrefsSheet';
import { useAuthStore } from '../../src/store/auth';
import { useSubscriptionStore } from '../../src/store/subscription';
import { tierLabel, tierColor, TIER_LIMITS } from '../../src/lib/tier-limits';
import { updateProfile } from '../../src/lib/api';
import { tokens } from '../../src/theme/tokens';
import { Connection, Transaction } from '@solana/web3.js';
import { useEmbeddedSolanaWallet } from '@privy-io/expo';
import { useSolBalance } from '../../src/hooks/useSolBalance';
import { queryClient } from '../../src/lib/query-client';

const RPC_URL = process.env.EXPO_PUBLIC_SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com';

// ── Gradient avatar from privy_id hash ───────────────────────────────────────
const AVATAR_COLORS = [
  ['#6366F1', '#8B5CF6'], ['#EC4899', '#F97316'], ['#06B6D4', '#3B82F6'],
  ['#10B981', '#06B6D4'], ['#F59E0B', '#EF4444'], ['#8B5CF6', '#EC4899'],
];

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// ── Settings Row ─────────────────────────────────────────────────────────────
function SettingsRow({ icon, label, value, onPress }: {
  icon: React.ReactNode; label: string; value?: string; onPress?: () => void;
}) {
  return (
    <Pressable style={styles.settingsRow} onPress={onPress} disabled={!onPress}>
      <View style={styles.settingsIcon}>{icon}</View>
      <Text style={styles.settingsLabel}>{label}</Text>
      {value && <Text style={styles.settingsValue} numberOfLines={1}>{value}</Text>}
      {onPress && <ChevronRight size={14} color={tokens.white20} />}
    </Pressable>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function AccountScreen() {
  const insets = useSafeAreaInsets();
  const apiKey = useAuthStore((s) => s.apiKey);
  const user = useAuthStore((s) => s.user);
  const watches = useAuthStore((s) => s.watches);
  const scanCount = useAuthStore((s) => s.scanCount);
  const setApiKey = useAuthStore((s) => s.setApiKey);
  const setUser = useAuthStore((s) => s.setUser);
  const recentSearches = useAuthStore((s) => s.recentSearches);
  const subPlan = useSubscriptionStore((s) => s.plan);
  const expiresAt = useSubscriptionStore((s) => s.expiresAt);
  const usage = useSubscriptionStore((s) => s.usage);

  const embeddedWallet = useEmbeddedSolanaWallet();

  const [editVisible, setEditVisible] = useState(false);
  const [sendVisible, setSendVisible] = useState(false);
  const [receiveVisible, setReceiveVisible] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [signOutVisible, setSignOutVisible] = useState(false);
  const [alertPrefsVisible, setAlertPrefsVisible] = useState(false);

  const isAuthenticated = !!apiKey;
  const displayName = user?.display_name ?? user?.username ?? user?.email?.split('@')[0] ?? 'Agent';
  const username = user?.username;
  const walletAddr = user?.wallet_address;
  const memberSince = user?.created_at
    ? new Date(Number(user.created_at) * 1000).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : undefined;
  const colorIdx = hashCode(user?.privy_id ?? 'a') % AVATAR_COLORS.length;
  const [bg1] = AVATAR_COLORS[colorIdx];

  // Tier limits for usage bars
  const limits = TIER_LIMITS[subPlan] ?? TIER_LIMITS.free;

  // Reputation score (client-side)
  const repScore = Math.min(999, scanCount * 2 + watches.length * 5);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleLogout = () => setSignOutVisible(true);

  const confirmLogout = async () => {
    setSignOutVisible(false);
    const { purgeUserData } = await import('../../src/lib/purge-user-data');
    await purgeUserData();
    setApiKey(null);
    router.replace('/(auth)/welcome');
  };

  const handleDeleteAccount = () => {
    // Two-step confirmation per Apple Guideline 5.1.1(v) — make destructive action obvious
    Alert.alert(
      'Delete Account?',
      'This permanently deletes your account, watchlist, alerts, investigations, and all related data. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Final confirmation',
              'Are you absolutely sure? Your account and all data will be erased forever.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete forever',
                  style: 'destructive',
                  onPress: async () => {
                    if (!apiKey) return;
                    try {
                      const { deleteAccount } = await import('../../src/lib/api');
                      await deleteAccount(apiKey);
                      // Reuse the existing logout cleanup pipeline
                      const { purgeUserData } = await import('../../src/lib/purge-user-data');
                      await purgeUserData();
                      setApiKey(null);
                      router.replace('/(auth)/welcome');
                    } catch (err) {
                      const msg = err instanceof Error ? err.message : 'Could not delete account';
                      Alert.alert('Delete failed', msg);
                    }
                  },
                },
              ],
            );
          },
        },
      ],
    );
  };

  const handlePickAvatar = async () => {
    if (!apiKey) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.3,
      base64: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    setAvatarUploading(true);
    try {
      // Resize to small thumbnail to keep base64 under DB limit
      const { manipulateAsync, SaveFormat } = await import('expo-image-manipulator');
      const manipulated = await manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 96, height: 96 } }],
        { compress: 0.5, format: SaveFormat.JPEG, base64: true },
      );
      if (!manipulated.base64) throw new Error('No base64');
      const dataUri = `data:image/jpeg;base64,${manipulated.base64}`;
      const updated = await updateProfile(apiKey, { avatar_url: dataUri });
      setUser(updated);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      Alert.alert('Avatar upload failed', msg);
    }
    setAvatarUploading(false);
  };

  const handleRotateKey = () => {
    Alert.alert('Rotate API Key', 'This will invalidate your current key. You will need to re-authenticate.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Rotate', style: 'destructive', onPress: async () => {
        try {
          const { regenerateApiKey } = await import('../../src/lib/api');
          const newKey = await regenerateApiKey(apiKey!);
          setApiKey(newKey);
          Alert.alert('Done', 'Your API key has been rotated.');
        } catch { Alert.alert('Error', 'Could not rotate key.'); }
      }},
    ]);
  };

  const { balance: solBalance, refetch: refetchBalance } = useSolBalance(walletAddr);

  const handleSignAndSend = async (tx: Transaction): Promise<string> => {
    if (!embeddedWallet || embeddedWallet.status !== 'connected' || !embeddedWallet.wallets?.length) {
      throw new Error('Wallet not connected');
    }
    const provider = await embeddedWallet.wallets[0].getProvider();
    const connection = new Connection(RPC_URL, 'confirmed');
    const { signature } = await provider.request({
      method: 'signAndSendTransaction',
      params: { transaction: tx, connection },
    });
    return signature;
  };

  const handleSendSuccess = () => {
    refetchBalance();
    queryClient.invalidateQueries({ queryKey: ['sol-balance'] });
  };

  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <View style={[styles.safe, { paddingTop: Math.max(insets.top, 16) }]}>
          <ScreenHeader icon={<User size={26} color={tokens.secondary} strokeWidth={2.5} />} title="Account" style={{ paddingHorizontal: 0 }} />
          <Animated.View entering={FadeInDown.duration(400)} style={styles.centerContent}>
            <GlassCard style={styles.noAuthCard}>
              <View style={styles.noAuthIconWrap}>
                <Shield size={40} color={tokens.textTertiary} strokeWidth={1.5} />
              </View>
              <Text style={styles.noAuthTitle}>Not Signed In</Text>
              <Text style={styles.noAuthSub}>Sign in to sync your watchlist, receive alerts, and unlock all features.</Text>
              <HapticButton variant="primary" size="md" fullWidth onPress={() => router.push('/(auth)/login')} style={{ marginTop: 16 }}>
                <Text style={styles.btnTextWhite}>Sign In</Text>
              </HapticButton>
            </GlassCard>
          </Animated.View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.safe, { paddingTop: Math.max(insets.top, 16) }]}>
        <ScreenHeader icon={<User size={26} color={tokens.secondary} strokeWidth={2.5} />} title="Account" style={{ paddingHorizontal: 0 }} />

        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom + 100, 120) }]} showsVerticalScrollIndicator={false}>

          {/* ── Section 1: Profile Hero ──────────────────────────────────────── */}
          <Animated.View entering={FadeInDown.duration(400)}>
            <GlassCard style={styles.profileCard}>
              <Pressable onPress={handlePickAvatar} disabled={avatarUploading} style={styles.avatarWrapper}>
                {user?.avatar_url ? (
                  <Image source={{ uri: user.avatar_url }} style={styles.avatarImg} />
                ) : (
                  <View style={[styles.avatar, { backgroundColor: `${bg1}25`, borderColor: `${bg1}50` }]}>
                    <Text style={[styles.avatarText, { color: bg1 }]}>{displayName[0]?.toUpperCase() ?? 'A'}</Text>
                  </View>
                )}
                {avatarUploading ? (
                  <View style={[styles.cameraBadge, { backgroundColor: tokens.white20 }]}>
                    <ActivityIndicator size={12} color={tokens.white} />
                  </View>
                ) : (
                  <View style={styles.cameraBadge}>
                    <Camera size={12} color={tokens.white} strokeWidth={2.5} />
                  </View>
                )}
              </Pressable>
              {!user?.avatar_url && !avatarUploading && (
                <Text style={styles.avatarHint}>Tap to add a photo</Text>
              )}

              <Pressable onPress={() => setEditVisible(true)} style={styles.nameRow}>
                <Text style={styles.profileName}>{displayName}</Text>
                {username && <Text style={styles.profileHandle}>@{username}</Text>}
              </Pressable>

              <View style={styles.profileMeta}>
                <View style={[styles.planPill, { backgroundColor: `${tierColor(subPlan)}20`, borderColor: `${tierColor(subPlan)}40` }]}>
                  <Text style={[styles.planPillText, { color: tierColor(subPlan) }]}>{tierLabel(subPlan)}</Text>
                </View>
                {memberSince && <Text style={styles.memberSince}>Since {memberSince}</Text>}
              </View>
            </GlassCard>
          </Animated.View>

          {/* ── Section 2: Wallet ────────────────────────────────────────────── */}
          <Animated.View entering={FadeInDown.delay(60).duration(400)}>
            <WalletCard
              address={walletAddr}
              onSend={() => setSendVisible(true)}
              onReceive={() => setReceiveVisible(true)}
            />
          </Animated.View>

          {/* ── Section 3: Plan & Usage ──────────────────────────────────────── */}
          <Animated.View entering={FadeInDown.delay(120).duration(400)}>
            <GlassCard style={styles.usageCard}>
              <View style={styles.usageHeader}>
                <Crown size={16} color={tierColor(subPlan)} />
                <Text style={styles.usageTitle}>{tierLabel(subPlan)} Plan</Text>
                <View style={{ flex: 1 }} />
                <HapticButton variant="ghost" size="sm" onPress={() => router.push('/paywall' as any)}>
                  <Text style={styles.managePlanText}>Upgrade</Text>
                  <ChevronRight size={14} color={tokens.secondary} />
                </HapticButton>
              </View>
              {expiresAt && subPlan !== 'free' && (
                <Text style={styles.planExpiry}>
                  Expires {new Date(expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
              )}
              <View style={styles.usageBars}>
                <UsageBar label="Scans" used={usage?.scans ?? scanCount} total={limits.scansPerDay === -1 ? Infinity : limits.scansPerDay} />
                <UsageBar label="AI Chats" used={usage?.ai_chat ?? 0} total={limits.aiChatDailyLimit === -1 ? Infinity : limits.aiChatDailyLimit} />
                <UsageBar label="Watchlist" used={watches.length} total={limits.maxWatchlist} />
              </View>
            </GlassCard>
          </Animated.View>

          {/* ── Section 4: Forensic Reputation ───────────────────────────────── */}
          <Animated.View entering={FadeInDown.delay(180).duration(400)}>
            <GlassCard style={styles.repCard}>
              <View style={styles.repHeader}>
                <Award size={18} color={tokens.gold} />
                <Text style={styles.repTitle}>Forensic Reputation</Text>
              </View>
              <View style={styles.repStatsRow}>
                <View style={styles.repStat}>
                  <Text style={styles.repStatVal}>{repScore}</Text>
                  <Text style={styles.repStatLabel}>Score</Text>
                </View>
                <View style={styles.repStat}>
                  <Scan size={16} color={tokens.secondary} />
                  <Text style={styles.repStatVal}>{scanCount}</Text>
                  <Text style={styles.repStatLabel}>Scans</Text>
                </View>
                <View style={styles.repStat}>
                  <Eye size={16} color={tokens.secondary} />
                  <Text style={styles.repStatVal}>{watches.length}</Text>
                  <Text style={styles.repStatLabel}>Watching</Text>
                </View>
              </View>
              {recentSearches.length > 0 && (
                <View style={styles.recentSection}>
                  <Text style={styles.recentTitle}>Recent Scans</Text>
                  {recentSearches.slice(0, 3).map((s) => (
                    <Pressable key={s.mint} style={styles.recentRow} onPress={() => router.push(`/token/${s.mint}` as any)}>
                      <Text style={styles.recentName} numberOfLines={1}>{s.name || s.symbol || s.mint.slice(0, 8)}</Text>
                      <ChevronRight size={12} color={tokens.white20} />
                    </Pressable>
                  ))}
                </View>
              )}
            </GlassCard>
          </Animated.View>

          {/* ── Section 5: Settings & Security ───────────────────────────────── */}
          <Animated.View entering={FadeInDown.delay(240).duration(400)}>
            <GlassCard>
              <SettingsRow
                icon={<Bell size={16} color={tokens.secondary} />}
                label="Notifications"
                onPress={() => setAlertPrefsVisible(true)}
              />
              <View style={styles.divider} />
              <SettingsRow
                icon={<Key size={16} color={tokens.secondary} />}
                label="API Key"
                value={apiKey ? `${apiKey.slice(0, 8)}••••${apiKey.slice(-4)}` : 'Not set'}
              />
              <View style={styles.divider} />
              <SettingsRow
                icon={<RefreshCw size={16} color={tokens.warning} />}
                label="Rotate API Key"
                onPress={handleRotateKey}
              />
            </GlassCard>
          </Animated.View>

          {/* Sign Out */}
          <Animated.View entering={FadeInDown.delay(300).duration(400)} style={{ marginTop: 4 }}>
            <HapticButton variant="ghost" size="md" fullWidth onPress={handleLogout}>
              <LogOut size={16} color={tokens.accent} />
              <Text style={styles.logoutText}>Sign Out</Text>
            </HapticButton>
          </Animated.View>

          {/* Danger Zone — Delete Account (Apple Guideline 5.1.1(v)) */}
          <Animated.View entering={FadeInDown.delay(350).duration(400)} style={styles.dangerZone}>
            <Text style={styles.dangerZoneLabel}>DANGER ZONE</Text>
            <Pressable style={styles.deleteAccountBtn} onPress={handleDeleteAccount}>
              <Trash2 size={15} color={tokens.risk.critical} />
              <Text style={styles.deleteAccountText}>Delete Account</Text>
            </Pressable>
            <Text style={styles.dangerZoneHint}>
              Permanently erases your account, watchlist, alerts and history. Cannot be undone.
            </Text>
          </Animated.View>

          {/* Legal links — required by Google Play / App Store for in-app access */}
          <Animated.View entering={FadeInDown.delay(400).duration(400)} style={styles.legalRow}>
            <Pressable onPress={() => router.push('/legal/privacy' as any)}>
              <Text style={styles.legalLink}>Privacy Policy</Text>
            </Pressable>
            <Text style={styles.legalDot}>·</Text>
            <Pressable onPress={() => router.push('/legal/terms' as any)}>
              <Text style={styles.legalLink}>Terms of Service</Text>
            </Pressable>
          </Animated.View>

          <Text style={styles.appVersion}>Lineage Agent v1.0.0</Text>

        </ScrollView>
      </View>

      {/* Sign Out Confirmation Modal */}
      <Modal visible={signOutVisible} transparent statusBarTranslucent animationType="none" onRequestClose={() => setSignOutVisible(false)}>
        <Animated2.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSignOutVisible(false)} />
          <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />

          <Animated2.View entering={SlideInDown.springify().damping(20).stiffness(300)} exiting={SlideOutDown.duration(200)} style={styles.modalCard}>
            {/* Glass highlight gradient */}
            <LinearGradient
              colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.00)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={[StyleSheet.absoluteFill, { borderRadius: tokens.radius.xl }]}
            />

            {/* Accent glow behind icon */}
            <View style={styles.modalGlow}>
              <View style={styles.modalGlowInner} />
            </View>

            {/* Icon */}
            <View style={styles.modalIconWrap}>
              <LinearGradient
                colors={['rgba(255, 51, 102, 0.20)', 'rgba(255, 51, 102, 0.05)']}
                style={StyleSheet.absoluteFill}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
              />
              <LogOut size={22} color={tokens.accent} strokeWidth={2.5} />
            </View>

            <Text style={styles.modalTitle}>Sign Out</Text>
            <Text style={styles.modalMessage}>
              Are you sure you want to sign out?{'\n'}You'll need to sign in again to access your account.
            </Text>

            {/* Divider */}
            <View style={styles.modalDivider} />

            {/* Actions */}
            <View style={styles.modalActions}>
              <Pressable
                style={({ pressed }) => [styles.modalBtn, styles.modalCancelBtn, pressed && { opacity: 0.7 }]}
                onPress={() => setSignOutVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.modalBtn, styles.modalDestructiveBtn, pressed && { opacity: 0.8, transform: [{ scale: 0.97 }] }]}
                onPress={confirmLogout}
              >
                <LinearGradient
                  colors={['#FF3366', '#CC2952']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[StyleSheet.absoluteFill, { borderRadius: tokens.radius.sm }]}
                />
                <LogOut size={14} color={tokens.white100} strokeWidth={2.5} />
                <Text style={styles.modalDestructiveText}>Sign Out</Text>
              </Pressable>
            </View>
          </Animated2.View>
        </Animated2.View>
      </Modal>

      {/* Sheets */}
      <EditProfileSheet visible={editVisible} onClose={() => setEditVisible(false)} />
      <AlertPrefsSheet visible={alertPrefsVisible} onClose={() => setAlertPrefsVisible(false)} />
      {walletAddr && (
        <>
          <ReceiveSheet visible={receiveVisible} onClose={() => setReceiveVisible(false)} address={walletAddr} />
          <SendSheet
            visible={sendVisible}
            onClose={() => setSendVisible(false)}
            walletAddress={walletAddr}
            balance={solBalance}
            signAndSend={handleSignAndSend}
            onSuccess={handleSendSuccess}
          />
        </>
      )}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.bgMain },
  safe: { flex: 1, paddingHorizontal: tokens.spacing.screenPadding },
  content: { gap: 12 },
  centerContent: { flex: 1, justifyContent: 'center' },

  // Profile Hero
  profileCard: { alignItems: 'center', paddingVertical: 24 },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  avatarImg: { width: 80, height: 80, borderRadius: 40 },
  avatarText: { fontFamily: 'Lexend-Bold', fontSize: 28 },
  avatarWrapper: { position: 'relative' as const, marginBottom: 4 },
  avatarHint: { fontFamily: 'Lexend-Regular', fontSize: 11, color: tokens.white40, marginBottom: 8 },
  cameraBadge: {
    position: 'absolute' as const, bottom: 0, right: 0,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: tokens.secondary, alignItems: 'center' as const, justifyContent: 'center' as const,
    borderWidth: 2, borderColor: tokens.bg1,
  },
  nameRow: { alignItems: 'center', gap: 2 },
  profileName: { fontFamily: 'Lexend-Bold', fontSize: tokens.font.sectionHeader, color: tokens.white100 },
  profileHandle: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.small, color: tokens.textTertiary },
  profileMeta: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  planPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: tokens.radius.pill, borderWidth: 1 },
  planPillText: { fontFamily: 'Lexend-Bold', fontSize: tokens.font.tiny, letterSpacing: 0.5 },
  memberSince: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.textTertiary },

  // Usage
  usageCard: { gap: 12 },
  usageHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  usageTitle: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.subheading, color: tokens.white80 },
  managePlanText: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.small, color: tokens.secondary },
  planExpiry: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.textTertiary },
  usageBars: { gap: 10 },

  // Reputation
  repCard: { gap: 12 },
  repHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  repTitle: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.subheading, color: tokens.white80 },
  repStatsRow: { flexDirection: 'row', gap: 8 },
  repStat: {
    flex: 1, alignItems: 'center', gap: 4,
    backgroundColor: tokens.bgGlass8, borderRadius: tokens.radius.sm,
    borderWidth: 1, borderColor: tokens.borderSubtle, paddingVertical: 12,
  },
  repStatVal: { fontFamily: 'Lexend-Bold', fontSize: tokens.font.sectionHeader, color: tokens.white100 },
  repStatLabel: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.textTertiary, letterSpacing: 0.5 },
  recentSection: { gap: 6, marginTop: 4 },
  recentTitle: { fontFamily: 'Lexend-Medium', fontSize: tokens.font.small, color: tokens.textTertiary },
  recentRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 8, paddingHorizontal: 4,
  },
  recentName: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.body, color: tokens.white60, flex: 1 },

  // Settings
  settingsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  settingsIcon: {
    width: 32, height: 32, borderRadius: 8, backgroundColor: tokens.bgGlass8,
    alignItems: 'center', justifyContent: 'center',
  },
  settingsLabel: { fontFamily: 'Lexend-Medium', fontSize: tokens.font.body, color: tokens.white80, flex: 1 },
  settingsValue: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.small, color: tokens.textTertiary, maxWidth: 140 },
  divider: { height: 1, backgroundColor: tokens.borderSubtle, marginVertical: 6 },

  // Logout
  logoutText: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.body, color: tokens.accent },
  appVersion: {
    fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny,
    color: tokens.white20, textAlign: 'center', marginTop: 4,
  },

  // Legal links
  legalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
  },
  legalLink: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.textTertiary,
    textDecorationLine: 'underline',
  },
  legalDot: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white20,
  },

  // Danger Zone
  dangerZone: {
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: `${tokens.risk.critical}20`,
    gap: 8,
  },
  dangerZoneLabel: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: 10,
    color: tokens.risk.critical,
    letterSpacing: 1.4,
  },
  deleteAccountBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: `${tokens.risk.critical}40`,
    backgroundColor: `${tokens.risk.critical}10`,
  },
  deleteAccountText: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.small,
    color: tokens.risk.critical,
  },
  dangerZoneHint: {
    fontFamily: 'Lexend-Regular',
    fontSize: 10,
    color: tokens.white40,
    textAlign: 'center',
    lineHeight: 14,
  },

  // Confirmation Modal
  modalBackdrop: {
    flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28,
  },
  modalCard: {
    width: '100%', borderRadius: tokens.radius.xl, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(255, 51, 102, 0.15)',
    backgroundColor: tokens.bgApp,
    alignItems: 'center' as const,
    paddingTop: 32, paddingBottom: 24, paddingHorizontal: 24,
    // Accent glow shadow
    shadowColor: '#FF3366',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 32,
    elevation: 16,
  },
  modalGlow: {
    position: 'absolute' as const, top: -40, alignSelf: 'center',
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: 'rgba(255, 51, 102, 0.08)',
  },
  modalGlowInner: {
    flex: 1, borderRadius: 60,
    backgroundColor: 'rgba(255, 51, 102, 0.06)',
  },
  modalIconWrap: {
    width: 56, height: 56, borderRadius: 28,
    overflow: 'hidden' as const,
    borderWidth: 1, borderColor: 'rgba(255, 51, 102, 0.30)',
    alignItems: 'center' as const, justifyContent: 'center' as const,
    marginBottom: 20,
  },
  modalTitle: {
    fontFamily: 'Lexend-Bold', fontSize: 22,
    color: tokens.white100, marginBottom: 10, letterSpacing: -0.3,
  },
  modalMessage: {
    fontFamily: 'Lexend-Regular', fontSize: tokens.font.body,
    color: tokens.textMuted, textAlign: 'center' as const,
    lineHeight: 22, marginBottom: 24, paddingHorizontal: 4,
  },
  modalDivider: {
    width: '100%' as any, height: 1,
    backgroundColor: tokens.borderSubtle, marginBottom: 20,
  },
  modalActions: {
    flexDirection: 'row' as const, gap: 12, width: '100%',
  },
  modalBtn: {
    flex: 1, height: 48, borderRadius: tokens.radius.sm,
    alignItems: 'center' as const, justifyContent: 'center' as const,
    flexDirection: 'row' as const, gap: 8,
  },
  modalCancelBtn: {
    backgroundColor: tokens.bgGlass8,
    borderWidth: 1, borderColor: tokens.borderSubtle,
  },
  modalDestructiveBtn: {
    overflow: 'hidden' as const,
    shadowColor: '#FF3366',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  modalCancelText: {
    fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.body, color: tokens.white60,
  },
  modalDestructiveText: {
    fontFamily: 'Lexend-Bold', fontSize: tokens.font.body, color: tokens.white100,
  },

  // Not authenticated
  noAuthCard: { alignItems: 'center', paddingVertical: 32 },
  noAuthIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: `${tokens.white100}08`, borderWidth: 1, borderColor: tokens.borderSubtle,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  noAuthTitle: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.subheading, color: tokens.white60, marginBottom: 8 },
  noAuthSub: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.body, color: tokens.textTertiary, textAlign: 'center', lineHeight: 22, paddingHorizontal: 16 },
  btnTextWhite: { fontFamily: 'Lexend-Bold', fontSize: tokens.font.body, color: tokens.white100 },
});
