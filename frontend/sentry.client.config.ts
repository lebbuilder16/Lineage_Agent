import * as Sentry from "@sentry/nextjs";

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV,

    // Capture 10% of traces for performance monitoring
    tracesSampleRate: 0.1,

    // Record a replay on errors (1% of sessions, 100% on errors)
    replaysSessionSampleRate: 0.01,
    replaysOnErrorSampleRate: 1.0,

    integrations: [
      Sentry.replayIntegration({
        // Mask PII fields by default
        maskAllText: false,
        blockAllMedia: false,
      }),
    ],

    // Don't report localhost errors
    beforeSend(event) {
      if (process.env.NODE_ENV === "development") return null;
      return event;
    },
  });
}
