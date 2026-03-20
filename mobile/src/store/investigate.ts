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
import type { AgentVerdict } from '../lib/agent-streaming';
import type { PlanTier } from '../lib/tier-limits';
import type { ChatMessage } from '../lib/investigate-streaming';

export type InvestigateStatus =
  | 'idle'
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

  // Error
  error: string | null;

  // Actions
  startInvestigation: (mint: string, tier: PlanTier) => void;
  addScanStep: (step: ScanStep) => void;
  setScanningDone: () => void;
  setAnalyzing: () => void;
  setReasoning: () => void;
  setHeuristicComplete: (score: number) => void;
  addAgentStep: (step: AgentStep) => void;
  setVerdict: (verdict: AgentVerdict, turnsUsed: number, tokensUsed: number) => void;
  setDone: (chatAvailable: boolean) => void;
  setError: (error: string) => void;
  addChatMessage: (msg: ChatMessage) => void;
  setChatBusy: (busy: boolean) => void;
  cancel: () => void;
  reset: () => void;
}

const INITIAL_STATE = {
  sessionId: null as string | null,
  mint: null as string | null,
  status: 'idle' as InvestigateStatus,
  tier: 'free' as PlanTier,
  scanSteps: [] as ScanStep[],
  heuristicScore: null as number | null,
  agentSteps: [] as AgentStep[],
  verdict: null as AgentVerdict | null,
  turnsUsed: 0,
  tokensUsed: 0,
  chatMessages: [] as ChatMessage[],
  chatBusy: false,
  chatAvailable: false,
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
      status: 'scanning',
    }),

  addScanStep: (step) =>
    set((s) => ({ scanSteps: [...s.scanSteps, step] })),

  setScanningDone: () => {
    const { status } = get();
    if (status === 'scanning') set({ status: 'scanning' }); // stays scanning until phase change
  },

  setAnalyzing: () =>
    set({ status: 'analyzing' }),

  setReasoning: () =>
    set({ status: 'reasoning' }),

  setHeuristicComplete: (score) =>
    set({ heuristicScore: score, status: 'done' }),

  addAgentStep: (step) =>
    set((s) => ({ agentSteps: [...s.agentSteps, step] })),

  setVerdict: (verdict, turnsUsed, tokensUsed) => {
    set({ verdict, turnsUsed, tokensUsed });

    // Persist verdict
    const { mint } = get();
    if (mint) {
      AsyncStorage.setItem(
        `investigate-result:${mint}`,
        JSON.stringify({ verdict, turnsUsed, tokensUsed, timestamp: Date.now() }),
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
}));
