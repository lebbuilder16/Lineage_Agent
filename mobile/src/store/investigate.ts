/**
 * Unified investigation state — tracks the current investigation session.
 * Replaces the separate agent store with a tier-adaptive state machine.
 *
 * Status transitions:
 *   idle → scanning → analyzing (Pro) | reasoning (Pro+) → done | error
 *   Free stops after scanning → done (with heuristicScore).
 */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AgentVerdict } from '../lib/investigate-streaming';
import type { PlanTier } from '../lib/tier-limits';
import type { ChatMessage } from '../lib/investigate-streaming';

export type InvestigateStatus =
  | 'idle'
  | 'preview'     // Intent Preview: show plan before starting
  | 'scanning'
  | 'analyzing'   // Pro: single-shot AI verdict
  | 'reasoning'   // Pro+: agent multi-turn
  | 'done'
  | 'error'
  | 'cancelled';

export interface ScanStep {
  step: string;
  status: 'running' | 'done';
  ms?: number;
  heuristic?: number;
  timestamp: number;
}

export interface AgentStep {
  type: 'thinking' | 'tool_call' | 'tool_result' | 'text';
  turn: number;
  data: Record<string, unknown>;
  timestamp: number;
}

interface InvestigateState {
  sessionId: string | null;
  mint: string | null;
  status: InvestigateStatus;
  tier: PlanTier;

  // Scan phase
  scanSteps: ScanStep[];
  heuristicScore: number | null;
  riskLevel: 'low' | 'medium' | 'high' | 'critical' | null;
  findings: string[];

  // Market data (from identity_ready event)
  marketData: {
    price_usd?: number | null;
    market_cap_usd?: number | null;
    liquidity_usd?: number | null;
    volume_24h_usd?: number | null;
    price_change_24h?: number | null;
    boost_count?: number | null;
  } | null;

  // Agent phase (Pro+ only)
  agentSteps: AgentStep[];

  // Verdict (Pro and Pro+)
  verdict: AgentVerdict | null;
  turnsUsed: number;
  tokensUsed: number;

  // Chat
  chatMessages: ChatMessage[];
  chatBusy: boolean;
  chatAvailable: boolean;

  // Timing
  startedAt: number | null;

  // Error
  error: string | null;

  // Actions
  startInvestigation: (mint: string, tier: PlanTier) => void;
  confirmInvestigation: () => void;
  addScanStep: (step: ScanStep) => void;
  setMarketData: (data: InvestigateState['marketData']) => void;
  setScanningDone: () => void;
  setAnalyzing: () => void;
  setReasoning: () => void;
  setHeuristicComplete: (score: number, riskLevel?: string, findings?: string[]) => void;
  addAgentStep: (step: AgentStep) => void;
  setVerdict: (verdict: AgentVerdict, turnsUsed: number, tokensUsed: number) => void;
  setDone: (chatAvailable: boolean) => void;
  setError: (error: string) => void;
  addChatMessage: (msg: ChatMessage) => void;
  setChatBusy: (busy: boolean) => void;
  cancel: () => void;
  reset: () => void;
  loadCached: (mint: string) => Promise<boolean>;
}

const INITIAL_STATE = {
  sessionId: null as string | null,
  mint: null as string | null,
  status: 'idle' as InvestigateStatus,
  tier: 'free' as PlanTier,
  scanSteps: [] as ScanStep[],
  heuristicScore: null as number | null,
  riskLevel: null as InvestigateState['riskLevel'],
  findings: [] as string[],
  marketData: null as InvestigateState['marketData'],
  agentSteps: [] as AgentStep[],
  verdict: null as AgentVerdict | null,
  turnsUsed: 0,
  tokensUsed: 0,
  chatMessages: [] as ChatMessage[],
  chatBusy: false,
  chatAvailable: false,
  startedAt: null as number | null,
  error: null as string | null,
};

export const useInvestigateStore = create<InvestigateState>((set, get) => ({
  ...INITIAL_STATE,

  startInvestigation: (mint, tier) =>
    set({
      ...INITIAL_STATE,
      sessionId: Date.now().toString(36),
      mint,
      tier,
      status: 'preview',
      startedAt: null,
    }),

  confirmInvestigation: () =>
    set({ status: 'scanning', startedAt: Date.now() }),

  addScanStep: (step) =>
    set((s) => ({ scanSteps: [...s.scanSteps, step] })),

  setMarketData: (data) =>
    set({ marketData: data }),

  setScanningDone: () => {
    const { status } = get();
    if (status === 'scanning') set({ status: 'scanning' }); // stays scanning until phase change
  },

  setAnalyzing: () =>
    set({ status: 'analyzing' }),

  setReasoning: () =>
    set({ status: 'reasoning' }),

  setHeuristicComplete: (score, riskLevel, findings) => {
    set({
      heuristicScore: score,
      riskLevel: (riskLevel as InvestigateState['riskLevel']) ?? null,
      findings: findings ?? [],
      status: 'done',
    });
    // Persist heuristic result for re-display on return
    const { mint, marketData } = get();
    if (mint) {
      AsyncStorage.setItem(
        `investigate-result:${mint}`,
        JSON.stringify({
          heuristicScore: score,
          riskLevel,
          findings: findings ?? [],
          marketData,
          timestamp: Date.now(),
        }),
      ).catch(() => {});
    }
  },

  addAgentStep: (step) =>
    set((s) => ({ agentSteps: [...s.agentSteps, step] })),

  setVerdict: (verdict, turnsUsed, tokensUsed) => {
    set({ verdict, turnsUsed, tokensUsed });

    // Persist verdict + market data for re-display on return
    const { mint, marketData, heuristicScore, riskLevel, findings } = get();
    if (mint) {
      AsyncStorage.setItem(
        `investigate-result:${mint}`,
        JSON.stringify({
          verdict, turnsUsed, tokensUsed, marketData,
          heuristicScore, riskLevel, findings,
          timestamp: Date.now(),
        }),
      ).catch(() => {});
    }
  },

  setDone: (chatAvailable) =>
    set({ status: 'done', chatAvailable }),

  setError: (error) =>
    set({ error, status: 'error' }),

  addChatMessage: (msg) =>
    set((s) => ({ chatMessages: [...s.chatMessages, msg].slice(-50) })),

  setChatBusy: (busy) =>
    set({ chatBusy: busy }),

  cancel: () =>
    set({ status: 'cancelled' }),

  reset: () =>
    set({ ...INITIAL_STATE }),

  loadCached: async (mint: string): Promise<boolean> => {
    try {
      const raw = await AsyncStorage.getItem(`investigate-result:${mint}`);
      if (!raw) return false;
      const data = JSON.parse(raw);
      // Only use cache if less than 30 minutes old — short enough to catch
      // deployer resolution changes, long enough to avoid rescans in a session
      if (Date.now() - (data.timestamp || 0) > 1_800_000) return false;
      set({
        ...INITIAL_STATE,
        mint,
        status: 'done',
        verdict: data.verdict ?? null,
        heuristicScore: data.heuristicScore ?? data.verdict?.risk_score ?? null,
        riskLevel: data.riskLevel ?? null,
        findings: data.findings ?? [],
        marketData: data.marketData ?? null,
        turnsUsed: data.turnsUsed ?? 0,
        tokensUsed: data.tokensUsed ?? 0,
      });
      return true;
    } catch {
      return false;
    }
  },
}));
