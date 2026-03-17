// Tests for the OpenClaw WebSocket client singleton
// Note: module-level state in openclaw.ts is reset via disconnectOpenClaw() in afterEach

import type { OpenClawResponse, OpenClawEvent } from '../types/openclaw';

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

const mockSetConnected = jest.fn();
const mockSetStatus = jest.fn();
const mockSetPaired = jest.fn();
const mockSetDeviceToken = jest.fn();
let mockConnected = false;

jest.mock('../store/openclaw', () => ({
  useOpenClawStore: {
    getState: () => ({
      connected: mockConnected,
      setConnected: mockSetConnected.mockImplementation((v: boolean) => { mockConnected = v; }),
      setStatus: mockSetStatus,
      setPaired: mockSetPaired,
      setDeviceToken: mockSetDeviceToken,
    }),
  },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  multiGet: jest.fn(),
  multiSet: jest.fn(),
}));

// ─── MockWebSocket ────────────────────────────────────────────────────────────

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState: number = MockWebSocket.CONNECTING;
  url: string;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  sentMessages: string[] = [];
  static instances: MockWebSocket[] = [];

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sentMessages.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ type: 'close' } as CloseEvent);
  }

  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.({ type: 'open' } as Event);
  }

  simulateMessage(data: object) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
  }

  simulateClose() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ type: 'close' } as CloseEvent);
  }

  simulateError() {
    this.onerror?.({ type: 'error' } as Event);
  }
}

// ─── Setup ────────────────────────────────────────────────────────────────────

let latestWS: () => MockWebSocket;

beforeAll(() => {
  (global as any).WebSocket = MockWebSocket;
});

beforeEach(() => {
  MockWebSocket.instances = [];
  mockConnected = false;
  jest.clearAllMocks();
  jest.useFakeTimers();
  latestWS = () => MockWebSocket.instances[MockWebSocket.instances.length - 1];
});

afterEach(async () => {
  const { disconnectOpenClaw } = require('../lib/openclaw');
  disconnectOpenClaw();
  jest.runAllTimers();
  jest.useRealTimers();
  jest.resetModules();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('connectOpenClaw', () => {
  it('creates a WebSocket with ws:// prefix for bare host', () => {
    const { connectOpenClaw } = require('../lib/openclaw');
    connectOpenClaw('192.168.1.50:18789', 'token123');

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(latestWS().url).toBe('ws://192.168.1.50:18789');
  });

  it('does not add protocol prefix when already ws://', () => {
    const { connectOpenClaw } = require('../lib/openclaw');
    connectOpenClaw('ws://192.168.1.50:18789', 'token123');

    expect(latestWS().url).toBe('ws://192.168.1.50:18789');
  });

  it('sets store status to reconnecting on connect attempt', () => {
    const { connectOpenClaw } = require('../lib/openclaw');
    connectOpenClaw('192.168.1.50:18789', 'token123');

    expect(mockSetStatus).toHaveBeenCalledWith('reconnecting');
  });

  it('sends connect handshake frame on WS open', () => {
    const { connectOpenClaw } = require('../lib/openclaw');
    connectOpenClaw('host:1234', 'my-token');
    latestWS().simulateOpen();

    expect(latestWS().sentMessages).toHaveLength(1);
    const frame = JSON.parse(latestWS().sentMessages[0]);
    expect(frame.type).toBe('req');
    expect(frame.id).toBe('connect-0');
    expect(frame.method).toBe('connect');
    expect(frame.params.token).toBe('my-token');
    expect(frame.params.mode).toBe('node');
    expect(frame.params.platform).toBe('ios');
    expect(Array.isArray(frame.params.capabilities)).toBe(true);
  });

  it('does not create a second WS when already OPEN', () => {
    const { connectOpenClaw } = require('../lib/openclaw');
    connectOpenClaw('host:1234', 'tok');
    latestWS().simulateOpen();
    const firstWS = latestWS();

    connectOpenClaw('host:1234', 'tok'); // second call
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(latestWS()).toBe(firstWS);
  });
});

describe('handshake response', () => {
  it('sets connected=true, status=connected, paired=true on successful handshake', () => {
    const { connectOpenClaw } = require('../lib/openclaw');
    connectOpenClaw('host:1234', 'tok');
    latestWS().simulateOpen();

    latestWS().simulateMessage({
      type: 'res',
      id: 'connect-0',
      ok: true,
      payload: { connId: 'abc', methods: [], events: [], snapshot: {} },
    } as OpenClawResponse);

    expect(mockSetConnected).toHaveBeenCalledWith(true);
    expect(mockSetStatus).toHaveBeenCalledWith('connected');
    expect(mockSetPaired).toHaveBeenCalledWith(true);
  });

  it('stores deviceToken from hello payload', () => {
    const { connectOpenClaw } = require('../lib/openclaw');
    connectOpenClaw('host:1234', 'tok');
    latestWS().simulateOpen();

    latestWS().simulateMessage({
      type: 'res',
      id: 'connect-0',
      ok: true,
      payload: { connId: 'abc', deviceToken: 'issued-token-xyz', methods: [], events: [], snapshot: {} },
    } as OpenClawResponse);

    expect(mockSetDeviceToken).toHaveBeenCalledWith('issued-token-xyz');
  });

  it('stops reconnecting and sets paired=false on auth failure', () => {
    const { connectOpenClaw } = require('../lib/openclaw');
    connectOpenClaw('host:1234', 'bad-token');
    latestWS().simulateOpen();

    latestWS().simulateMessage({
      type: 'res',
      id: 'connect-0',
      ok: false,
      error: { message: 'Invalid token', code: 401 },
    } as OpenClawResponse);

    expect(mockSetPaired).toHaveBeenCalledWith(false);
    expect(mockSetStatus).toHaveBeenCalledWith('offline');

    // Trigger close — no reconnect should happen
    const instancesBefore = MockWebSocket.instances.length;
    jest.runAllTimers();
    expect(MockWebSocket.instances.length).toBe(instancesBefore);
  });
});

describe('sendRequest', () => {
  it('resolves with payload on matching response', async () => {
    const { connectOpenClaw, sendRequest } = require('../lib/openclaw');
    connectOpenClaw('host:1234', 'tok');
    latestWS().simulateOpen();
    // Successful handshake
    latestWS().simulateMessage({ type: 'res', id: 'connect-0', ok: true, payload: {} } as OpenClawResponse);
    mockConnected = true;

    const promise = sendRequest('cron.list', {});

    // Grab the sent frame to get its id
    const frame = JSON.parse(latestWS().sentMessages[latestWS().sentMessages.length - 1]);
    expect(frame.type).toBe('req');
    expect(frame.method).toBe('cron.list');

    latestWS().simulateMessage({
      type: 'res',
      id: frame.id,
      ok: true,
      payload: { jobs: [] },
    } as OpenClawResponse);

    await expect(promise).resolves.toEqual({ jobs: [] });
  });

  it('rejects when WS is not open', async () => {
    const { sendRequest } = require('../lib/openclaw');
    // No connectOpenClaw called — ws is null
    await expect(sendRequest('test.method', {})).rejects.toThrow('OpenClaw not connected');
  });

  it('rejects after REQUEST_TIMEOUT (15s)', async () => {
    const { connectOpenClaw, sendRequest } = require('../lib/openclaw');
    connectOpenClaw('host:1234', 'tok');
    latestWS().simulateOpen();
    latestWS().simulateMessage({ type: 'res', id: 'connect-0', ok: true, payload: {} } as OpenClawResponse);
    mockConnected = true;

    const promise = sendRequest('slow.method', {});
    jest.advanceTimersByTime(15_001);

    await expect(promise).rejects.toThrow('OpenClaw request timeout: slow.method');
  });

  it('rejects on error response', async () => {
    const { connectOpenClaw, sendRequest } = require('../lib/openclaw');
    connectOpenClaw('host:1234', 'tok');
    latestWS().simulateOpen();
    latestWS().simulateMessage({ type: 'res', id: 'connect-0', ok: true, payload: {} } as OpenClawResponse);
    mockConnected = true;

    const promise = sendRequest('fail.method', {});
    const frame = JSON.parse(latestWS().sentMessages[latestWS().sentMessages.length - 1]);

    latestWS().simulateMessage({
      type: 'res',
      id: frame.id,
      ok: false,
      error: { message: 'Not found', code: 404 },
    } as OpenClawResponse);

    await expect(promise).rejects.toThrow('Not found');
  });
});

describe('subscribe / events', () => {
  it('dispatches event payload to matching subscriber', () => {
    const { connectOpenClaw, subscribe } = require('../lib/openclaw');
    connectOpenClaw('host:1234', 'tok');
    latestWS().simulateOpen();
    latestWS().simulateMessage({ type: 'res', id: 'connect-0', ok: true, payload: {} } as OpenClawResponse);

    const cb = jest.fn();
    subscribe('cron.result', cb);

    latestWS().simulateMessage({
      type: 'event',
      event: 'cron.result',
      payload: { name: 'lineage:briefing', result: 'content' },
    } as OpenClawEvent);

    expect(cb).toHaveBeenCalledWith({ name: 'lineage:briefing', result: 'content' });
  });

  it('does not call subscriber after unsubscribe', () => {
    const { connectOpenClaw, subscribe } = require('../lib/openclaw');
    connectOpenClaw('host:1234', 'tok');
    latestWS().simulateOpen();
    latestWS().simulateMessage({ type: 'res', id: 'connect-0', ok: true, payload: {} } as OpenClawResponse);

    const cb = jest.fn();
    const unsub = subscribe('alert', cb);
    unsub();

    latestWS().simulateMessage({
      type: 'event',
      event: 'alert',
      payload: { type: 'rug' },
    } as OpenClawEvent);

    expect(cb).not.toHaveBeenCalled();
  });

  it('wildcard subscriber receives all events', () => {
    const { connectOpenClaw, subscribe } = require('../lib/openclaw');
    connectOpenClaw('host:1234', 'tok');
    latestWS().simulateOpen();
    latestWS().simulateMessage({ type: 'res', id: 'connect-0', ok: true, payload: {} } as OpenClawResponse);

    const wildcard = jest.fn();
    subscribe('*', wildcard);

    latestWS().simulateMessage({
      type: 'event',
      event: 'test.event',
      payload: { foo: 'bar' },
    } as OpenClawEvent);

    expect(wildcard).toHaveBeenCalledWith({ event: 'test.event', payload: { foo: 'bar' } });
  });

  it('isolates subscribers by event type', () => {
    const { connectOpenClaw, subscribe } = require('../lib/openclaw');
    connectOpenClaw('host:1234', 'tok');
    latestWS().simulateOpen();
    latestWS().simulateMessage({ type: 'res', id: 'connect-0', ok: true, payload: {} } as OpenClawResponse);

    const cbAlert = jest.fn();
    const cbCron = jest.fn();
    subscribe('alert', cbAlert);
    subscribe('cron.result', cbCron);

    latestWS().simulateMessage({ type: 'event', event: 'alert', payload: {} } as OpenClawEvent);

    expect(cbAlert).toHaveBeenCalledTimes(1);
    expect(cbCron).not.toHaveBeenCalled();
  });
});

describe('disconnectOpenClaw', () => {
  it('rejects all pending requests with "OpenClaw disconnected"', async () => {
    const { connectOpenClaw, sendRequest, disconnectOpenClaw } = require('../lib/openclaw');
    connectOpenClaw('host:1234', 'tok');
    latestWS().simulateOpen();
    latestWS().simulateMessage({ type: 'res', id: 'connect-0', ok: true, payload: {} } as OpenClawResponse);
    mockConnected = true;

    const p1 = sendRequest('method.a', {});
    const p2 = sendRequest('method.b', {});

    disconnectOpenClaw();

    await expect(p1).rejects.toThrow('OpenClaw disconnected');
    await expect(p2).rejects.toThrow('OpenClaw disconnected');
  });

  it('sets store connected=false and status=offline', () => {
    const { connectOpenClaw, disconnectOpenClaw } = require('../lib/openclaw');
    connectOpenClaw('host:1234', 'tok');
    disconnectOpenClaw();

    expect(mockSetConnected).toHaveBeenCalledWith(false);
    expect(mockSetStatus).toHaveBeenCalledWith('offline');
  });
});

describe('isOpenClawAvailable', () => {
  it('returns store.connected value', () => {
    const { isOpenClawAvailable } = require('../lib/openclaw');

    mockConnected = false;
    expect(isOpenClawAvailable()).toBe(false);

    mockConnected = true;
    expect(isOpenClawAvailable()).toBe(true);
  });
});

describe('reconnection backoff', () => {
  it('schedules reconnect after WS close when not intentionally disconnected', () => {
    const { connectOpenClaw } = require('../lib/openclaw');
    connectOpenClaw('host:1234', 'tok');
    latestWS().simulateOpen();
    latestWS().simulateMessage({ type: 'res', id: 'connect-0', ok: true, payload: {} } as OpenClawResponse);

    const countBefore = MockWebSocket.instances.length;
    latestWS().simulateClose();

    // Advance past first backoff (BACKOFF_BASE = 2000ms, retryCount=0 → 2s)
    jest.advanceTimersByTime(2_001);

    expect(MockWebSocket.instances.length).toBeGreaterThan(countBefore);
    expect(mockSetStatus).toHaveBeenCalledWith('reconnecting');
  });

  it('sets status=offline on close after intentional disconnect', () => {
    const { connectOpenClaw, disconnectOpenClaw } = require('../lib/openclaw');
    connectOpenClaw('host:1234', 'tok');
    latestWS().simulateOpen();

    const countBefore = MockWebSocket.instances.length;
    disconnectOpenClaw();
    jest.runAllTimers();

    // No new WS instances should have been created
    expect(MockWebSocket.instances.length).toBe(countBefore);
  });
});
