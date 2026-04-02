// Tests for OpenClaw cron job read-only client
// syncWatchlistCrons and createBriefingCron are now server-managed (cron_manager.py)

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

jest.mock('../lib/openclaw', () => ({
  isOpenClawAvailable: jest.fn(),
  sendRequest: jest.fn(),
}));

import * as OpenClaw from '../lib/openclaw';
import { listCronJobs, removeCronJob } from '../lib/openclaw-cron';
import type { CronJobStatus } from '../types/openclaw';

const mockIsAvailable = jest.mocked(OpenClaw.isOpenClawAvailable);
const mockSendRequest = jest.mocked(OpenClaw.sendRequest);

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

// ─── Server-managed functions removed ─────────────────────────────────────────

describe('server-managed crons', () => {
  it('openclaw-cron.ts no longer exports syncWatchlistCrons', () => {
    const mod = require('../lib/openclaw-cron');
    expect(mod.syncWatchlistCrons).toBeUndefined();
  });

  it('openclaw-cron.ts no longer exports createBriefingCron', () => {
    const mod = require('../lib/openclaw-cron');
    expect(mod.createBriefingCron).toBeUndefined();
  });
});
