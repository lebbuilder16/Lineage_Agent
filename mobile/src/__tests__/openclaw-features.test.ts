// Tests for OpenClaw advanced features:
//   - Briefing listener (startBriefingListener)
//   - Device node commands (startNodeCommandListener, registerDeviceNode)
//   - Rug response listener (startRugResponseListener)
//   - Cartel monitor (startCartelMonitor, stopCartelMonitor, isCartelMonitored)

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

// ─── Mock openclaw.ts ─────────────────────────────────────────────────────────

jest.mock('../lib/openclaw', () => ({
  isOpenClawAvailable: jest.fn(),
  sendRequest: jest.fn(),
  subscribe: jest.fn(),
}));

// ─── Mock api.ts ──────────────────────────────────────────────────────────────

jest.mock('../lib/api', () => ({
  getLineage: jest.fn(),
}));

// ─── Mock openclaw-alerts.ts ──────────────────────────────────────────────────

jest.mock('../lib/openclaw-alerts', () => ({
  routeAlertToChannels: jest.fn(),
}));

// ─── Mock openclaw-cron.ts ────────────────────────────────────────────────────

jest.mock('../lib/openclaw-cron', () => ({
  listCronJobs: jest.fn(),
  removeCronJob: jest.fn(),
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import * as OpenClaw from '../lib/openclaw';
import * as Api from '../lib/api';
import * as OcAlerts from '../lib/openclaw-alerts';
import * as OcCron from '../lib/openclaw-cron';
import * as Notifications from 'expo-notifications';

import { useBriefingStore, startBriefingListener } from '../lib/openclaw-briefing';
import { registerDeviceNode, startNodeCommandListener } from '../lib/openclaw-node';
import { startRugResponseListener } from '../lib/openclaw-rug-response';
import {
  startCartelMonitor,
  stopCartelMonitor,
  isCartelMonitored,
} from '../lib/openclaw-cartel-monitor';
import { useAlertsStore } from '../store/alerts';
import { useAuthStore } from '../store/auth';
import type { AlertItem } from '../types/api';
import type { CronJobStatus } from '../types/openclaw';

const mockIsAvailable = jest.mocked(OpenClaw.isOpenClawAvailable);
const mockSendRequest = jest.mocked(OpenClaw.sendRequest);
const mockSubscribe = jest.mocked(OpenClaw.subscribe);
const mockGetLineage = jest.mocked(Api.getLineage);
const mockRouteAlertToChannels = jest.mocked(OcAlerts.routeAlertToChannels);
const mockListCronJobs = jest.mocked(OcCron.listCronJobs);
const mockRemoveCronJob = jest.mocked(OcCron.removeCronJob);

// ─── Event emission helper ────────────────────────────────────────────────────

// Collect subscriber callbacks registered via subscribe() so we can emit events
const subscribers = new Map<string, Set<(p: unknown) => void>>();

function setupSubscribeMock() {
  mockSubscribe.mockImplementation((event, cb) => {
    let set = subscribers.get(event);
    if (!set) { set = new Set(); subscribers.set(event, set); }
    set.add(cb);
    return () => { set!.delete(cb); };
  });
}

function emitEvent(event: string, payload: unknown) {
  const set = subscribers.get(event);
  if (set) { for (const cb of set) { cb(payload); } }
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  subscribers.clear();
  jest.clearAllMocks();
  mockIsAvailable.mockReturnValue(false);
  mockSendRequest.mockResolvedValue({});
  mockListCronJobs.mockResolvedValue([]);
  mockRemoveCronJob.mockResolvedValue(undefined);
  setupSubscribeMock();

  // Reset stores
  useBriefingStore.setState({ latest: null, receivedAt: null, unread: false });
  useAlertsStore.setState({ alerts: [], wsConnected: false });
  useAuthStore.setState({ apiKey: 'test-key', user: null, watches: [], scanCount: 0, hydrated: true });
});

// ─── Briefing Listener ────────────────────────────────────────────────────────

describe('startBriefingListener', () => {
  it('subscribes to cron.result events', () => {
    startBriefingListener();
    expect(mockSubscribe).toHaveBeenCalledWith('cron.result', expect.any(Function));
  });

  it('stores briefing content when name starts with lineage:briefing', () => {
    startBriefingListener();

    emitEvent('cron.result', {
      name: 'lineage:briefing',
      result: '# Daily Briefing\n\nAll clear today.',
    });

    const { latest, unread } = useBriefingStore.getState();
    expect(latest).toBe('# Daily Briefing\n\nAll clear today.');
    expect(unread).toBe(true);
  });

  it('uses output field as fallback', () => {
    startBriefingListener();
    emitEvent('cron.result', { name: 'lineage:briefing', output: 'Briefing from output field' });
    expect(useBriefingStore.getState().latest).toBe('Briefing from output field');
  });

  it('uses text field as second fallback', () => {
    startBriefingListener();
    emitEvent('cron.result', { name: 'lineage:briefing', text: 'Briefing from text field' });
    expect(useBriefingStore.getState().latest).toBe('Briefing from text field');
  });

  it('ignores events with wrong name prefix', () => {
    startBriefingListener();
    emitEvent('cron.result', { name: 'lineage:watchlist:w1', result: 'watchlist result' });
    expect(useBriefingStore.getState().latest).toBeNull();
  });

  it('ignores events with empty content', () => {
    startBriefingListener();
    emitEvent('cron.result', { name: 'lineage:briefing', result: '   ' });
    expect(useBriefingStore.getState().latest).toBeNull();
  });

  it('returns an unsubscribe function that stops further updates', () => {
    const unsub = startBriefingListener();
    unsub();
    emitEvent('cron.result', { name: 'lineage:briefing', result: 'after unsub' });
    expect(useBriefingStore.getState().latest).toBeNull();
  });

  it('sets receivedAt when briefing is stored', () => {
    startBriefingListener();
    emitEvent('cron.result', { name: 'lineage:briefing', result: 'content' });
    expect(useBriefingStore.getState().receivedAt).toBeTruthy();
    expect(new Date(useBriefingStore.getState().receivedAt!).getTime()).not.toBeNaN();
  });
});

describe('useBriefingStore.markRead', () => {
  it('clears unread flag', () => {
    useBriefingStore.setState({ latest: 'content', unread: true });
    useBriefingStore.getState().markRead();
    expect(useBriefingStore.getState().unread).toBe(false);
  });
});

describe('useBriefingStore.clear', () => {
  it('resets all briefing state', () => {
    useBriefingStore.setState({ latest: 'some content', receivedAt: '2024-01-01', unread: true });
    useBriefingStore.getState().clear();
    const { latest, receivedAt, unread } = useBriefingStore.getState();
    expect(latest).toBeNull();
    expect(receivedAt).toBeNull();
    expect(unread).toBe(false);
  });
});

// ─── Device Node ──────────────────────────────────────────────────────────────

describe('registerDeviceNode', () => {
  it('does nothing when OpenClaw is unavailable', async () => {
    mockIsAvailable.mockReturnValue(false);
    await registerDeviceNode();
    expect(mockSendRequest).not.toHaveBeenCalled();
  });

  it('sends node.register with capabilities', async () => {
    mockIsAvailable.mockReturnValue(true);
    await registerDeviceNode();

    expect(mockSendRequest).toHaveBeenCalledWith('node.register', expect.objectContaining({
      capabilities: expect.arrayContaining([
        'lineage.scan',
        'lineage.watchlist',
        'lineage.alert',
        'notifications.send',
      ]),
    }));
  });

  it('does not throw when sendRequest fails', async () => {
    mockIsAvailable.mockReturnValue(true);
    mockSendRequest.mockRejectedValueOnce(new Error('Node registration failed'));
    await expect(registerDeviceNode()).resolves.toBeUndefined();
  });
});

describe('startNodeCommandListener', () => {
  it('subscribes to node.invoke events', () => {
    startNodeCommandListener();
    expect(mockSubscribe).toHaveBeenCalledWith('node.invoke', expect.any(Function));
  });

  it('returns unsubscribe function', () => {
    const unsub = startNodeCommandListener();
    expect(typeof unsub).toBe('function');
  });

  describe('lineage.scan command', () => {
    it('calls getLineage with mint param and returns result', async () => {
      mockIsAvailable.mockReturnValue(true);
      const lineageData = { mint: 'abc', risk_score: 75 };
      mockGetLineage.mockResolvedValueOnce(lineageData as any);
      startNodeCommandListener();

      emitEvent('node.invoke', {
        id: 'cmd-1',
        command: 'lineage.scan',
        params: { mint: 'abc123' },
      });

      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(mockGetLineage).toHaveBeenCalledWith('abc123');
      expect(mockSendRequest).toHaveBeenCalledWith('node.invoke.result', {
        result: { id: 'cmd-1', ok: true, payload: lineageData },
      });
    });

    it('returns error when mint param is missing', async () => {
      mockIsAvailable.mockReturnValue(true);
      startNodeCommandListener();

      emitEvent('node.invoke', { id: 'cmd-2', command: 'lineage.scan', params: {} });

      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(mockSendRequest).toHaveBeenCalledWith('node.invoke.result', {
        result: expect.objectContaining({ id: 'cmd-2', ok: false }),
      });
    });
  });

  describe('lineage.watchlist command', () => {
    it('returns formatted watchlist from auth store', async () => {
      mockIsAvailable.mockReturnValue(true);
      useAuthStore.setState({
        watches: [
          { id: 'w1', value: 'mint1', sub_type: 'mint', identifier: 'id1', label: 'Token 1', created_at: '' },
          { id: 'w2', value: 'dep1', sub_type: 'deployer', identifier: 'id2', label: null, created_at: '' },
        ],
      } as any);

      startNodeCommandListener();
      emitEvent('node.invoke', { id: 'cmd-3', command: 'lineage.watchlist', params: {} });

      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      const call = mockSendRequest.mock.calls.find((c) => c[0] === 'node.invoke.result');
      const result = (call?.[1] as { result: { ok: boolean; payload: unknown[] } })?.result;
      expect(result?.ok).toBe(true);
      expect(result?.payload).toHaveLength(2);
      expect((result?.payload as any[])[0]).toMatchObject({ id: 'w1', type: 'mint', value: 'mint1' });
    });
  });

  describe('lineage.alert command', () => {
    it('adds alert to the alerts store', async () => {
      mockIsAvailable.mockReturnValue(true);
      startNodeCommandListener();

      emitEvent('node.invoke', {
        id: 'cmd-4',
        command: 'lineage.alert',
        params: { type: 'insider', message: 'Insider trading detected', risk_score: 72 },
      });

      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      const { alerts } = useAlertsStore.getState();
      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe('insider');
      expect(alerts[0].message).toBe('Insider trading detected');
    });
  });

  describe('notifications.send command', () => {
    it('calls expo-notifications with title and body', async () => {
      mockIsAvailable.mockReturnValue(true);
      startNodeCommandListener();

      emitEvent('node.invoke', {
        id: 'cmd-5',
        command: 'notifications.send',
        params: { title: 'Alert!', body: 'Check your watchlist' },
      });

      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith({
        content: { title: 'Alert!', body: 'Check your watchlist' },
        trigger: null,
      });
    });
  });

  describe('unknown command', () => {
    it('returns error result for unknown commands', async () => {
      mockIsAvailable.mockReturnValue(true);
      startNodeCommandListener();

      emitEvent('node.invoke', { id: 'cmd-6', command: 'lineage.unknown_command', params: {} });

      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      const call = mockSendRequest.mock.calls.find((c) => c[0] === 'node.invoke.result');
      const result = (call?.[1] as { result: { ok: boolean; error: string } })?.result;
      expect(result?.ok).toBe(false);
      expect(result?.error).toContain('Unknown command');
    });
  });

  it('ignores events missing id or command', async () => {
    mockIsAvailable.mockReturnValue(true);
    startNodeCommandListener();

    emitEvent('node.invoke', { id: 'cmd-7' }); // no command
    emitEvent('node.invoke', { command: 'lineage.scan' }); // no id

    await Promise.resolve();
    expect(mockSendRequest).not.toHaveBeenCalled();
  });
});

// ─── Rug Response Listener ────────────────────────────────────────────────────

describe('startRugResponseListener', () => {
  it('subscribes to alert events', () => {
    startRugResponseListener();
    expect(mockSubscribe).toHaveBeenCalledWith('alert', expect.any(Function));
  });

  it('ignores non-rug alerts', async () => {
    mockIsAvailable.mockReturnValue(true);
    startRugResponseListener();

    emitEvent('alert', { id: 'a1', type: 'narrative', message: 'x', timestamp: new Date().toISOString(), read: false });

    await Promise.resolve();
    expect(mockRouteAlertToChannels).not.toHaveBeenCalled();
    expect(mockSendRequest).not.toHaveBeenCalled();
  });

  it('routes rug alert with risk_score=100', async () => {
    mockIsAvailable.mockReturnValue(true);
    mockSendRequest.mockResolvedValue({
      cartelSummary: 'Cartel of scammers',
      relatedTokens: ['m1'],
    });

    const rugAlert: AlertItem = {
      id: 'rug-1',
      type: 'rug',
      message: 'LP drained',
      timestamp: new Date().toISOString(),
      read: false,
      mint: 'scam-mint-111',
      risk_score: 80,
    };

    useAlertsStore.getState().addAlert(rugAlert);
    startRugResponseListener();
    emitEvent('alert', rugAlert);

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(mockRouteAlertToChannels).toHaveBeenCalledWith(
      expect.objectContaining({ risk_score: 100 }),
    );
  });

  it('skips handling when alert has no mint', async () => {
    mockIsAvailable.mockReturnValue(true);
    startRugResponseListener();

    emitEvent('alert', {
      id: 'rug-2',
      type: 'rug',
      message: 'no mint',
      timestamp: new Date().toISOString(),
      read: false,
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(mockSendRequest).not.toHaveBeenCalled();
  });

  it('skips handling when OpenClaw is not available', async () => {
    mockIsAvailable.mockReturnValue(false);
    startRugResponseListener();

    emitEvent('alert', {
      id: 'rug-3',
      type: 'rug',
      message: 'rug',
      timestamp: new Date().toISOString(),
      read: false,
      mint: 'some-mint',
    });

    await Promise.resolve();
    expect(mockSendRequest).not.toHaveBeenCalled();
  });

  it('updates enrichment in alerts store after analysis', async () => {
    mockIsAvailable.mockReturnValue(true);
    mockSendRequest.mockResolvedValueOnce({
      cartelSummary: 'Known cartel network',
      relatedTokens: ['related-1', 'related-2'],
      deployerRugRate: 0.9,
      estimatedDamage: '$50K',
    });

    const rugAlert: AlertItem = {
      id: 'rug-4',
      type: 'rug',
      message: 'Drained',
      timestamp: new Date().toISOString(),
      read: false,
      mint: 'rug-mint-abc',
      risk_score: 95,
      token_name: 'RugToken',
    };

    useAlertsStore.getState().addAlert(rugAlert);
    startRugResponseListener();
    emitEvent('alert', rugAlert);

    // Let async chain settle
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const alert = useAlertsStore.getState().alerts.find((a) => a.id === 'rug-4');
    expect(alert?.enrichedData).toBeTruthy();
    expect(alert?.enrichedData?.summary).toContain('Known cartel network');
    expect(alert?.enrichedData?.relatedTokens).toEqual(['related-1', 'related-2']);
  });

  it('returns an unsubscribe function', () => {
    const unsub = startRugResponseListener();
    expect(typeof unsub).toBe('function');
    unsub();
  });
});

// ─── Cartel Monitor ───────────────────────────────────────────────────────────

describe('startCartelMonitor', () => {
  it('does nothing when OpenClaw is unavailable', async () => {
    mockIsAvailable.mockReturnValue(false);
    await startCartelMonitor('cartel-1');
    expect(mockSendRequest).not.toHaveBeenCalled();
  });

  it('creates a cron job with correct name', async () => {
    mockIsAvailable.mockReturnValue(true);
    await startCartelMonitor('cartel-abc', 'GreedyDeployers');

    expect(mockSendRequest).toHaveBeenCalledWith('cron.add', expect.objectContaining({
      name: 'lineage:cartel:cartel-abc',
    }));
  });

  it('uses every-2h schedule', async () => {
    mockIsAvailable.mockReturnValue(true);
    await startCartelMonitor('c1');

    const call = mockSendRequest.mock.calls.find((c) => c[0] === 'cron.add');
    const config = call?.[1] as { schedule: { cron: string } };
    expect(config?.schedule?.cron).toBe('0 */2 * * *');
  });

  it('includes cartel id in payload message', async () => {
    mockIsAvailable.mockReturnValue(true);
    await startCartelMonitor('cartel-xyz', 'LabelABC');

    const call = mockSendRequest.mock.calls.find((c) => c[0] === 'cron.add');
    const config = call?.[1] as { payload: { message: string } };
    expect(config?.payload?.message).toContain('cartel-xyz');
    expect(config?.payload?.message).toContain('LabelABC');
  });

  it('does not throw on sendRequest failure', async () => {
    mockIsAvailable.mockReturnValue(true);
    mockSendRequest.mockRejectedValueOnce(new Error('Fail'));
    await expect(startCartelMonitor('c1')).resolves.toBeUndefined();
  });
});

describe('stopCartelMonitor', () => {
  it('does nothing when OpenClaw is unavailable', async () => {
    mockIsAvailable.mockReturnValue(false);
    await stopCartelMonitor('cartel-1');
    expect(mockListCronJobs).not.toHaveBeenCalled();
  });

  it('removes the matching cron job', async () => {
    mockIsAvailable.mockReturnValue(true);
    const mockJob: CronJobStatus = {
      id: 'cron-xyz',
      name: 'lineage:cartel:cartel-1',
      schedule: { cron: '0 */2 * * *' },
      payload: { type: 'agentTurn', message: 'check' },
      enabled: true,
      status: 'active',
      nextRun: undefined,
      lastRun: undefined,
    };
    mockListCronJobs.mockResolvedValueOnce([mockJob]);

    await stopCartelMonitor('cartel-1');

    expect(mockRemoveCronJob).toHaveBeenCalledWith('cron-xyz');
  });

  it('does nothing when no matching cron job found', async () => {
    mockIsAvailable.mockReturnValue(true);
    mockListCronJobs.mockResolvedValueOnce([]);

    await stopCartelMonitor('cartel-999');
    expect(mockRemoveCronJob).not.toHaveBeenCalled();
  });
});

describe('isCartelMonitored', () => {
  it('returns false when OpenClaw is unavailable', async () => {
    mockIsAvailable.mockReturnValue(false);
    const result = await isCartelMonitored('cartel-1');
    expect(result).toBe(false);
  });

  it('returns true when matching cron job exists', async () => {
    mockIsAvailable.mockReturnValue(true);
    mockListCronJobs.mockResolvedValueOnce([
      { id: 'j1', name: 'lineage:cartel:cartel-abc', enabled: true, status: 'active' as const, schedule: { cron: '0 */2 * * *' }, payload: { type: 'agentTurn' as const, message: 'check' }, nextRun: undefined, lastRun: undefined },
    ]);

    const result = await isCartelMonitored('cartel-abc');
    expect(result).toBe(true);
  });

  it('returns false when no matching cron job exists', async () => {
    mockIsAvailable.mockReturnValue(true);
    mockListCronJobs.mockResolvedValueOnce([
      { id: 'j2', name: 'lineage:cartel:other', enabled: true, status: 'active' as const, schedule: { cron: '0 */2 * * *' }, payload: { type: 'agentTurn' as const, message: 'check' }, nextRun: undefined, lastRun: undefined },
    ]);

    const result = await isCartelMonitored('cartel-abc');
    expect(result).toBe(false);
  });

  it('returns false when listCronJobs throws', async () => {
    mockIsAvailable.mockReturnValue(true);
    mockListCronJobs.mockRejectedValueOnce(new Error('fail'));

    const result = await isCartelMonitored('cartel-1');
    expect(result).toBe(false);
  });
});
