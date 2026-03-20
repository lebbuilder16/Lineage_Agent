/* eslint-disable @typescript-eslint/no-var-requires */

// Mock native modules that streaming.ts imports transitively
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(() => Promise.resolve()),
  getItem: jest.fn(() => Promise.resolve(null)),
  removeItem: jest.fn(() => Promise.resolve()),
}));
jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: { addEventListener: jest.fn() },
}));
jest.mock('../lib/openclaw', () => ({
  isOpenClawAvailable: jest.fn(() => false),
}));
jest.mock('../lib/openclaw-alerts', () => ({
  routeAlertToChannels: jest.fn(),
  enrichAlert: jest.fn(),
}));
jest.mock('../store/alert-prefs', () => ({
  useAlertPrefsStore: { getState: () => ({ enrichmentEnabled: false }) },
}));
jest.mock('../store/alerts', () => ({
  useAlertsStore: { getState: () => ({ updateEnrichment: jest.fn() }) },
}));

// Mock XMLHttpRequest BEFORE importing module
class MockXHR {
  open = jest.fn();
  send = jest.fn();
  abort = jest.fn();
  setRequestHeader = jest.fn();
  responseType = '';
  timeout = 0;
  responseText = '';
  onprogress: (() => void) | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;

  feedSSE(text: string) {
    this.responseText += text;
    this.onprogress?.();
  }
  triggerLoad() { this.onload?.(); }
  triggerError() { this.onerror?.(); }
  triggerTimeout() { this.ontimeout?.(); }
}

let mockXhr: MockXHR;

beforeEach(() => {
  mockXhr = new MockXHR();
  (global as any).XMLHttpRequest = jest.fn(() => mockXhr);
});

// Import after mock setup
import { agentStream } from '../lib/agent-streaming';
import type { AgentEvent, AgentDoneEvent } from '../lib/agent-streaming';

describe('agentStream', () => {
  it('parses thinking event', () => {
    const events: AgentEvent[] = [];
    const onEvent = (e: AgentEvent) => events.push(e);
    const onDone = jest.fn();
    const onError = jest.fn();

    agentStream('mint1', 'key1', onEvent, onDone, onError);

    mockXhr.feedSSE('event: thinking\ndata: {"turn":1,"text":"Reasoning..."}\n\n');

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('thinking');
    expect((events[0].data as any).text).toBe('Reasoning...');
  });

  it('parses tool_call event', () => {
    const events: AgentEvent[] = [];

    agentStream('m', 'k', (e) => events.push(e), jest.fn(), jest.fn());

    mockXhr.feedSSE('event: tool_call\ndata: {"turn":1,"tool":"scan_token","input":{"mint":"M"},"call_id":"tc1"}\n\n');

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('tool_call');
    if (events[0].type === 'tool_call') {
      expect(events[0].data.tool).toBe('scan_token');
      expect(events[0].data.callId).toBe('tc1');
    }
  });

  it('parses tool_result event', () => {
    const events: AgentEvent[] = [];

    agentStream('m', 'k', (e) => events.push(e), jest.fn(), jest.fn());

    mockXhr.feedSSE('event: tool_result\ndata: {"turn":1,"tool":"scan_token","call_id":"tc1","result":{"risk":50},"error":null,"duration_ms":150}\n\n');

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('tool_result');
    if (events[0].type === 'tool_result') {
      expect(events[0].data.durationMs).toBe(150);
      expect(events[0].data.error).toBeNull();
    }
  });

  it('parses text event', () => {
    const events: AgentEvent[] = [];

    agentStream('m', 'k', (e) => events.push(e), jest.fn(), jest.fn());

    mockXhr.feedSSE('event: text\ndata: {"turn":2,"text":"The token shows moderate risk."}\n\n');

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('text');
  });

  it('parses done event with verdict', () => {
    const events: AgentEvent[] = [];
    const onDone = jest.fn();

    agentStream('m', 'k', (e) => events.push(e), onDone, jest.fn());

    const verdict = {
      verdict: { risk_score: 85, confidence: 'high', rug_pattern: 'classic_rug', verdict_summary: 'Rug confirmed', narrative: { observation: 'o', pattern: 'p', risk: 'r' }, key_findings: ['f1'], conviction_chain: 'c', operator_hypothesis: null },
      turns_used: 3,
      tokens_used: 5000,
    };
    mockXhr.feedSSE(`event: done\ndata: ${JSON.stringify(verdict)}\n\n`);

    expect(onDone).toHaveBeenCalledTimes(1);
    const result = onDone.mock.calls[0][0] as AgentDoneEvent;
    expect(result.verdict?.risk_score).toBe(85);
    expect(result.turns_used).toBe(3);
  });

  it('surfaces error event via onError — never swallowed', () => {
    const onError = jest.fn();

    agentStream('m', 'k', jest.fn(), jest.fn(), onError);

    mockXhr.feedSSE('event: error\ndata: {"detail":"API key invalid","recoverable":false}\n\n');

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].message).toBe('API key invalid');
  });

  it('handles network error via onError', () => {
    const onError = jest.fn();

    agentStream('m', 'k', jest.fn(), jest.fn(), onError);

    mockXhr.triggerError();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].message).toContain('Network error');
  });

  it('handles timeout via onError', () => {
    const onError = jest.fn();

    agentStream('m', 'k', jest.fn(), jest.fn(), onError);

    mockXhr.triggerTimeout();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].message).toContain('timed out');
  });

  it('cancel aborts XHR', () => {

    const cancel = agentStream('m', 'k', jest.fn(), jest.fn(), jest.fn());
    cancel();

    expect(mockXhr.abort).toHaveBeenCalled();
  });

  it('ignores events after cancel', () => {
    const events: AgentEvent[] = [];

    const cancel = agentStream('m', 'k', (e) => events.push(e), jest.fn(), jest.fn());
    cancel();

    mockXhr.feedSSE('event: thinking\ndata: {"turn":1,"text":"test"}\n\n');

    expect(events).toHaveLength(0);
  });

  it('handles partial SSE chunks across multiple onprogress', () => {
    const events: AgentEvent[] = [];

    agentStream('m', 'k', (e) => events.push(e), jest.fn(), jest.fn());

    // Feed partial data
    mockXhr.feedSSE('event: thinking\nda');
    expect(events).toHaveLength(0);

    // Complete the event
    mockXhr.feedSSE('ta: {"turn":1,"text":"hello"}\n\n');
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('thinking');
  });

  it('sets correct headers', () => {

    agentStream('myMint', 'myKey', jest.fn(), jest.fn(), jest.fn());

    expect(mockXhr.setRequestHeader).toHaveBeenCalledWith('X-API-Key', 'myKey');
    expect(mockXhr.setRequestHeader).toHaveBeenCalledWith('Accept', 'text/event-stream');
    expect(mockXhr.open).toHaveBeenCalledWith('POST', expect.stringContaining('/agent/myMint'));
  });
});
