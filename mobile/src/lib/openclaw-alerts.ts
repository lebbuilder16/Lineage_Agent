// ─────────────────────────────────────────────────────────────────────────────
// OpenClaw Alerts — Multi-channel routing + AI enrichment
// Fire-and-forget: local alert store always receives alerts first (instant).
// OpenClaw routing is async, best-effort.
// ─────────────────────────────────────────────────────────────────────────────
import { isOpenClawAvailable, sendRequest } from './openclaw';
import { useAlertPrefsStore } from '../store/alert-prefs';
import type { AlertItem } from '../types/api';
import type { EnrichedAlertData, AlertChannelId } from '../types/openclaw';

/**
 * Route an alert to external channels via OpenClaw.
 * Fire-and-forget — errors are silently ignored.
 */
export function routeAlertToChannels(alert: AlertItem): void {
  if (!isOpenClawAvailable()) return;

  const prefs = useAlertPrefsStore.getState();
  const channels = getEscalationChannels(alert, prefs.escalationRules);

  if (channels.length === 0) return;

  const formattedMessage = formatAlertMessage(alert);

  // Fire-and-forget delivery via OpenClaw agent
  sendRequest('send', {
    sessionKey: 'lineage:alerts',
    message: formattedMessage,
    deliver: channels.map((ch) => ({ channel: ch })),
  }).catch(() => {
    // Best-effort — don't block on failure
  });
}

/**
 * Ask OpenClaw to enrich an alert with AI context.
 * Returns enrichment data or null on failure.
 */
export async function enrichAlert(alert: AlertItem): Promise<EnrichedAlertData | null> {
  if (!isOpenClawAvailable()) return null;

  try {
    const result = await sendRequest<EnrichedAlertData>('chat.send', {
      sessionKey: 'lineage:alert-enrichment',
      message: [
        'Enrich this Lineage alert with context. Return JSON with: summary, relatedTokens (mints), riskDelta, recommendedAction.',
        `Alert type: ${alert.type}`,
        `Token: ${alert.token_name ?? 'unknown'} (${alert.mint ?? 'no mint'})`,
        `Message: ${alert.message}`,
        `Risk score: ${alert.risk_score ?? 'unknown'}`,
      ].join('\n'),
      responseFormat: 'json',
    });

    if (result && typeof result === 'object' && 'summary' in result) {
      return result;
    }

    // Try to parse if returned as string
    if (typeof result === 'string') {
      try {
        return JSON.parse(result) as EnrichedAlertData;
      } catch { /* not valid JSON */ }
    }

    return null;
  } catch {
    return null;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getEscalationChannels(
  alert: AlertItem,
  rules: { alertType: string; minRiskScore?: number; channels: AlertChannelId[] }[],
): AlertChannelId[] {
  const prefs = useAlertPrefsStore.getState();
  const enabledChannels = new Set<AlertChannelId>();

  // Check each rule
  for (const rule of rules) {
    const typeMatch = rule.alertType === '*' || rule.alertType === alert.type;
    const scoreMatch = !rule.minRiskScore || (alert.risk_score ?? 0) >= rule.minRiskScore;

    if (typeMatch && scoreMatch) {
      for (const ch of rule.channels) {
        if (prefs.channels[ch]) {
          enabledChannels.add(ch);
        }
      }
    }
  }

  return [...enabledChannels];
}

function formatAlertMessage(alert: AlertItem): string {
  const severity =
    alert.type === 'rug' ? 'CRITICAL'
      : alert.type === 'insider' || alert.type === 'bundle' ? 'WARNING'
        : 'INFO';

  const emoji =
    severity === 'CRITICAL' ? '\u{1F6A8}'
      : severity === 'WARNING' ? '\u{26A0}\u{FE0F}'
        : '\u{2139}\u{FE0F}';

  return [
    `${emoji} **Lineage Alert** [${severity}]`,
    '',
    `**Type:** ${alert.type.toUpperCase()}`,
    alert.token_name ? `**Token:** ${alert.token_name}` : null,
    alert.mint ? `**Mint:** \`${alert.mint}\`` : null,
    `**Message:** ${alert.message}`,
    alert.risk_score != null ? `**Risk Score:** ${alert.risk_score}/100` : null,
    '',
    `_${new Date(alert.timestamp).toLocaleString()}_`,
  ]
    .filter(Boolean)
    .join('\n');
}
