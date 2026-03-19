/**
 * Cartel monitoring — now uses backend API.
 */

const BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'https://lineage-agent.fly.dev').replace(/\/$/, '');

export async function startCartelMonitor(cartelId: string, _label?: string): Promise<void> {
  try {
    await fetch(`${BASE_URL}/auth/cartel-monitors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cartel_id: cartelId }),
    });
  } catch {
    console.warn('[cartel-monitor] failed to start monitoring', cartelId);
  }
}

export async function stopCartelMonitor(cartelId: string): Promise<void> {
  try {
    await fetch(`${BASE_URL}/auth/cartel-monitors/${encodeURIComponent(cartelId)}`, {
      method: 'DELETE',
    });
  } catch {
    console.warn('[cartel-monitor] failed to stop monitoring', cartelId);
  }
}

export async function isCartelMonitored(cartelId: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/auth/cartel-monitors`);
    if (res.ok) {
      const monitors = await res.json();
      return monitors.some((m: { cartel_id: string }) => m.cartel_id === cartelId);
    }
  } catch { /* ignore */ }
  return false;
}
