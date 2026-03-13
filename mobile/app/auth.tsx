// app/auth.tsx
// Auth screen — Figma Make "Secure Access" design + Privy (email OTP) + Phantom Wallet deeplink

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import * as Linking from "expo-linking";
import Animated, {
  FadeIn,
  FadeInDown,
  useSharedValue,
  withTiming,
  useAnimatedStyle,
  withRepeat,
} from "react-native-reanimated";
import Svg, { Path, Circle, Polyline, Line, Rect } from "react-native-svg";
import { usePrivy, useLoginWithEmail } from "@privy-io/expo";
import { loginWithPrivy, getCurrentUser } from "@/src/lib/api";
import { sentryCaptureError } from "@/src/lib/sentry";
import { toast } from "@/src/lib/toast";
import { useAuthStore } from "@/src/store/auth";
import { HapticButton } from "@/src/components/ui/HapticButton";
import { aurora } from "@/src/theme/colors";
import { Fonts } from "@/src/theme/fonts";
import { LinearGradient } from "expo-linear-gradient";
import {
  buildPhantomConnectURL,
  buildPhantomUniversalConnectURL,
} from "@/src/lib/solanaWallet";

// ── Lucide-style SVG icons (inline, no dependency) ───────────────────────────
function ShieldCheckIcon({ size = 24, color = "#ADC8FF" }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <Polyline points="9 12 11 14 15 10" />
    </Svg>
  );
}
function WalletIcon({ size = 20, color = "#fff" }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
      <Line x1="1" y1="10" x2="23" y2="10" />
    </Svg>
  );
}
function MailIcon({ size = 18, color = "rgba(255,255,255,0.4)" }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <Polyline points="22,6 12,13 2,6" />
    </Svg>
  );
}
function ArrowRightIcon({ size = 18, color = "#ADC8FF" }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Line x1="5" y1="12" x2="19" y2="12" />
      <Polyline points="12 5 19 12 12 19" />
    </Svg>
  );
}
function FingerprintIcon({ size = 24, color = "#fff" }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M2 12C2 6.5 6.5 2 12 2a10 10 0 0 1 8 4" />
      <Path d="M5 19.5C5.5 18 6 15 6 12s1.6-4.5 4-5" />
      <Path d="M10 22a26.29 26.29 0 0 0 1.99-3.6" />
      <Path d="M14 13.87a4 4 0 0 0-.48-1.87" />
      <Path d="M17.75 12c.05-.17.17-3.38-2.25-5.5" />
      <Circle cx="12" cy="12" r="2" />
      <Path d="M14.89 19.2a8 8 0 0 1-1.15 2.8" />
      <Path d="M18.14 17.8a12 12 0 0 0 1.86-5.8" />
    </Svg>
  );
}

// Spinning fingerprint loader for wallet connect
function SpinningFingerprint() {
  const rotation = useSharedValue(0);
  useEffect(() => {
    rotation.value = withRepeat(withTiming(360, { duration: 1000 }), -1, false);
  }, []);
  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));
  return <Animated.View style={style}><FingerprintIcon size={24} color="#fff" /></Animated.View>;
}

export default function AuthScreen() {
  const { colors: _ } = useTheme();
  const setUser = useAuthStore((s) => s.setUser);
  const [loading, setLoading] = useState(false);
  const [hasBiometric, setHasBiometric] = useState(false);
  const [devPrivyId, setDevPrivyId] = useState("");
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [walletLoading, setWalletLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const authErrorRef = useRef<string | null>(null);
  const phantomTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resendIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Privy SDK
  // isReady: wait for Privy to initialise before allowing any auth attempt.
  // user: watch for Privy-side state change as a backup path for loginWithCode.
  const { isReady, user: privyAuthUser } = usePrivy();
  const { sendCode, loginWithCode, state: emailState } = useLoginWithEmail({
    // onLoginSuccess is deliberately omitted here — we use the return value of
    // loginWithCode() instead (see handleConnect below). Using both simultaneously
    // would call _handlePrivyUser twice, causing duplicate backend requests and
    // navigation races. (Privy Expo v0.7.0 type: loginWithCode → Promise<PrivyUser | undefined>)
    onError: (err) => {
      authErrorRef.current = err.message ?? "Please try again.";
    },
  });

  // ── Dedup guard — prevents _handlePrivyUser from being called twice
  // (can happen if loginWithCode() returns a user AND the backup privyAuthUser
  // effect fires in the same render cycle).
  const privyHandledRef = useRef(false);

  // Backup path: if loginWithCode() resolves but returns undefined (edge case in
  // older SDK versions), Privy still sets usePrivy().user. React to that change
  // while we're actively in an OTP loading state.
  useEffect(() => {
    if (!loading || !privyAuthUser) return;
    const emailAccount = (privyAuthUser.linked_accounts as any[])?.find(
      (a: any) => a.type === "email"
    );
    _handlePrivyUser(privyAuthUser.id, emailAccount?.address);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [privyAuthUser]);

  // Safety net: if emailState reaches 'done' but loading is still true after
  // 3 s, something went wrong — clear the spinner so the user can retry.
  useEffect(() => {
    if (emailState.status === "done" && loading) {
      const id = setTimeout(() => setLoading(false), 3000);
      return () => clearTimeout(id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailState.status]);

  const _handlePrivyUser = useCallback(
    async (privyId: string, email?: string) => {
      if (privyHandledRef.current) return; // prevent double-call
      privyHandledRef.current = true;
      setLoading(true);
      try {
        const user = await loginWithPrivy(privyId, undefined, email);
        await setUser(user);
        router.replace("/(tabs)");
      } catch (e: any) {
        privyHandledRef.current = false; // allow retry after error
        sentryCaptureError(e, { context: "auth_email" });
        Alert.alert("Connection failed", e.message ?? "Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [setUser]
  );

  useEffect(() => {
    checkBiometric();
    return () => {
      if (phantomTimeoutRef.current) clearTimeout(phantomTimeoutRef.current);
      if (resendIntervalRef.current) clearInterval(resendIntervalRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkBiometric = async () => {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    setHasBiometric(compatible && enrolled);

    const existingKey = await SecureStore.getItemAsync("lineage_api_key");
    if (!existingKey) return;

    if (compatible && enrolled) {
      // Gate silent restore behind biometric unlock
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Unlock Lineage Agent",
        fallbackLabel: "Enter PIN",
      });
      if (!result.success) return;
    }
    // No biometrics enrolled → restore session silently using the stored key
    try {
      const user = await getCurrentUser();
      await setUser(user);
      router.replace("/(tabs)");
    } catch {
      // Token expired or network error — stay on login screen
    }
  };

  const handlePhantomConnect = async () => {
    setWalletLoading(true);

    // Phantom callback is handled exclusively by the phantom-connect.tsx screen
    // (deep link route). This timeout is only a safety net if Phantom never
    // brings the app back.
    if (phantomTimeoutRef.current) clearTimeout(phantomTimeoutRef.current);
    phantomTimeoutRef.current = setTimeout(() => {
      setWalletLoading(false);
      Alert.alert("Connection timed out", "Phantom didn't respond. Please try again.");
      phantomTimeoutRef.current = null;
    }, 120_000);

    const deepUrl = await buildPhantomConnectURL("lineage");

    // Try the native phantom:// scheme first, fall back to universal link
    const canOpen = await Linking.canOpenURL(deepUrl).catch(() => false);

    try {
      if (canOpen) {
        await Linking.openURL(deepUrl);
      } else {
        // Universal link: also works as a web redirect on Android
        const universalUrl = await buildPhantomUniversalConnectURL("lineage");
        await Linking.openURL(universalUrl);
      }
    } catch {
      if (phantomTimeoutRef.current) {
        clearTimeout(phantomTimeoutRef.current);
        phantomTimeoutRef.current = null;
      }
      setWalletLoading(false);
      Alert.alert(
        "Phantom not found",
        "Please install the Phantom wallet app to connect with a Solana wallet."
      );
    }
  };

  const handleConnect = async () => {
    if (__DEV__ && devPrivyId.trim()) {
      await _handlePrivyUser(devPrivyId.trim());
      return;
    }

    setLoading(true);

    if (!otpSent) {
      // Step 1: send OTP to email
      const trimmedEmail = email.trim();
      if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmedEmail)) {
        Alert.alert("Invalid email", "Please enter a valid email address.");
        setLoading(false);
        return;
      }
      try {
        authErrorRef.current = null;
        await sendCode({ email: trimmedEmail });
        setOtpSent(true);
        toast.info("Code sent! Check your email.");
        // Start 30s resend cooldown
        setResendCooldown(30);
        if (resendIntervalRef.current) clearInterval(resendIntervalRef.current);
        resendIntervalRef.current = setInterval(() => {
          setResendCooldown((prev) => {
            if (prev <= 1) {
              clearInterval(resendIntervalRef.current!);
              resendIntervalRef.current = null;
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } catch (e: any) {
        const msg =
          authErrorRef.current ??
          e.message ??
          "Privy could not send the email code. Check spam and retry in a minute.";
        Alert.alert("Code not sent", msg);
      } finally {
        setLoading(false);
      }
    } else {
      // Step 2: verify OTP — keep loading=true on success so _handlePrivyUser
      // (triggered via emailState effect) takes over without a loading flicker.
      const trimmedCode = otpCode.trim();
      if (!trimmedCode) {
        Alert.alert("Code required", "Please enter the code from your email.");
        setLoading(false);
        return;
      }
      try {
        authErrorRef.current = null;
        privyHandledRef.current = false; // reset before each attempt
        // Official Privy Expo quickstart: always pass email to loginWithCode so
        // the SDK can match the OTP to the right session.
        const privyUser = await loginWithCode({ code: trimmedCode, email: email.trim() });
        if (privyUser?.id) {
          // Extract email from linked_accounts (PrivyUser has no top-level .email field)
          const emailAccount = (privyUser.linked_accounts as any[])?.find(
            (a: any) => a.type === "email"
          );
          _handlePrivyUser(privyUser.id, emailAccount?.address);
        }
        // If privyUser is undefined, the backup useEffect handles it via usePrivy().user
      } catch (e: any) {
        const msg =
          authErrorRef.current ??
          e.message ??
          "The code was rejected or expired. Request a new code and try again.";
        Alert.alert("Code invalid", msg);
        setLoading(false);
      }
    }
  };

  const handleResend = async () => {
    if (loading) return;
    setLoading(true);
    setOtpCode("");
    try {
      authErrorRef.current = null;
      await sendCode({ email: email.trim() });
      toast.info("New code sent! Check your email.");
      setResendCooldown(30);
      if (resendIntervalRef.current) clearInterval(resendIntervalRef.current);
      resendIntervalRef.current = setInterval(() => {
        setResendCooldown((prev) => {
          if (prev <= 1) {
            clearInterval(resendIntervalRef.current!);
            resendIntervalRef.current = null;
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (e: any) {
      Alert.alert("Resend failed", e.message ?? "Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Auto-submit OTP when all 6 digits are entered
  useEffect(() => {
    if (otpSent && otpCode.length === 6 && !loading) {
      handleConnect();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otpCode, otpSent]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Background glow — top-right, secondary colour, exact Figma Make spec */}
      <View style={styles.bgGlow} />

      <Animated.ScrollView
        entering={FadeIn.duration(400)}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <Animated.View entering={FadeIn.duration(500)} style={styles.header}>
          {/* Shield icon in glass square */}
          <View style={styles.iconBox}>
            <ShieldCheckIcon size={24} color={aurora.secondary} />
          </View>
          <Text style={styles.title}>Secure Access</Text>
          <Text style={styles.subtitle}>
            Connect your wallet or login to synchronize your intel node.
          </Text>
        </Animated.View>

        {/* ── Body ────────────────────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(200).duration(500)} style={styles.body}>

          {/* Phantom Wallet button — purple gradient + Wallet icon */}
          <View style={styles.walletSection}>
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={handlePhantomConnect}
              disabled={walletLoading || loading}
              style={styles.phantomBtn}
            >
              <LinearGradient
                colors={["#AB9FF2", "#512DA8"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.phantomGradient}
              >
                {walletLoading ? (
                  <SpinningFingerprint />
                ) : (
                  <>
                    <WalletIcon size={20} color="#fff" />
                    <Text style={styles.phantomBtnLabel}>Connect Phantom Wallet</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>OR STANDARD LOGIN</Text>
              <View style={styles.dividerLine} />
            </View>
          </View>

          {/* Dev mode input — removed in production build */}
          {__DEV__ && (
            <View style={styles.devInput}>
              <TextInput
                style={styles.devTextInput}
                placeholder="Dev: privy_id (leave blank = auto)"
                placeholderTextColor={aurora.white40}
                value={devPrivyId}
                onChangeText={setDevPrivyId}
                autoCapitalize="none"
              />
            </View>
          )}

          {/* ── Email / OTP form ─────────────────────────────────────────── */}
          {!otpSent ? (
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>EMAIL ADDRESS</Text>
              <View style={styles.inputRow}>
                <View style={styles.inputIcon}>
                  <MailIcon size={18} />
                </View>
                <TextInput
                  style={styles.textInput}
                  placeholder="agent@solana.com"
                  placeholderTextColor="rgba(255,255,255,0.20)"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType="send"
                  onSubmitEditing={handleConnect}
                />
              </View>
            </View>
          ) : (
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>VERIFICATION CODE</Text>
              <Text style={styles.otpHint}>Code sent to {email}</Text>
              <View style={[styles.inputRow, { borderColor: aurora.secondary }]}>
                <TextInput
                  style={[styles.textInput, { paddingLeft: 16 }]}
                  placeholder="6-digit code"
                  placeholderTextColor="rgba(255,255,255,0.20)"
                  value={otpCode}
                  onChangeText={setOtpCode}
                  keyboardType="number-pad"
                  maxLength={6}
                  returnKeyType="done"
                  onSubmitEditing={handleConnect}
                  autoFocus
                />
              </View>
              <View style={styles.otpActions}>
                <TouchableOpacity
                  onPress={() => {
                    setOtpSent(false);
                    setOtpCode("");
                    setResendCooldown(0);
                    if (resendIntervalRef.current) clearInterval(resendIntervalRef.current);
                  }}
                >
                  <Text style={styles.otpActionText}>Change email</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  disabled={resendCooldown > 0 || loading}
                  onPress={handleResend}
                >
                  <Text style={[styles.otpActionText, (resendCooldown > 0 || loading) && { opacity: 0.4 }]}>
                    {resendCooldown > 0 ? `Resend (${resendCooldown}s)` : "Resend code"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Sign In button — glass card + ArrowRight icon (Figma Make spec) */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={handleConnect}
            disabled={loading || !isReady}
            style={[styles.signInBtn, (loading || !isReady) && { opacity: 0.6 }]}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.signInBtnText}>
                  {otpSent ? "Verify Code" : "Sign In"}
                </Text>
                <ArrowRightIcon size={18} color={aurora.secondary} />
              </>
            )}
          </TouchableOpacity>

          {hasBiometric && (
            <HapticButton
              label="Use Face ID / Fingerprint"
              variant="ghost"
              size="sm"
              hapticStyle="light"
              onPress={checkBiometric}
              style={styles.biometricBtn}
            />
          )}
        </Animated.View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Don't have an account?{" "}
            <Text style={styles.footerLink}>Request Access</Text>
          </Text>
        </View>
      </Animated.ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: aurora.bgMain,
  },
  // Top-right corner glow — secondary colour (#ADC8FF), Figma Make spec
  bgGlow: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 256,
    height: 256,
    borderRadius: 128,
    backgroundColor: aurora.secondary,
    opacity: 0.2,
    // Simulate blur with a larger, softer circle — RN has no CSS blur on View
  },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 24,
    paddingTop: 64,
    paddingBottom: 32,
    flexGrow: 1,
  },
  // ── Header
  header: {
    marginBottom: 40,
  },
  iconBox: {
    width: 48,
    height: 48,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontFamily: Fonts.bold,
    color: "#ffffff",
    marginBottom: 8,
    letterSpacing: -0.5,
    lineHeight: 34,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: "rgba(255,255,255,0.60)",
    lineHeight: 21,
  },
  // ── Body
  body: {
    flex: 1,
  },
  // ── Wallet section
  walletSection: {
    marginBottom: 32,
  },
  phantomBtn: {
    width: "100%",
    height: 56,
    borderRadius: 20,
    overflow: "hidden",
    // Purple outer glow
    shadowColor: "#512DA8",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 8,
  },
  phantomGradient: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "rgba(171,159,242,0.50)",
    borderRadius: 20,
  },
  phantomBtnLabel: {
    color: "#ffffff",
    fontSize: 14,
    fontFamily: Fonts.bold,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginTop: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  dividerText: {
    fontSize: 10,
    fontFamily: Fonts.semiBold,
    color: "rgba(255,255,255,0.40)",
    letterSpacing: 1.5,
  },
  // ── Form fields
  fieldGroup: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 10,
    fontFamily: Fonts.medium,
    color: "rgba(255,255,255,0.50)",
    letterSpacing: 0.8,
    marginBottom: 6,
    marginLeft: 8,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    height: 56,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    borderRadius: 20,
    overflow: "hidden",
  },
  inputIcon: {
    paddingLeft: 16,
    paddingRight: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  textInput: {
    flex: 1,
    paddingLeft: 12,
    paddingRight: 16,
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: "#ffffff",
    height: "100%",
  },
  otpHint: {
    fontSize: 11,
    fontFamily: Fonts.regular,
    color: "rgba(255,255,255,0.40)",
    marginBottom: 6,
    marginLeft: 8,
  },
  otpActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
    paddingHorizontal: 4,
  },
  otpActionText: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: aurora.secondary,
  },
  // ── Sign In button — glass card with ArrowRight
  signInBtn: {
    width: "100%",
    height: 56,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.20)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 32,
  },
  signInBtnText: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: "#ffffff",
  },
  biometricBtn: {
    marginTop: 16,
    alignSelf: "center",
  },
  // ── Dev input
  devInput: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: aurora.border,
    backgroundColor: aurora.bgGlass,
    marginBottom: 16,
    padding: 10,
  },
  devTextInput: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: aurora.white,
  },
  // ── Footer
  footer: {
    marginTop: 32,
    alignItems: "center",
  },
  footerText: {
    fontSize: 11,
    fontFamily: Fonts.regular,
    color: "rgba(255,255,255,0.40)",
  },
  footerLink: {
    color: aurora.secondary,
    fontFamily: Fonts.medium,
  },
});
