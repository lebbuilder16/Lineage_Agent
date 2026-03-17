import { useEffect } from 'react';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, View, AppState } from 'react-native';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { checkWatchedTokenAlerts } from '../src/lib/notifications';
import { connectOpenClaw, disconnectOpenClaw } from '../src/lib/openclaw';
import { useOpenClawStore } from '../src/store/openclaw';
import { registerDeviceNode, startNodeCommandListener } from '../src/lib/openclaw-node';
import { startRugResponseListener } from '../src/lib/openclaw-rug-response';
import { tokens } from '../src/theme/tokens';
import { ErrorBoundary } from '../src/components/ui/ErrorBoundary';
import { useAuthStore } from '../src/store/auth';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 30_000,
    },
  },
});

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

  // Handle deep links: lineage://activate?key=XXX | lineage://openclaw?host=X&token=Y
  const url = Linking.useURL();
  useEffect(() => {
    if (!url) return;
    try {
      const parsed = Linking.parse(url);
      if (parsed.hostname === 'activate' && typeof parsed.queryParams?.key === 'string' && parsed.queryParams.key) {
        setApiKey(parsed.queryParams.key);
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

  // Connect OpenClaw when host becomes available (after AsyncStorage hydration)
  useEffect(() => {
    if (!ocHost) return;
    connectOpenClaw(ocHost, ocToken ?? '');
    let unsubNode: (() => void) | undefined;
    let unsubRug: (() => void) | undefined;
    const t = setTimeout(() => {
      registerDeviceNode();
      unsubNode = startNodeCommandListener();
      unsubRug = startRugResponseListener();
    }, 1_500);
    return () => {
      clearTimeout(t);
      unsubNode?.();
      unsubRug?.();
    };
  }, [ocHost]);

  useEffect(() => {
    if ((fontsLoaded || fontError) && hydrated) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError, hydrated]);

  if ((!fontsLoaded && !fontError) || !hydrated) return null;

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={styles.root}>
      <QueryClientProvider client={queryClient}>
        <View style={styles.root}>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false }}>
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
          </Stack>
        </View>
      </QueryClientProvider>
    </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.bgMain },
});
