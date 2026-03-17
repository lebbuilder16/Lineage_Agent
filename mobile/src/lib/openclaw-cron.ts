// ─────────────────────────────────────────────────────────────────────────────
// OpenClaw Cron — Watchlist re-scan scheduling + daily briefing
// ─────────────────────────────────────────────────────────────────────────────
import { isOpenClawAvailable, sendRequest } from './openclaw';
import type { CronJobStatus, CronJobConfig } from '../types/openclaw';
import type { Watch } from '../types/api';

const CRON_TAG_WATCHLIST = 'lineage:watchlist';
const CRON_TAG_BRIEFING = 'lineage:briefing';

// ─── Public API ──────────────────────────────────────────────────────────────

/** List all Lineage cron jobs registered in OpenClaw */
export async function listCronJobs(): Promise<CronJobStatus[]> {
  if (!isOpenClawAvailable()) return [];
  try {
    const result = await sendRequest<{ jobs: CronJobStatus[] }>('cron.list', {});
    const jobs = result?.jobs ?? (Array.isArray(result) ? (result as CronJobStatus[]) : []);
    return jobs.filter((j) => j.name?.startsWith('lineage:'));
  } catch {
    return [];
  }
}

/** Remove a cron job by ID */
export async function removeCronJob(id: string): Promise<void> {
  if (!isOpenClawAvailable()) return;
  await sendRequest('cron.remove', { id }).catch(() => {});
}

/**
 * Diff local watchlist against existing cron jobs and sync:
 * - Adds jobs for new watches
 * - Removes jobs for deleted watches
 */
export async function syncWatchlistCrons(watches: Watch[]): Promise<void> {
  if (!isOpenClawAvailable()) return;

  try {
    const existing = await listCronJobs();
    const existingWatchJobs = existing.filter((j) => j.name?.startsWith(CRON_TAG_WATCHLIST));

    // Build a map of existing jobs: watchId → cronJobId
    const existingMap = new Map<string, string>();
    for (const job of existingWatchJobs) {
      // Name format: "lineage:watchlist:{watchId}"
      const parts = job.name.split(':');
      if (parts.length === 3) existingMap.set(parts[2], job.id);
    }

    // Add cron for each watch not already tracked
    for (const watch of watches) {
      if (!existingMap.has(watch.id)) {
        await addWatchCron(watch);
        existingMap.delete(watch.id); // mark as handled
      } else {
        existingMap.delete(watch.id); // still valid
      }
    }

    // Remove cron for watches no longer in the list
    const watchIds = new Set(watches.map((w) => w.id));
    for (const [watchId, cronId] of existingMap) {
      if (!watchIds.has(watchId)) {
        await removeCronJob(cronId);
      }
    }
  } catch {
    // Best-effort — don't throw
  }
}

/**
 * Create or update the daily intelligence briefing cron.
 * @param hour  Hour of day (0-23) in local timezone
 * @param tz    IANA timezone string, e.g. "Europe/Paris"
 */
export async function createBriefingCron(hour = 8, tz = 'UTC'): Promise<void> {
  if (!isOpenClawAvailable()) return;

  try {
    // Remove existing briefing job first
    const existing = await listCronJobs();
    const oldBriefing = existing.find((j) => j.name === CRON_TAG_BRIEFING);
    if (oldBriefing) await removeCronJob(oldBriefing.id);

    const config: CronJobConfig = {
      name: CRON_TAG_BRIEFING,
      schedule: { cron: `0 ${hour} * * *`, timezone: tz },
      session: 'main',
      payload: {
        type: 'agentTurn',
        message: [
          'Generate the daily Lineage security briefing.',
          'Use the Lineage skill to:',
          '1. Check global stats (tokens scanned, rugs, rug rate)',
          '2. Summarize high-risk alerts from the last 24h',
          '3. Review each watchlisted token and deployer for new risks',
          '4. Identify trending threats or new cartel activity',
          'Format as a concise markdown briefing with sections.',
        ].join('\n'),
        timeout: 120_000,
      },
      delivery: {
        mode: 'announce',
      },
      enabled: true,
    };

    await sendRequest('cron.add', config as unknown as Record<string, unknown>);
  } catch {
    // Best-effort
  }
}

// ─── Internal ────────────────────────────────────────────────────────────────

async function addWatchCron(watch: Watch): Promise<void> {
  const label = watch.label ?? watch.identifier ?? watch.value.slice(0, 8);
  const config: CronJobConfig = {
    name: `${CRON_TAG_WATCHLIST}:${watch.id}`,
    schedule: { cron: '0 */6 * * *' }, // every 6 hours
    session: 'isolated',
    payload: {
      type: 'agentTurn',
      message:
        watch.sub_type === 'mint'
          ? `Re-scan Lineage token ${watch.value} (${label}). Use the Lineage skill to fetch updated risk data. If risk score > 70, send an alert.`
          : `Re-scan Lineage deployer ${watch.value} (${label}). Check for new tokens launched and rug activity. Alert if new rugs detected.`,
      timeout: 60_000,
    },
    delivery: {
      mode: 'announce',
    },
    enabled: true,
  };

  await sendRequest('cron.add', config as unknown as Record<string, unknown>);
}
