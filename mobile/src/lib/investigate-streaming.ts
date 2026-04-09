// Lineage Agent — Unified Investigation SSE streaming handler
// Consumes tier-adaptive events from POST /investigate/{mint}
// Superset of scan, agent, and verdict event types.

import { createSSEParser } from './streaming';

const BASE_URL = (
  process.env.EXPO_PUBLIC_API_URL ?? 'https://lineage-agent.fly.dev'
).replace(/\/$/, '');

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PhaseEvent {
  phase: 'scan' | 'agent' | 'ai_verdict';
  status: 'started' | 'done';
}

export interface StepEvent {
  step: 'lineage' | 'deployer' | 'cartel' | 'bundle' | 'sol_flow' | 'ai';
  status: 'running' | 'done';
  ms?: number;
  heuristic?: number;
}

export interface IdentityReadyEvent {
  name: string;
  symbol: string;
  deployer: string;
  created_at: string | null;
  ms: number;
  price_usd?: number | null;
  market_cap_usd?: number | null;
  liquidity_usd?: number | null;
  volume_24h_usd?: number | null;
  price_change_24h?: number | null;
  boost_count?: number | null;
}

export interface HeuristicCompleteEvent {
  heuristic_score: number;
  tier: string;
  risk_level?: 'low' | 'medium' | 'high' | 'critical';
  findings?: string[];
}

export interface ThinkingEvent {
  turn: number;
  text: string;
}

export interface ToolCallEvent {
  turn: number;
  tool: string;
  input: Record<string, unknown>;
  callId: string;
}

export interface ToolResultEvent {
  turn: number;
  tool: string;
  callId: string;
  result: Record<string, unknown> | null;
  error: string | null;
  durationMs: number;
}

export interface TextEvent {
  turn: number;
  text: string;
}

export interface VerdictEvent extends AgentVerdict {}

export interface InvestigateDoneEvent {
  tier: string;
  turns_used: number;
  tokens_used: number;
  chat_available: boolean;
}

export interface InvestigateErrorEvent {
  detail: string;
  recoverable?: boolean;
}

export interface ForensicSnapshotEvent {
  sol_flow?: {
    total_extracted_sol: number | null;
    total_extracted_usd: number | null;
    hop_count: number;
    known_cex_detected: boolean | null;
  };
  bundle_report?: {
    overall_verdict: string | null;
    bundle_count: number | null;
    total_extracted_sol: number | null;
    total_extracted_usd: number | null;
    coordinated_sell_detected: boolean | null;
    evidence_chain: string[] | null;
  };
  deployer_profile?: {
    address: string | null;
    total_tokens_launched: number | null;
    confirmed_rug_count: number | null;
    rug_rate_pct: number | null;
  };
  cartel_report?: {
    deployer_community: {
      community_id: string | null;
      wallets: string[] | null;
      total_rugs: number | null;
      estimated_extracted_usd: number | null;
    };
  };
  death_clock?: {
    risk_level: string | null;
    rug_probability_pct: number | null;
    median_rug_hours: number | null;
    elapsed_hours: number | null;
  };
  insider_sell?: {
    deployer_exited: boolean | null;
    sell_pressure_1h: number | null;
    verdict: string | null;
    flags: string[] | null;
  };
}

export type InvestigateEvent =
  | { type: 'phase'; data: PhaseEvent }
  | { type: 'step'; data: StepEvent }
  | { type: 'identity_ready'; data: IdentityReadyEvent }
  | { type: 'heuristic_complete'; data: HeuristicCompleteEvent }
  | { type: 'forensic_snapshot'; data: ForensicSnapshotEvent }
  | { type: 'thinking'; data: ThinkingEvent }
  | { type: 'tool_call'; data: ToolCallEvent }
  | { type: 'tool_result'; data: ToolResultEvent }
  | { type: 'text'; data: TextEvent }
  | { type: 'verdict'; data: VerdictEvent }
  | { type: 'done'; data: InvestigateDoneEvent }
  | { type: 'error'; data: InvestigateErrorEvent };

// ─── Callbacks ───────────────────────────────────────────────────────────────

export interface InvestigateCallbacks {
  onEvent: (event: InvestigateEvent) => void;
  onDone: (result: InvestigateDoneEvent | null) => void;
  onError: (err: Error) => void;
}

// ─── Event parsing ───────────────────────────────────────────────────────────

function parseEvent(eventType: string, data: string): InvestigateEvent | null {
  try {
    const parsed = JSON.parse(data) as Record<string, unknown>;

    switch (eventType) {
      case 'phase':
        return { type: 'phase', data: parsed as unknown as PhaseEvent };

      case 'step':
        return { type: 'step', data: parsed as unknown as StepEvent };

      case 'identity_ready':
        return { type: 'identity_ready', data: parsed as unknown as IdentityReadyEvent };

      case 'forensic_snapshot':
        return { type: 'forensic_snapshot', data: parsed as unknown as ForensicSnapshotEvent };

      case 'heuristic_complete':
        return { type: 'heuristic_complete', data: parsed as unknown as HeuristicCompleteEvent };

      case 'thinking':
        return { type: 'thinking', data: parsed as unknown as ThinkingEvent };

      case 'tool_call':
        return {
          type: 'tool_call',
          data: {
            turn: parsed.turn as number,
            tool: parsed.tool as string,
            input: (parsed.input ?? {}) as Record<string, unknown>,
            callId: (parsed.call_id ?? '') as string,
          },
        };

      case 'tool_result':
        return {
          type: 'tool_result',
          data: {
            turn: parsed.turn as number,
            tool: parsed.tool as string,
            callId: (parsed.call_id ?? '') as string,
            result: (parsed.result ?? null) as Record<string, unknown> | null,
            error: (parsed.error ?? null) as string | null,
            durationMs: (parsed.duration_ms ?? 0) as number,
          },
        };

      case 'text':
        return { type: 'text', data: parsed as unknown as TextEvent };

      case 'verdict':
        return { type: 'verdict', data: parsed as unknown as VerdictEvent };

      case 'done':
        return {
          type: 'done',
          data: {
            tier: (parsed.tier ?? 'free') as string,
            turns_used: (parsed.turns_used ?? 0) as number,
            tokens_used: (parsed.tokens_used ?? 0) as number,
            chat_available: (parsed.chat_available ?? false) as boolean,
          },
        };

      case 'error':
        return {
          type: 'error',
          data: {
            detail: (parsed.detail ?? 'Unknown error') as string,
            recoverable: (parsed.recoverable ?? false) as boolean,
          },
        };

      default:
        return null;
    }
  } catch {
    return null;
  }
}

// ─── Main stream function ────────────────────────────────────────────────────

/**
 * Start a unified investigation stream for a token.
 * @returns cancel function to abort the stream
 */
export function investigateStream(
  mint: string,
  apiKey: string,
  callbacks: InvestigateCallbacks,
): () => void {
  const url = `${BASE_URL}/investigate/${encodeURIComponent(mint)}`;
  let stopped = false;
  const startedAt = Date.now();
  const sessionId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  const xhr = new XMLHttpRequest();
  xhr.open('POST', url);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.setRequestHeader('Accept', 'text/event-stream');
  xhr.setRequestHeader('X-Session-ID', sessionId);
  if (apiKey) xhr.setRequestHeader('X-API-Key', apiKey);
  xhr.responseType = 'text';

  const parser = createSSEParser({
    onEvent(eventType, data) {
      if (stopped) return true;

      // Server-side keepalive — ignore silently, do not propagate
      if (eventType === 'ping') return false;

      if (eventType === 'done') {
        stopped = true;
        const parsed = parseEvent('done', data);
        if (parsed && parsed.type === 'done') {
          callbacks.onEvent(parsed);
          callbacks.onDone(parsed.data);
        } else {
          callbacks.onDone(null);
        }
        return true;
      }

      if (eventType === 'error') {
        stopped = true;
        const parsed = parseEvent('error', data);
        if (parsed && parsed.type === 'error') {
          callbacks.onEvent(parsed);
          callbacks.onError(new Error(parsed.data.detail));
        } else {
          callbacks.onError(new Error(data || 'Investigation error'));
        }
        return true;
      }

      const event = parseEvent(eventType, data);
      if (event) {
        callbacks.onEvent(event);
      }
      return false;
    },
  });

  xhr.onprogress = () => {
    if (stopped) return;
    parser.feed(xhr.responseText);
  };

  xhr.onload = () => {
    if (stopped) return;

    if (xhr.status >= 400) {
      stopped = true;
      let detail = `HTTP ${xhr.status}`;
      try {
        const body = JSON.parse(xhr.responseText) as { detail?: string };
        if (body.detail) detail = body.detail;
      } catch { /* use status code */ }
      callbacks.onError(new Error(detail));
      return;
    }

    parser.feed(xhr.responseText);
    if (!stopped) {
      callbacks.onDone(null);
    }
  };

  xhr.onerror = () => {
    if (!stopped) {
      stopped = true;
      // React Native routes ontimeout to onerror on some platforms —
      // check elapsed time to distinguish network drop from client timeout.
      const elapsed = Date.now() - startedAt;
      const msg = elapsed >= 295_000
        ? 'Investigation timed out — try again'
        : 'Network error — check your connection';
      callbacks.onError(new Error(msg));
    }
  };

  xhr.ontimeout = () => {
    if (!stopped) {
      stopped = true;
      callbacks.onError(new Error('Investigation timed out — try again'));
    }
  };

  // 5 min — agent multi-turn (up to 5 turns × ~45s) + verdict extraction (~30s)
  xhr.timeout = 300_000;
  xhr.send(JSON.stringify({}));

  return () => {
    stopped = true;
    xhr.abort();
  };
}

// ─── Chat stream for investigation follow-ups ────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Stream a follow-up chat message within an investigation context.
 * @returns cancel function
 */
export function investigateChatStream(
  mint: string,
  apiKey: string,
  message: string,
  history: ChatMessage[],
  onToken: (text: string) => void,
  onDone: () => void,
  onError: (err: Error) => void,
): () => void {
  const url = `${BASE_URL}/investigate/${encodeURIComponent(mint)}/chat`;
  let stopped = false;

  const xhr = new XMLHttpRequest();
  xhr.open('POST', url);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.setRequestHeader('Accept', 'text/event-stream');
  if (apiKey) xhr.setRequestHeader('X-API-Key', apiKey);
  xhr.responseType = 'text';

  const parser = createSSEParser({
    onEvent(eventType, data) {
      if (stopped) return true;

      if (eventType === 'done') {
        stopped = true;
        onDone();
        return true;
      }

      if (eventType === 'error') {
        stopped = true;
        try {
          const parsed = JSON.parse(data) as { detail?: string };
          onError(new Error(parsed.detail ?? 'Chat error'));
        } catch {
          onError(new Error(data || 'Chat error'));
        }
        return true;
      }

      if (eventType === 'token') {
        try {
          const parsed = JSON.parse(data) as { text?: string };
          if (parsed.text) onToken(parsed.text);
        } catch { /* skip malformed token */ }
      }

      return false;
    },
  });

  xhr.onprogress = () => {
    if (stopped) return;
    parser.feed(xhr.responseText);
  };

  xhr.onload = () => {
    if (stopped) return;
    if (xhr.status >= 400) {
      stopped = true;
      let detail = `HTTP ${xhr.status}`;
      try {
        const body = JSON.parse(xhr.responseText) as { detail?: string };
        if (body.detail) detail = body.detail;
      } catch { /* use status */ }
      onError(new Error(detail));
      return;
    }
    parser.feed(xhr.responseText);
    if (!stopped) onDone();
  };

  xhr.onerror = () => { if (!stopped) { stopped = true; onError(new Error('Network error')); } };
  xhr.ontimeout = () => { if (!stopped) { stopped = true; onError(new Error('Request timed out')); } };

  xhr.timeout = 30_000;
  xhr.send(JSON.stringify({ message, history }));

  return () => { stopped = true; xhr.abort(); };
}

// ─── Shared verdict type ────────────────────────────────────────────────────

export interface AgentVerdict {
  risk_score: number;
  confidence: 'low' | 'medium' | 'high';
  rug_pattern: string;
  verdict_summary: string;
  narrative: { observation: string; pattern: string; risk: string };
  key_findings: string[];
  conviction_chain: string;
  operator_hypothesis: string | null;
  // Memory intelligence (Palier 4)
  memory_depth?: 'deep' | 'partial' | 'first_encounter';
  memory_context?: string | null;
  prediction_band?: { low: number; high: number; n: number };
  calibration_applied?: boolean;
  calibration_offset?: number;
}
