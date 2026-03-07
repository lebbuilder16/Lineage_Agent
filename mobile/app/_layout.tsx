// app/_layout.tsx
// Layout racine — initialise fonts, QueryClient, SafeArea, Reanimated, push notifications

import "../src/global.css";
import React, { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as SplashScreen from "expo-splash-screen";
import { PrivyProvider } from "@privy-io/expo";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import { colors } from "@/src/theme/colors";
import { useAuthStore } from "@/src/store/auth";
import { useAlertsStore } from "@/src/store/alerts";
import type { AlertItem } from "@/src/types/api";
import { initRevenueCat, loginToRevenueCat } from "@/src/lib/purchases";
import {
  registerForPushNotifications,
  addNotificationReceivedListener,
  addNotificationResponseListener,
  clearBadge,
} from "@/src/lib/pushNotifications";

const PRIVY_APP_ID = process.env.EXPO_PUBLIC_PRIVY_APP_ID ?? "";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // 30s
      retry: 2,
    },
  },
});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const { isAuthenticated, user } = useAuthStore();
  const { addAlert } = useAlertsStore();

  // ── RevenueCat init + push notifications
  useEffect(() => {
    if (!isAuthenticated) return;

    // Identify user in RevenueCat so purchases are linked
    if (user?.privy_id) {
      initRevenueCat(user.privy_id);
      loginToRevenueCat(user.privy_id);
    }

    registerForPushNotifications();

    const cleanFg = addNotificationReceivedListener((notification) => {
      const title = notification.request.content.title ?? "";
      const body = notification.request.content.body ?? "";
      const data = notification.request.content.data ?? {};
      addAlert({
        id: notification.request.identifier,
        type: (data.type as AlertItem["type"]) ?? "rug",
        token_name: (data.token_name as string | undefined) ?? title,
        token_image: (data.token_image as string | undefined) ?? "",
        message: body,
        mint: (data.mint as string | undefined) ?? "",
        timestamp: new Date().toISOString(),
        read: false,
      });
      clearBadge();
    });

    const cleanTap = addNotificationResponseListener((_response) => {
      clearBadge();
    });

    return () => {
      cleanFg();
      cleanTap();
    };
  }, [isAuthenticated, user?.privy_id]);

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <PrivyProvider appId={PRIVY_APP_ID}>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background.deep }}>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="light" backgroundColor={colors.background.deep} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background.deep },
            animation: "fade_from_bottom",
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="lineage/[mint]"
            options={{
              animation: "slide_from_right",
              presentation: "card",
            }}
          />
          <Stack.Screen
            name="deployer/[address]"
            options={{ animation: "slide_from_right" }}
          />
          <Stack.Screen
            name="chat/[mint]"
            options={{
              animation: "slide_from_bottom",
              presentation: "modal",
            }}
          />
          <Stack.Screen
            name="paywall"
            options={{
              animation: "slide_from_bottom",
              presentation: "modal",
            }}
          />
          <Stack.Screen name="auth" options={{ headerShown: false }} />
        </Stack>
        </QueryClientProvider>
      </GestureHandlerRootView>
    </PrivyProvider>
  );
}
