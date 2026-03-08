// app/auth.tsx
// Auth screen — connexion via Privy embedded wallet + fallback biométrique

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
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

  // ── Privy SDK
  const { logout: privyLogout } = usePrivy();
  const { sendCode, loginWithCode, state: emailState } = useLoginWithEmail({
    onError: (err) => {
      Alert.alert("Login failed", err.message ?? "Please try again.");
      setLoading(false);
    },
  });

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

  const handleConnect = async () => {
    if (__DEV__ && devPrivyId.trim()) {
      await _handlePrivyUser(devPrivyId.trim());
      return;
    }
    setLoading(true);
    try {
      if (!otpSent) {
        // Étape 1 : envoyer le code OTP à l'adresse email
        const trimmedEmail = email.trim();
        if (!trimmedEmail || !trimmedEmail.includes("@")) {
          Alert.alert("Email invalide", "Veuillez entrer un email valide.");
          setLoading(false);
          return;
        }
        await sendCode({ email: trimmedEmail });
        setOtpSent(true);
        toast.info("Code sent! Check your email.");
      } else {
        // Étape 2 : vérifier le code OTP
        const trimmedCode = otpCode.trim();
        if (!trimmedCode) {
          Alert.alert("Code requis", "Veuillez entrer le code reçu par email.");
          setLoading(false);
          return;
        }
        await loginWithCode({ code: trimmedCode });
      }
    } catch (e: any) {
      Alert.alert("Connection failed", e.message ?? "Please try again.");
    } finally {
      setLoading(false);
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
            <Text style={styles.cardTitle}>Connect your wallet</Text>
            <Text style={styles.cardSub}>
              Your Solana wallet is your identity. No password required.
            </Text>

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
