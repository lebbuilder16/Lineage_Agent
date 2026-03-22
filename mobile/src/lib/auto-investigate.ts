/**
 * Auto-investigate — triggers background investigation when high-risk alerts arrive.
 * Checks agent prefs before firing. Results land in history store.
 */
import { useAgentPrefsStore } from '../store/agent-prefs';
import { useHistoryStore } from '../store/history';
import { useAuthStore } from '../store/auth';
import type { AlertItem } from '../types/api';

const BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'https://lineage-agent.fly.dev').replace(/\/$/, '');
const RISK_THRESHOLD = 70;
const _inFlight = new Set<string>();

/**
 * Called on every new WebSocket alert. Checks prefs and triggers
 * a background investigation if conditions are met.
 */
export function maybeAutoInvestigate(alert: AlertItem): void {
  // 1. Check pref
  const { autoInvestigate } = useAgentPrefsStore.getState();
  if (!autoInvestigate) return;

  // 2. Check risk threshold
  const score = alert.risk_score ?? 0;
  if (score < RISK_THRESHOLD) return;

  // 3. Need a mint to investigate
  const mint = alert.mint;
  if (!mint) return;

  // 4. Don't duplicate in-flight investigations
  if (_inFlight.has(mint)) return;

  // 5. Skip if already investigated recently (within 1 hour)
  const existing = useHistoryStore.getState().getByMint(mint);
  if (existing && Date.now() - existing.timestamp < 3600_000) return;

  // 6. Need API key
  const apiKey = useAuthStore.getState().apiKey;
  if (!apiKey) return;

  // Fire and forget
  _inFlight.add(mint);
  _runBackgroundInvestigation(mint, apiKey, alert).finally(() => {
    _inFlight.delete(mint);
  });
}

async function _runBackgroundInvestigation(
  mint: string,
  apiKey: string,
  alert: AlertItem,
): Promise<void> {
  try {
    const url = `${BASE_URL}/investigate/${encodeURIComponent(mint)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({}),
    });

    if (!res.ok) return;

    // Parse SSE response to extract verdict
    const text = await res.text();
    const lines = text.split('\n');
    let verdict: Record<string, unknown> | null = null;

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        try {
          const parsed = JSON.parse(data);
          // Look for verdict event
          if (parsed.risk_score != null && parsed.verdict_summary) {
            verdict = parsed;
          }
        } catch {
          // skip malformed lines
        }
      }
    }

    if (verdict) {
      useHistoryStore.getState().addInvestigation({
        mint,
        name: alert.token_name ?? '',
        symbol: '',
        riskScore: (verdict.risk_score as number) ?? 0,
        verdict: (verdict.verdict_summary as string) ?? '',
        keyFindings: Array.isArray(verdict.key_findings) ? verdict.key_findings as string[] : [],
        timestamp: Date.now(),
      });
      console.log('[auto-investigate] verdict recorded for', mint.slice(0, 8));
    }
  } catch (err) {
    console.warn('[auto-investigate] failed for', mint.slice(0, 8), err);
  }
}
