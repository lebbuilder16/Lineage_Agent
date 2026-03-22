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
      lightColor: '#ADC8FF',
      sound: 'default',
    });
  }

  const token = await Notifications.getExpoPushTokenAsync();
  return token.data;
}

export function scheduleLocalAlert(title: string, body: string) {
  Notifications.scheduleNotificationAsync({
    content: { title, body, sound: true },
    trigger: null,
  });
}

// ─── Watched token alerts ──────────────────────────────────────────────────────
// In-memory dedup: mint → last notified timestamp
// Prevents re-alerting the same signal within the cooldown window
const _notifiedAt: Record<string, number> = {};
const COOLDOWN_MS = 60 * 60 * 1000; // 1 hour per token

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

  // Priority 6 — Large SOL extraction
  if (sf?.total_extracted_sol != null && sf.total_extracted_sol > 50) {
    return {
      title: `💸 ${name}`,
      body: `${sf.total_extracted_sol.toFixed(1)} SOL extracted via ${sf.hop_count ?? '?'}-hop chain`,
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
  const watches = useAuthStore.getState().watches;
  const mintWatches = watches.filter((w) => w.sub_type === 'mint');
  if (mintWatches.length === 0) return;

  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return;

  const now = Date.now();

  for (const watch of mintWatches) {
    const lastNotified = _notifiedAt[watch.value] ?? 0;
    if (now - lastNotified < COOLDOWN_MS) continue;

    try {
      const data = await getLineage(watch.value);
      const name = data.query_token?.name ?? `${watch.value.slice(0, 6)}…`;
      const signal = detectSignals(data, name);

      if (signal) {
        _notifiedAt[watch.value] = now;

        // Add to alerts store so it's visible in the Alerts tab
        const alertItem: AlertItem = {
          id: `local-${watch.value}-${now}`,
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
      }
    } catch {
      // Silent — token unavailable or network error
    }
  }
}
