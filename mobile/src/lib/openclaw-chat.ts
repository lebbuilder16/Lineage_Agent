// ─────────────────────────────────────────────────────────────────────────────
// OpenClaw Chat — Dual-mode adapter
// Routes chat through OpenClaw when available, falls back to Lineage API.
// When OpenClaw is active, injects full scan data (lineage, death clock,
// bundle, insider sell) into the prompt so the AI can give precise analysis.
// ─────────────────────────────────────────────────────────────────────────────
import { isOpenClawAvailable, sendRequest } from './openclaw';
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
  // Try OpenClaw first
  if (isOpenClawAvailable()) {
    try {
      return await openClawChatStream(mint, message, history, onChunk, onDone, onError);
    } catch {
      // OpenClaw failed — fall through to direct API
    }
  }

  // Fallback: direct Lineage API chat
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

  // Token identity
  parts.push(`TOKEN: ${root.name} (${root.symbol}) — mint: ${mint}`);
  parts.push(`Deployer: ${root.deployer}`);
  if (root.created_at) parts.push(`Created: ${root.created_at}`);
  if (root.market_cap_usd) parts.push(`Market cap: $${formatNum(root.market_cap_usd)}`);
  if (root.liquidity_usd) parts.push(`Liquidity: $${formatNum(root.liquidity_usd)}`);
  if (root.lifecycle_stage) parts.push(`Lifecycle: ${root.lifecycle_stage}`);
  if (root.market_surface) parts.push(`Market surface: ${root.market_surface}`);

  // Lineage tree
  const derivCount = lineage.derivatives?.length ?? 0;
  if (derivCount > 0) {
    parts.push(`\nLINEAGE: ${derivCount} derivative(s) detected (confidence: ${(lineage.confidence * 100).toFixed(0)}%)`);
  }

  // Death Clock
  if (dc) {
    parts.push(`\nDEATH CLOCK:`);
    parts.push(`  Risk level: ${dc.risk_level}`);
    parts.push(`  Historical rugs by deployer: ${dc.historical_rug_count}`);
    if (dc.rug_probability_pct != null) parts.push(`  Rug probability: ${dc.rug_probability_pct}%`);
    if (dc.median_rug_hours > 0) parts.push(`  Median rug timing: ${dc.median_rug_hours.toFixed(1)}h`);
    parts.push(`  Elapsed: ${dc.elapsed_hours.toFixed(1)}h since launch`);
    if (dc.predicted_window_start) parts.push(`  Rug window: ${dc.predicted_window_start} → ${dc.predicted_window_end}`);
    parts.push(`  Confidence: ${dc.confidence_level} (${dc.confidence_note})`);
    parts.push(`  Prediction basis: ${dc.prediction_basis} (${dc.sample_count} samples)`);
    if (dc.basis_breakdown && Object.keys(dc.basis_breakdown).length > 0) {
      parts.push(`  Rug mechanisms: ${Object.entries(dc.basis_breakdown).map(([k, v]) => `${k}: ${v}`).join(', ')}`);
    }
    if (dc.is_factory) parts.push(`  ⚠ Factory-pattern deployer detected`);
  }

  // Bundle report
  if (bundle) {
    parts.push(`\nBUNDLE REPORT:`);
    const b = bundle as Record<string, unknown>;
    if (b.bundle_count != null) parts.push(`  Bundles detected: ${b.bundle_count}`);
    if (b.total_extracted_sol != null) parts.push(`  Total extracted: ${b.total_extracted_sol} SOL`);
    if (b.verdict) parts.push(`  Verdict: ${b.verdict}`);
    if (b.team_wallets && Array.isArray(b.team_wallets)) {
      parts.push(`  Team wallets: ${b.team_wallets.length}`);
    }
  }

  // Insider sell
  if (insider) {
    parts.push(`\nINSIDER SELL:`);
    const ins = insider as Record<string, unknown>;
    if (ins.verdict) parts.push(`  Verdict: ${ins.verdict}`);
    if (ins.deployer_sold_pct != null) parts.push(`  Deployer sold: ${ins.deployer_sold_pct}%`);
    if (ins.flags && Array.isArray(ins.flags)) parts.push(`  Flags: ${ins.flags.join(', ')}`);
  }

  // Operator fingerprint
  if (operator) {
    parts.push(`\nOPERATOR FINGERPRINT:`);
    const op = operator as Record<string, unknown>;
    if (op.operator_id) parts.push(`  Operator: ${op.operator_id}`);
    if (op.total_tokens != null) parts.push(`  Total tokens by operator: ${op.total_tokens}`);
    if (op.rug_rate != null) parts.push(`  Rug rate: ${(op.rug_rate as number * 100).toFixed(0)}%`);
  }

  // Zombie alerts
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

async function openClawChatStream(
  mint: string | undefined,
  message: string,
  history: ChatMessage[],
  onChunk: (text: string) => void,
  onDone: () => void,
  onError?: (err: Error) => void,
): Promise<() => void> {
  let cancelled = false;

  const sessionKey = mint ? `lineage:token:${mint}` : 'lineage:chat:global';

  // Build rich context from cached scan data
  const context = mint
    ? buildTokenContext(mint)
    : '[General Lineage Agent chat. Use your Lineage skill to fetch data if needed.]';

  const enrichedMessage = `[SCAN DATA]\n${context}\n[END SCAN DATA]\n\nUser question: ${message}`;

  try {
    const result = await sendRequest<{ text?: string; chunks?: string[] }>('chat.send', {
      sessionKey,
      message: enrichedMessage,
      stream: false,
    });

    if (cancelled) return () => {};

    const fullText = typeof result === 'string'
      ? result
      : (result as { text?: string })?.text ?? JSON.stringify(result);

    // Simulate streaming by chunking the response
    const words = fullText.split(' ');
    let i = 0;
    const chunkInterval = setInterval(() => {
      if (cancelled || i >= words.length) {
        clearInterval(chunkInterval);
        if (!cancelled) onDone();
        return;
      }
      const chunk = (i > 0 ? ' ' : '') + words[i];
      onChunk(chunk);
      i++;
    }, 20); // ~50 words/sec for natural feel

    return () => {
      cancelled = true;
      clearInterval(chunkInterval);
    };
  } catch (err) {
    cancelled = true;
    throw err;
  }
}
