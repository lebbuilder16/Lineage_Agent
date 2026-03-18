// ─────────────────────────────────────────────────────────────────────────────
// OpenClaw Cartel Monitor — Cron surveillance of known cartel networks
// ─────────────────────────────────────────────────────────────────────────────
import { isOpenClawAvailable, sendRequest } from './openclaw';
import { listCronJobs, removeCronJob } from './openclaw-cron';
import type { CronJobConfig } from '../types/openclaw';

const CRON_TAG_CARTEL = 'lineage:cartel';

// ─── Public API ──────────────────────────────────────────────────────────────

/** Start monitoring a cartel network with a cron job every 2h */
export async function startCartelMonitor(cartelId: string, label?: string): Promise<void> {
  if (!isOpenClawAvailable()) return;

  try {
    await sendRequest('cron.add', {
      name: `${CRON_TAG_CARTEL}:${cartelId}`,
      schedule: { kind: 'cron', at: '0 */2 * * *' },
      text: [
        `Monitor cartel network ${cartelId}${label ? ` (${label})` : ''}.`,
        'Use the Lineage cartel API to:',
        '1. Check for new deployer wallets joining the network',
        '2. Detect new tokens launched by cartel members',
        '3. Identify wallet movements and SOL extractions',
        '4. Alert if new rug activity or new risky tokens detected.',
      ].join('\n'),
      delivery: { mode: 'announce' },
      enabled: true,
    });
  } catch {
    // Best-effort
  }
}

/** Stop monitoring a cartel */
export async function stopCartelMonitor(cartelId: string): Promise<void> {
  if (!isOpenClawAvailable()) return;

  try {
    const jobs = await listCronJobs();
    const cartelJob = jobs.find((j) => j.name === `${CRON_TAG_CARTEL}:${cartelId}`);
    if (cartelJob) await removeCronJob(cartelJob.id);
  } catch {
    // Best-effort
  }
}

/** Check if a cartel is currently being monitored */
export async function isCartelMonitored(cartelId: string): Promise<boolean> {
  if (!isOpenClawAvailable()) return false;

  try {
    const jobs = await listCronJobs();
    return jobs.some((j) => j.name === `${CRON_TAG_CARTEL}:${cartelId}`);
  } catch {
    return false;
  }
}
