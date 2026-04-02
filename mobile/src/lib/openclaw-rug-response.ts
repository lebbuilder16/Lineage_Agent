// ─────────────────────────────────────────────────────────────────────────────
// OpenClaw Rug Response — Automated analysis on rug detection
// Subscribes to rug alerts and triggers parallel analysis, then pushes
// an enriched report with proposed actions back into the alert store.
// ─────────────────────────────────────────────────────────────────────────────
import { isOpenClawAvailable, sendRequest, subscribe } from './openclaw';
import { useAlertsStore } from '../store/alerts';
import { routeAlertToChannels } from './openclaw-alerts';
import type { AlertItem } from '../types/api';
import type { AlertAction } from '../types/openclaw';

// ─── Listener ────────────────────────────────────────────────────────────────

/** Start listening for rug alerts to trigger automated response. Returns cleanup fn. */
export function startRugResponseListener(): () => void {
  const unsub = subscribe('alert', (payload) => {
    if (!payload || typeof payload !== 'object') return;

    const alert = payload as AlertItem;
    if (alert.type !== 'rug') return;
    if (!isOpenClawAvailable()) return;

    // Fire async rug response without blocking
    handleRugAlert(alert).catch((e) => console.warn('[openclaw-rug] handler failed', e));
  });

  return unsub;
}

// ─── Internal ────────────────────────────────────────────────────────────────

async function handleRugAlert(alert: AlertItem): Promise<void> {
  const mint = alert.mint;
  if (!mint) return;

  // 1. Immediate multi-channel escalation (already done by streaming.ts hook,
  //    but rug warrants a second push with CRITICAL priority)
  routeAlertToChannels({ ...alert, risk_score: 100 });

  try {
    // 2. Ask OpenClaw to run deep analysis in parallel
    const analysis = await sendRequest<{
      cartelSummary?: string;
      relatedTokens?: string[];
      deployerRugRate?: number;
      estimatedDamage?: string;
    }>('chat.send', {
      sessionKey: 'lineage:rug-response',
      message: [
        `URGENT: Rug detected on token ${mint} (${alert.token_name ?? 'unknown'}).`,
        'Perform rapid response analysis:',
        '1. Use Lineage API to fetch cartel/deployer data for this mint',
        '2. Identify other tokens at risk from the same deployer',
        '3. Estimate total damage (SOL extracted)',
        '4. Return JSON: { cartelSummary, relatedTokens, deployerRugRate, estimatedDamage }',
      ].join('\n'),
      responseFormat: 'json',
    });

    if (!analysis) return;

    // 3. Build proposed actions
    const actions: AlertAction[] = [];

    if (analysis.relatedTokens && analysis.relatedTokens.length > 0) {
      actions.push({
        label: `Scan ${analysis.relatedTokens.length} related token${analysis.relatedTokens.length > 1 ? 's' : ''}`,
        action: 'lineage.scan_batch',
        params: { mints: analysis.relatedTokens.join(',') },
      });
    }

    actions.push({
      label: 'View token details',
      action: 'lineage.navigate',
      params: { path: `/token/${mint}` },
    });

    // 4. Enrich the alert in store with rug response data
    const enrichedData = {
      summary: [
        analysis.cartelSummary ?? `Rug confirmed on ${alert.token_name ?? mint}.`,
        analysis.estimatedDamage ? `Estimated damage: ${analysis.estimatedDamage}` : null,
        analysis.deployerRugRate != null
          ? `Deployer rug rate: ${(analysis.deployerRugRate * 100).toFixed(0)}%`
          : null,
      ]
        .filter(Boolean)
        .join(' '),
      relatedTokens: analysis.relatedTokens ?? [],
      riskDelta: 100 - (alert.risk_score ?? 50),
      recommendedAction: 'Avoid all tokens from this deployer immediately',
    };

    useAlertsStore.getState().updateEnrichment(alert.id, enrichedData);

    // Also inject proposed actions
    useAlertsStore.setState((state) => ({
      alerts: state.alerts.map((a) =>
        a.id === alert.id ? { ...a, actions } : a,
      ),
    }));
  } catch {
    // Best-effort — failure to enrich doesn't block the alert
  }
}
