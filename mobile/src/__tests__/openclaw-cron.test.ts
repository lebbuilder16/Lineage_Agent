// Tests for OpenClaw cron job management: listCronJobs, syncWatchlistCrons, createBriefingCron

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

// ─── Mocks (no outer variable references in factory — hoisting safe) ──────────

jest.mock('../lib/openclaw', () => ({
  isOpenClawAvailable: jest.fn(),
  sendRequest: jest.fn(),
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import * as OpenClaw from '../lib/openclaw';
import { listCronJobs, removeCronJob, syncWatchlistCrons, createBriefingCron } from '../lib/openclaw-cron';
import type { CronJobStatus } from '../types/openclaw';
import type { Watch } from '../types/api';

const mockIsAvailable = jest.mocked(OpenClaw.isOpenClawAvailable);
const mockSendRequest = jest.mocked(OpenClaw.sendRequest);

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeJob = (name: string, id: string): CronJobStatus => ({
  id,
  name,
  schedule: { cron: '0 */6 * * *' },
  payload: { type: 'agentTurn', message: 'check' },
  enabled: true,
  status: 'active',
  nextRun: undefined,
  lastRun: undefined,
});

const makeWatch = (id: string, value = `sol${id}`, sub_type: 'mint' | 'deployer' = 'mint'): Watch => ({
  id,
  value,
  sub_type,
  identifier: `token-${id}`,
  label: `Token ${id}`,
  created_at: '',
});

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockIsAvailable.mockReturnValue(false);
  mockSendRequest.mockResolvedValue({});
});

// ─── listCronJobs ─────────────────────────────────────────────────────────────

describe('listCronJobs', () => {
  it('returns empty array when OpenClaw is unavailable', async () => {
    mockIsAvailable.mockReturnValue(false);
    const result = await listCronJobs();
    expect(result).toEqual([]);
    expect(mockSendRequest).not.toHaveBeenCalled();
  });

  it('filters to only lineage: prefixed jobs', async () => {
    mockIsAvailable.mockReturnValue(true);
    mockSendRequest.mockResolvedValueOnce({
      jobs: [
        makeJob('lineage:watchlist:w1', 'job-1'),
        makeJob('lineage:briefing', 'job-2'),
        makeJob('other:external', 'job-3'),
        makeJob('lineage:cartel:c1', 'job-4'),
      ],
    });

    const result = await listCronJobs();
    expect(result).toHaveLength(3);
    expect(result.map((j) => j.id)).not.toContain('job-3');
  });

  it('handles array response (no wrapper)', async () => {
    mockIsAvailable.mockReturnValue(true);
    mockSendRequest.mockResolvedValueOnce([
      makeJob('lineage:watchlist:w1', 'j1'),
    ]);

    const result = await listCronJobs();
    expect(result).toHaveLength(1);
  });

  it('returns empty array when sendRequest throws', async () => {
    mockIsAvailable.mockReturnValue(true);
    mockSendRequest.mockRejectedValueOnce(new Error('WS error'));

    const result = await listCronJobs();
    expect(result).toEqual([]);
  });

  it('calls cron.list method', async () => {
    mockIsAvailable.mockReturnValue(true);
    mockSendRequest.mockResolvedValueOnce({ jobs: [] });

    await listCronJobs();
    expect(mockSendRequest).toHaveBeenCalledWith('cron.list', {});
  });
});

// ─── removeCronJob ────────────────────────────────────────────────────────────

describe('removeCronJob', () => {
  it('does nothing when OpenClaw is unavailable', async () => {
    mockIsAvailable.mockReturnValue(false);
    await removeCronJob('job-1');
    expect(mockSendRequest).not.toHaveBeenCalled();
  });

  it('calls cron.remove with the job id', async () => {
    mockIsAvailable.mockReturnValue(true);
    await removeCronJob('job-abc');
    expect(mockSendRequest).toHaveBeenCalledWith('cron.remove', { id: 'job-abc' });
  });

  it('does not throw when sendRequest fails', async () => {
    mockIsAvailable.mockReturnValue(true);
    mockSendRequest.mockRejectedValueOnce(new Error('Network error'));
    await expect(removeCronJob('job-1')).resolves.toBeUndefined();
  });
});

// ─── syncWatchlistCrons ───────────────────────────────────────────────────────

describe('syncWatchlistCrons', () => {
  it('does nothing when OpenClaw is unavailable', async () => {
    mockIsAvailable.mockReturnValue(false);
    await syncWatchlistCrons([makeWatch('w1')]);
    expect(mockSendRequest).not.toHaveBeenCalled();
  });

  it('adds cron jobs for new watches not yet tracked', async () => {
    mockIsAvailable.mockReturnValue(true);
    // cron.list returns no existing jobs
    mockSendRequest.mockResolvedValueOnce({ jobs: [] }); // listCronJobs
    mockSendRequest.mockResolvedValue({});               // cron.add calls

    await syncWatchlistCrons([makeWatch('w1'), makeWatch('w2')]);

    const addCalls = mockSendRequest.mock.calls.filter((c) => c[0] === 'cron.add');
    expect(addCalls).toHaveLength(2);
  });

  it('does not add cron for watches already tracked', async () => {
    mockIsAvailable.mockReturnValue(true);
    // w1 already has a cron job
    mockSendRequest.mockResolvedValueOnce({
      jobs: [makeJob('lineage:watchlist:w1', 'existing-1')],
    });
    mockSendRequest.mockResolvedValue({});

    await syncWatchlistCrons([makeWatch('w1'), makeWatch('w2')]);

    const addCalls = mockSendRequest.mock.calls.filter((c) => c[0] === 'cron.add');
    expect(addCalls).toHaveLength(1);
    const addedConfig = addCalls[0][1] as { name: string };
    expect(addedConfig.name).toBe('lineage:watchlist:w2');
  });

  it('removes cron jobs for watches no longer in watchlist', async () => {
    mockIsAvailable.mockReturnValue(true);
    // w1 and w2 have cron jobs but only w1 is in the watchlist
    mockSendRequest.mockResolvedValueOnce({
      jobs: [
        makeJob('lineage:watchlist:w1', 'cron-1'),
        makeJob('lineage:watchlist:w2', 'cron-2'), // stale
      ],
    });
    mockSendRequest.mockResolvedValue({});

    await syncWatchlistCrons([makeWatch('w1')]);

    const removeCalls = mockSendRequest.mock.calls.filter((c) => c[0] === 'cron.remove');
    expect(removeCalls).toHaveLength(1);
    expect(removeCalls[0][1]).toEqual({ id: 'cron-2' });
  });

  it('uses correct cron schedule (every 6h) for watch jobs', async () => {
    mockIsAvailable.mockReturnValue(true);
    mockSendRequest.mockResolvedValueOnce({ jobs: [] });
    mockSendRequest.mockResolvedValue({});

    await syncWatchlistCrons([makeWatch('w1')]);

    const addCall = mockSendRequest.mock.calls.find((c) => c[0] === 'cron.add');
    const config = addCall?.[1] as { schedule: { cron: string } };
    expect(config?.schedule?.cron).toBe('0 */6 * * *');
  });

  it('includes mint in cron payload message for mint-type watches', async () => {
    mockIsAvailable.mockReturnValue(true);
    mockSendRequest.mockResolvedValueOnce({ jobs: [] });
    mockSendRequest.mockResolvedValue({});

    await syncWatchlistCrons([makeWatch('w1', 'sol-mint-abc', 'mint')]);

    const addCall = mockSendRequest.mock.calls.find((c) => c[0] === 'cron.add');
    const config = addCall?.[1] as { payload: { message: string } };
    expect(config?.payload?.message).toContain('sol-mint-abc');
    expect(config?.payload?.message).toContain('token');
  });

  it('includes deployer in cron payload message for deployer-type watches', async () => {
    mockIsAvailable.mockReturnValue(true);
    mockSendRequest.mockResolvedValueOnce({ jobs: [] });
    mockSendRequest.mockResolvedValue({});

    await syncWatchlistCrons([makeWatch('w1', 'deployer-addr', 'deployer')]);

    const addCall = mockSendRequest.mock.calls.find((c) => c[0] === 'cron.add');
    const config = addCall?.[1] as { payload: { message: string } };
    expect(config?.payload?.message).toContain('deployer');
  });

  it('does not throw when an operation fails', async () => {
    mockIsAvailable.mockReturnValue(true);
    mockSendRequest.mockRejectedValue(new Error('always fails'));

    await expect(syncWatchlistCrons([makeWatch('w1')])).resolves.toBeUndefined();
  });
});

// ─── createBriefingCron ───────────────────────────────────────────────────────

describe('createBriefingCron', () => {
  it('does nothing when OpenClaw is unavailable', async () => {
    mockIsAvailable.mockReturnValue(false);
    await createBriefingCron(8, 'UTC');
    expect(mockSendRequest).not.toHaveBeenCalled();
  });

  it('creates a cron job with the correct schedule', async () => {
    mockIsAvailable.mockReturnValue(true);
    mockSendRequest.mockResolvedValueOnce({ jobs: [] }); // listCronJobs — no existing briefing
    mockSendRequest.mockResolvedValue({});               // cron.add

    await createBriefingCron(9, 'Europe/Paris');

    const addCall = mockSendRequest.mock.calls.find((c) => c[0] === 'cron.add');
    const config = addCall?.[1] as { schedule: { cron: string; timezone: string } };
    expect(config?.schedule?.cron).toBe('0 9 * * *');
    expect(config?.schedule?.timezone).toBe('Europe/Paris');
  });

  it('uses lineage:briefing as the job name', async () => {
    mockIsAvailable.mockReturnValue(true);
    mockSendRequest.mockResolvedValueOnce({ jobs: [] });
    mockSendRequest.mockResolvedValue({});

    await createBriefingCron();

    const addCall = mockSendRequest.mock.calls.find((c) => c[0] === 'cron.add');
    expect((addCall?.[1] as { name: string })?.name).toBe('lineage:briefing');
  });

  it('removes existing briefing job before creating new one', async () => {
    mockIsAvailable.mockReturnValue(true);
    // Existing briefing job
    mockSendRequest.mockResolvedValueOnce({
      jobs: [makeJob('lineage:briefing', 'old-briefing-123')],
    });
    mockSendRequest.mockResolvedValue({});

    await createBriefingCron(8, 'UTC');

    const removeCalls = mockSendRequest.mock.calls.filter((c) => c[0] === 'cron.remove');
    expect(removeCalls).toHaveLength(1);
    expect(removeCalls[0][1]).toEqual({ id: 'old-briefing-123' });
  });

  it('defaults to hour=8, tz=UTC', async () => {
    mockIsAvailable.mockReturnValue(true);
    mockSendRequest.mockResolvedValueOnce({ jobs: [] });
    mockSendRequest.mockResolvedValue({});

    await createBriefingCron(); // no args

    const addCall = mockSendRequest.mock.calls.find((c) => c[0] === 'cron.add');
    const config = addCall?.[1] as { schedule: { cron: string; timezone: string } };
    expect(config?.schedule?.cron).toBe('0 8 * * *');
    expect(config?.schedule?.timezone).toBe('UTC');
  });

  it('does not throw when operations fail', async () => {
    mockIsAvailable.mockReturnValue(true);
    mockSendRequest.mockRejectedValue(new Error('Failure'));

    await expect(createBriefingCron()).resolves.toBeUndefined();
  });

  it('enables the cron job', async () => {
    mockIsAvailable.mockReturnValue(true);
    mockSendRequest.mockResolvedValueOnce({ jobs: [] });
    mockSendRequest.mockResolvedValue({});

    await createBriefingCron(8, 'UTC');

    const addCall = mockSendRequest.mock.calls.find((c) => c[0] === 'cron.add');
    expect((addCall?.[1] as { enabled: boolean })?.enabled).toBe(true);
  });
});
