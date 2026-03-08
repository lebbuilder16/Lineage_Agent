// src/lib/sentry.ts
// Sentry initialisation wrapper.
// Set EXPO_PUBLIC_SENTRY_DSN in your .env / EAS secrets to enable.

import * as Sentry from "@sentry/react-native";

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN ?? "";

export function initSentry() {
  if (!DSN) return; // Silently disabled when DSN not set
  Sentry.init({
    dsn: DSN,
    tracesSampleRate: 0.2,
    environment: process.env.NODE_ENV ?? "development",
    enableAutoPerformanceTracing: true,
    attachStacktrace: true,
  });
}

export { Sentry };
