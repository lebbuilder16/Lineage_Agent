// app/_layout.tsx
// Layout racine — initialise fonts, QueryClient, SafeArea, Reanimated, push notifications

import "../src/polyfills";
import "../src/global.css";
import React, { useState, useEffect, useRef } from "react";
import { Stack, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AppState, AppStateStatus, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
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
import { ErrorBoundary } from "@/src/components/ErrorBoundary";
import { useAuthStore } from "@/src/store/auth";
import { useAlertsStore } from "@/src/store/alerts";
import type { AlertItem } from "@/src/types/api";
import FlashMessage from "react-native-flash-message";
import { initRevenueCat, loginToRevenueCat } from "@/src/lib/purchases";
import { liveAlerts } from "@/src/lib/websocket";
import { initSentry } from "@/src/lib/sentry";
import { registerUnauthorizedHandler } from "@/src/lib/api";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ONBOARDING_KEY } from "./onboarding";
import {
  registerForPushNotifications,
  addNotificationReceivedListener,
  addNotificationResponseListener,
  clearBadge,
} from "@/src/lib/pushNotifications";

const PRIVY_APP_ID = process.env.EXPO_PUBLIC_PRIVY_APP_ID ?? "";

SplashScreen.preventAutoHideAsync();
initSentry();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // 30s
      retry: 2,
      gcTime: 1000 * 60 * 60 * 24, // 24h — needed for persistence
    },
  },
});

const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  throttleTime: 3_000,
  key: "rq-offline-cache",
});

export default function RootLayout() {
  const [splashDone, setSplashDone] = useState(false);
  const splashOpacity = useSharedValue(1);
  const splashStyle = useAnimatedStyle(() => ({ opacity: splashOpacity.value }));

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const { isAuthenticated, user } = useAuthStore();
  const { addAlert } = useAlertsStore();

  // Register 401 handler — logs the user out automatically on auth failures
  useEffect(() => {
    registerUnauthorizedHandler(() => {
      const { isAuthenticated, logout } = useAuthStore.getState();
      if (!isAuthenticated) return;
      logout().then(() => router.replace("/auth"));
    });
    return () => registerUnauthorizedHandler(null);
  }, []);

  // ── RevenueCat init + push notifications
  useEffect(() => {
    if (!isAuthenticated) return;

    // Identify user in RevenueCat so purchases are linked
    if (user?.privy_id) {
      initRevenueCat(user.privy_id);
      loginToRevenueCat(user.privy_id);
    }

    registerForPushNotifications();
    liveAlerts.start();

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

    const cleanTap = addNotificationResponseListener((response) => {
      clearBadge();
      const data = response.notification.request.content.data ?? {};
      const mint = data.mint as string | undefined;
      if (mint) {
        router.push(`/lineage/${mint}` as any);
      } else {
        router.push("/(tabs)/alerts");
      }
    });

    return () => {
      cleanFg();
      cleanTap();
      liveAlerts.stop();
    };
  }, [isAuthenticated, user?.privy_id]);

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
      AsyncStorage.getItem(ONBOARDING_KEY).then((val) => {
        if (!val) router.replace("/onboarding");
      });
      // Fade out the splash overlay to reveal the app
      splashOpacity.value = withTiming(0, { duration: 600 }, () => {
        runOnJS(setSplashDone)(true);
      });
    }
  }, [fontsLoaded]);

  // Refresh stale queries when app comes back to foreground
  const appState = useRef<AppStateStatus>(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (appState.current.match(/inactive|background/) && next === "active") {
        queryClient.invalidateQueries();
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, []);

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: asyncStoragePersister,
        maxAge: 1000 * 60 * 60 * 24, // 24h
        buster: "v1",
      }}
    >
      <PrivyProvider appId={PRIVY_APP_ID}>
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background.deep }}>
          <StatusBar style="light" backgroundColor={colors.background.deep} />
          <ErrorBoundary>
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
              <Stack.Screen name="onboarding" options={{ headerShown: false, animation: "fade" }} />
              <Stack.Screen name="+not-found" options={{ headerShown: false }} />
            </Stack>
          </ErrorBoundary>
          <FlashMessage position="top" />
        </GestureHandlerRootView>
      </PrivyProvider>
      {/* Animated splash fade-out overlay */}
      {!splashDone && (
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, splashStyle, styles.splashOverlay]}
        />
      )}
    </PersistQueryClientProvider>
  );
}

const styles = StyleSheet.create({
  splashOverlay: {
    backgroundColor: "#0A0A0F",
    zIndex: 9999,
  },
});
