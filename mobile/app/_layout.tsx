import 'react-native-get-random-values'; // Polyfill crypto.getRandomValues for tweetnacl — MUST be first
import { useEffect } from 'react';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, View, AppState } from 'react-native';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { PrivyProvider } from '@privy-io/expo';
import { checkWatchedTokenAlerts } from '../src/lib/notifications';
import { connectOpenClaw, disconnectOpenClaw, isOpenClawAvailable } from '../src/lib/openclaw';
import { useOpenClawStore } from '../src/store/openclaw';
import { registerDeviceNode, startNodeCommandListener } from '../src/lib/openclaw-node';
import { startRugResponseListener } from '../src/lib/openclaw-rug-response';
import { setupWatchlistMonitor, startWatchlistMonitorListener } from '../src/lib/openclaw-monitor';
import { createBriefingCron } from '../src/lib/openclaw-cron';
import { startBriefingListener } from '../src/lib/openclaw-briefing';
import { tokens } from '../src/theme/tokens';
import { ErrorBoundary } from '../src/components/ui/ErrorBoundary';
import { useAuthStore } from '../src/store/auth';

const PRIVY_APP_ID = process.env.EXPO_PUBLIC_PRIVY_APP_ID || '';

SplashScreen.preventAutoHideAsync();

import { queryClient } from '../src/lib/query-client';

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    'Lexend-Light': require('../assets/fonts/Lexend-Light.ttf'),
    'Lexend-Regular': require('../assets/fonts/Lexend-Regular.ttf'),
    'Lexend-Medium': require('../assets/fonts/Lexend-Medium.ttf'),
    'Lexend-SemiBold': require('../assets/fonts/Lexend-SemiBold.ttf'),
    'Lexend-Bold': require('../assets/fonts/Lexend-Bold.ttf'),
  });
  const hydrate = useAuthStore((s) => s.hydrate);
  const hydrated = useAuthStore((s) => s.hydrated);
  const setApiKey = useAuthStore((s) => s.setApiKey);

  // OpenClaw connection state
  const ocHost = useOpenClawStore((s) => s.host);
  const ocToken = useOpenClawStore((s) => s.deviceToken);

  // Handle deep links: lineage://activate?key=XXX&wallet=phantom | lineage://openclaw?host=X&token=Y
  const url = Linking.useURL();
  useEffect(() => {
    if (!url) return;
    try {
      const parsed = Linking.parse(url);
      if (parsed.hostname === 'activate' && typeof parsed.queryParams?.key === 'string' && parsed.queryParams.key) {
        setApiKey(parsed.queryParams.key);
        // After wallet activation, fetch user profile
        const fetchProfile = async () => {
          try {
            const { getMe } = await import('../src/lib/api');
            const user = await getMe(parsed.queryParams!.key as string);
            useAuthStore.getState().setUser(user);
          } catch { /* profile fetch is best-effort */ }
        };
        fetchProfile();
      } else if (parsed.hostname === 'openclaw' && typeof parsed.queryParams?.host === 'string') {
        const store = useOpenClawStore.getState();
        store.setHost(parsed.queryParams.host);
        if (typeof parsed.queryParams?.token === 'string') {
          store.setDeviceToken(parsed.queryParams.token);
        }
        connectOpenClaw(parsed.queryParams.host, parsed.queryParams.token as string ?? '');
      }
    } catch { /* ignore malformed URLs */ }
  }, [url]);

  useEffect(() => {
    hydrate();
    Notifications.requestPermissionsAsync().catch(() => {});
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });

    // Check watched tokens for risk signals when app comes to foreground
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkWatchedTokenAlerts();
    });
    return () => {
      sub.remove();
      disconnectOpenClaw();
    };
  }, []);

  // OpenClaw is optional (power users only) — don't auto-connect.
  // All features work via backend direct API.
  // Only connect if user has explicitly enabled it via deep link or settings.

  // Initialize listeners + crons once OpenClaw is connected
  const ocConnected = useOpenClawStore((s) => s.connected);
  useEffect(() => {
    if (!ocConnected || !isOpenClawAvailable()) return;
    registerDeviceNode();
    const unsubNode = startNodeCommandListener();
    const unsubRug = startRugResponseListener();
    const unsubMonitor = startWatchlistMonitorListener();
    const unsubBriefing = startBriefingListener();
    setupWatchlistMonitor();
    createBriefingCron(8, Intl.DateTimeFormat().resolvedOptions().timeZone);
    return () => {
      unsubNode();
      unsubRug();
      unsubMonitor();
      unsubBriefing();
    };
  }, [ocConnected]);

  useEffect(() => {
    if ((fontsLoaded || fontError) && hydrated) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError, hydrated]);

  if ((!fontsLoaded && !fontError) || !hydrated) return null;

  return (
    <ErrorBoundary>
      <PrivyProvider appId={PRIVY_APP_ID}>
      <GestureHandlerRootView style={styles.root}>
      <QueryClientProvider client={queryClient}>
        <View style={styles.root}>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="(auth)" options={{ headerShown: false, animation: 'fade' }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="token/[mint]"
              options={{ presentation: 'card', animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="deployer/[address]"
              options={{ presentation: 'card', animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="cartel/[id]"
              options={{ presentation: 'card', animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="sol-trace/[mint]"
              options={{ presentation: 'card', animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="compare"
              options={{ presentation: 'card', animation: 'slide_from_bottom' }}
            />
            <Stack.Screen
              name="analysis/[mint]"
              options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
            />
            <Stack.Screen
              name="tree/[mint]"
              options={{ presentation: 'card', animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="chat/[mint]"
              options={{ presentation: 'card', animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="agent/[mint]"
              options={{ headerShown: false, animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="investigate/[mint]"
              options={{ headerShown: false, animation: 'slide_from_right' }}
            />
          </Stack>
        </View>
      </QueryClientProvider>
    </GestureHandlerRootView>
    </PrivyProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.bgMain },
});
