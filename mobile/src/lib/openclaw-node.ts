// ─────────────────────────────────────────────────────────────────────────────
// OpenClaw Device Node — Register capabilities + handle agent invocations
// The mobile app exposes commands that OpenClaw skills/cron jobs can call back.
// ─────────────────────────────────────────────────────────────────────────────
import { isOpenClawAvailable, sendRequest, subscribe } from './openclaw';
import { useAuthStore } from '../store/auth';
import { useAlertsStore } from '../store/alerts';
import { getLineage } from './api';
import { apiClient } from './api-client';
import type { AlertItem } from '../types/api';
import type { DeviceNodeCommand, DeviceNodeResult } from '../types/openclaw';
import * as Notifications from 'expo-notifications';

// ─── Registration ─────────────────────────────────────────────────────────────

export async function registerDeviceNode(): Promise<void> {
  if (!isOpenClawAvailable()) return;

  try {
    await sendRequest('node.register', {
      capabilities: [
        'lineage.scan',
        'lineage.analyze',
        'lineage.watchlist',
        'lineage.alert',
        'lineage.navigate',
        'notifications.send',
      ],
      platform: 'mobile',
    });
  } catch {
    // Best-effort — node registration failing doesn't break the app
  }
}

// ─── Command dispatcher ───────────────────────────────────────────────────────

/** Start listening for agent-invoked commands. Returns cleanup fn. */
export function startNodeCommandListener(): () => void {
  const unsub = subscribe('node.invoke', (payload) => {
    const cmd = payload as DeviceNodeCommand;
    if (!cmd?.id || !cmd?.command) return;
    handleCommand(cmd);
  });

  return unsub;
}

async function handleCommand(cmd: DeviceNodeCommand): Promise<void> {
  let result: DeviceNodeResult;

  try {
    const payload = await dispatchCommand(cmd.command, cmd.params ?? {});
    result = { id: cmd.id, ok: true, payload };
  } catch (err) {
    result = {
      id: cmd.id,
      ok: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }

  // Return result to OpenClaw
  sendRequest('node.invoke.result', { result }).catch(() => {});
}

async function dispatchCommand(
  command: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  switch (command) {
    case 'lineage.scan': {
      const mint = params.mint as string;
      if (!mint) throw new Error('mint param required');
      return await getLineage(mint);
    }

    case 'lineage.analyze': {
      const mint = params.mint as string;
      if (!mint) throw new Error('mint param required');
      const { data } = await apiClient.GET('/analyze/{mint}', {
        params: { path: { mint } },
      });
      return data;
    }

    case 'lineage.watchlist': {
      const watches = useAuthStore.getState().watches ?? [];
      return watches.map((w) => ({
        id: w.id,
        type: w.sub_type,
        value: w.value,
        label: w.label ?? w.identifier,
      }));
    }

    case 'lineage.alert': {
      const alertData = params as Partial<AlertItem>;
      const alert: AlertItem = {
        id: alertData.id ?? `oc-${Date.now()}`,
        type: (alertData.type ?? 'narrative') as AlertItem['type'],
        message: (alertData.message as string) ?? '',
        timestamp: new Date().toISOString(),
        read: false,
        title: alertData.title,
        token_name: alertData.token_name,
        mint: alertData.mint,
        risk_score: alertData.risk_score,
      };
      useAlertsStore.getState().addAlert(alert);
      return { delivered: true };
    }

    case 'notifications.send': {
      const title = (params.title as string) ?? 'Lineage Alert';
      const body = (params.body as string) ?? '';
      await Notifications.scheduleNotificationAsync({
        content: { title, body },
        trigger: null,
      });
      return { delivered: true };
    }

    default:
      throw new Error(`Unknown command: ${command}`);
  }
}
