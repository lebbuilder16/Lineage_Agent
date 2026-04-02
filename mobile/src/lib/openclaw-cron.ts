// ─────────────────────────────────────────────────────────────────────────────
// OpenClaw Cron — Read-only client for server-managed crons
//
// Cron lifecycle (create/update/delete) is now managed server-side by
// cron_manager.py. The mobile only reads crons for display and supports
// manual removal via removeCronJob().
// ─────────────────────────────────────────────────────────────────────────────
import { isOpenClawAvailable, sendRequest } from './openclaw';
import type { CronJobStatus } from '../types/openclaw';

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

/** Remove a cron job by ID (manual user action) */
export async function removeCronJob(id: string): Promise<void> {
  if (!isOpenClawAvailable()) return;
  await sendRequest('cron.remove', { id }).catch((e) => console.warn('[openclaw-cron] remove failed', e));
}
