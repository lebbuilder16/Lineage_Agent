// app/_layout.tsx
// Layout racine — initialise fonts, QueryClient, SafeArea, Reanimated, push notifications

import "../src/polyfills";
import "../src/global.css";
import React, { useEffect, useRef } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as SplashScreen from "expo-splash-screen";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { PrivyProvider } from "@privy-io/expo";
import {
  useFonts,
  Lexend_400Regular,
  Lexend_500Medium,
  Lexend_600SemiBold,
  Lexend_700Bold,
  Lexend_800ExtraBold,
} from "@expo-google-fonts/lexend";
import FlashMessage from "react-native-flash-message";
import { ThemeProvider, useTheme } from "@/src/theme/ThemeContext";
import { useAuthStore } from "@/src/store/auth";
import { useAlertsStore } from "@/src/store/alerts";
import { initRevenueCat, loginToRevenueCat } from "@/src/lib/purchases";
import {
  registerForPushNotifications,
  addNotificationReceivedListener,
  addNotificationResponseListener,
  clearBadge,
} from "@/src/lib/pushNotifications";
import { initSentry, sentrySetUser, Sentry } from "@/src/lib/sentry";
import { registerUnauthorizedHandler } from "@/src/lib/api";
import { ErrorBoundary } from "@/src/components/ErrorBoundary";
import * as Updates from "expo-updates";

// Initialise Sentry au démarrage de l'app (avant tout rendu)
initSentry();

const PRIVY_APP_ID = process.env.EXPO_PUBLIC_PRIVY_APP_ID ?? "";
if (__DEV__ && !PRIVY_APP_ID) {
  console.warn(
    "[Auth] EXPO_PUBLIC_PRIVY_APP_ID is empty — Privy will not initialise.\n" +
    "Copy mobile/.env.example to mobile/.env.local and fill in the value."
  );
}
const ONBOARDING_KEY = "onboarding_done";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // 30s
      retry: 2,
    },
  },
});

/** Vérifie et applique les OTA updates EAS au démarrage (hors dev). */
function useOtaUpdate() {
  useEffect(() => {
    if (__DEV__) return; // pas d'OTA en mode développement
    (async () => {
      try {
        const check = await Updates.checkForUpdateAsync();
        if (check.isAvailable) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync(); // recharge l'app avec la nouvelle version
        }
      } catch (_e) {
        // En cas d'erreur réseau ou de runtime, on ignore silencieusement
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** Inner shell rendered inside ThemeProvider so useTheme() works reactively */
function ThemedShell() {
  const { colors: tc, isDark } = useTheme();
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: tc.background.deep }}>
      <QueryClientProvider client={queryClient}>
        <StatusBar style={isDark ? "light" : "dark"} backgroundColor={tc.background.deep} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: tc.background.deep },
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
          <Stack.Screen name="phantom-connect" options={{ headerShown: false }} />
        </Stack>
        <FlashMessage position="top" />
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

function RootLayout() {
  useOtaUpdate();

  const [fontsLoaded] = useFonts({
    Lexend_400Regular,
    Lexend_500Medium,
    Lexend_600SemiBold,
    Lexend_700Bold,
    Lexend_800ExtraBold,
  });
  const { isAuthenticated, user, logout } = useAuthStore();
  const { addAlert } = useAlertsStore();
  const initialNavDone = useRef(false);

  // Register global 401 handler — silently logs out and redirects to /auth on token expiry
  useEffect(() => {
    registerUnauthorizedHandler(async () => {
      await logout();
      router.replace("/auth");
    });
    return () => registerUnauthorizedHandler(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lie l'utilisateur courant à Sentry pour retrouver ses sessions dans les rapports
  useEffect(() => {
    sentrySetUser(user ? { id: user.privy_id, email: user.email ?? null } : null);
  }, [user]);

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
      const rawTitle = notification.request.content.title;
      const rawBody = notification.request.content.body;
      const alertTitle: string = rawTitle ?? "";
      const alertBody: string = rawBody ?? "";
      addAlert({
        id: notification.request.identifier,
        type: (notification.request.content.data?.type as any) ?? "info",
        token_name: alertTitle,
        message: alertBody,
        token_image: "",
        mint: (notification.request.content.data?.mint as string | undefined) ?? "",
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
    if (!fontsLoaded || initialNavDone.current) return;
    initialNavDone.current = true;
    SplashScreen.hideAsync();
    AsyncStorage.getItem(ONBOARDING_KEY).then((value) => {
      if (!value) {
        router.replace("/onboarding");
      } else if (!isAuthenticated) {
        router.replace("/auth");
      }
    });
  // Runs once after fonts load — isAuthenticated intentionally excluded to avoid
  // re-triggering during the biometric session-restore in auth.tsx.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <ThemeProvider>
    <ErrorBoundary>
      <PrivyProvider appId={PRIVY_APP_ID}>
        <ThemedShell />
      </PrivyProvider>
    </ErrorBoundary>
    </ThemeProvider>
  );
}

// Sentry.wrap() instrumente le composant racine pour capturer les crashs natifs et JS
export default Sentry.wrap(RootLayout);
