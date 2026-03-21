import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import {
  ShieldCheck,
  Mail,
  ChevronRight,
  ArrowLeft,
  Smartphone,
} from 'lucide-react-native';
import { useLoginWithEmail, useLoginWithSiws } from '@privy-io/expo';
import {
  usePhantomDeeplinkWalletConnector,
  useBackpackDeeplinkWalletConnector,
  useDeeplinkWalletConnector,
} from '@privy-io/expo/connectors';
import type { User } from '@privy-io/api-types';
import { AuroraBackground } from '../../src/components/ui/AuroraBackground';
import { HapticButton } from '../../src/components/ui/HapticButton';
import { tokens } from '../../src/theme/tokens';
import { syncPrivyUser } from '../../src/lib/privy-auth';

// ── Constants ────────────────────────────────────────────────────────────────

const APP_URL = 'https://lineageagent.app';
const REDIRECT_URI = '/';

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractFromLinkedAccounts(user: User) {
  let walletAddress: string | undefined;
  let emailAddress: string | undefined;

  for (const acct of user.linked_accounts) {
    if (!emailAddress && acct.type === 'email' && 'address' in acct) {
      emailAddress = acct.address;
    }
    if (!walletAddress && acct.type === 'wallet' && 'chain_type' in acct && acct.chain_type === 'solana') {
      walletAddress = acct.address;
    }
  }

  return { walletAddress, emailAddress };
}

async function handlePrivyLoginSuccess(user: User) {
  const { walletAddress, emailAddress } = extractFromLinkedAccounts(user);
  const ok = await syncPrivyUser({
    id: user.id,
    wallet: walletAddress ? { address: walletAddress } : null,
    email: emailAddress ? { address: emailAddress } : null,
  });
  if (ok) {
    router.replace('/(tabs)/radar');
  } else {
    Alert.alert('Error', 'Could not sync your account. Please try again.');
  }
}

// ── Wallet brand configs ─────────────────────────────────────────────────────

interface WalletBrand {
  id: 'phantom' | 'solflare' | 'backpack';
  name: string;
  color: string;
  bgColor: string;
  letter: string;
}

const WALLET_BRANDS: WalletBrand[] = [
  {
    id: 'phantom',
    name: 'Phantom',
    color: '#AB9FF2',
    bgColor: 'rgba(171, 159, 242, 0.12)',
    letter: 'P',
  },
  {
    id: 'solflare',
    name: 'Solflare',
    color: '#FC7227',
    bgColor: 'rgba(252, 114, 39, 0.12)',
    letter: 'S',
  },
  {
    id: 'backpack',
    name: 'Backpack',
    color: '#E33E3F',
    bgColor: 'rgba(227, 62, 63, 0.12)',
    letter: 'B',
  },
];

// ── Login Screen ─────────────────────────────────────────────────────────────

export default function LoginScreen() {
  const insets = useSafeAreaInsets();

  // ── Email OTP login ───────────────────────────────────────────────────────
  const { sendCode, loginWithCode, state: emailState } = useLoginWithEmail({
    onLoginSuccess: (user) => { handlePrivyLoginSuccess(user); },
    onError: (err) => {
      Alert.alert('Login failed', err?.message ?? 'Something went wrong.');
    },
  });

  // ── SIWS (Sign In With Solana) ────────────────────────────────────────────
  const { generateMessage, login: siwsLogin } = useLoginWithSiws();

  // ── Privy deep-link wallet connectors ─────────────────────────────────────
  const phantom = usePhantomDeeplinkWalletConnector({
    appUrl: APP_URL,
    redirectUri: REDIRECT_URI,
  });

  const backpack = useBackpackDeeplinkWalletConnector({
    appUrl: APP_URL,
    redirectUri: REDIRECT_URI,
  });

  // Solflare uses the generic connector
  const solflare = useDeeplinkWalletConnector({
    appUrl: APP_URL,
    redirectUri: REDIRECT_URI,
    baseUrl: 'https://solflare.com',
    encryptionPublicKeyName: 'solflare_encryption_public_key',
  });

  const connectors = { phantom, solflare, backpack };

  // ── State ─────────────────────────────────────────────────────────────────
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [connectingWallet, setConnectingWallet] = useState<string | null>(null);

  // ── Watch for wallet connection completion (address populated after deep link return) ──
  const pendingWalletRef = useRef<'phantom' | 'solflare' | 'backpack' | null>(null);

  useEffect(() => {
    const brandId = pendingWalletRef.current;
    if (!brandId) return;

    const connector = connectors[brandId];
    if (!connector.isConnected || !connector.address) return;

    // Wallet just connected — complete SIWS flow
    pendingWalletRef.current = null;
    const walletAddress = connector.address;

    (async () => {
      try {
        // Generate SIWS message
        const { message } = await generateMessage({
          wallet: { address: walletAddress },
          from: {
            domain: 'lineageagent.app',
            uri: 'https://lineageagent.app',
          },
        });

        // Ask wallet to sign the SIWS message
        const { signature } = await connector.signMessage(message);

        // Login with Privy
        const user = await siwsLogin({
          signature,
          message,
          wallet: { walletClientType: brandId, connectorType: 'deeplink' },
        });

        // Sync with backend
        await handlePrivyLoginSuccess(user);
      } catch (err: any) {
        const msg = err?.message || 'Wallet authentication failed.';
        if (!msg.includes('cancel') && !msg.includes('dismiss')) {
          Alert.alert('Auth failed', msg);
        }
      } finally {
        setConnectingWallet(null);
      }
    })();
  }, [phantom.isConnected, phantom.address, solflare.isConnected, solflare.address, backpack.isConnected, backpack.address]);

  // ── Email OTP flow ────────────────────────────────────────────────────────

  const handleSendOtp = useCallback(async () => {
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes('@')) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }
    try {
      await sendCode({ email: trimmed });
      setOtpSent(true);
    } catch {
      Alert.alert('Error', 'Could not send verification code.');
    }
  }, [email, sendCode]);

  const handleVerifyOtp = useCallback(async () => {
    const trimmed = otpCode.trim();
    if (trimmed.length < 4) {
      Alert.alert('Invalid code', 'Please enter the verification code from your email.');
      return;
    }
    try {
      await loginWithCode({ code: trimmed, email: email.trim() });
    } catch {
      Alert.alert('Error', 'Invalid verification code.');
    }
  }, [otpCode, email, loginWithCode]);

  // ── Wallet connect: initiate deep link, SIWS flow completes in useEffect above ─

  const handleWalletConnect = useCallback(async (brand: WalletBrand) => {
    setConnectingWallet(brand.id);
    pendingWalletRef.current = brand.id;
    const connector = connectors[brand.id];

    try {
      await connector.connect();
      // If connector already has address (auto-reconnect), the useEffect will fire.
      // Otherwise, we wait for the wallet deep link callback to populate address.
    } catch (err: any) {
      pendingWalletRef.current = null;
      setConnectingWallet(null);
      const msg = err?.message || 'Wallet connection failed.';
      if (!msg.includes('cancel') && !msg.includes('dismiss')) {
        Alert.alert('Connection failed', `Could not connect to ${brand.name}.`);
      }
    }
  }, [connectors]);

  // ── Skip ──────────────────────────────────────────────────────────────────

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
              Link your Solana wallet or sign in with email to access full features.
            </Text>
          </Animated.View>

          {/* Wallet options */}
          <Animated.View entering={FadeInDown.delay(300).duration(500)} style={styles.walletGrid}>
            {WALLET_BRANDS.map((wallet, i) => (
              <Animated.View
                key={wallet.id}
                entering={FadeInDown.delay(350 + i * 60).duration(400)}
              >
                <Pressable
                  onPress={() => handleWalletConnect(wallet)}
                  disabled={!!connectingWallet}
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
                  {connectingWallet === wallet.id ? (
                    <ActivityIndicator size="small" color={wallet.color} />
                  ) : (
                    <ChevronRight size={16} color={tokens.white20} strokeWidth={2} />
                  )}
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

          {/* Email OTP section */}
          <Animated.View entering={FadeInDown.delay(600).duration(400)} style={styles.emailSection}>
            <View style={styles.emailTitleRow}>
              <Mail size={14} color={tokens.secondary} strokeWidth={2} />
              <Text style={styles.emailSectionTitle}>Email Sign In</Text>
            </View>

            {!otpSent ? (
              <>
                {/* Email input */}
                <View style={styles.inputRow}>
                  <Mail size={16} color={tokens.white35} strokeWidth={1.5} />
                  <TextInput
                    style={styles.input}
                    value={email}
                    onChangeText={setEmail}
                    placeholder="you@email.com"
                    placeholderTextColor={tokens.white20}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    returnKeyType="done"
                    onSubmitEditing={handleSendOtp}
                  />
                </View>

                <HapticButton
                  variant="ghost"
                  size="lg"
                  fullWidth
                  loading={emailState.status === 'sending-code'}
                  onPress={handleSendOtp}
                >
                  <Text style={styles.signInText}>Send Verification Code</Text>
                  <ChevronRight size={16} color={tokens.white80} strokeWidth={2} />
                </HapticButton>
              </>
            ) : (
              <>
                {/* OTP sent confirmation */}
                <View style={styles.otpSentBanner}>
                  <Smartphone size={14} color={tokens.success} strokeWidth={2} />
                  <Text style={styles.otpSentText}>
                    Code sent to {email.trim()}
                  </Text>
                </View>

                {/* OTP code input */}
                <View style={styles.inputRow}>
                  <ShieldCheck size={16} color={tokens.white35} strokeWidth={1.5} />
                  <TextInput
                    style={[styles.input, styles.otpInput]}
                    value={otpCode}
                    onChangeText={setOtpCode}
                    placeholder="Enter code"
                    placeholderTextColor={tokens.white20}
                    keyboardType="number-pad"
                    maxLength={8}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={handleVerifyOtp}
                  />
                </View>

                <HapticButton
                  variant="primary"
                  size="lg"
                  fullWidth
                  loading={emailState.status === 'submitting-code'}
                  onPress={handleVerifyOtp}
                >
                  <Text style={styles.verifyBtnText}>Verify & Sign In</Text>
                </HapticButton>

                <Pressable
                  onPress={() => { setOtpSent(false); setOtpCode(''); }}
                  style={styles.resendRow}
                >
                  <Text style={styles.resendText}>Use a different email</Text>
                </Pressable>
              </>
            )}
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
  emailTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 4,
  },
  emailSectionTitle: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.small,
    color: tokens.white35,
    letterSpacing: 0.5,
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
  otpInput: {
    letterSpacing: 4,
    fontSize: tokens.font.sectionHeader,
    fontFamily: 'Lexend-SemiBold',
  },
  signInText: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.body,
    color: tokens.white100,
  },
  verifyBtnText: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.subheading,
    color: tokens.white100,
  },

  // OTP sent
  otpSentBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: `${tokens.success}10`,
    borderWidth: 1,
    borderColor: `${tokens.success}20`,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  otpSentText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.success,
    flex: 1,
  },
  resendRow: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  resendText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white35,
    textDecorationLine: 'underline',
    textDecorationColor: tokens.white10,
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
