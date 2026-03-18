// ─────────────────────────────────────────────────────────────────────────────
// OpenClaw Watchlist Monitor — Periodic rescan of watched tokens via cron
// Creates/updates a cron job on the gateway that triggers lineage.scan
// for each watched token, then compares risk levels and fires alerts.
// ─────────────────────────────────────────────────────────────────────────────
import { isOpenClawAvailable, sendRequest, subscribe } from './openclaw';
import { useAuthStore } from '../store/auth';
import { useAlertsStore } from '../store/alerts';
import { getLineage } from './api';
import { queryClient } from './query-client';
import { QK } from './query';
import type { LineageResult, AlertItem } from '../types/api';

const CRON_NAME = 'lineage:watchlist-monitor';
const MONITOR_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 hours

/**
 * Register the watchlist monitoring cron job on the OpenClaw gateway.
 * Safe to call multiple times — upserts the cron.
 */
export async function setupWatchlistMonitor(): Promise<void> {
  if (!isOpenClawAvailable()) return;

  try {
    await sendRequest('cron.upsert', {
      name: CRON_NAME,
      intervalMs: MONITOR_INTERVAL_MS,
      command: 'lineage.watchlist-check',
      enabled: true,
    });
  } catch {
    // Cron registration is best-effort
  }
}

/**
 * Listen for cron-triggered watchlist check commands and run the scan.
 * Returns cleanup function.
 */
export function startWatchlistMonitorListener(): () => void {
  const unsub = subscribe('cron.result', (payload) => {
    if (!payload || typeof payload !== 'object') return;
    const p = payload as { name?: string };
    if (p.name !== CRON_NAME) return;

    // Cron fired — run the watchlist check
    runWatchlistCheck().catch(() => {});
  });

  return unsub;
}

/**
 * Run a full watchlist rescan — compare new results with cached data,
 * fire alerts if risk level changed.
 */
export async function runWatchlistCheck(): Promise<void> {
  const watches = useAuthStore.getState().watches ?? [];
  const tokenWatches = watches.filter((w) => w.sub_type === 'mint');

  for (const watch of tokenWatches) {
    const mint = watch.value;
    if (!mint) continue;

    try {
      // Get previously cached result
      const cached = queryClient.getQueryData<LineageResult>(QK.lineage(mint));
      const oldRisk = cached?.death_clock?.risk_level ?? 'insufficient_data';

      // Fetch fresh data
      const fresh = await getLineage(mint);

      // Update the query cache
      queryClient.setQueryData(QK.lineage(mint), fresh);

      const newRisk = fresh.death_clock?.risk_level ?? 'insufficient_data';

      // Alert if risk escalated
      if (isEscalation(oldRisk, newRisk)) {
        const alert: AlertItem = {
          id: `monitor-${mint}-${Date.now()}`,
          type: 'narrative',
          title: `Risk escalation: ${fresh.root?.name ?? mint}`,
          message: `Risk level changed from ${oldRisk.toUpperCase()} to ${newRisk.toUpperCase()}`,
          timestamp: new Date().toISOString(),
          read: false,
          token_name: fresh.root?.name,
          mint,
          risk_score: fresh.death_clock?.rug_probability_pct ?? undefined,
        };
        useAlertsStore.getState().addAlert(alert);
      }
    } catch {
      // Skip failed tokens — don't block the rest
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const RISK_ORDER: Record<string, number> = {
  insufficient_data: 0,
  low: 1,
  medium: 2,
  high: 3,
  first_rug: 4,
  critical: 5,
};

function isEscalation(oldLevel: string, newLevel: string): boolean {
  const oldScore = RISK_ORDER[oldLevel] ?? 0;
  const newScore = RISK_ORDER[newLevel] ?? 0;
  return newScore > oldScore && newScore >= 2; // Only alert medium+
}
