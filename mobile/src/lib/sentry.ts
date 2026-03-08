// src/lib/sentry.ts
// Sentry initialisation wrapper.
// Set EXPO_PUBLIC_SENTRY_DSN in your .env / EAS secrets to enable.

import * as Sentry from "@sentry/react-native";

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN ?? "";
const IS_PROD = process.env.EXPO_PUBLIC_ENV === "production";

export function initSentry(): void {
  if (!DSN) return;
  Sentry.init({
    dsn: DSN,
    tracesSampleRate: IS_PROD ? 0.1 : 0.0,
    environment: IS_PROD ? "production" : "development",
    enableAutoPerformanceTracing: true,
    attachStacktrace: true,
    beforeSend(event) {
      // Don’t forward events in local dev unless explicitly forced
      if (!IS_PROD && process.env.NODE_ENV === "development" && !process.env.EXPO_PUBLIC_SENTRY_FORCE_DEV) {
        return null;
      }
      return event;
    },
  });
}

/** Set or clear the current authenticated user on Sentry. */
export function sentrySetUser(user: { id: string; email?: string | null } | null): void {
  if (!DSN) return;
  if (user) {
    Sentry.setUser({ id: user.id, email: user.email ?? undefined });
  } else {
    Sentry.setUser(null);
  }
}

/** Capture an exception with optional extra context. */
export function sentryCaptureError(err: unknown, context?: Record<string, unknown>): void {
  if (!DSN) return;
  Sentry.captureException(err, context ? { extra: context } : undefined);
}

/** Add a breadcrumb for navigation or user actions. */
export function sentryBreadcrumb(
  message: string,
  category = "app",
  data?: Record<string, unknown>,
): void {
  if (!DSN) return;
  Sentry.addBreadcrumb({ message, category, data, level: "info" });
}

export { Sentry };

