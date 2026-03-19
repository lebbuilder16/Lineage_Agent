/**
 * Watchlist monitoring — now server-side.
 * This module is kept for API compatibility but the heavy lifting
 * is done by the backend's schedule_watchlist_sweep() task.
 */

export function setupWatchlistMonitor(): void {
  // No-op: monitoring is now server-side (every 2h sweep)
}

export function startWatchlistMonitorListener(): () => void {
  // No-op: alerts come via the backend WebSocket
  return () => {};
}
