// app/auth.tsx
// Auth screen — connexion via Privy (email OTP) + Phantom Wallet deeplink

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
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
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { usePrivy, useLoginWithEmail } from "@privy-io/expo";
import { loginWithPrivy, getCurrentUser } from "@/src/lib/api";
import { sentryCaptureError } from "@/src/lib/sentry";
import { toast } from "@/src/lib/toast";
import { useAuthStore } from "@/src/store/auth";
import { GlassCard } from "@/src/components/ui/GlassCard";
import { HapticButton } from "@/src/components/ui/HapticButton";
import { useTheme } from "@/src/theme/ThemeContext";
import { aurora } from "@/src/theme/colors";
import { Fonts } from "@/src/theme/fonts";
import { LinearGradient } from "expo-linear-gradient";
import {
  buildPhantomConnectURL,
  buildPhantomUniversalConnectURL,
} from "@/src/lib/solanaWallet";

function AnimatedOrb() {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.7);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(withTiming(1.15, { duration: 2000 }), withTiming(1, { duration: 2000 })),
      -1,
      false
    );
    opacity.value = withRepeat(
      withSequence(withTiming(1, { duration: 2000 }), withTiming(0.6, { duration: 2000 })),
      -1,
      false
    );
  }, []);

  const orbStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.orbContainer, orbStyle]}>
      <LinearGradient
        colors={[aurora.primary, "#1A3AC7", "#2D5FE8", aurora.secondary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.orb}
      />
      <View style={[styles.orbGlow, { borderColor: `${aurora.secondary}80` }]} />
    </Animated.View>
  );
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
      {/* Background glow */}
      <View style={styles.bgGlow} />

      <View style={styles.content}>
        {/* Logo area */}
        <Animated.View entering={FadeIn.duration(600)} style={styles.logoSection}>
          <AnimatedOrb />
          <Text style={styles.appName}>
            LINEAGE <Text style={{ color: aurora.secondary }}>AGENT</Text>
          </Text>
          <Text style={styles.tagline}>On-chain forensics, powered by AI</Text>
        </Animated.View>

        {/* Auth card */}
        <Animated.View entering={FadeInDown.delay(300).springify()}>
          <GlassCard elevated style={styles.authCard}>
            <Text style={styles.cardTitle}>Sign in to Lineage</Text>
            <Text style={styles.cardSub}>
              Enter your email — we'll send you a one-time sign-in code.
            </Text>

            {/* Phantom Wallet option */}
            <HapticButton
              hapticStyle="medium"
              onPress={handlePhantomConnect}
              disabled={walletLoading || loading}
              style={StyleSheet.flatten([styles.phantomBtn, { backgroundColor: aurora.primary, borderColor: `${aurora.secondary}80` }])}
            >
              {walletLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <View style={styles.phantomBtnInner}>
                  <Text style={styles.phantomIcon}>👻</Text>
                  <Text style={styles.phantomBtnLabel}>Connect Phantom Wallet</Text>
                </View>
              )}
            </HapticButton>

            {/* Divider */}
            <View style={styles.divider}>
              <View style={[styles.dividerLine, { backgroundColor: aurora.border }]} />
              <Text style={[styles.dividerText, { color: aurora.white40 }]}>or sign in with email</Text>
              <View style={[styles.dividerLine, { backgroundColor: aurora.border }]} />
            </View>

            {/* Dev mode input — removed in production build */}
            {__DEV__ && (
              <View style={[styles.devInput, { backgroundColor: aurora.bgGlass, borderColor: aurora.border }]}>
                <TextInput
                  style={[styles.devTextInput, { color: aurora.white }]}
                  placeholder="Dev: privy_id (leave blank = auto)"
                  placeholderTextColor={aurora.white40}
                  value={devPrivyId}
                  onChangeText={setDevPrivyId}
                  autoCapitalize="none"
                />
              </View>
            )}

            {/* Email input */}
            {!otpSent ? (
              <View style={styles.inputWrapper}>
                <TextInput
                  style={[styles.textInput, { backgroundColor: aurora.bgGlass, borderColor: aurora.border, color: aurora.white }]}
                  placeholder="Email address"
                  placeholderTextColor={aurora.white40}
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
            ) : (
              <View style={styles.inputWrapper}>
                <Text style={[styles.otpHint, { color: aurora.white40 }]}>Code sent to {email}</Text>
                <TextInput
                  style={[styles.textInput, { backgroundColor: aurora.bgGlass, borderColor: aurora.secondary, color: aurora.white }]}
                  placeholder="6-digit code"
                  placeholderTextColor={aurora.white40}
                  value={otpCode}
                  onChangeText={setOtpCode}
                  keyboardType="number-pad"
                  maxLength={6}
                  returnKeyType="done"
                  onSubmitEditing={handleConnect}
                  autoFocus
                />
                <View style={styles.otpActions}>
                  <HapticButton
                    label="Change email"
                    variant="ghost"
                    size="sm"
                    hapticStyle="light"
                    onPress={() => {
                      setOtpSent(false);
                      setOtpCode("");
                      setResendCooldown(0);
                      if (resendIntervalRef.current) clearInterval(resendIntervalRef.current);
                    }}
                    style={styles.changeEmailBtn}
                  />
                  <HapticButton
                    label={resendCooldown > 0 ? `Resend (${resendCooldown}s)` : "Resend code"}
                    variant="ghost"
                    size="sm"
                    hapticStyle="light"
                    disabled={resendCooldown > 0 || loading}
                    onPress={handleResend}
                    style={styles.changeEmailBtn}
                  />
                </View>
              </View>
            )}

            <HapticButton
              label={loading ? "" : otpSent ? "Verify Code" : "Send Code"}
              hapticStyle="medium"
              onPress={handleConnect}
              disabled={loading || !isReady}
              style={styles.connectBtn}
            >
              {loading && <ActivityIndicator color={aurora.bgMain} />}
            </HapticButton>

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

            <Text style={styles.disclaimer}>
              By connecting, you agree to the{" "}
              <Text
                style={styles.link}
                onPress={() => Linking.openURL("https://lineageagent.io/terms").catch(() => {})}
              >
                Terms of Service
              </Text>
              {" "}and{" "}
              <Text
                style={styles.link}
                onPress={() => Linking.openURL("https://lineageagent.io/privacy").catch(() => {})}
              >
                Privacy Policy
              </Text>
              .
            </Text>
          </GlassCard>
        </Animated.View>

        {/* Feature pills */}
        <Animated.View entering={FadeInDown.delay(500)} style={styles.features}>
          {["Lineage detection", "Bundle forensics", "AI analysis", "Push alerts"].map((f) => (
            <View key={f} style={[styles.featurePill, { borderColor: aurora.border, backgroundColor: aurora.bgGlass }]}>
              <Text style={[styles.featureText, { color: aurora.white40 }]}>{f}</Text>
            </View>
          ))}
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: aurora.bgMain },
  bgGlow: {
    position: "absolute",
    top: "25%",
    left: "25%",
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: aurora.primary,
    opacity: 0.4,
  },
  phantomBtn: {
    width: "100%",
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 4,
  },
  phantomBtnInner: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  phantomIcon: { fontSize: 20 },
  phantomBtnLabel: { color: aurora.white, fontSize: 15, fontFamily: Fonts.bold },
  divider: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16, marginTop: 8 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 12, fontFamily: Fonts.regular },
  meshBg: { ...StyleSheet.absoluteFillObject, opacity: 0.8 },
  content: { flex: 1, paddingHorizontal: 20, justifyContent: "center", gap: 32 },
  logoSection: { alignItems: "center" },
  orbContainer: { marginBottom: 20 },
  orb: { width: 80, height: 80, borderRadius: 40 },
  orbGlow: { ...StyleSheet.absoluteFillObject, borderRadius: 40, borderWidth: 2 },
  appName: { fontSize: 28, fontFamily: Fonts.bold, letterSpacing: -0.5, color: aurora.white },
  tagline: { fontSize: 15, marginTop: 6, fontFamily: Fonts.regular, color: aurora.white40 },
  authCard: { padding: 24 },
  cardTitle: { fontSize: 20, fontFamily: Fonts.bold, marginBottom: 8, color: aurora.white },
  cardSub: { fontSize: 14, lineHeight: 20, marginBottom: 24, fontFamily: Fonts.regular, color: aurora.white60 },
  devInput: { borderRadius: 8, borderWidth: 1, marginBottom: 16, padding: 10 },
  devTextInput: { fontSize: 13, fontFamily: Fonts.regular },
  inputWrapper: { marginBottom: 16 },
  textInput: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: Fonts.regular,
  },
  otpHint: { fontSize: 12, marginBottom: 8, textAlign: "center", fontFamily: Fonts.regular },
  changeEmailBtn: { marginTop: 8, alignSelf: "center" },
  otpActions: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  connectBtn: { width: "100%", height: 52, borderRadius: 14 },
  connectBtnText: { fontSize: 16, fontFamily: Fonts.bold },
  biometricBtn: { marginTop: 12, alignSelf: "center" },
  disclaimer: { fontSize: 11, textAlign: "center", marginTop: 16, lineHeight: 17, fontFamily: Fonts.regular, color: aurora.white40 },
  link: { color: aurora.secondary },
  features: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  featurePill: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  featureText: { fontSize: 12, fontFamily: Fonts.regular },
});
