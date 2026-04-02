import { useInvestigateStore } from '../store/investigate';
import type { AgentVerdict } from '../lib/investigate-streaming';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn().mockResolvedValue(undefined),
  getItem: jest.fn().mockResolvedValue(null),
}));

const MINT = '7dmpjtmtkRNumctHAGbTrP4MQPHjX59M54aZAbvzpump';

function mockVerdict(): AgentVerdict {
  return {
    risk_score: 78,
    confidence: 'high',
    rug_pattern: 'classic_rug',
    verdict_summary: 'High risk.',
    narrative: { observation: '', pattern: '', risk: '' },
    key_findings: ['Bundle detected'],
    conviction_chain: 'A→B',
    operator_hypothesis: null,
  };
}

beforeEach(() => {
  useInvestigateStore.getState().reset();
});

describe('InvestigateStore', () => {
  test('starts in idle state', () => {
    const state = useInvestigateStore.getState();
    expect(state.status).toBe('idle');
    expect(state.mint).toBeNull();
  });

  test('startInvestigation transitions to scanning with startedAt', () => {
    const before = Date.now();
    useInvestigateStore.getState().startInvestigation(MINT, 'elite');
    const state = useInvestigateStore.getState();
    expect(state.status).toBe('scanning');
    expect(state.mint).toBe(MINT);
    expect(state.tier).toBe('elite');
    expect(state.sessionId).toBeTruthy();
    expect(state.startedAt).toBeGreaterThanOrEqual(before);
    expect(state.startedAt).toBeLessThanOrEqual(Date.now());
  });

  test('addScanStep accumulates steps', () => {
    useInvestigateStore.getState().startInvestigation(MINT, 'free');
    useInvestigateStore.getState().addScanStep({
      step: 'lineage', status: 'running', timestamp: Date.now(),
    });
    useInvestigateStore.getState().addScanStep({
      step: 'lineage', status: 'done', ms: 200, timestamp: Date.now(),
    });
    expect(useInvestigateStore.getState().scanSteps).toHaveLength(2);
  });

  test('setHeuristicComplete transitions to done (free tier path)', () => {
    useInvestigateStore.getState().startInvestigation(MINT, 'free');
    useInvestigateStore.getState().setHeuristicComplete(65);
    const state = useInvestigateStore.getState();
    expect(state.status).toBe('done');
    expect(state.heuristicScore).toBe(65);
  });

  test('setAnalyzing transitions to analyzing (pro tier path)', () => {
    useInvestigateStore.getState().startInvestigation(MINT, 'pro');
    useInvestigateStore.getState().setAnalyzing();
    expect(useInvestigateStore.getState().status).toBe('analyzing');
  });

  test('setReasoning transitions to reasoning (pro+ tier path)', () => {
    useInvestigateStore.getState().startInvestigation(MINT, 'elite');
    useInvestigateStore.getState().setReasoning();
    expect(useInvestigateStore.getState().status).toBe('reasoning');
  });

  test('addAgentStep accumulates agent steps', () => {
    useInvestigateStore.getState().startInvestigation(MINT, 'elite');
    useInvestigateStore.getState().addAgentStep({
      type: 'thinking', turn: 1, data: { text: 'Scanning...' }, timestamp: Date.now(),
    });
    useInvestigateStore.getState().addAgentStep({
      type: 'tool_call', turn: 1, data: { tool: 'scan_token' }, timestamp: Date.now(),
    });
    expect(useInvestigateStore.getState().agentSteps).toHaveLength(2);
  });

  test('setVerdict stores verdict and persists', () => {
    const AsyncStorage = require('@react-native-async-storage/async-storage');
    useInvestigateStore.getState().startInvestigation(MINT, 'elite');
    useInvestigateStore.getState().setVerdict(mockVerdict(), 3, 5000);
    const state = useInvestigateStore.getState();
    expect(state.verdict).not.toBeNull();
    expect(state.verdict!.risk_score).toBe(78);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      `investigate-result:${MINT}`,
      expect.any(String),
    );
  });

  test('setDone transitions to done with chatAvailable', () => {
    useInvestigateStore.getState().startInvestigation(MINT, 'pro');
    useInvestigateStore.getState().setDone(true);
    const state = useInvestigateStore.getState();
    expect(state.status).toBe('done');
    expect(state.chatAvailable).toBe(true);
  });

  test('setError transitions to error', () => {
    useInvestigateStore.getState().startInvestigation(MINT, 'pro');
    useInvestigateStore.getState().setError('AI failed');
    const state = useInvestigateStore.getState();
    expect(state.status).toBe('error');
    expect(state.error).toBe('AI failed');
  });

  test('cancel transitions to cancelled', () => {
    useInvestigateStore.getState().startInvestigation(MINT, 'elite');
    useInvestigateStore.getState().cancel();
    expect(useInvestigateStore.getState().status).toBe('cancelled');
  });

  test('reset returns to initial state including startedAt', () => {
    useInvestigateStore.getState().startInvestigation(MINT, 'elite');
    expect(useInvestigateStore.getState().startedAt).not.toBeNull();
    useInvestigateStore.getState().addScanStep({ step: 'lineage', status: 'done', ms: 100, timestamp: Date.now() });
    useInvestigateStore.getState().reset();
    const state = useInvestigateStore.getState();
    expect(state.status).toBe('idle');
    expect(state.mint).toBeNull();
    expect(state.startedAt).toBeNull();
    expect(state.scanSteps).toHaveLength(0);
    expect(state.agentSteps).toHaveLength(0);
  });

  test('chat messages accumulate and cap at 50', () => {
    useInvestigateStore.getState().startInvestigation(MINT, 'pro');
    for (let i = 0; i < 55; i++) {
      useInvestigateStore.getState().addChatMessage({ role: 'user', content: `msg ${i}` });
    }
    expect(useInvestigateStore.getState().chatMessages).toHaveLength(50);
  });
});
