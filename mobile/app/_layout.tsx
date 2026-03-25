import 'react-native-get-random-values'; // Polyfill crypto.getRandomValues for tweetnacl — MUST be first
import { useEffect, useRef } from 'react';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, View, AppState } from 'react-native';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { PrivyProvider, usePrivy, useEmbeddedSolanaWallet } from '@privy-io/expo';
import { checkWatchedTokenAlerts, setupNotificationResponseHandler } from '../src/lib/notifications';
import { connectAlertsWS } from '../src/lib/streaming';
import { useAlertsStore } from '../src/store/alerts';
import { maybeAutoInvestigate } from '../src/lib/auto-investigate';
import { connectOpenClaw, disconnectOpenClaw, isOpenClawAvailable } from '../src/lib/openclaw';
import { useOpenClawStore } from '../src/store/openclaw';
import { registerDeviceNode, startNodeCommandListener } from '../src/lib/openclaw-node';
import { startRugResponseListener } from '../src/lib/openclaw-rug-response';
import { setupWatchlistMonitor, startWatchlistMonitorListener } from '../src/lib/openclaw-monitor';
import { createBriefingCron } from '../src/lib/openclaw-cron';
import { startBriefingListener } from '../src/lib/openclaw-briefing';
import { tokens } from '../src/theme/tokens';
import { ErrorBoundary } from '../src/components/ui/ErrorBoundary';
import { AuroraBackground } from '../src/components/ui/AuroraBackground';
import { useAuthStore } from '../src/store/auth';

const PRIVY_APP_ID = process.env.EXPO_PUBLIC_PRIVY_APP_ID || '';
const PRIVY_CLIENT_ID = process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID || '';

SplashScreen.preventAutoHideAsync();

/**
 * Auto-create embedded Solana wallet for authenticated users who don't have one.
 * Must be a child of PrivyProvider (needs Privy hooks).
 * createOnLogin is 'off' to avoid session conflicts during logout/re-login.
 * This component handles wallet creation AFTER login, in the global layout.
 */
function WalletAutoCreate({ children }: { children: React.ReactNode }) {
  const { user: privyUser } = usePrivy();
  const embeddedWallet = useEmbeddedSolanaWallet();
  const attemptedRef = useRef(false);

  useEffect(() => {
    // Only attempt once per mount, when user is authenticated but has no wallet
    if (
      privyUser &&
      embeddedWallet.status === 'not-created' &&
      !attemptedRef.current
    ) {
      attemptedRef.current = true;
      console.log('[wallet] Auto-creating embedded Solana wallet for', privyUser.id?.slice(0, 12));
      embeddedWallet.create?.()
        .then(() => console.log('[wallet] Embedded wallet created'))
        .catch((err: unknown) => console.log('[wallet] Create failed (may already exist):', err));
    }
    // Reset flag when user logs out
    if (!privyUser) {
      attemptedRef.current = false;
    }
  }, [privyUser, embeddedWallet.status]);

  // Sync wallet address to backend when connected
  useEffect(() => {
    if (
      privyUser &&
      embeddedWallet.status === 'connected' &&
      embeddedWallet.wallets.length > 0
    ) {
      import('../src/lib/privy-auth').then(({ updateWalletAddress }) => {
        updateWalletAddress(privyUser.id, embeddedWallet.wallets[0].address);
      }).catch(() => {});
    }
  }, [privyUser, embeddedWallet.status]);

  return <>{children}</>;
}

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
  // IMPORTANT: Ignore wallet callback URLs (wallet_action param) — those are handled by Privy connectors
  const url = Linking.useURL();
  useEffect(() => {
    if (!url) return;
    try {
      const parsed = Linking.parse(url);
      // Skip wallet deep link callbacks — Privy connectors handle these via their own Linking listener
      if (parsed.queryParams?.wallet_action || parsed.queryParams?.wallet_id) {
        return;
      }
      if (parsed.hostname === 'activate' && typeof parsed.queryParams?.key === 'string' && parsed.queryParams.key) {
        setApiKey(parsed.queryParams.key);
        const fetchProfile = async () => {
          try {
            const { getMe } = await import('../src/lib/api');
            const user = await getMe(parsed.queryParams?.key as string);
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

  const apiKey = useAuthStore((s) => s.apiKey);

  // One-time setup: auth hydration, notifications, foreground check
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

    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        // Catch up on alerts from watched tokens
        checkWatchedTokenAlerts();
        // Catch up on investigations completed while offline
        import('../src/store/history').then(({ useHistoryStore }) => {
          useHistoryStore.getState().catchUp();
        }).catch(() => {});
      }
    });

    // Handle taps on FCM push notifications (investigation-complete, etc.)
    const notifSub = setupNotificationResponseHandler();

    return () => {
      sub.remove();
      notifSub.remove();
      disconnectOpenClaw();
    };
  }, []);

  // User-scoped: WebSocket alerts + history hydration — reconnect on account change
  useEffect(() => {
    console.log(`[_layout] apiKey effect fired — apiKey=${apiKey ? apiKey.slice(0, 8) + '...' : 'null'}`);
    if (!apiKey) return;

    // Hydrate investigation history for the current user
    import('../src/store/history').then(({ useHistoryStore }) => {
      useHistoryStore.getState().hydrate();
    }).catch(() => {});

    const _addAlert = useAlertsStore.getState().addAlert;
    const _setWsConnected = useAlertsStore.getState().setWsConnected;
    const addAlertWithAutoInvestigate = (alert: any) => {
      _addAlert(alert);
      maybeAutoInvestigate(alert);
    };
    const wsCleanup = connectAlertsWS(
      addAlertWithAutoInvestigate,
      undefined,
      (connected) => _setWsConnected(connected),
      undefined,
      apiKey,
    );

    // Polling fallback: fetch /graduations every 30s to catch alerts
    // missed during WebSocket disconnections (mobile background, network switch)
    const BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'https://lineage-agent.fly.dev').replace(/\/$/, '');
    let lastGradTs = Date.now() / 1000;
    const pollTimer = setInterval(async () => {
      try {
        const res = await fetch(`${BASE_URL}/graduations?limit=10`);
        if (!res.ok) return;
        const grads = await res.json();
        for (const g of grads) {
          if (g.timestamp && g.timestamp > lastGradTs && g.mint) {
            const alert = {
              id: `grad-${g.mint}-${g.timestamp}`,
              type: 'token_graduated' as const,
              title: g.name || g.symbol || g.mint?.slice(0, 8),
              message: `Graduated to DEX`,
              token_name: g.name || g.symbol || g.mint?.slice(0, 8),
              mint: g.mint,
              image_uri: g.image_uri,
              deployer: g.deployer,
              timestamp: new Date(g.timestamp * 1000).toISOString(),
              read: false,
            };
            addAlertWithAutoInvestigate(alert as any);
          }
        }
        if (grads.length > 0 && grads[0].timestamp) {
          lastGradTs = grads[0].timestamp;
        }
      } catch { /* best-effort */ }
    }, 30_000);

    return () => {
      wsCleanup();
      clearInterval(pollTimer);
    };
  }, [apiKey]);

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

  const appContent = (
    <GestureHandlerRootView style={styles.root}>
      <AuroraBackground />
      <QueryClientProvider client={queryClient}>
        <View style={styles.root}>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: tokens.bgMain } }}>
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
  );

  return (
    <ErrorBoundary>
      {PRIVY_APP_ID ? (
        <PrivyProvider
          appId={PRIVY_APP_ID}
          clientId={PRIVY_CLIENT_ID || undefined}
          config={{
            embedded: {
              solana: {
                createOnLogin: 'off',
              },
            },
          }}
        >
          <WalletAutoCreate>
            {appContent}
          </WalletAutoCreate>
        </PrivyProvider>
      ) : (
        appContent
      )}
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.bgMain },
});
