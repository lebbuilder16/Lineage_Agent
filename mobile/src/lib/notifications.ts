import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { getLineage } from './api';
import { useAuthStore } from '../store/auth';
import { useAlertsStore } from '../store/alerts';
import type { AlertItem } from '../types/api';

// Configure how notifications are displayed while app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Handle incoming FCM data payloads for investigation-complete events.
 * When a background investigation finishes server-side, the FCM push
 * carries ``type: 'investigation_complete'`` — we sync the result into
 * the local history store so the user sees it immediately.
 */
export function setupNotificationResponseHandler(): Notifications.Subscription {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as Record<string, string> | undefined;
    if (!data) return;

    if (data.type === 'investigation_complete' && data.mint) {
      // Trigger incremental catch-up so the investigation appears in history
      import('../store/history').then(({ useHistoryStore }) => {
        useHistoryStore.getState().catchUp();
      }).catch((e) => console.warn('[notifications] catchUp after investigation_complete failed', e));
    }

    if (data.type === 'sweep_flag' && data.mint) {
      // Deep link to watchlist tab — the auto-expand logic in watchlist.tsx
      // will expand the card for urgent mints automatically
      import('expo-router').then(({ router }) => {
        router.replace('/(tabs)/watchlist');
      }).catch((e) => console.warn('[notifications] deep link to watchlist failed', e));
      // Refresh flags so the new flag appears immediately
      import('../store/sweep-flags').then(({ useSweepFlagsStore }) => {
        useSweepFlagsStore.getState().fetchFlags();
      }).catch(() => {});
    }

    if (data.type === 'pulse_alert' && data.mint) {
      import('expo-router').then(({ router }) => {
        router.replace('/(tabs)/watchlist');
      }).catch((e) => console.warn('[notifications] deep link to watchlist failed', e));
      import('../store/sweep-flags').then(({ useSweepFlagsStore }) => {
        useSweepFlagsStore.getState().fetchFlags();
      }).catch(() => {});
    }
  });
}

/**
 * Request permissions, set up Android channel, and return the **native**
 * FCM / APNS device push token (not the Expo wrapper token).
 * This is the token the backend stores and uses with the FCM v1 HTTP API.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('alerts', {
      name: 'Lineage Alerts',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#CFE6E4',
      sound: 'default',
    });
  }

  // Use native device token (FCM on Android, APNS on iOS) — not Expo push token.
  // The backend sends pushes directly via FCM v1 HTTP API and needs the raw token.
  const token = await Notifications.getDevicePushTokenAsync();
  return token.data as string;
}

export function scheduleLocalAlert(title: string, body: string) {
  Notifications.scheduleNotificationAsync({
    content: { title, body, sound: true },
    trigger: null,
  });
}

// ─── Watched token alerts ──────────────────────────────────────────────────────
// Persistent dedup: mint+signalType → last notified timestamp
// Survives app restart via AsyncStorage
import AsyncStorage from '@react-native-async-storage/async-storage';

const _DEDUP_KEY = 'lineage-alert-dedup';
const COOLDOWN_MS = 1 * 60 * 60 * 1000; // 1 hour per token+signal
let _notifiedAt: Record<string, number> = {};
let _dedupLoaded = false;

/** Reset in-memory dedup state on logout (AsyncStorage key cleared separately). */
export function resetNotificationDedup(): void {
  _notifiedAt = {};
  _dedupLoaded = false;
}

async function _loadDedup(): Promise<void> {
  if (_dedupLoaded) return;
  try {
    const stored = await AsyncStorage.getItem(_DEDUP_KEY);
    if (stored) _notifiedAt = JSON.parse(stored);
  } catch { /* ignore */ }
  _dedupLoaded = true;
}

async function _saveDedup(): Promise<void> {
  try {
    // Prune entries older than 24h
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const pruned: Record<string, number> = {};
    for (const [k, v] of Object.entries(_notifiedAt)) {
      if (v > cutoff) pruned[k] = v;
    }
    _notifiedAt = pruned;
    await AsyncStorage.setItem(_DEDUP_KEY, JSON.stringify(pruned));
  } catch { /* ignore */ }
}

type AlertSignal = {
  title: string;
  body: string;
  priority: number; // higher = more urgent, used to pick strongest signal
};

function detectSignals(data: Awaited<ReturnType<typeof getLineage>>, name: string): AlertSignal | null {
  const ins = data.insider_sell;
  const dc = data.death_clock;
  const br = data.bundle_report;
  const sf = data.sol_flow;

  // Priority 1 — Insider dump + deployer exited (most urgent, live signal)
  if (ins?.verdict === 'insider_dump' && ins?.deployer_exited) {
    const price = ins.price_change_24h != null ? ` · ${ins.price_change_24h.toFixed(0)}% 24h` : '';
    return { title: `⚠️ ${name}`, body: `Insider dump confirmed — deployer exited${price}`, priority: 4 };
  }

  // Priority 2 — Insider dump without confirmed exit
  if (ins?.verdict === 'insider_dump') {
    const sp = ins.sell_pressure_24h != null ? ` · ${(ins.sell_pressure_24h * 100).toFixed(0)}% sell pressure` : '';
    return { title: `🔴 ${name}`, body: `Insider dump detected${sp}`, priority: 3 };
  }

  // Priority 3 — Rug window open (deployer history-based)
  if (dc && dc.sample_count >= 3 && dc.median_rug_hours > 0) {
    const windowStart = Math.max(dc.median_rug_hours - dc.stdev_rug_hours, 0);
    if (dc.elapsed_hours >= windowStart) {
      return {
        title: `⏰ ${name}`,
        body: `Rug window is open (${Math.round(dc.elapsed_hours)}h elapsed · median ${Math.round(dc.median_rug_hours)}h)`,
        priority: 3,
      };
    }
  }

  // Priority 4 — Confirmed bundle extraction
  if (br?.overall_verdict === 'confirmed_team_extraction') {
    const sol = br.total_sol_extracted_confirmed != null
      ? ` · ${br.total_sol_extracted_confirmed.toFixed(1)} SOL`
      : '';
    return { title: `🚨 ${name}`, body: `Confirmed team extraction${sol}`, priority: 2 };
  }

  // Priority 5 — Heavy price crash
  if (ins?.flags?.includes('PRICE_CRASH') && (ins?.price_change_24h ?? 0) < -60) {
    return {
      title: `📉 ${name}`,
      body: `Price crashed ${ins!.price_change_24h!.toFixed(0)}% in 24h`,
      priority: 1,
    };
  }

  // Priority 6 — Large SOL extraction (only if confirmed or suspicious, not protocol fees)
  const sfCtx = (sf as Record<string, unknown>)?.extraction_context as string | undefined;
  if (sf?.total_extracted_sol != null && sf.total_extracted_sol > 50
      && sfCtx && sfCtx !== 'protocol_fees_only' && sfCtx !== 'deployer_operational') {
    return {
      title: `💸 ${name}`,
      body: `${sf.total_extracted_sol.toFixed(1)} SOL ${sfCtx === 'confirmed_extraction' ? 'extracted' : 'moved'} via ${sf.hop_count ?? '?'}-hop chain`,
      priority: 1,
    };
  }

  return null;
}

/**
 * Called when the app comes to foreground.
 * Checks all watched mint tokens for critical risk signals.
 * Fires a local notification for each new signal (deduped per hour).
 */
export async function checkWatchedTokenAlerts(): Promise<void> {
  const { watches, user } = useAuthStore.getState();
  const mintWatches = watches.filter((w) => w.sub_type === 'mint');
  if (mintWatches.length === 0) return;

  // Skip local checks when backend FCM push is active — avoids duplicate alerts.
  // The sweep loop already sends FCM pushes for critical/warning flags.
  // If we have a device push token registered, backend handles notifications.
  try {
    const token = await Notifications.getDevicePushTokenAsync();
    if (token?.data) return; // Backend FCM active — skip local checks
  } catch {
    // No push token → fall through to local checks as fallback
  }

  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return;

  // Load persistent dedup state
  await _loadDedup();
  const now = Date.now();
  let didNotify = false;

  for (const watch of mintWatches) {
    try {
      const data = await getLineage(watch.value);
      const name = data.query_token?.name ?? `${watch.value.slice(0, 6)}…`;
      const signal = detectSignals(data, name);

      if (!signal) continue;

      // Dedup key: mint + signal body (same signal = same key)
      const dedupKey = `${watch.value}:${signal.body}`;
      const lastNotified = _notifiedAt[dedupKey] ?? 0;
      if (now - lastNotified < COOLDOWN_MS) continue;

      // Also check if the alerts store already has this exact signal (prevent duplicates)
      const existingAlerts = useAlertsStore.getState().alerts;
      const alreadyExists = existingAlerts.some(
        (a) => a.mint === watch.value && a.message === signal.body
          && (now - new Date(a.timestamp).getTime()) < COOLDOWN_MS
      );
      if (alreadyExists) {
        _notifiedAt[dedupKey] = now;
        continue;
      }

      _notifiedAt[dedupKey] = now;
      didNotify = true;

      // Add to alerts store so it's visible in the Alerts tab
      const alertItem: AlertItem = {
        id: `local-${watch.value}-${signal.priority}-${Math.floor(now / COOLDOWN_MS)}`,
        type: signal.priority >= 3 ? 'insider' : signal.priority >= 2 ? 'bundle' : 'deployer',
        title: signal.title,
        message: signal.body,
        mint: watch.value,
        token_name: name,
        risk_score: signal.priority * 25,
        timestamp: new Date().toISOString(),
        read: false,
      };
      useAlertsStore.getState().addAlert(alertItem);

      // Also fire local notification
      await Notifications.scheduleNotificationAsync({
        content: {
          title: signal.title,
          body: signal.body,
          sound: true,
          data: { mint: watch.value },
        },
        trigger: null,
      });
    } catch {
      // Silent — token unavailable or network error
    }
  }

  // Persist dedup state if we notified anything
  if (didNotify) await _saveDedup();
}
