import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Alert, Pressable, Image, ActivityIndicator, Linking,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  User, Crown, ChevronRight, LogOut, Key, Bell, RefreshCw, Shield, Eye, Award,
  Pencil, Camera, Copy, Check, Zap, Target, Skull, TrendingUp,
} from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { GlassCard } from '../../src/components/ui/GlassCard';
import { HapticButton } from '../../src/components/ui/HapticButton';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { WalletCard } from '../../src/components/ui/WalletCard';
import { UsageBar } from '../../src/components/ui/UsageBar';
import { GaugeRing } from '../../src/components/ui/GaugeRing';
import { EditProfileSheet } from '../../src/components/ui/EditProfileSheet';
import { ReceiveSheet } from '../../src/components/ui/ReceiveSheet';
import { SendSheet } from '../../src/components/ui/SendSheet';
import { useAuthStore } from '../../src/store/auth';
import { useSubscriptionStore } from '../../src/store/subscription';
import { useHistoryStore } from '../../src/store/history';
import { tierLabel, tierColor, TIER_LIMITS } from '../../src/lib/tier-limits';
import { updateProfile } from '../../src/lib/api';
import { tokens } from '../../src/theme/tokens';
import { Connection, Transaction } from '@solana/web3.js';
import { useEmbeddedSolanaWallet } from '@privy-io/expo';
import { useSolBalance } from '../../src/hooks/useSolBalance';
import { queryClient } from '../../src/lib/query-client';

const RPC_URL = process.env.EXPO_PUBLIC_SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com';
const APP_VERSION = '1.0.0';

// ── Helpers ─────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  ['#6366F1', '#8B5CF6'], ['#EC4899', '#F97316'], ['#06B6D4', '#3B82F6'],
  ['#10B981', '#06B6D4'], ['#F59E0B', '#EF4444'], ['#8B5CF6', '#EC4899'],
];

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// ── Achievements ────────────────────────────────────────────────────────────

interface Achievement { id: string; label: string; icon: any; color: string; unlocked: boolean; }

function getAchievements(scanCount: number, watchCount: number, rugCount: number): Achievement[] {
  return [
    { id: 'first_scan', label: 'First Scan', icon: Target, color: tokens.secondary, unlocked: scanCount >= 1 },
    { id: 'hunter_10', label: '10 Scans', icon: Eye, color: tokens.secondary, unlocked: scanCount >= 10 },
    { id: 'hunter_100', label: 'Centurion', icon: Award, color: tokens.gold, unlocked: scanCount >= 100 },
    { id: 'watchdog', label: 'Watchdog', icon: Shield, color: tokens.success, unlocked: watchCount >= 5 },
    { id: 'rug_hunter', label: 'Rug Hunter', icon: Skull, color: tokens.risk.critical, unlocked: rugCount >= 1 },
    { id: 'whale', label: 'Whale Watcher', icon: TrendingUp, color: tokens.gold, unlocked: watchCount >= 20 },
  ];
}

// ── Settings Row ────────────────────────────────────────────────────────────

function SettingsRow({ icon, label, value, onPress, rightIcon }: {
  icon: React.ReactNode; label: string; value?: string; onPress?: () => void; rightIcon?: React.ReactNode;
}) {
  return (
    <Pressable style={s.settingsRow} onPress={onPress} disabled={!onPress}>
      <View style={s.settingsIcon}>{icon}</View>
      <Text style={s.settingsLabel}>{label}</Text>
      {value && <Text style={s.settingsValue} numberOfLines={1}>{value}</Text>}
      {rightIcon ?? (onPress ? <ChevronRight size={14} color={tokens.white20} /> : null)}
    </Pressable>
  );
}

// ── Plan benefit labels ─────────────────────────────────────────────────────

const PLAN_BENEFITS: Record<string, string[]> = {
  free: ['5 scans/day', 'Basic risk score'],
  pro: ['Unlimited scans', '20 AI chats/day', '10 watchlist slots', 'Full forensic reports'],
  pro_plus: ['Unlimited scans & chats', '50 watchlist slots', 'Agent multi-turn reasoning', 'Priority support'],
  whale: ['Everything unlimited', '200 watchlist slots', 'Dedicated support', 'Early access'],
};

// ── Main ────────────────────────────────────────────────────────────────────

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
  const [keyCopied, setKeyCopied] = useState(false);

  const isAuthenticated = !!apiKey;
  const displayName = user?.display_name ?? user?.username ?? user?.email?.split('@')[0] ?? 'Agent';
  const username = user?.username;
  const walletAddr = user?.wallet_address;
  const memberSince = user?.created_at
    ? new Date(Number(user.created_at) * 1000).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : undefined;
  const colorIdx = hashCode(user?.privy_id ?? 'a') % AVATAR_COLORS.length;
  const [bg1] = AVATAR_COLORS[colorIdx];
  const tc = tierColor(subPlan);
  const limits = TIER_LIMITS[subPlan] ?? TIER_LIMITS.free;
  const repScore = Math.min(999, scanCount * 2 + watches.length * 5);
  const repPct = Math.min(repScore / 999, 1);

  // Investigation history for achievements
  const historyCount = useHistoryStore((st) => st.investigations.length);
  const rugCount = useHistoryStore((st) => st.investigations.filter((i) => i.riskScore >= 75).length);
  const achievements = getAchievements(scanCount, watches.length, rugCount);
  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => {
        const { purgeUserData } = await import('../../src/lib/purge-user-data');
        await purgeUserData();
        setApiKey(null);
        router.replace('/(auth)/welcome');
      }},
    ]);
  };

  const handlePickAvatar = async () => {
    if (!apiKey) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    });
    if (result.canceled || !result.assets?.[0]?.base64) return;
    setAvatarUploading(true);
    try {
      const dataUri = `data:image/jpeg;base64,${result.assets[0].base64}`;
      const updated = await updateProfile(apiKey, { avatar_url: dataUri });
      setUser(updated);
    } catch { /* best-effort */ }
    setAvatarUploading(false);
  };

  const handleRotateKey = () => {
    Alert.alert('Rotate API Key', 'This will invalidate your current key.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Rotate', style: 'destructive', onPress: async () => {
        try {
          const { regenerateApiKey } = await import('../../src/lib/api');
          const newKey = await regenerateApiKey(apiKey!);
          setApiKey(newKey);
          const masked = `${newKey.slice(0, 8)}••••${newKey.slice(-4)}`;
          Alert.alert('Key Rotated', `New key: ${masked}\n\nCopy it now.`, [
            { text: 'Copy Key', onPress: () => Clipboard.setStringAsync(newKey) },
            { text: 'OK' },
          ]);
        } catch { Alert.alert('Error', 'Could not rotate key.'); }
      }},
    ]);
  };

  const handleCopyKey = async () => {
    if (!apiKey) return;
    await Clipboard.setStringAsync(apiKey);
    setKeyCopied(true);
    setTimeout(() => setKeyCopied(false), 2000);
  };

  const { balance: solBalance, refetch: refetchBalance } = useSolBalance(walletAddr);

  const handleSignAndSend = async (tx: Transaction): Promise<string> => {
    if (!embeddedWallet || embeddedWallet.status !== 'connected' || !embeddedWallet.wallets?.length) throw new Error('Wallet not connected');
    const provider = await embeddedWallet.wallets[0].getProvider();
    const connection = new Connection(RPC_URL, 'confirmed');
    const { signature } = await provider.request({ method: 'signAndSendTransaction', params: { transaction: tx, connection } });
    return signature;
  };

  const handleSendSuccess = () => { refetchBalance(); queryClient.invalidateQueries({ queryKey: ['sol-balance'] }); };

  // ── Unauthenticated ────────────────────────────────────────────────────────

  if (!isAuthenticated) {
    return (
      <View style={s.container}>
        <View style={[s.safe, { paddingTop: Math.max(insets.top, 16) }]}>
          <ScreenHeader icon={<User size={26} color={tokens.secondary} strokeWidth={2.5} />} title="Account" style={{ paddingHorizontal: 0 }} />
          <Animated.View entering={FadeInDown.duration(400)} style={s.centerContent}>
            <GlassCard style={s.noAuthCard}>
              <View style={s.noAuthIconWrap}>
                <Shield size={40} color={tokens.textTertiary} strokeWidth={1.5} />
              </View>
              <Text style={s.noAuthTitle}>Not Signed In</Text>
              <Text style={s.noAuthSub}>Sign in to sync your watchlist, receive alerts, and unlock all features.</Text>
              <HapticButton variant="primary" size="md" fullWidth onPress={() => router.push('/(auth)/login')} style={{ marginTop: 16 }}>
                <Text style={s.btnText}>Sign In</Text>
              </HapticButton>
            </GlassCard>
          </Animated.View>
        </View>
      </View>
    );
  }

  // ── Authenticated ──────────────────────────────────────────────────────────

  return (
    <View style={s.container}>
      <View style={[s.safe, { paddingTop: Math.max(insets.top, 16) }]}>
        <ScreenHeader icon={<User size={26} color={tokens.secondary} strokeWidth={2.5} />} title="Account" style={{ paddingHorizontal: 0 }} />

        <ScrollView contentContainerStyle={[s.content, { paddingBottom: Math.max(insets.bottom + 100, 120) }]} showsVerticalScrollIndicator={false}>

          {/* ── Profile Hero (with tier glow) ──────────────────────────────── */}
          <Animated.View entering={FadeInDown.duration(400)}>
            <GlassCard style={[s.heroCard, { borderColor: `${tc}20`, borderWidth: 1 }]}>
              {/* Glow accent */}
              <View style={[s.heroGlow, { backgroundColor: tc }]} />

              {/* Avatar with camera overlay */}
              <Pressable onPress={handlePickAvatar} disabled={avatarUploading} style={s.avatarWrap}>
                {user?.avatar_url ? (
                  <Image source={{ uri: user.avatar_url }} style={[s.avatarImg, { borderColor: `${tc}50` }]} />
                ) : (
                  <View style={[s.avatar, { backgroundColor: `${bg1}20`, borderColor: `${tc}50` }]}>
                    <Text style={[s.avatarLetter, { color: bg1 }]}>{displayName[0]?.toUpperCase() ?? 'A'}</Text>
                  </View>
                )}
                <View style={s.cameraOverlay}>
                  {avatarUploading
                    ? <ActivityIndicator size="small" color={tokens.white100} />
                    : <Camera size={14} color={tokens.white100} />}
                </View>
              </Pressable>

              {/* Name + edit */}
              <Pressable onPress={() => setEditVisible(true)} style={s.nameRow}>
                <Text style={s.heroName}>{displayName}</Text>
                <Pencil size={13} color={tokens.white35} />
              </Pressable>
              {username && <Text style={s.heroHandle}>@{username}</Text>}

              {/* Plan + member since */}
              <View style={s.heroMeta}>
                <View style={[s.planPill, { backgroundColor: `${tc}15`, borderColor: `${tc}35` }]}>
                  <Crown size={10} color={tc} />
                  <Text style={[s.planPillText, { color: tc }]}>{tierLabel(subPlan)}</Text>
                </View>
                {memberSince && <Text style={s.memberSince}>Since {memberSince}</Text>}
              </View>

              {/* Quick stats strip */}
              <View style={s.quickStats}>
                <View style={s.quickStat}>
                  <Text style={s.quickStatVal}>{scanCount}</Text>
                  <Text style={s.quickStatLabel}>Scans</Text>
                </View>
                <View style={s.quickStatDivider} />
                <View style={s.quickStat}>
                  <Text style={s.quickStatVal}>{watches.length}</Text>
                  <Text style={s.quickStatLabel}>Watching</Text>
                </View>
                <View style={s.quickStatDivider} />
                <View style={s.quickStat}>
                  <Text style={s.quickStatVal}>{historyCount}</Text>
                  <Text style={s.quickStatLabel}>Investigated</Text>
                </View>
              </View>
            </GlassCard>
          </Animated.View>

          {/* ── Plan & Usage ──────────────────────────────────────────────── */}
          <Animated.View entering={FadeInDown.delay(60).duration(400)}>
            <GlassCard style={s.planCard}>
              <View style={s.planHeader}>
                <View style={[s.planIconWrap, { backgroundColor: `${tc}15` }]}>
                  <Crown size={18} color={tc} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.planTitle}>{tierLabel(subPlan)} Plan</Text>
                  {expiresAt && subPlan !== 'free' && (
                    <Text style={s.planExpiry}>
                      Expires {new Date(expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </Text>
                  )}
                </View>
                {subPlan === 'free' || subPlan === 'pro' ? (
                  <HapticButton variant="primary" size="sm" onPress={() => router.push('/paywall' as any)}>
                    <Text style={s.upgradeBtnText}>Upgrade</Text>
                  </HapticButton>
                ) : null}
              </View>

              {/* Benefits */}
              <View style={s.benefitsList}>
                {(PLAN_BENEFITS[subPlan] ?? PLAN_BENEFITS.free).map((b, i) => (
                  <View key={i} style={s.benefitRow}>
                    <Check size={12} color={tc} />
                    <Text style={s.benefitText}>{b}</Text>
                  </View>
                ))}
              </View>

              {/* Usage bars */}
              <View style={s.usageBars}>
                <UsageBar label="Scans" used={usage?.scans ?? scanCount} total={limits.scansPerDay === -1 ? Infinity : limits.scansPerDay} />
                <UsageBar label="AI Chats" used={usage?.ai_chat ?? 0} total={limits.aiChatDailyLimit === -1 ? Infinity : limits.aiChatDailyLimit} />
                <UsageBar label="Watchlist" used={watches.length} total={limits.maxWatchlist} />
              </View>
            </GlassCard>
          </Animated.View>

          {/* ── Reputation (with gauge) ───────────────────────────────────── */}
          <Animated.View entering={FadeInDown.delay(120).duration(400)}>
            <GlassCard style={s.repCard}>
              <View style={s.repRow}>
                <GaugeRing
                  value={repPct}
                  color={repPct > 0.7 ? tokens.gold : repPct > 0.3 ? tokens.secondary : tokens.white60}
                  size={72}
                  strokeWidth={5}
                  label={String(repScore)}
                  sublabel="REP"
                />
                <View style={s.repInfo}>
                  <View style={s.repHeader}>
                    <Award size={16} color={tokens.gold} />
                    <Text style={s.repTitle}>Forensic Reputation</Text>
                  </View>
                  <Text style={s.repSub}>
                    {repScore < 100 ? 'Keep scanning to build your reputation'
                      : repScore < 500 ? 'Active analyst — building credibility'
                      : 'Expert forensic analyst'}
                  </Text>
                </View>
              </View>

              {/* Achievements */}
              <View style={s.achieveSection}>
                <Text style={s.achieveTitle}>Achievements · {unlockedCount}/{achievements.length}</Text>
                <View style={s.achieveGrid}>
                  {achievements.map((a) => {
                    const Icon = a.icon;
                    return (
                      <View key={a.id} style={[s.achieveBadge, !a.unlocked && s.achieveLocked]}>
                        <Icon size={14} color={a.unlocked ? a.color : tokens.white20} />
                        <Text style={[s.achieveLabel, !a.unlocked && { color: tokens.white20 }]}>{a.label}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>

              {/* Recent scans */}
              {recentSearches.length > 0 && (
                <View style={s.recentSection}>
                  <Text style={s.recentSectionTitle}>Recent Scans</Text>
                  {recentSearches.slice(0, 3).map((item) => (
                    <Pressable key={item.mint} style={s.recentRow} onPress={() => router.push(`/token/${item.mint}` as any)}>
                      <Text style={s.recentName} numberOfLines={1}>{item.name || item.symbol || item.mint.slice(0, 8)}</Text>
                      <ChevronRight size={12} color={tokens.white20} />
                    </Pressable>
                  ))}
                  {recentSearches.length > 3 && (
                    <Pressable style={s.viewAllRow} onPress={() => router.push('/(tabs)/scan' as any)}>
                      <Text style={s.viewAllText}>View all</Text>
                      <ChevronRight size={12} color={tokens.secondary} />
                    </Pressable>
                  )}
                </View>
              )}
            </GlassCard>
          </Animated.View>

          {/* ── Wallet ────────────────────────────────────────────────────── */}
          <Animated.View entering={FadeInDown.delay(180).duration(400)}>
            <WalletCard address={walletAddr} onSend={() => setSendVisible(true)} onReceive={() => setReceiveVisible(true)} />
          </Animated.View>

          {/* ── Settings & Security ───────────────────────────────────────── */}
          <Animated.View entering={FadeInDown.delay(240).duration(400)}>
            <GlassCard>
              <SettingsRow
                icon={<Bell size={16} color={tokens.secondary} />}
                label="Notifications"
                onPress={() => router.push('/(tabs)/alerts' as any)}
              />
              <View style={s.divider} />
              <Pressable style={s.settingsRow} onPress={handleCopyKey}>
                <View style={s.settingsIcon}><Key size={16} color={tokens.secondary} /></View>
                <Text style={s.settingsLabel}>API Key</Text>
                <Text style={s.settingsValue} numberOfLines={1}>
                  {apiKey ? `${apiKey.slice(0, 6)}•••${apiKey.slice(-4)}` : 'Not set'}
                </Text>
                {keyCopied ? <Check size={14} color={tokens.success} /> : <Copy size={14} color={tokens.white20} />}
              </Pressable>
              <View style={s.divider} />
              <SettingsRow
                icon={<RefreshCw size={16} color={tokens.warning} />}
                label="Rotate Key"
                onPress={handleRotateKey}
              />
            </GlassCard>
          </Animated.View>

          {/* ── Sign Out ──────────────────────────────────────────────────── */}
          <Animated.View entering={FadeInDown.delay(300).duration(400)} style={{ marginTop: 8 }}>
            <HapticButton variant="ghost" size="md" fullWidth onPress={handleLogout}>
              <LogOut size={16} color={tokens.accent} />
              <Text style={s.logoutText}>Sign Out</Text>
            </HapticButton>
          </Animated.View>

          {/* ── Footer ────────────────────────────────────────────────────── */}
          <Pressable onPress={() => Clipboard.setStringAsync(`Lineage Agent v${APP_VERSION}`)}>
            <Text style={s.appVersion}>Lineage Agent v{APP_VERSION} · Preview</Text>
          </Pressable>

        </ScrollView>
      </View>

      {/* Sheets */}
      <EditProfileSheet visible={editVisible} onClose={() => setEditVisible(false)} />
      {walletAddr && (
        <>
          <ReceiveSheet visible={receiveVisible} onClose={() => setReceiveVisible(false)} address={walletAddr} />
          <SendSheet visible={sendVisible} onClose={() => setSendVisible(false)} walletAddress={walletAddr} balance={solBalance} signAndSend={handleSignAndSend} onSuccess={handleSendSuccess} />
        </>
      )}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.bgMain },
  safe: { flex: 1, paddingHorizontal: tokens.spacing.screenPadding },
  content: { gap: 12 },
  centerContent: { flex: 1, justifyContent: 'center' },

  // Hero
  heroCard: { alignItems: 'center', paddingTop: 28, paddingBottom: 20, overflow: 'hidden' },
  heroGlow: {
    position: 'absolute', top: -40, left: '25%', right: '25%', height: 80,
    borderRadius: 40, opacity: 0.08,
  },
  avatarWrap: { position: 'relative', marginBottom: 14 },
  avatar: {
    width: 88, height: 88, borderRadius: 44,
    borderWidth: 2.5, alignItems: 'center', justifyContent: 'center',
  },
  avatarImg: { width: 88, height: 88, borderRadius: 44, borderWidth: 2.5 },
  avatarLetter: { fontFamily: 'Lexend-Bold', fontSize: 32 },
  cameraOverlay: {
    position: 'absolute', bottom: 0, right: 0,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.6)', borderWidth: 2, borderColor: tokens.bgMain,
    alignItems: 'center', justifyContent: 'center',
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroName: { fontFamily: 'Lexend-Bold', fontSize: tokens.font.sectionHeader, color: tokens.white100 },
  heroHandle: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.small, color: tokens.textTertiary, marginTop: 2 },
  heroMeta: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  planPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 3, borderRadius: tokens.radius.pill, borderWidth: 1 },
  planPillText: { fontFamily: 'Lexend-Bold', fontSize: tokens.font.tiny, letterSpacing: 0.5 },
  memberSince: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.textTertiary },

  // Quick stats
  quickStats: {
    flexDirection: 'row', alignItems: 'center', width: '100%',
    marginTop: 18, paddingTop: 14,
    borderTopWidth: 1, borderTopColor: tokens.borderSubtle,
  },
  quickStat: { flex: 1, alignItems: 'center', gap: 2 },
  quickStatVal: { fontFamily: 'Lexend-Bold', fontSize: tokens.font.subheading, color: tokens.white100 },
  quickStatLabel: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.textTertiary },
  quickStatDivider: { width: 1, height: 24, backgroundColor: tokens.borderSubtle },

  // Plan
  planCard: { gap: 14 },
  planHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  planIconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  planTitle: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.subheading, color: tokens.white100 },
  planExpiry: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.textTertiary, marginTop: 2 },
  upgradeBtnText: { fontFamily: 'Lexend-Bold', fontSize: tokens.font.small, color: tokens.white100, letterSpacing: 0.3 },
  benefitsList: { gap: 6 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  benefitText: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.small, color: tokens.white60 },
  usageBars: { gap: 10, marginTop: 2 },

  // Reputation
  repCard: { gap: 14 },
  repRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  repInfo: { flex: 1, gap: 4 },
  repHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  repTitle: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.body, color: tokens.white100 },
  repSub: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.small, color: tokens.textTertiary, lineHeight: 18 },

  // Achievements
  achieveSection: { gap: 8, marginTop: 2 },
  achieveTitle: { fontFamily: 'Lexend-Medium', fontSize: tokens.font.tiny, color: tokens.textTertiary, letterSpacing: 0.3 },
  achieveGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  achieveBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: tokens.radius.pill, borderWidth: 1,
    borderColor: tokens.borderSubtle, backgroundColor: tokens.bgGlass8,
  },
  achieveLocked: { opacity: 0.4 },
  achieveLabel: { fontFamily: 'Lexend-Medium', fontSize: 10, color: tokens.white80, letterSpacing: 0.2 },

  // Recent scans
  recentSection: { gap: 4, marginTop: 4, paddingTop: 10, borderTopWidth: 1, borderTopColor: tokens.borderSubtle },
  recentSectionTitle: { fontFamily: 'Lexend-Medium', fontSize: tokens.font.tiny, color: tokens.textTertiary, letterSpacing: 0.3 },
  recentRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  recentName: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.body, color: tokens.white60, flex: 1 },
  viewAllRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 6 },
  viewAllText: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.small, color: tokens.secondary },

  // Settings
  settingsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  settingsIcon: {
    width: 34, height: 34, borderRadius: 10, backgroundColor: tokens.bgGlass8,
    alignItems: 'center', justifyContent: 'center',
  },
  settingsLabel: { fontFamily: 'Lexend-Medium', fontSize: tokens.font.body, color: tokens.white80, flex: 1 },
  settingsValue: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.small, color: tokens.textTertiary, maxWidth: 120 },
  divider: { height: 1, backgroundColor: tokens.borderSubtle, marginVertical: 4 },

  // Logout
  logoutText: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.body, color: tokens.accent },
  appVersion: {
    fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny,
    color: tokens.white20, textAlign: 'center', marginTop: 8,
  },

  // Unauth
  noAuthCard: { alignItems: 'center', paddingVertical: 32 },
  noAuthIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: `${tokens.white100}08`, borderWidth: 1, borderColor: tokens.borderSubtle,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  noAuthTitle: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.subheading, color: tokens.white60, marginBottom: 8 },
  noAuthSub: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.body, color: tokens.textTertiary, textAlign: 'center', lineHeight: 22, paddingHorizontal: 16 },
  btnText: { fontFamily: 'Lexend-Bold', fontSize: tokens.font.body, color: tokens.white100 },
});
