// src/lib/api.ts
// Client HTTP typé — consomme le backend FastAPI existant

import * as SecureStore from "expo-secure-store";
import type {
  LineageResult,
  TokenSearchResult,
  DeployerProfile,
  GlobalStats,
  StatsBrief,
  User,
  Watch,
} from "@/types/api";

const API_KEY_STORAGE_KEY = "lineage_api_key";

// ─── Configuration ────────────────────────────────────────────────────────────
// Pointer sur le backend FastAPI. En dev: localhost ou tunnel ngrok.
// En prod: l'URL Fly.io déployée.
const BASE_URL = (
  process.env.EXPO_PUBLIC_API_URL ?? "https://lineage-agent.fly.dev"
).replace(/\/$/, "");

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getApiKey(): Promise<string | null> {
  return SecureStore.getItemAsync(API_KEY_STORAGE_KEY);
}

export async function saveApiKey(key: string): Promise<void> {
  if (typeof key !== "string" || !key) return;
  await SecureStore.setItemAsync(API_KEY_STORAGE_KEY, key);
}

export async function clearApiKey(): Promise<void> {
  await SecureStore.deleteItemAsync(API_KEY_STORAGE_KEY);
}

// 401 handler — registered once from root layout to trigger logout & redirect
let _unauthorizedHandler: (() => void) | null = null;
export function registerUnauthorizedHandler(fn: (() => void) | null): void {
  _unauthorizedHandler = fn;
}

interface FetchOptions extends RequestInit {
  authenticated?: boolean;
}

async function apiFetch<T>(
  path: string,
  options: FetchOptions = {}
): Promise<T> {
  const { authenticated = false, ...init } = options;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string>),
  };

  if (authenticated) {
    const key = await getApiKey();
    if (key) {
      headers["X-API-Key"] = key;
    }
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    if (response.status === 401) {
      _unauthorizedHandler?.();
    }
    const text = await response.text().catch(() => response.statusText);
    throw new ApiError(response.status, text);
  }

  return response.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ─── Auth endpoints ────────────────────────────────────────────────────────────

export async function loginWithPrivy(privyId: string, walletAddress?: string, email?: string): Promise<User> {
  return apiFetch<User>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ privy_id: privyId, wallet_address: walletAddress, email }),
  });
}

export async function getCurrentUser(): Promise<User> {
  return apiFetch<User>("/auth/me", { authenticated: true });
}

export async function getWatches(): Promise<Watch[]> {
  return apiFetch<Watch[]>("/auth/watches", { authenticated: true });
}

export async function addWatch(params: {
  mint?: string;
  deployer?: string;
  label?: string;
}): Promise<Watch> {
  return apiFetch<Watch>("/auth/watches", {
    method: "POST",
    authenticated: true,
    body: JSON.stringify(params),
  });
}

export async function removeWatch(watchId: number): Promise<void> {
  await apiFetch<void>(`/auth/watches/${watchId}`, {
    method: "DELETE",
    authenticated: true,
  });
}

// ─── Lineage endpoints ────────────────────────────────────────────────────────

export async function getLineage(mint: string): Promise<LineageResult> {
  return apiFetch<LineageResult>(`/lineage?mint=${encodeURIComponent(mint)}`);
}

// ─── Search ───────────────────────────────────────────────────────────────────

export async function searchTokens(query: string): Promise<TokenSearchResult[]> {
  return apiFetch<TokenSearchResult[]>(`/search?q=${encodeURIComponent(query)}`);
}

/** Paginated search — offset-based, page size 20. Use with useInfiniteQuery. */
export async function searchTokensPaginated(
  query: string,
  offset = 0,
  limit = 20,
): Promise<TokenSearchResult[]> {
  return apiFetch<TokenSearchResult[]>(
    `/search?q=${encodeURIComponent(query)}&offset=${offset}&limit=${limit}`,
  );
}

// ─── Deployer ─────────────────────────────────────────────────────────────────

export async function getDeployerProfile(address: string): Promise<DeployerProfile> {
  return apiFetch<DeployerProfile>(`/deployer/${encodeURIComponent(address)}`);
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export async function getGlobalStats(): Promise<GlobalStats> {
  return apiFetch<GlobalStats>("/stats/global");
}

export async function getStatsBrief(): Promise<StatsBrief> {
  return apiFetch<StatsBrief>("/stats/brief");
}

// ─── AI Analysis (streaming via SSE) ──────────────────────────────────────────
// Retourne l'URL SSE + un EventSource-compatible (géré côté hook)
export function getAnalysisStreamUrl(mint: string): string {
  return `${BASE_URL}/analyze/${encodeURIComponent(mint)}/stream`;
}

export function getChatStreamUrl(mint: string, query?: string): string {
  const base = `${BASE_URL}/chat/${encodeURIComponent(mint)}`;
  return query ? `${base}?q=${encodeURIComponent(query)}` : base;
}

// ─── Bundle & SOL Flow ───────────────────────────────────────────────────────

/** Trigger (or retrieve cached) bundle wallet forensic analysis for a mint. */
export async function getBundleReport(mint: string): Promise<import("@/types/api").BundleExtractionReport> {
  return apiFetch(`/bundle/${encodeURIComponent(mint)}`);
}

/** Trigger (or retrieve cached) post-rug SOL capital flow trace for a mint. */
export async function getSolTrace(mint: string): Promise<import("@/types/api").SolFlowReport> {
  return apiFetch(`/lineage/${encodeURIComponent(mint)}/sol-trace`);
}

// ─── Push notification registration ──────────────────────────────────────────
export async function registerFcmToken(fcmToken: string): Promise<void> {
  await apiFetch<void>("/notifications/register-fcm", {
    method: "POST",
    authenticated: true,
    body: JSON.stringify({ fcm_token: fcmToken }),
  });
}

// ─── Subscription sync ────────────────────────────────────────────────────────
export async function syncSubscription(rcAppUserId: string): Promise<User> {
  return apiFetch<User>("/auth/sync-plan", {
    method: "POST",
    authenticated: true,
    body: JSON.stringify({ rc_app_user_id: rcAppUserId }),
  });
}

// ─── Notification preferences ─────────────────────────────────────────────────
export interface NotificationPrefs {
  rug: boolean;
  bundle: boolean;
  insider: boolean;
  zombie: boolean;
}

export async function getNotificationPrefs(): Promise<NotificationPrefs> {
  return apiFetch<NotificationPrefs>("/auth/notification-prefs", {
    authenticated: true,
  });
}

export async function updateNotificationPrefs(prefs: NotificationPrefs): Promise<void> {
  await apiFetch<void>("/auth/notification-prefs", {
    method: "POST",
    authenticated: true,
    body: JSON.stringify(prefs),
  });
}
