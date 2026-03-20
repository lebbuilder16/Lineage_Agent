/**
 * Agent investigation state — tracks the current investigation session.
 * Manages steps, verdict, and status for the agent/[mint] screen.
 */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AgentVerdict, AgentDoneEvent } from '../lib/agent-streaming';

export type AgentStatus = 'idle' | 'running' | 'done' | 'error' | 'cancelled';

export interface AgentStep {
  type: 'thinking' | 'tool_call' | 'tool_result' | 'text';
  turn: number;
  data: Record<string, unknown>;
  timestamp: number;
}

interface AgentState {
  sessionId: string | null;
  mint: string | null;
  status: AgentStatus;
  steps: AgentStep[];
  verdict: AgentVerdict | null;
  turnsUsed: number;
  tokensUsed: number;
  error: string | null;

  // Actions
  startSession: (mint: string) => void;
  addStep: (step: AgentStep) => void;
  setVerdict: (verdict: AgentVerdict, turnsUsed: number, tokensUsed: number) => void;
  setError: (error: string) => void;
  cancel: () => void;
  reset: () => void;
}

const INITIAL_STATE = {
  sessionId: null as string | null,
  mint: null as string | null,
  status: 'idle' as AgentStatus,
  steps: [] as AgentStep[],
  verdict: null as AgentVerdict | null,
  turnsUsed: 0,
  tokensUsed: 0,
  error: null as string | null,
};

export const useAgentStore = create<AgentState>((set, get) => ({
  ...INITIAL_STATE,

  startSession: (mint: string) =>
    set({
      sessionId: Date.now().toString(36),
      mint,
      status: 'running',
      steps: [],
      verdict: null,
      turnsUsed: 0,
      tokensUsed: 0,
      error: null,
    }),

  addStep: (step: AgentStep) =>
    set((s) => ({ steps: [...s.steps, step] })),

  setVerdict: (verdict: AgentVerdict, turnsUsed: number, tokensUsed: number) => {
    set({ verdict, turnsUsed, tokensUsed, status: 'done' });

    // Persist verdict to AsyncStorage for cache
    const { mint } = get();
    if (mint) {
      AsyncStorage.setItem(
        `agent-result:${mint}`,
        JSON.stringify({ verdict, turnsUsed, tokensUsed, timestamp: Date.now() }),
      ).catch(() => {}); // best-effort
    }
  },

  setError: (error: string) =>
    set({ error, status: 'error' }),

  cancel: () =>
    set({ status: 'cancelled' }),

  reset: () =>
    set({ ...INITIAL_STATE }),
}));
