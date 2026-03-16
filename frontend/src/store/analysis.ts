import { create } from 'zustand';
import type { LineageResult, AnalysisStep } from '../types/api';

interface AnalysisRun {
  steps: Record<string, AnalysisStep>;
  result: LineageResult | null;
  running: boolean;
  error: string | null;
}

interface AnalysisState {
  runs: Record<string, AnalysisRun>;
  setStep: (mint: string, step: AnalysisStep) => void;
  setResult: (mint: string, result: LineageResult) => void;
  setRunning: (mint: string, running: boolean) => void;
  setError: (mint: string, error: string | null) => void;
  getRun: (mint: string) => AnalysisRun | undefined;
}

const emptyRun = (): AnalysisRun => ({ steps: {}, result: null, running: false, error: null });

export const useAnalysisStore = create<AnalysisState>((set, get) => ({
  runs: {},

  setStep: (mint, step) =>
    set((state) => {
      const run = state.runs[mint] ?? emptyRun();
      return { runs: { ...state.runs, [mint]: { ...run, steps: { ...run.steps, [step.step]: step } } } };
    }),

  setResult: (mint, result) =>
    set((state) => {
      const run = state.runs[mint] ?? emptyRun();
      return { runs: { ...state.runs, [mint]: { ...run, result, running: false } } };
    }),

  setRunning: (mint, running) =>
    set((state) => {
      const run = state.runs[mint] ?? emptyRun();
      return { runs: { ...state.runs, [mint]: { ...run, running, error: null, ...(running ? { steps: {}, result: null } : {}) } } };
    }),

  setError: (mint, error) =>
    set((state) => {
      const run = state.runs[mint] ?? emptyRun();
      return { runs: { ...state.runs, [mint]: { ...run, error, running: false } } };
    }),

  getRun: (mint) => get().runs[mint],
}));
