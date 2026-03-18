// ─────────────────────────────────────────────────────────────────────────────
// OpenClaw Chat — Dual-mode adapter
// Routes chat through OpenClaw when available, falls back to Lineage API.
//
// Protocol: chat.send is non-blocking. It acks with {runId, status:"started"}.
// The AI response streams via "chat" events:
//   state:"delta"  → cumulative text so far (every ~150ms)
//   state:"final"  → complete response
//   state:"error"  → agent error
// ─────────────────────────────────────────────────────────────────────────────
import { isOpenClawAvailable, sendRequest, subscribe } from './openclaw';
import { chatStream } from './streaming';
import { queryClient } from './query-client';
import { QK } from './query';
import type { LineageResult } from '../types/api';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Dual-mode chat: OpenClaw agent session when available, direct API otherwise.
 * Returns a cancel function.
 */
export async function smartChatStream(
  mint: string | undefined,
  message: string,
  history: ChatMessage[],
  onChunk: (text: string) => void,
  onDone: () => void,
  onError?: (err: Error) => void,
): Promise<() => void> {
  if (isOpenClawAvailable()) {
    try {
      return await openClawChatStream(mint, message, onChunk, onDone, onError);
    } catch (err) {
      console.warn('[openclaw-chat] OpenClaw failed, falling back to direct API:', err);
    }
  }
  return chatStream(mint, message, history, onChunk, onDone, onError);
}

/** Whether the current chat session is using OpenClaw */
export function isChatOpenClawMode(): boolean {
  return isOpenClawAvailable();
}

// ─── Build rich context from cached scan data ────────────────────────────────

function buildTokenContext(mint: string): string {
  const lineage = queryClient.getQueryData<LineageResult>(QK.lineage(mint));
  if (!lineage) return `[Analyzing Solana token ${mint}. No scan data cached yet.]`;

  const root = lineage.root ?? undefined;
  if (!root) return `[Analyzing Solana token ${mint}. Scan data incomplete.]`;
  const dc = lineage.death_clock ?? undefined;
  const bundle = lineage.bundle_report ?? undefined;
  const insider = lineage.insider_sell ?? undefined;
  const operator = lineage.operator_fingerprint ?? undefined;

  const parts: string[] = [];

  parts.push(`TOKEN: ${root.name} (${root.symbol}) — mint: ${mint}`);
  parts.push(`Deployer: ${root.deployer}`);
  if (root.created_at) parts.push(`Created: ${root.created_at}`);
  if (root.market_cap_usd) parts.push(`Market cap: $${formatNum(root.market_cap_usd)}`);
  if (root.liquidity_usd) parts.push(`Liquidity: $${formatNum(root.liquidity_usd)}`);
  if (root.lifecycle_stage) parts.push(`Lifecycle: ${root.lifecycle_stage}`);
  if (root.market_surface) parts.push(`Market surface: ${root.market_surface}`);

  const derivCount = lineage.derivatives?.length ?? 0;
  if (derivCount > 0) {
    parts.push(`\nLINEAGE: ${derivCount} derivative(s) (confidence: ${(lineage.confidence * 100).toFixed(0)}%)`);
  }

  if (dc) {
    parts.push(`\nDEATH CLOCK:`);
    parts.push(`  Risk level: ${dc.risk_level}`);
    parts.push(`  Historical rugs: ${dc.historical_rug_count}`);
    if (dc.rug_probability_pct != null) parts.push(`  Rug probability: ${dc.rug_probability_pct}%`);
    if (dc.median_rug_hours > 0) parts.push(`  Median rug timing: ${dc.median_rug_hours.toFixed(1)}h`);
    parts.push(`  Elapsed: ${dc.elapsed_hours.toFixed(1)}h since launch`);
    if (dc.predicted_window_start) parts.push(`  Rug window: ${dc.predicted_window_start} → ${dc.predicted_window_end}`);
    parts.push(`  Confidence: ${dc.confidence_level} (${dc.confidence_note})`);
    parts.push(`  Basis: ${dc.prediction_basis} (${dc.sample_count} samples)`);
    if (dc.basis_breakdown && Object.keys(dc.basis_breakdown).length > 0) {
      parts.push(`  Mechanisms: ${Object.entries(dc.basis_breakdown).map(([k, v]) => `${k}: ${v}`).join(', ')}`);
    }
    if (dc.is_factory) parts.push(`  ⚠ Factory-pattern deployer`);
  }

  if (bundle) {
    parts.push(`\nBUNDLE REPORT:`);
    const b = bundle as Record<string, unknown>;
    if (b.bundle_count != null) parts.push(`  Bundles: ${b.bundle_count}`);
    if (b.total_extracted_sol != null) parts.push(`  Extracted: ${b.total_extracted_sol} SOL`);
    if (b.verdict) parts.push(`  Verdict: ${b.verdict}`);
  }

  if (insider) {
    parts.push(`\nINSIDER SELL:`);
    const ins = insider as Record<string, unknown>;
    if (ins.verdict) parts.push(`  Verdict: ${ins.verdict}`);
    if (ins.deployer_sold_pct != null) parts.push(`  Deployer sold: ${ins.deployer_sold_pct}%`);
    if (ins.flags && Array.isArray(ins.flags)) parts.push(`  Flags: ${ins.flags.join(', ')}`);
  }

  if (operator) {
    parts.push(`\nOPERATOR:`);
    const op = operator as Record<string, unknown>;
    if (op.operator_id) parts.push(`  ID: ${op.operator_id}`);
    if (op.total_tokens != null) parts.push(`  Tokens: ${op.total_tokens}`);
    if (op.rug_rate != null) parts.push(`  Rug rate: ${(op.rug_rate as number * 100).toFixed(0)}%`);
  }

  if (lineage.zombie_alert) {
    parts.push(`\n⚠ ZOMBIE ALERT: Token relaunch detected`);
  }

  return parts.join('\n');
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toFixed(2);
}

// ─── OpenClaw chat via Gateway WebSocket ─────────────────────────────────────

interface ChatEventPayload {
  runId: string;
  sessionKey: string;
  seq: number;
  state: 'delta' | 'final' | 'error' | 'aborted';
  message?: {
    role: string;
    content: Array<{ type: string; text: string }>;
    timestamp?: number;
    stopReason?: string;
  };
  errorMessage?: string;
}

async function openClawChatStream(
  mint: string | undefined,
  message: string,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError?: (err: Error) => void,
): Promise<() => void> {
  let cancelled = false;
  let lastTextLen = 0;

  const sessionKey = mint ? `lineage:token:${mint}` : 'lineage:chat:global';
  const idempotencyKey = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const context = mint
    ? buildTokenContext(mint)
    : '[General Lineage Agent chat. Use your Lineage skill to fetch data if needed.]';

  const enrichedMessage = `[SCAN DATA]\n${context}\n[END SCAN DATA]\n\nUser question: ${message}`;

  // 1. Subscribe to "chat" events BEFORE sending the request
  const unsub = subscribe('chat', (payload) => {
    const evt = payload as ChatEventPayload;
    if (evt.runId !== idempotencyKey || cancelled) return;

    const text = evt.message?.content?.[0]?.text ?? '';

    if (evt.state === 'delta') {
      // Text is cumulative — deliver only the NEW portion
      if (text.length > lastTextLen) {
        onChunk(text.slice(lastTextLen));
        lastTextLen = text.length;
      }
    }

    if (evt.state === 'final') {
      // Deliver any remaining text
      if (text.length > lastTextLen) {
        onChunk(text.slice(lastTextLen));
      }
      onDone();
      unsub();
      clearTimeout(timeout);
    }

    if (evt.state === 'error' || evt.state === 'aborted') {
      const errMsg = evt.errorMessage ?? 'AI agent error';
      if (onError) onError(new Error(errMsg));
      else onDone();
      unsub();
      clearTimeout(timeout);
    }
  });

  // 2. Timeout safety: if no final event after 120s
  const timeout = setTimeout(() => {
    if (!cancelled) {
      unsub();
      if (lastTextLen === 0) {
        onChunk('Request timed out. Please try again.');
      }
      onDone();
    }
  }, 120_000);

  // 3. Send chat.send — ack is just { runId, status: "started" }
  try {
    await sendRequest('chat.send', {
      sessionKey,
      message: enrichedMessage,
      idempotencyKey,
    });
  } catch (err) {
    unsub();
    clearTimeout(timeout);
    throw err;
  }

  return () => {
    cancelled = true;
    unsub();
    clearTimeout(timeout);
  };
}
