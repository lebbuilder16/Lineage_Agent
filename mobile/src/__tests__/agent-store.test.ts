import { useAgentStore } from '../store/agent';
import type { AgentVerdict } from '../lib/agent-streaming';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(() => Promise.resolve()),
  getItem: jest.fn(() => Promise.resolve(null)),
}));

const MOCK_VERDICT: AgentVerdict = {
  risk_score: 78,
  confidence: 'high',
  rug_pattern: 'coordinated_bundle',
  verdict_summary: 'Coordinated bundle extraction confirmed',
  narrative: {
    observation: 'Multiple wallets acted in coordination',
    pattern: 'Staging → accumulation → exit',
    risk: '14 SOL extracted, deployer exited',
  },
  key_findings: ['[FINANCIAL] Bundle extracted 14 SOL'],
  conviction_chain: 'Three independent signals converge',
  operator_hypothesis: null,
};

describe('useAgentStore', () => {
  beforeEach(() => {
    useAgentStore.getState().reset();
  });

  it('has correct initial state', () => {
    const state = useAgentStore.getState();
    expect(state.status).toBe('idle');
    expect(state.sessionId).toBeNull();
    expect(state.mint).toBeNull();
    expect(state.steps).toEqual([]);
    expect(state.verdict).toBeNull();
    expect(state.error).toBeNull();
  });

  it('startSession sets mint and status', () => {
    useAgentStore.getState().startSession('TestMint123');
    const state = useAgentStore.getState();
    expect(state.status).toBe('running');
    expect(state.mint).toBe('TestMint123');
    expect(state.sessionId).toBeTruthy();
    expect(state.steps).toEqual([]);
    expect(state.verdict).toBeNull();
    expect(state.error).toBeNull();
  });

  it('addStep appends to steps array', () => {
    useAgentStore.getState().startSession('M');
    useAgentStore.getState().addStep({
      type: 'thinking',
      turn: 1,
      data: { text: 'Analyzing...' },
      timestamp: Date.now(),
    });
    useAgentStore.getState().addStep({
      type: 'tool_call',
      turn: 1,
      data: { tool: 'scan_token' },
      timestamp: Date.now(),
    });
    expect(useAgentStore.getState().steps).toHaveLength(2);
    expect(useAgentStore.getState().steps[0].type).toBe('thinking');
    expect(useAgentStore.getState().steps[1].type).toBe('tool_call');
  });

  it('setVerdict updates verdict and status', () => {
    useAgentStore.getState().startSession('M');
    useAgentStore.getState().setVerdict(MOCK_VERDICT, 3, 5000);
    const state = useAgentStore.getState();
    expect(state.status).toBe('done');
    expect(state.verdict).toEqual(MOCK_VERDICT);
    expect(state.turnsUsed).toBe(3);
    expect(state.tokensUsed).toBe(5000);
  });

  it('setError sets error string and status', () => {
    useAgentStore.getState().startSession('M');
    useAgentStore.getState().setError('Connection failed');
    const state = useAgentStore.getState();
    expect(state.status).toBe('error');
    expect(state.error).toBe('Connection failed');
  });

  it('cancel sets status to cancelled', () => {
    useAgentStore.getState().startSession('M');
    useAgentStore.getState().cancel();
    expect(useAgentStore.getState().status).toBe('cancelled');
  });

  it('reset returns to initial state', () => {
    useAgentStore.getState().startSession('M');
    useAgentStore.getState().addStep({ type: 'thinking', turn: 1, data: {}, timestamp: 0 });
    useAgentStore.getState().setVerdict(MOCK_VERDICT, 2, 1000);
    useAgentStore.getState().reset();

    const state = useAgentStore.getState();
    expect(state.status).toBe('idle');
    expect(state.sessionId).toBeNull();
    expect(state.steps).toEqual([]);
    expect(state.verdict).toBeNull();
  });

  it('persists verdict to AsyncStorage on setVerdict', () => {
    const AsyncStorage = require('@react-native-async-storage/async-storage');
    useAgentStore.getState().startSession('PersistMint');
    useAgentStore.getState().setVerdict(MOCK_VERDICT, 2, 3000);

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'agent-result:PersistMint',
      expect.stringContaining('"risk_score":78'),
    );
  });
});
