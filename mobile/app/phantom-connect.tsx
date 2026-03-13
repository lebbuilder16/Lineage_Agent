// app/phantom-connect.tsx
// Deep-link callback screen for Phantom wallet connect.
// Phantom redirects here after the user approves (or rejects) the connection:
//   lineage://phantom-connect?phantom_encryption_public_key=...&nonce=...&data=...
// or on rejection:
//   lineage://phantom-connect?errorCode=...&errorMessage=...

import React, { useEffect, useRef } from "react";
import { View, Text, ActivityIndicator, Alert, StyleSheet } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Linking from "expo-linking";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  decryptPhantomResponse,
  parsePhantomCallbackParams,
} from "@/src/lib/solanaWallet";
import { loginWithPrivy } from "@/src/lib/api";
import { useAuthStore } from "@/src/store/auth";
import { sentryCaptureError } from "@/src/lib/sentry";
import { useTheme } from "@/src/theme/ThemeContext";

export default function PhantomConnectScreen() {
  const { colors } = useTheme();
  const setUser = useAuthStore((s) => s.setUser);
  const handled = useRef(false);

  // Expo Router parses query params from the deep link automatically,
  // but Phantom may pass them in different formats — we also parse the raw URL.
  const searchParams = useLocalSearchParams<{
    phantom_encryption_public_key?: string;
    nonce?: string;
    data?: string;
    errorCode?: string;
    errorMessage?: string;
  }>();

  useEffect(() => {
    if (handled.current) return;

    async function handle() {
      handled.current = true;

      // Prefer params parsed by Expo Router; fall back to raw initial URL.
      // decryptPhantomResponse is async and self-heals the keypair from SecureStore
      // internally, so no explicit restorePhantomSession call is needed here.
      let params: Record<string, string> = {};

      if (searchParams.phantom_encryption_public_key || searchParams.errorCode) {
        // Expo Router already decoded the query string
        for (const [k, v] of Object.entries(searchParams)) {
          if (v !== undefined) params[k] = String(v);
        }
      } else {
        // Cold-start OR warm-start where Expo Router params aren't ready yet:
        // read from the raw URL supplied by the OS.
        const url = await Linking.getInitialURL();
        if (url) params = parsePhantomCallbackParams(url);
      }

      // ── User rejected in Phantom
      if (params.errorCode) {
        Alert.alert(
          "Wallet connection cancelled",
          params.errorMessage ?? "You rejected the connection request.",
          [{ text: "OK", onPress: () => router.replace("/auth") }]
        );
        return;
      }

      const { phantom_encryption_public_key, nonce, data } = params;

      if (!phantom_encryption_public_key || !nonce || !data) {
        Alert.alert("Error", "Incomplete response from Phantom.", [
          { text: "OK", onPress: () => router.replace("/auth") },
        ]);
        return;
      }

      const result = await decryptPhantomResponse(
        phantom_encryption_public_key,
        nonce,
        data
      );

      if (!result.ok) {
        Alert.alert("Decryption error", result.error, [
          { text: "OK", onPress: () => router.replace("/auth") },
        ]);
        return;
      }

      try {
        const user = await loginWithPrivy(result.publicKey, result.publicKey);
        await setUser(user);
        router.replace("/(tabs)");
      } catch (e: any) {
        sentryCaptureError(e, { context: "phantom_connect_screen" });
        Alert.alert("Connection failed", e.message ?? "Please try again.", [
          { text: "OK", onPress: () => router.replace("/auth") },
        ]);
      }
    }

    handle();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background.deep }]}>
      <View style={styles.content}>
        <ActivityIndicator size="large" color={colors.accent.ai} />
        <Text style={[styles.label, { color: colors.text.secondary }]}>Connecting wallet…</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  label: { fontSize: 15 },
});
