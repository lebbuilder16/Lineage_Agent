import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  Linking,
  Pressable,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import {
  ShieldCheck,
  Mail,
  Lock,
  Wallet,
  ChevronRight,
  ArrowLeft,
  Eye,
  EyeOff,
} from 'lucide-react-native';
import { AuroraBackground } from '../../src/components/ui/AuroraBackground';
import { HapticButton } from '../../src/components/ui/HapticButton';
import { tokens } from '../../src/theme/tokens';
import { useAuthStore } from '../../src/store/auth';
import { authLogin, getMe } from '../../src/lib/api';
import type { WalletProvider } from '../../src/types/api';

// ── Wallet provider configs ──────────────────────────────────────────────────

const BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'https://lineage-agent.fly.dev').replace(/\/$/, '');

interface WalletOption {
  id: WalletProvider;
  name: string;
  color: string;
  bgColor: string;
  deeplink: string;
  installUrl: string;
  letter: string;
}

const WALLETS: WalletOption[] = [
  {
    id: 'phantom',
    name: 'Phantom',
    color: '#AB9FF2',
    bgColor: 'rgba(171, 159, 242, 0.12)',
    deeplink: `https://phantom.app/ul/browse/${BASE_URL}/auth/phantom`,
    installUrl: 'https://phantom.app/download',
    letter: 'P',
  },
  {
    id: 'solflare',
    name: 'Solflare',
    color: '#FC7227',
    bgColor: 'rgba(252, 114, 39, 0.12)',
    deeplink: `https://solflare.com/ul/browse/${BASE_URL}/auth/solflare`,
    installUrl: 'https://solflare.com/download',
    letter: 'S',
  },
  {
    id: 'backpack',
    name: 'Backpack',
    color: '#E33E3F',
    bgColor: 'rgba(227, 62, 63, 0.12)',
    deeplink: `https://backpack.app/ul/browse/${BASE_URL}/auth/backpack`,
    installUrl: 'https://backpack.app/download',
    letter: 'B',
  },
];

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const setApiKey = useAuthStore((s) => s.setApiKey);
  const setUser = useAuthStore((s) => s.setUser);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [connectingWallet, setConnectingWallet] = useState<WalletProvider | null>(null);

  // ── Wallet connect ──────────────────────────────────────────────────────────

  const handleWalletConnect = useCallback(async (wallet: WalletOption) => {
    setConnectingWallet(wallet.id);
    try {
      const canOpen = await Linking.canOpenURL(wallet.deeplink);
      if (canOpen) {
        await Linking.openURL(wallet.deeplink);
      } else {
        Alert.alert(
          wallet.name,
          `${wallet.name} wallet is not installed. Install it to connect.`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Install', onPress: () => Linking.openURL(wallet.installUrl) },
          ],
        );
      }
    } catch {
      Alert.alert('Error', `Could not connect to ${wallet.name} wallet.`);
    } finally {
      setConnectingWallet(null);
    }
  }, []);

  // ── Email login ─────────────────────────────────────────────────────────────

  const handleEmailLogin = useCallback(async () => {
    const trimmedEmail = email.trim();
    const trimmedPw = password.trim();

    if (!trimmedEmail || !trimmedPw) {
      Alert.alert('Missing fields', 'Please enter both email and password.');
      return;
    }

    setLoading(true);
    try {
      const result = await authLogin(trimmedEmail, { email: trimmedEmail });
      if (result.api_key) {
        setApiKey(result.api_key);
        try {
          const me = await getMe(result.api_key);
          setUser(me);
        } catch { /* profile fetch is optional */ }
        router.replace('/(tabs)/radar');
      } else {
        Alert.alert('Login failed', 'Invalid credentials. Please try again.');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      Alert.alert('Login failed', msg);
    } finally {
      setLoading(false);
    }
  }, [email, password, setApiKey, setUser]);

  // ── Skip ────────────────────────────────────────────────────────────────────

  const handleSkip = useCallback(() => {
    router.replace('/(tabs)/radar');
  }, []);

  return (
    <View style={styles.container}>
      <AuroraBackground />
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            {
              paddingTop: Math.max(insets.top + 12, 36),
              paddingBottom: Math.max(insets.bottom + 24, 40),
            },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Back button */}
          <Animated.View entering={FadeIn.delay(100).duration(400)}>
            <Pressable
              onPress={() => router.back()}
              style={styles.backBtn}
              hitSlop={12}
            >
              <ArrowLeft size={20} color={tokens.white60} strokeWidth={2} />
            </Pressable>
          </Animated.View>

          {/* Header */}
          <Animated.View entering={FadeInDown.delay(150).duration(500)} style={styles.header}>
            <View style={styles.headerIconRow}>
              <View style={styles.headerIcon}>
                <ShieldCheck size={20} color={tokens.secondary} strokeWidth={2} />
              </View>
            </View>
            <Text style={styles.headerTitle}>Connect Wallet</Text>
            <Text style={styles.headerSubtitle}>
              Link your Solana wallet to sync your intel node and unlock full features.
            </Text>
          </Animated.View>

          {/* Wallet options */}
          <Animated.View entering={FadeInDown.delay(300).duration(500)} style={styles.walletGrid}>
            {WALLETS.map((wallet, i) => (
              <Animated.View
                key={wallet.id}
                entering={FadeInDown.delay(350 + i * 60).duration(400)}
              >
                <Pressable
                  onPress={() => handleWalletConnect(wallet)}
                  disabled={connectingWallet !== null}
                  style={({ pressed }) => [
                    styles.walletCard,
                    pressed && styles.walletCardPressed,
                    connectingWallet === wallet.id && styles.walletCardActive,
                  ]}
                >
                  <View style={[styles.walletIcon, { backgroundColor: wallet.bgColor }]}>
                    <Text style={[styles.walletLetter, { color: wallet.color }]}>
                      {wallet.letter}
                    </Text>
                  </View>
                  <View style={styles.walletInfo}>
                    <Text style={styles.walletName}>{wallet.name}</Text>
                    <Text style={styles.walletHint}>
                      {connectingWallet === wallet.id ? 'Connecting...' : 'Tap to connect'}
                    </Text>
                  </View>
                  <ChevronRight size={16} color={tokens.white20} strokeWidth={2} />
                </Pressable>
              </Animated.View>
            ))}
          </Animated.View>

          {/* Divider */}
          <Animated.View entering={FadeInDown.delay(550).duration(400)} style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.dividerLine} />
          </Animated.View>

          {/* Email section */}
          <Animated.View entering={FadeInDown.delay(600).duration(400)} style={styles.emailSection}>
            <Text style={styles.emailSectionTitle}>Email Login</Text>

            {/* Email field */}
            <View style={styles.inputRow}>
              <Mail size={16} color={tokens.white35} strokeWidth={1.5} />
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="agent@solana.com"
                placeholderTextColor={tokens.white20}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                returnKeyType="next"
              />
            </View>

            {/* Password field */}
            <View style={styles.inputRow}>
              <Lock size={16} color={tokens.white35} strokeWidth={1.5} />
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                placeholderTextColor={tokens.white20}
                secureTextEntry={!showPassword}
                returnKeyType="done"
                onSubmitEditing={handleEmailLogin}
              />
              <Pressable onPress={() => setShowPassword((p) => !p)} hitSlop={8}>
                {showPassword
                  ? <EyeOff size={16} color={tokens.white35} strokeWidth={1.5} />
                  : <Eye size={16} color={tokens.white35} strokeWidth={1.5} />
                }
              </Pressable>
            </View>

            {/* Sign In button */}
            <HapticButton
              variant="ghost"
              size="lg"
              fullWidth
              loading={loading}
              onPress={handleEmailLogin}
            >
              <Text style={styles.signInText}>Sign In</Text>
              <ChevronRight size={16} color={tokens.white80} strokeWidth={2} />
            </HapticButton>
          </Animated.View>

          {/* Skip */}
          <Animated.View entering={FadeInDown.delay(700).duration(400)} style={styles.skipSection}>
            <Pressable onPress={handleSkip} hitSlop={8}>
              <Text style={styles.skipText}>Continue without account</Text>
            </Pressable>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.bgMain },
  kav: { flex: 1 },
  content: {
    paddingHorizontal: tokens.spacing.screenPadding + 4,
    gap: 0,
  },

  // Back
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: tokens.bgGlass8,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },

  // Header
  header: { marginBottom: 24 },
  headerIconRow: { marginBottom: 14 },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: `${tokens.secondary}12`,
    borderWidth: 1,
    borderColor: `${tokens.secondary}25`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: 'Lexend-Bold',
    fontSize: 26,
    color: tokens.white100,
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.body,
    color: tokens.white35,
    lineHeight: 21,
  },

  // Wallet cards
  walletGrid: { gap: 8, marginBottom: 20 },
  walletCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: tokens.bgGlass,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  walletCardPressed: {
    backgroundColor: tokens.bgGlass8,
  },
  walletCardActive: {
    borderColor: tokens.borderActive,
    backgroundColor: tokens.bgGlass8,
  },
  walletIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletLetter: {
    fontFamily: 'Lexend-Bold',
    fontSize: 18,
  },
  walletInfo: { flex: 1 },
  walletName: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.subheading,
    color: tokens.white100,
    marginBottom: 2,
  },
  walletHint: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white35,
  },

  // Divider
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: tokens.borderSubtle,
  },
  dividerText: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.tiny,
    color: tokens.white20,
    letterSpacing: 2,
  },

  // Email section
  emailSection: { gap: 10, marginBottom: 24 },
  emailSectionTitle: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.small,
    color: tokens.white35,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: tokens.bgGlass,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  input: {
    flex: 1,
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.body,
    color: tokens.white100,
    padding: 0,
  },
  signInText: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.subheading,
    color: tokens.white100,
  },

  // Skip
  skipSection: { alignItems: 'center' },
  skipText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white20,
    textDecorationLine: 'underline',
    textDecorationColor: tokens.white10,
  },
});
