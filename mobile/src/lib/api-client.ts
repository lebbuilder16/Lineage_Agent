// ─────────────────────────────────────────────────────────────────────────────
// Lineage Agent — openapi-fetch singleton + error middleware
// ─────────────────────────────────────────────────────────────────────────────
import createClient, { type Middleware } from 'openapi-fetch';
import type { paths } from '../types/api.generated';

const BASE_URL = (
  process.env.EXPO_PUBLIC_API_URL ?? 'https://lineage-agent.fly.dev'
).replace(/\/$/, '');

// Security: enforce HTTPS-only API calls
if (!__DEV__ && !BASE_URL.startsWith('https://')) {
  throw new Error('API URL must use HTTPS in production');
}

// ─── Typed API error (RFC 9457 Problem Details shape) ────────────────────────

export class ApiError extends Error {
  readonly status: number;
  readonly type: string;
  readonly detail: string;
  readonly instance?: string;

  constructor(
    status: number,
    detail: string,
    type = 'about:blank',
    instance?: string,
  ) {
    super(detail);
    this.name = 'ApiError';
    this.status = status;
    this.type = type;
    this.detail = detail;
    this.instance = instance;
  }
}

// ─── Middleware: throw ApiError on non-2xx responses ─────────────────────────

const throwOnError: Middleware = {
  async onResponse({ response }) {
    if (!response.ok) {
      let problem: Record<string, unknown> = {};
      try {
        problem = await response.clone().json();
      } catch {
        // ignore parse failure — use fallback below
      }
      throw new ApiError(
        response.status,
        typeof problem['detail'] === 'string'
          ? problem['detail']
          : `HTTP ${response.status}`,
        typeof problem['type'] === 'string' ? problem['type'] : 'about:blank',
        typeof problem['instance'] === 'string' ? problem['instance'] : undefined,
      );
    }
    return undefined;
  },
};

// ─── Singleton client (typed against OpenAPI schema) ─────────────────────────

export const apiClient = createClient<paths>({ baseUrl: BASE_URL });
apiClient.use(throwOnError);

// ─── WebSocket base URL (wss:// for https://, ws:// for http://) ─────────────

export const WS_BASE = BASE_URL.replace(
  /^https?/,
  (p) => (p === 'https' ? 'wss' : 'ws'),
);
