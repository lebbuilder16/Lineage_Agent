// ─────────────────────────────────────────────────────────────────────────────
// OpenClaw Gateway Protocol Types
// Based on: https://github.com/openclaw/openclaw Gateway WebSocket API
// ─────────────────────────────────────────────────────────────────────────────

/** Frame types sent over the OpenClaw Gateway WebSocket */
export type OpenClawFrame = OpenClawRequest | OpenClawResponse | OpenClawEvent;

export interface OpenClawRequest {
  type: 'req';
  id: string;
  method: string;
  params?: Record<string, unknown>;
}

export interface OpenClawResponse {
  type: 'res';
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: { code: string; message: string };
}

export interface OpenClawEvent {
  type: 'event';
  event: string;
  payload?: unknown;
  seq?: number;
  stateVersion?: number;
}

/** Connect handshake params sent as the first frame */
export interface ConnectParams {
  id: string;
  token?: string;
  deviceToken?: string;
  platform: 'ios' | 'android';
  mode: 'node' | 'backend' | 'webchat';
  version: string;
  minProtocol: number;
  maxProtocol: number;
  capabilities?: string[];
}

/** Hello-ok response payload from Gateway after successful connect */
export interface HelloPayload {
  connId: string;
  methods: string[];
  events: string[];
  snapshot?: Record<string, unknown>;
  canvasHostUrl?: string;
  deviceToken?: string;
}

// ─── Alert channel & escalation ──────────────────────────────────────────────

export type AlertChannelId = 'telegram' | 'whatsapp' | 'discord' | 'push';

export interface EscalationRule {
  alertType: string; // e.g. 'rug', 'insider', 'death_clock', '*'
  minRiskScore?: number; // optional threshold (0-100)
  channels: AlertChannelId[];
}

// ─── Cron job config ─────────────────────────────────────────────────────────

export interface CronJobConfig {
  id?: string;
  name: string;
  schedule:
    | { at: string } // ISO 8601 one-shot
    | { every: number } // interval ms
    | { cron: string; timezone?: string }; // 5/6-field cron
  session?: 'main' | 'isolated' | string;
  payload: {
    type: 'systemEvent' | 'agentTurn';
    message: string;
    model?: string;
    timeout?: number;
  };
  delivery?: {
    mode: 'announce' | 'webhook' | 'none';
    channels?: AlertChannelId[];
    to?: string; // webhook URL
  };
  enabled?: boolean;
}

export interface CronJobStatus extends CronJobConfig {
  id: string;
  lastRun?: string;
  nextRun?: string;
  status: 'active' | 'paused' | 'disabled' | 'error';
}

// ─── Device node ─────────────────────────────────────────────────────────────

export interface DeviceNodeCommand {
  id: string;
  command: string;
  params?: Record<string, unknown>;
  timeoutMs?: number;
}

export interface DeviceNodeResult {
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: string;
}

// ─── Enriched alert data (from OpenClaw AI) ──────────────────────────────────

export interface EnrichedAlertData {
  summary: string;
  relatedTokens: string[];
  riskDelta: number;
  deployerHistory?: string;
  recommendedAction?: string;
}

// ─── Alert action (agent-proposed, Phase 5) ──────────────────────────────────

export interface AlertAction {
  label: string;
  action: string;
  params: Record<string, string>;
}
