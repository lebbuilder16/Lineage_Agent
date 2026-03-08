// app/+not-found.tsx
// Fallback screen for unknown deep-link routes

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { router, usePathname, Stack } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "@/src/theme/colors";
import { HapticButton } from "@/src/components/ui/HapticButton";

export default function NotFoundScreen() {
  const path = usePathname();

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ title: "Not Found", headerShown: false }} />
      <View style={styles.content}>
        <Text style={styles.code}>404</Text>
        <Text style={styles.title}>Page not found</Text>
        <Text style={styles.subtitle} numberOfLines={2}>
          {path}
        </Text>
        <HapticButton
          label="Go to Feed"
          onPress={() => router.replace("/(tabs)")}
          variant="primary"
          style={{ marginTop: 24, minWidth: 160 }}
          accessibilityLabel="Go to Feed"
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background.deep },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 8,
  },
  code: {
    fontSize: 72,
    fontWeight: "900",
    color: colors.accent.ai,
    opacity: 0.6,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.text.primary,
  },
  subtitle: {
    fontSize: 13,
    color: colors.text.muted,
    fontFamily: "monospace",
    textAlign: "center",
    marginTop: 4,
  },
});
