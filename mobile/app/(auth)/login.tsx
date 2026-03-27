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
  Lock,
} from 'lucide-react-native';
import { useLoginWithEmail, usePrivy } from '@privy-io/expo';
import type { User } from '@privy-io/api-types';
import { HapticButton } from '../../src/components/ui/HapticButton';
import { tokens } from '../../src/theme/tokens';
import { syncPrivyUser } from '../../src/lib/privy-auth';

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractFromLinkedAccounts(user: User) {
  let walletAddress: string | undefined;
  let emailAddress: string | undefined;
  for (const acct of user.linked_accounts) {
    if (!emailAddress && acct.type === 'email' && 'address' in acct) emailAddress = acct.address;
    if (!walletAddress && acct.type === 'wallet' && 'chain_type' in acct && acct.chain_type === 'solana') walletAddress = acct.address;
  }
  return { walletAddress, emailAddress };
}

async function handlePrivyLoginSuccess(user: User) {
  const { walletAddress, emailAddress } = extractFromLinkedAccounts(user);
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

  const { sendCode, loginWithCode, state: emailState } = useLoginWithEmail({
    onLoginSuccess: (user) => { handlePrivyLoginSuccess(user); },
    onError: (err) => { Alert.alert('Login failed', err?.message ?? 'Something went wrong.'); },
  });

  const { logout: privyLogout, isReady: privyReady } = usePrivy();

  // Force-clear Privy session on mount
  useEffect(() => {
    const clearSession = async () => {
      try { await privyLogout(); } catch {}
      await new Promise((r) => setTimeout(r, 1500));
    };
    if (privyReady) clearSession();
    return () => {};
  }, [privyReady, privyLogout]);

  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [otpFocused, setOtpFocused] = useState(false);

  // Resend countdown
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const startCooldown = useCallback(() => {
    setResendCooldown(30);
    clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) { clearInterval(cooldownRef.current); return 0; }
        return prev - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => () => clearInterval(cooldownRef.current), []);

  const handleSendOtp = useCallback(async () => {
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes('@')) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }
    try { await privyLogout(); } catch {}
    await new Promise((r) => setTimeout(r, 1500));

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await sendCode({ email: trimmed });
        setOtpSent(true);
        startCooldown();
        return;
      } catch (err: any) {
        const msg = err?.message ?? '';
        if (msg.includes('Already logged in') && attempt < 2) {
          try { await privyLogout(); } catch {}
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        Alert.alert('Error', msg || 'Could not send verification code.');
        return;
      }
    }
  }, [email, sendCode, privyLogout, startCooldown]);

  const handleResend = useCallback(async () => {
    if (resendCooldown > 0) return;
    try { await privyLogout(); } catch {}
    await new Promise((r) => setTimeout(r, 1000));
    try {
      await sendCode({ email: email.trim() });
      startCooldown();
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Could not resend code.');
    }
  }, [email, sendCode, privyLogout, resendCooldown, startCooldown]);

  const handleVerifyOtp = useCallback(async () => {
    const trimmed = otpCode.trim();
    if (trimmed.length < 4) {
      Alert.alert('Invalid code', 'Please enter the verification code from your email.');
      return;
    }
    try {
      await loginWithCode({ code: trimmed, email: email.trim() });
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Invalid verification code.');
    }
  }, [otpCode, email, loginWithCode]);

  const handleSkip = useCallback(() => { router.replace('/(tabs)/radar'); }, []);

  return (
    <View style={s.container}>
      <KeyboardAvoidingView style={s.kav} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={[s.content, { paddingTop: Math.max(insets.top + 12, 36), paddingBottom: Math.max(insets.bottom + 24, 40) }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Back */}
          <Animated.View entering={FadeIn.delay(100).duration(400)}>
            <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={12}>
              <ArrowLeft size={20} color={tokens.white60} strokeWidth={2} />
            </Pressable>
          </Animated.View>

          {/* Header */}
          <Animated.View entering={FadeInDown.delay(150).duration(500)} style={s.header}>
            <View style={s.headerIcon}>
              <ShieldCheck size={22} color={tokens.secondary} strokeWidth={2} />
            </View>
            <Text style={s.headerTitle}>Welcome back</Text>
            <Text style={s.headerSubtitle}>
              Enter your email to receive a secure sign-in code. No password needed.
            </Text>
          </Animated.View>

          {/* ── Step 1: Email ─────────────────────────────────────────── */}
          {!otpSent ? (
            <Animated.View entering={FadeInDown.delay(300).duration(400)} style={s.formSection}>
              <View style={[s.inputRow, emailFocused && s.inputRowFocused]}>
                <Mail size={18} color={emailFocused ? tokens.secondary : tokens.textTertiary} strokeWidth={1.5} />
                <TextInput
                  style={s.input}
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
                variant="primary"
                size="lg"
                fullWidth
                loading={emailState.status === 'sending-code'}
                onPress={handleSendOtp}
              >
                <Text style={s.ctaBtnText}>Continue</Text>
                <ChevronRight size={18} color={tokens.white100} strokeWidth={2.5} />
              </HapticButton>

              {/* Trust badge */}
              <View style={s.trustRow}>
                <Lock size={11} color={tokens.textTertiary} strokeWidth={1.5} />
                <Text style={s.trustText}>Secure & encrypted · No password needed</Text>
              </View>
            </Animated.View>

          ) : (
            /* ── Step 2: OTP ──────────────────────────────────────────── */
            <Animated.View entering={FadeInDown.duration(400)} style={s.formSection}>
              <View style={s.otpSentBanner}>
                <Smartphone size={14} color={tokens.success} strokeWidth={2} />
                <Text style={s.otpSentText}>Code sent to {email.trim()}</Text>
              </View>

              <View style={[s.inputRow, otpFocused && s.inputRowFocused]}>
                <ShieldCheck size={18} color={otpFocused ? tokens.secondary : tokens.textTertiary} strokeWidth={1.5} />
                <TextInput
                  style={[s.input, s.otpInput]}
                  value={otpCode}
                  onChangeText={setOtpCode}
                  placeholder="000000"
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
                <Text style={s.ctaBtnText}>Verify & Sign In</Text>
              </HapticButton>

              {/* Resend / change email */}
              <View style={s.otpActions}>
                <Pressable onPress={handleResend} disabled={resendCooldown > 0} hitSlop={8}>
                  <Text style={[s.otpActionText, resendCooldown > 0 && s.otpActionDisabled]}>
                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
                  </Text>
                </Pressable>
                <View style={s.otpActionDot} />
                <Pressable onPress={() => { setOtpSent(false); setOtpCode(''); }} hitSlop={8}>
                  <Text style={s.otpActionText}>Change email</Text>
                </Pressable>
              </View>
            </Animated.View>
          )}

          {/* Skip */}
          <Animated.View entering={FadeInDown.delay(500).duration(400)} style={s.skipSection}>
            <Pressable onPress={handleSkip} hitSlop={8}>
              <Text style={s.skipText}>Continue without account</Text>
            </Pressable>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.bgMain },
  kav: { flex: 1 },
  content: { paddingHorizontal: tokens.spacing.screenPadding + 4 },

  // Back
  backBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: tokens.bgGlass8, borderWidth: 1, borderColor: tokens.borderSubtle,
    alignItems: 'center', justifyContent: 'center', marginBottom: 24,
  },

  // Header
  header: { marginBottom: 32 },
  headerIcon: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: `${tokens.secondary}12`, borderWidth: 1, borderColor: `${tokens.secondary}25`,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  headerTitle: {
    fontFamily: 'Lexend-Bold', fontSize: 28, color: tokens.white100,
    marginBottom: 8, letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontFamily: 'Lexend-Regular', fontSize: tokens.font.body,
    color: tokens.textTertiary, lineHeight: 22,
  },

  // Form
  formSection: { gap: 14, marginBottom: 28 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: tokens.bgGlass, borderRadius: tokens.radius.md,
    borderWidth: 1.5, borderColor: tokens.borderSubtle,
    paddingHorizontal: 16, paddingVertical: 16,
  },
  inputRowFocused: {
    borderColor: `${tokens.secondary}60`,
    backgroundColor: tokens.bgGlass8,
  },
  input: {
    flex: 1, fontFamily: 'Lexend-Regular', fontSize: tokens.font.body,
    color: tokens.white100, padding: 0,
  },
  otpInput: {
    letterSpacing: 6, fontSize: 22, fontFamily: 'Lexend-Bold', textAlign: 'center',
  },
  ctaBtnText: {
    fontFamily: 'Lexend-Bold', fontSize: tokens.font.subheading,
    color: tokens.white100, letterSpacing: 0.3,
  },

  // Trust
  trustRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, marginTop: 2,
  },
  trustText: {
    fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny,
    color: tokens.textTertiary, letterSpacing: 0.2,
  },

  // OTP sent
  otpSentBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: `${tokens.success}10`, borderWidth: 1, borderColor: `${tokens.success}20`,
    borderRadius: tokens.radius.sm, paddingHorizontal: 14, paddingVertical: 10,
  },
  otpSentText: {
    fontFamily: 'Lexend-Regular', fontSize: tokens.font.small,
    color: tokens.success, flex: 1,
  },
  otpActions: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
  },
  otpActionText: {
    fontFamily: 'Lexend-Medium', fontSize: tokens.font.small, color: tokens.secondary,
  },
  otpActionDisabled: { color: tokens.textTertiary },
  otpActionDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: tokens.white20 },

  // Skip
  skipSection: { alignItems: 'center', marginTop: 8 },
  skipText: {
    fontFamily: 'Lexend-Regular', fontSize: tokens.font.small, color: tokens.white60,
  },
});
