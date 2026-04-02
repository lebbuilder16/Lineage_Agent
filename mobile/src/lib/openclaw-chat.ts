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
import { getLineage } from './api';
import { queryClient } from './query-client';
import { QK } from './query';
import type { LineageResult } from '../types/api';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Chat — uses OpenClaw WebSocket when connected (real-time streaming),
 * falls back to backend SSE otherwise.
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
    } catch {
      // Fall back to backend SSE on OpenClaw failure
    }
  }
  return chatStream(mint, message, history, onChunk, onDone, onError);
}

/** Whether chat is currently routing through OpenClaw gateway */
export function isChatOpenClawMode(): boolean {
  return isOpenClawAvailable();
}

// ─── Build rich context from cached scan data ────────────────────────────────

interface FetchedLineage {
  data: LineageResult;
  fromCache: boolean;
  fetchedAt: string;
}

async function fetchFreshLineage(mint: string): Promise<FetchedLineage | null> {
  try {
    const fresh = await getLineage(mint);
    queryClient.setQueryData(QK.lineage(mint), fresh);
    return { data: fresh, fromCache: false, fetchedAt: new Date().toISOString() };
  } catch {
    const cached = queryClient.getQueryData<LineageResult>(QK.lineage(mint));
    if (!cached) return null;
    return { data: cached, fromCache: true, fetchedAt: new Date().toISOString() };
  }
}

function buildTokenContext(mint: string, fetched: FetchedLineage | null): string {
  if (!fetched) return `[Analyzing Solana token ${mint}. No scan data available.]`;

  const lineage = fetched.data;
  const dataSource = fetched.fromCache
    ? `CACHED DATA (fetched from local cache at ${fetched.fetchedAt} — may be up to 60s old)`
    : `LIVE DATA (fetched at ${fetched.fetchedAt})`;

  // Use query_token (the actual scanned token) when available — root is the
  // oldest ancestor in the lineage tree and may have different market data.
  const qt = (lineage as Record<string, unknown>).query_token as Record<string, unknown> | undefined;
  const root = qt ?? (lineage.root as Record<string, unknown> | undefined);
  if (!root) return `[Analyzing Solana token ${mint}. Scan data incomplete.]`;
  const dc = lineage.death_clock ?? undefined;
  const bundle = lineage.bundle_report ?? undefined;
  const insider = lineage.insider_sell ?? undefined;
  const operator = lineage.operator_fingerprint ?? undefined;

  const parts: string[] = [];

  const mcap = root.market_cap_usd as number | null | undefined;
  const liq = root.liquidity_usd as number | null | undefined;

  parts.push(`DATA SOURCE: ${dataSource}`);
  parts.push(`⚠ SOL PRICE NOTE: No SOL/USD price is provided. Do NOT state or assume a SOL price. Report SOL amounts as-is. Only convert to USD if total_extracted_usd is explicitly provided.`);
  parts.push(`TOKEN: ${root.name} (${root.symbol}) — mint: ${mint}`);
  parts.push(`Deployer: ${root.deployer}`);
  if (root.created_at) parts.push(`Created: ${root.created_at}`);
  if (mcap) parts.push(`Market cap: $${formatNum(mcap)}`);
  if (liq) parts.push(`Liquidity: $${formatNum(liq)}`);
  if (root.lifecycle_stage) parts.push(`Lifecycle: ${root.lifecycle_stage}`);
  if (root.market_surface) parts.push(`Market surface: ${root.market_surface}`);

  // If the scanned token is NOT the root, mention the lineage relationship
  const rootMint = lineage.root?.mint;
  const isDerivative = rootMint && rootMint !== mint;
  const derivCount = lineage.derivatives?.length ?? 0;
  if (isDerivative) {
    parts.push(`\nLINEAGE: This token is a derivative/clone of ${lineage.root?.name} (${rootMint})`);
    parts.push(`  Root market cap: $${formatNum((lineage.root?.market_cap_usd as number) || 0)}`);
  }
  if (derivCount > 0) {
    parts.push(`  ${derivCount} total derivative(s) in family (confidence: ${(lineage.confidence * 100).toFixed(0)}%)`);
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
    if (b.total_extracted_sol != null) {
      const usd = b.total_extracted_usd != null ? ` ($${formatNum(b.total_extracted_usd as number)})` : ' (USD conversion unavailable)';
      parts.push(`  Extracted: ${b.total_extracted_sol} SOL${usd}`);
    }
    if (b.verdict) parts.push(`  Verdict: ${b.verdict}`);
  }

  if (insider) {
    parts.push(`\nINSIDER SELL:`);
    const ins = insider as Record<string, unknown>;
    if (ins.verdict) parts.push(`  Verdict: ${ins.verdict}`);
    if (ins.deployer_sold_pct != null) parts.push(`  Deployer sold: ${ins.deployer_sold_pct}%`);
    if (ins.deployer_exited != null) parts.push(`  Deployer exited: ${ins.deployer_exited}`);
    if (ins.flags && Array.isArray(ins.flags)) parts.push(`  Flags: ${ins.flags.join(', ')}`);
    if (ins.sell_pressure_1h != null) parts.push(`  Sell pressure 1h: ${((ins.sell_pressure_1h as number) * 100).toFixed(1)}%`);
    if (ins.sell_pressure_6h != null) parts.push(`  Sell pressure 6h: ${((ins.sell_pressure_6h as number) * 100).toFixed(1)}%`);
    if (ins.sell_pressure_24h != null) parts.push(`  Sell pressure 24h: ${((ins.sell_pressure_24h as number) * 100).toFixed(1)}%`);
    if (ins.price_change_1h != null) parts.push(`  Price change 1h: ${ins.price_change_1h}%`);
    if (ins.price_change_24h != null) parts.push(`  Price change 24h: ${ins.price_change_24h}%`);
  }

  if (!insider) {
    parts.push(`\nINSIDER SELL: no data available`);
  }
  if (!bundle) {
    parts.push(`\nBUNDLE REPORT: no bundle detected`);
  }

  if (operator) {
    parts.push(`\nOPERATOR:`);
    const op = operator as Record<string, unknown>;
    if (op.fingerprint) parts.push(`  Fingerprint: ${op.fingerprint}`);
    if (op.linked_wallets && Array.isArray(op.linked_wallets)) parts.push(`  Linked wallets: ${(op.linked_wallets as string[]).length}`);
    if (op.upload_service) parts.push(`  Upload service: ${op.upload_service}`);
    if (op.description_pattern) parts.push(`  Pattern: ${op.description_pattern}`);
    if (op.confidence) parts.push(`  Confidence: ${op.confidence}`);
  }

  // Liquidity architecture
  const liqArch = (lineage as Record<string, unknown>).liquidity_arch as Record<string, unknown> | undefined;
  if (liqArch) {
    parts.push(`\nLIQUIDITY ARCHITECTURE:`);
    if (liqArch.concentration_hhi != null) parts.push(`  HHI: ${liqArch.concentration_hhi}`);
    if (liqArch.pool_count != null) parts.push(`  Pools: ${liqArch.pool_count}`);
    if (liqArch.pools && typeof liqArch.pools === 'object') {
      const pools = liqArch.pools as Record<string, number>;
      parts.push(`  Distribution: ${Object.entries(pools).map(([k, v]) => `${k}: $${formatNum(v)}`).join(', ')}`);
    }
    if (liqArch.authenticity_score != null) parts.push(`  Authenticity: ${liqArch.authenticity_score}`);
  }

  // SOL flow — compact summary (individual edges are too large for LLM context)
  const solFlow = (lineage as Record<string, unknown>).sol_flow as Record<string, unknown> | undefined;
  if (solFlow) {
    parts.push(`\nSOL FLOW:`);
    if (solFlow.total_extracted_sol != null) {
      const usd = solFlow.total_extracted_usd != null
        ? ` ($${formatNum(solFlow.total_extracted_usd as number)})`
        : ' (USD conversion unavailable — do not assume SOL price)';
      parts.push(`  Total extracted: ${solFlow.total_extracted_sol} SOL${usd}`);
    }
    if (solFlow.deployer) parts.push(`  Deployer wallet: ${solFlow.deployer}`);
    if (solFlow.hop_count != null) parts.push(`  Hops: ${solFlow.hop_count}`);
    if (solFlow.known_cex_detected != null) parts.push(`  CEX detected: ${solFlow.known_cex_detected}`);
    if (solFlow.rug_timestamp) parts.push(`  Extraction started: ${solFlow.rug_timestamp}`);
    if (solFlow.terminal_wallets && Array.isArray(solFlow.terminal_wallets)) {
      parts.push(`  Terminal/sink wallets: ${(solFlow.terminal_wallets as string[]).join(', ')}`);
    }
    // Summarize flows instead of listing each edge — saves ~2000 tokens
    const flows = solFlow.flows as Array<Record<string, unknown>> | undefined;
    if (flows && flows.length > 0) {
      const wallets = new Set<string>();
      const amountByHop: Record<number, number> = {};
      for (const f of flows) {
        if (f.from_address) wallets.add(f.from_address as string);
        if (f.to_address) wallets.add(f.to_address as string);
        const hop = (f.hop as number) ?? 0;
        amountByHop[hop] = (amountByHop[hop] ?? 0) + ((f.amount_sol as number) ?? 0);
      }
      parts.push(`  Unique wallets in flow: ${wallets.size}`);
      parts.push(`  Total flow edges: ${flows.length}`);
      const hopSummary = Object.entries(amountByHop)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([hop, sol]) => `hop${hop}: ${sol.toFixed(3)} SOL`)
        .join(', ');
      parts.push(`  Volume by hop: ${hopSummary}`);
      // Time span of extraction
      const times = flows.map((f) => f.block_time as string).filter(Boolean).sort();
      if (times.length >= 2) {
        parts.push(`  Time span: ${times[0]} → ${times[times.length - 1]}`);
      }
    }
  }

  // Family size
  const familySize = (lineage as Record<string, unknown>).family_size;
  if (familySize != null) parts.push(`\nFamily size: ${familySize} tokens total`);

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

  // 1. Subscribe to "chat" events FIRST (before any async work)
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

  // 3. Fetch lineage data (subscription is already active)
  const fetched = mint ? await fetchFreshLineage(mint) : null;
  const context = mint
    ? buildTokenContext(mint, fetched)
    : '[General Lineage Agent chat. Use your Lineage skill to fetch data if needed.]';

  const enrichedMessage = `[SCAN DATA — USE THESE NUMBERS, DO NOT CALL THE API AGAIN]\n${context}\n[END SCAN DATA]\n\nUser question: ${message}`;

  // 4. Send chat.send — ack is just { runId, status: "started" }
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
