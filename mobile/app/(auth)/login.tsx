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
import { useLoginWithEmail, usePrivy } from '@privy-io/expo';
import type { User } from '@privy-io/api-types';
import { HapticButton } from '../../src/components/ui/HapticButton';
import { tokens } from '../../src/theme/tokens';
import { syncPrivyUser } from '../../src/lib/privy-auth';
// External wallet auth available but UI removed for now
// import { useExternalWalletAuth, type WalletBrandId } from '../../src/hooks/useExternalWalletAuth';

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
  console.log('[login] handlePrivyLoginSuccess:', JSON.stringify({ id: user.id, walletAddress, emailAddress }));
  // Wallet creation is handled by WalletAutoCreate in _layout.tsx (global, after login)
  try {
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
  } catch (err: any) {
    Alert.alert('Sync Error', err?.message ?? 'Could not sync your account.');
  }
}

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

  // ── Privy hooks (wallet creation handled by WalletAutoCreate in _layout.tsx) ──
  const { user: privyUser, logout: privyLogout, isReady: privyReady } = usePrivy();

  // External wallet auth kept as import for future use but UI removed

  // ── Force-clear Privy session on EVERY mount ──────────────────────────────
  useEffect(() => {
    const clearSession = async () => {
      try {
        await privyLogout();
      } catch {
        // Privy throws if not logged in — that's fine
      }
      // Wait for Privy SDK to fully settle (createOnLogin:'off' = faster)
      await new Promise((r) => setTimeout(r, 1500));
    };
    if (privyReady) {
      clearSession();
    }
    return () => {};
  }, [privyReady, privyLogout]);

  // ── Email OTP state ─────────────────────────────────────────────────────
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [otpFocused, setOtpFocused] = useState(false);

  // ── Email OTP handlers ──────────────────────────────────────────────────

  const handleSendOtp = useCallback(async () => {
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes('@')) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }

    // ALWAYS force logout before sending code — never trust cached state
    try {
      await privyLogout();
    } catch {
      // Not logged in — that's the desired state
    }
    // Critical: wait for Privy SDK to fully process the logout
    await new Promise((r) => setTimeout(r, 1500));

    // Attempt to send code with up to 3 retries
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await sendCode({ email: trimmed });
        setOtpSent(true);
        return;
      } catch (err: any) {
        const msg = err?.message ?? '';
        if (msg.includes('Already logged in') && attempt < 2) {
          // Force another logout cycle and wait longer
          try { await privyLogout(); } catch {}
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        console.error('[login] sendCode error:', err);
        Alert.alert('Error', msg || 'Could not send verification code.');
        return;
      }
    }
  }, [email, sendCode, privyLogout]);

  const handleVerifyOtp = useCallback(async () => {
    const trimmed = otpCode.trim();
    if (trimmed.length < 4) {
      Alert.alert('Invalid code', 'Please enter the verification code from your email.');
      return;
    }
    try {
      await loginWithCode({ code: trimmed, email: email.trim() });
    } catch (err: any) {
      console.error('[login] loginWithCode error:', err);
      Alert.alert('Error', err?.message ?? 'Invalid verification code.');
    }
  }, [otpCode, email, loginWithCode]);

  // ── Skip ──────────────────────────────────────────────────────────────────

  const handleSkip = useCallback(() => {
    router.replace('/(tabs)/radar');
  }, []);

  return (
    <View style={styles.container}>
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
            <Text style={styles.headerTitle}>Sign In</Text>
            <Text style={styles.headerSubtitle}>
              Sign in with email to get started, or connect an external Solana wallet.
            </Text>
          </Animated.View>

          {/* ── Email OTP section (primary) ──────────────────────────────── */}
          <Animated.View entering={FadeInDown.delay(300).duration(400)} style={styles.emailSection}>
            <View style={styles.emailTitleRow}>
              <Mail size={14} color={tokens.secondary} strokeWidth={2} />
              <Text style={styles.emailSectionTitle}>Email Sign In</Text>
            </View>

            {!otpSent ? (
              <>
                {/* Email input */}
                <View style={[styles.inputRow, emailFocused && styles.inputRowFocused]}>
                  <Mail size={16} color={emailFocused ? tokens.secondary : tokens.textTertiary} strokeWidth={1.5} />
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
                    onFocus={() => setEmailFocused(true)}
                    onBlur={() => setEmailFocused(false)}
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
                <View style={[styles.inputRow, otpFocused && styles.inputRowFocused]}>
                  <ShieldCheck size={16} color={otpFocused ? tokens.secondary : tokens.textTertiary} strokeWidth={1.5} />
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
                    onFocus={() => setOtpFocused(true)}
                    onBlur={() => setOtpFocused(false)}
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
          <Animated.View entering={FadeInDown.delay(750).duration(400)} style={styles.skipSection}>
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
    color: tokens.textTertiary,
    lineHeight: 21,
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
    color: tokens.textTertiary,
    letterSpacing: 0.5,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: tokens.bgGlass,
    borderRadius: tokens.radius.sm,
    borderWidth: 1.5,
    borderColor: tokens.borderSubtle,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  inputRowFocused: {
    borderColor: `${tokens.secondary}60`,
    backgroundColor: tokens.bgGlass8,
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
    color: tokens.textTertiary,
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
