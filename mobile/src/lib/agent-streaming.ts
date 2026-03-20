// Lineage Agent — Agent investigation SSE streaming handler
// Consumes multi-turn tool_use events from POST /agent/{mint}

import { createSSEParser } from './streaming';

const BASE_URL = (
  process.env.EXPO_PUBLIC_API_URL ?? 'https://lineage-agent.fly.dev'
).replace(/\/$/, '');

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AgentThinkingEvent {
  turn: number;
  text: string;
}

export interface AgentToolCallEvent {
  turn: number;
  tool: string;
  input: Record<string, unknown>;
  callId: string;
}

export interface AgentToolResultEvent {
  turn: number;
  tool: string;
  callId: string;
  result: Record<string, unknown> | null;
  error: string | null;
  durationMs: number;
}

export interface AgentTextEvent {
  turn: number;
  text: string;
}

export interface AgentVerdict {
  risk_score: number;
  confidence: 'low' | 'medium' | 'high';
  rug_pattern: string;
  verdict_summary: string;
  narrative: { observation: string; pattern: string; risk: string };
  key_findings: string[];
  conviction_chain: string;
  operator_hypothesis: string | null;
}

export interface AgentDoneEvent {
  verdict: AgentVerdict | null;
  turns_used: number;
  tokens_used: number;
}

export interface AgentErrorEvent {
  detail: string;
  recoverable: boolean;
}

export type AgentEvent =
  | { type: 'thinking'; data: AgentThinkingEvent }
  | { type: 'tool_call'; data: AgentToolCallEvent }
  | { type: 'tool_result'; data: AgentToolResultEvent }
  | { type: 'text'; data: AgentTextEvent }
  | { type: 'done'; data: AgentDoneEvent }
  | { type: 'error'; data: AgentErrorEvent };

// ─── Event parsing ───────────────────────────────────────────────────────────

function parseAgentEvent(eventType: string, data: string): AgentEvent | null {
  try {
    const parsed = JSON.parse(data) as Record<string, unknown>;

    switch (eventType) {
      case 'thinking':
        return {
          type: 'thinking',
          data: parsed as unknown as AgentThinkingEvent,
        };
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
        return {
          type: 'text',
          data: parsed as unknown as AgentTextEvent,
        };
      case 'done':
        return {
          type: 'done',
          data: {
            verdict: (parsed.verdict ?? null) as AgentVerdict | null,
            turns_used: (parsed.turns_used ?? 0) as number,
            tokens_used: (parsed.tokens_used ?? 0) as number,
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

// ─── Stream function ─────────────────────────────────────────────────────────

/**
 * Start an agent investigation stream for a token.
 *
 * @returns cancel function to abort the stream
 */
export function agentStream(
  mint: string,
  apiKey: string,
  onEvent: (event: AgentEvent) => void,
  onDone: (result: AgentDoneEvent | null) => void,
  onError: (err: Error) => void,
): () => void {
  const url = `${BASE_URL}/agent/${encodeURIComponent(mint)}`;
  let stopped = false;

  const xhr = new XMLHttpRequest();
  xhr.open('POST', url);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.setRequestHeader('Accept', 'text/event-stream');
  xhr.setRequestHeader('X-API-Key', apiKey);
  xhr.responseType = 'text';

  const parser = createSSEParser({
    onEvent(eventType, data) {
      if (stopped) return true;

      // Done event
      if (eventType === 'done') {
        stopped = true;
        const parsed = parseAgentEvent('done', data);
        if (parsed && parsed.type === 'done') {
          onEvent(parsed);
          onDone(parsed.data);
        } else {
          onDone(null);
        }
        return true;
      }

      // Error event — NEVER swallowed
      if (eventType === 'error') {
        stopped = true;
        const parsed = parseAgentEvent('error', data);
        if (parsed && parsed.type === 'error') {
          onEvent(parsed);
          onError(new Error(parsed.data.detail));
        } else {
          onError(new Error(data || 'Agent error'));
        }
        return true;
      }

      // All other events
      const agentEvent = parseAgentEvent(eventType, data);
      if (agentEvent) {
        onEvent(agentEvent);
      }
      return false;
    },
  });

  xhr.onprogress = () => {
    if (stopped) return;
    parser.feed(xhr.responseText);
  };

  xhr.onload = () => {
    if (!stopped) {
      parser.feed(xhr.responseText);
      if (!stopped) {
        // Stream ended without done event
        onDone(null);
      }
    }
  };

  xhr.onerror = () => {
    if (!stopped) {
      stopped = true;
      onError(new Error('Network error — check your connection'));
    }
  };

  xhr.ontimeout = () => {
    if (!stopped) {
      stopped = true;
      onError(new Error('Request timed out'));
    }
  };

  xhr.timeout = 120_000; // 2 min max
  xhr.send(JSON.stringify({})); // No body needed — mint is in URL

  return () => {
    stopped = true;
    xhr.abort();
  };
}
