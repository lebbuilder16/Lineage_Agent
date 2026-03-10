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
import { toast } from "@/src/lib/toast";
import { useAuthStore } from "@/src/store/auth";
import { GlassCard } from "@/src/components/ui/GlassCard";
import { HapticButton } from "@/src/components/ui/HapticButton";
import { colors } from "@/src/theme/colors";
import {
  buildPhantomConnectURL,
  buildPhantomUniversalConnectURL,
  decryptPhantomResponse,
  isPhantomCallback,
  parsePhantomCallbackParams,
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
      <View style={styles.orb} />
      <View style={styles.orbGlow} />
    </Animated.View>
  );
}

export default function AuthScreen() {
  const setUser = useAuthStore((s) => s.setUser);
  const [loading, setLoading] = useState(false);
  const [hasBiometric, setHasBiometric] = useState(false);
  const [devPrivyId, setDevPrivyId] = useState("");
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [walletLoading, setWalletLoading] = useState(false);
  const authErrorRef = useRef<string | null>(null);
  // Tracks whether we're in an active Phantom deeplink flow
  const phantomPendingRef = useRef(false);

  // ── Privy SDK
  usePrivy(); // keep provider context active
  const { sendCode, loginWithCode, state: emailState } = useLoginWithEmail({
    onError: (err) => {
      authErrorRef.current = err.message ?? "Please try again.";
    },
  });

  // ── Phantom deeplink callback listener ────────────────────────────────
  const _handlePhantomCallback = useCallback(
    async (url: string) => {
      if (!isPhantomCallback(url) || !phantomPendingRef.current) return;
      phantomPendingRef.current = false;

      const params = parsePhantomCallbackParams(url);

      // User rejected in Phantom
      if (params.errorCode) {
        setWalletLoading(false);
        Alert.alert(
          "Wallet connection cancelled",
          params.errorMessage ?? "You rejected the connection request."
        );
        return;
      }

      const { phantom_encryption_public_key, nonce, data } = params;
      if (!phantom_encryption_public_key || !nonce || !data) {
        setWalletLoading(false);
        Alert.alert("Error", "Incomplete response from Phantom.");
        return;
      }

      const result = decryptPhantomResponse(
        phantom_encryption_public_key,
        nonce,
        data
      );

      if (!result.ok) {
        setWalletLoading(false);
        Alert.alert("Decryption error", result.error);
        return;
      }

      // Use the Solana public key as unique identifier on our backend
      try {
        const user = await loginWithPrivy(result.publicKey, result.publicKey);
        await setUser(user);
        router.replace("/(tabs)");
      } catch (e: any) {
        Alert.alert("Connection failed", e.message ?? "Please try again.");
      } finally {
        setWalletLoading(false);
      }
    },
    [setUser]
  );

  useEffect(() => {
    // Listen for Phantom deeplink callbacks while this screen is mounted
    const subscription = Linking.addEventListener("url", ({ url }) => {
      _handlePhantomCallback(url);
    });

    // Handle case where app was cold-started by the deeplink
    Linking.getInitialURL().then((url) => {
      if (url) _handlePhantomCallback(url);
    });

    return () => subscription.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Privy v2: onComplete removed — watch emailState.status instead
  useEffect(() => {
    if (emailState.status === "done") {
      const privyUser = (emailState as any).user;
      if (privyUser?.id) {
        _handlePrivyUser(privyUser.id, privyUser.email?.address);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailState.status]);

  const _handlePrivyUser = useCallback(
    async (privyId: string, email?: string) => {
      setLoading(true);
      try {
        const user = await loginWithPrivy(privyId, undefined, email);
        await setUser(user);
        router.replace("/(tabs)");
      } catch (e: any) {
        Alert.alert("Connection failed", e.message ?? "Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [setUser]
  );

  useEffect(() => {
    checkBiometric();
  }, []);

  const checkBiometric = async () => {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    setHasBiometric(compatible && enrolled);

    // Re-login biométrique si API key déjà stockée
    const existingKey = await SecureStore.getItemAsync("lineage_api_key");
    if (existingKey && compatible && enrolled) {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Unlock Lineage Agent",
        fallbackLabel: "Enter PIN",
      });
      if (result.success) {
        try {
          const user = await getCurrentUser();
          setUser(user);
          router.replace("/(tabs)");
        } catch {
          // Token expiré — continuer vers login normal
        }
      }
    }
  };

  const handlePhantomConnect = async () => {
    setWalletLoading(true);
    phantomPendingRef.current = true;

    const deepUrl = buildPhantomConnectURL("lineage");

    // Try the native phantom:// scheme first, fall back to universal link
    const canOpen = await Linking.canOpenURL(deepUrl).catch(() => false);

    try {
      if (canOpen) {
        await Linking.openURL(deepUrl);
      } else {
        // Universal link: also works as a web redirect on Android
        const universalUrl = buildPhantomUniversalConnectURL("lineage");
        await Linking.openURL(universalUrl);
      }
    } catch {
      phantomPendingRef.current = false;
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
      if (!trimmedEmail || !trimmedEmail.includes("@")) {
        Alert.alert("Invalid email", "Please enter a valid email address.");
        setLoading(false);
        return;
      }
      try {
        authErrorRef.current = null;
        const result = await sendCode({ email: trimmedEmail });
        if (!result?.success) {
          Alert.alert(
            "Code not sent",
            authErrorRef.current ?? "Privy could not send the email code. Check spam and retry in a minute."
          );
          return;
        }
        setOtpSent(true);
        toast.info("Code sent! Check your email.");
      } catch (e: any) {
        Alert.alert("Connection failed", e.message ?? "Please try again.");
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
        const privyUser = await loginWithCode({ code: trimmedCode });
        if (!privyUser) {
          Alert.alert(
            "Code invalid",
            authErrorRef.current ?? "The code was rejected or expired. Request a new code and try again."
          );
          setLoading(false);
          return;
        }
        // loading stays true — _handlePrivyUser will reset it after navigation
      } catch (e: any) {
        Alert.alert("Connection failed", e.message ?? "Please try again.");
        setLoading(false);
      }
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Background mesh */}
      <View style={styles.meshBg} />

      <View style={styles.content}>
        {/* Logo area */}
        <Animated.View entering={FadeIn.duration(600)} style={styles.logoSection}>
          <AnimatedOrb />
          <Text style={styles.appName}>Lineage Agent</Text>
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
              style={styles.phantomBtn}
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
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or sign in with email</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Dev mode input — removed in production build */}
            {__DEV__ && (
              <View style={styles.devInput}>
                <TextInput
                  style={styles.devTextInput}
                  placeholder="Dev: privy_id (leave blank = auto)"
                  placeholderTextColor={colors.text.muted}
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
                  style={styles.textInput}
                  placeholder="Email address"
                  placeholderTextColor={colors.text.muted}
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
                <Text style={styles.otpHint}>Code sent to {email}</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter OTP code"
                  placeholderTextColor={colors.text.muted}
                  value={otpCode}
                  onChangeText={setOtpCode}
                  keyboardType="number-pad"
                  returnKeyType="done"
                  onSubmitEditing={handleConnect}
                  autoFocus
                />
                <HapticButton
                  label="Change email"
                  variant="ghost"
                  size="sm"
                  hapticStyle="light"
                  onPress={() => { setOtpSent(false); setOtpCode(""); }}
                  style={styles.changeEmailBtn}
                />
              </View>
            )}

            <HapticButton
              label={loading ? "" : otpSent ? "Verify Code" : "Send Code"}
              hapticStyle="medium"
              onPress={handleConnect}
              disabled={loading}
              style={styles.connectBtn}
            >
              {loading && <ActivityIndicator color={colors.background.deep} />}
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
              <Text style={styles.link}>Terms of Service</Text> and{" "}
              <Text style={styles.link}>Privacy Policy</Text>.
            </Text>
          </GlassCard>
        </Animated.View>

        {/* Feature pills */}
        <Animated.View entering={FadeInDown.delay(500)} style={styles.features}>
          {["Lineage detection", "Bundle forensics", "AI analysis", "Push alerts"].map((f) => (
            <View key={f} style={styles.featurePill}>
              <Text style={styles.featureText}>{f}</Text>
            </View>
          ))}
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background.deep },
  phantomBtn: {
    width: "100%",
    height: 52,
    borderRadius: 14,
    backgroundColor: "#7C3AED",
    borderWidth: 1,
    borderColor: "#9B59F780",
    marginBottom: 4,
  },
  phantomBtnInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  phantomIcon: { fontSize: 20 },
  phantomBtnLabel: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
    marginTop: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.glass.border,
  },
  dividerText: {
    color: colors.text.muted,
    fontSize: 12,
  },
  meshBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background.deep,
    // En production: remplacer par une vraie image de mesh gradient
    opacity: 0.8,
  },
  content: { flex: 1, paddingHorizontal: 20, justifyContent: "center", gap: 32 },
  logoSection: { alignItems: "center" },
  orbContainer: { marginBottom: 20 },
  orb: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.accent.ai,
    opacity: 0.2,
  },
  orbGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: `${colors.accent.ai}80`,
  },
  appName: {
    color: colors.text.primary,
    fontSize: 32,
    fontWeight: "700",
    letterSpacing: -1,
  },
  tagline: { color: colors.text.muted, fontSize: 15, marginTop: 6 },
  authCard: { padding: 24 },
  cardTitle: { color: colors.text.primary, fontSize: 20, fontWeight: "700", marginBottom: 8 },
  cardSub: { color: colors.text.secondary, fontSize: 14, lineHeight: 20, marginBottom: 24 },
  devInput: {
    backgroundColor: colors.glass.bg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.glass.border,
    marginBottom: 16,
    padding: 10,
  },
  devTextInput: { color: colors.text.primary, fontSize: 13 },
  inputWrapper: {
    marginBottom: 16,
  },
  textInput: {
    backgroundColor: colors.glass.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.glass.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text.primary,
    fontSize: 15,
  },
  otpHint: {
    color: colors.text.muted,
    fontSize: 12,
    marginBottom: 8,
    textAlign: "center",
  },
  changeEmailBtn: { marginTop: 8, alignSelf: "center" },
  connectBtn: { width: "100%", height: 52, borderRadius: 14 },
  connectBtnText: { color: colors.background.deep, fontSize: 16, fontWeight: "700" },
  biometricBtn: { marginTop: 12, alignSelf: "center" },
  disclaimer: {
    color: colors.text.muted,
    fontSize: 11,
    textAlign: "center",
    marginTop: 16,
    lineHeight: 17,
  },
  link: { color: colors.accent.blue },
  features: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center",
  },
  featurePill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.glass.border,
    backgroundColor: colors.glass.bg,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  featureText: { color: colors.text.muted, fontSize: 12 },
});
