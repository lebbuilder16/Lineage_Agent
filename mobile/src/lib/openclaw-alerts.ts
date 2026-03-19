/**
 * Alert routing — now uses backend API directly.
 * OpenClaw is no longer required for alert routing.
 */

import type { AlertItem } from '../types/api';
import type { EnrichedAlertData } from '../types/openclaw';

const BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'https://lineage-agent.fly.dev').replace(/\/$/, '');

export function routeAlertToChannels(_alert: AlertItem): void {
  // Alert routing is now server-side — this is a no-op on the mobile side.
  // The backend routes alerts automatically when they are generated.
  // This function is kept for backwards compatibility but does nothing.
}

export async function enrichAlert(alert: AlertItem): Promise<EnrichedAlertData | null> {
  try {
    const res = await fetch(`${BASE_URL}/alerts/enrich`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(alert),
    });
    if (res.ok) return res.json();
  } catch {
    // Enrichment is best-effort
  }
  return null;
}
