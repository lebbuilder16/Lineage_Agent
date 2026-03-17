// ─── Centralized API error handling ───────────────────────────────────────────
import { ApiError } from './api-client';

export interface UserError {
  title: string;
  message: string;
  retry: boolean;
}

export function handleApiError(error: unknown): UserError {
  if (error instanceof TypeError) {
    return { title: 'Offline', message: 'Check your internet connection.', retry: true };
  }
  if (error instanceof ApiError) {
    if (error.status === 429) {
      return { title: 'Too many requests', message: 'Please wait a moment and try again.', retry: true };
    }
    if (error.status === 404) {
      return { title: 'Not found', message: 'Token or address not found.', retry: false };
    }
    if (error.status >= 500) {
      return { title: 'Server error', message: 'Our servers are having trouble. Try again shortly.', retry: true };
    }
    return { title: 'Error', message: error.detail ?? 'Something went wrong.', retry: true };
  }
  if (error instanceof Error && error.message.includes('timed out')) {
    return { title: 'Timeout', message: 'The request took too long. Try again.', retry: true };
  }
  return { title: 'Error', message: 'Something went wrong.', retry: false };
}
