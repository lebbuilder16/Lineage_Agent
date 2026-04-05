/**
 * Centralized handler for tier-limit errors (403/429) across the app.
 * Shows an error toast with the backend message and navigates to paywall
 * when the user hits a plan limit.
 */
import { router } from 'expo-router';
import { ApiError } from './api-client';

type ShowToast = (message: string, variant?: 'success' | 'error' | 'info') => void;

/**
 * Returns true if the error was a tier-limit error (handled).
 * Returns false if it's a different error (caller should handle).
 */
export function handleTierError(
  err: unknown,
  showToast: ShowToast,
  opts?: { navigateToPaywall?: boolean },
): boolean {
  const navigate = opts?.navigateToPaywall ?? true;

  // Extract status and message
  let status = 0;
  let detail = '';

  if (err instanceof ApiError) {
    status = err.status;
    detail = err.detail;
  } else if (err && typeof err === 'object') {
    status = (err as any).status ?? 0;
    detail = (err as any).message ?? (err as any).detail ?? '';
  } else if (err instanceof Error) {
    detail = err.message;
  }

  // Detect tier-limit patterns
  const isTierLimit =
    status === 403 ||
    status === 429 ||
    /limit reached/i.test(detail) ||
    /does not include/i.test(detail) ||
    /max for your plan/i.test(detail) ||
    /upgrade/i.test(detail);

  if (!isTierLimit) return false;

  // Show error toast with the actual backend message
  const msg = detail || 'Plan limit reached';
  showToast(msg, 'error');

  // Navigate to paywall after a short delay (so toast is visible first)
  if (navigate) {
    setTimeout(() => router.push('/paywall' as any), 1500);
  }

  return true;
}
