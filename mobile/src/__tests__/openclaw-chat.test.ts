// Tests for the OpenClaw dual-mode chat adapter

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

// ─── Mocks (factories must not reference outer variables — hoisting) ──────────

jest.mock('../lib/openclaw', () => ({
  isOpenClawAvailable: jest.fn(),
  sendRequest: jest.fn(),
  subscribe: jest.fn(() => jest.fn()), // returns unsubscribe fn
}));

jest.mock('../lib/streaming', () => ({
  chatStream: jest.fn(),
}));

// ─── Imports (after mock declarations) ───────────────────────────────────────

import { smartChatStream, isChatOpenClawMode } from '../lib/openclaw-chat';
import * as OpenClaw from '../lib/openclaw';
import * as Streaming from '../lib/streaming';

const mockIsAvailable = jest.mocked(OpenClaw.isOpenClawAvailable);
const mockSendRequest = jest.mocked(OpenClaw.sendRequest);
const mockSubscribe = jest.mocked(OpenClaw.subscribe);
const mockChatStream = jest.mocked(Streaming.chatStream);

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockIsAvailable.mockReturnValue(false);
  mockSendRequest.mockResolvedValue({ text: '' });
});

afterEach(() => {
  jest.runAllTimers();
  jest.useRealTimers();
});

// ─── isChatOpenClawMode ───────────────────────────────────────────────────────

describe('isChatOpenClawMode', () => {
  it('returns false when OpenClaw is not available', () => {
    mockIsAvailable.mockReturnValue(false);
    expect(isChatOpenClawMode()).toBe(false);
  });

  it('returns true when OpenClaw is available', () => {
    mockIsAvailable.mockReturnValue(true);
    expect(isChatOpenClawMode()).toBe(true);
  });
});

// ─── smartChatStream ─────────────────────────────────────────────────────────

describe('smartChatStream — fallback mode (OpenClaw unavailable)', () => {
  it('calls chatStream when OpenClaw is not available', async () => {
    mockIsAvailable.mockReturnValue(false);
    const cancel = jest.fn();
    mockChatStream.mockResolvedValue(cancel);

    const onChunk = jest.fn();
    const onDone = jest.fn();
    const result = await smartChatStream('mint123', 'hello', [], onChunk, onDone);

    expect(mockChatStream).toHaveBeenCalledWith('mint123', 'hello', [], onChunk, onDone, undefined);
    expect(result).toBe(cancel);
  });

  it('passes undefined mint correctly', async () => {
    mockIsAvailable.mockReturnValue(false);
    mockChatStream.mockResolvedValue(jest.fn());

    await smartChatStream(undefined, 'hello', [], jest.fn(), jest.fn());
    expect(mockChatStream).toHaveBeenCalledWith(undefined, 'hello', [], expect.any(Function), expect.any(Function), undefined);
  });

  it('passes error callback to chatStream', async () => {
    mockIsAvailable.mockReturnValue(false);
    mockChatStream.mockResolvedValue(jest.fn());
    const onError = jest.fn();

    await smartChatStream('mint', 'hi', [], jest.fn(), jest.fn(), onError);
    expect(mockChatStream).toHaveBeenCalledWith('mint', 'hi', [], expect.any(Function), expect.any(Function), onError);
  });
});

describe('smartChatStream — OpenClaw mode', () => {
  let subscribeCb: ((payload: unknown) => void) | null = null;

  beforeEach(() => {
    mockIsAvailable.mockReturnValue(true);
    subscribeCb = null;
    // Capture the subscribe callback so we can simulate server events
    mockSubscribe.mockImplementation((_event: string, cb: (payload: unknown) => void) => {
      subscribeCb = cb;
      return jest.fn(); // unsubscribe
    });
  });

  it('sends chat.send request with correct sessionKey for a mint', async () => {
    mockSendRequest.mockResolvedValue({});

    const onChunk = jest.fn();
    const onDone = jest.fn();
    await smartChatStream('abc123', 'hi', [], onChunk, onDone);

    expect(mockSendRequest).toHaveBeenCalledWith('chat.send', expect.objectContaining({
      sessionKey: 'lineage:token:abc123',
    }));
  });

  it('uses global session key when no mint provided', async () => {
    mockSendRequest.mockResolvedValue({});

    await smartChatStream(undefined, 'question', [], jest.fn(), jest.fn());

    expect(mockSendRequest).toHaveBeenCalledWith('chat.send', expect.objectContaining({
      sessionKey: 'lineage:chat:global',
    }));
  });

  it('subscribes to chat events before sending request', async () => {
    mockSendRequest.mockResolvedValue({});

    await smartChatStream('mint', 'q', [], jest.fn(), jest.fn());

    expect(mockSubscribe).toHaveBeenCalledWith('chat', expect.any(Function));
    // subscribe must be called before sendRequest
    const subOrder = mockSubscribe.mock.invocationCallOrder[0];
    const sendOrder = mockSendRequest.mock.invocationCallOrder[0];
    expect(subOrder).toBeLessThan(sendOrder);
  });

  it('delivers delta events as incremental chunks', async () => {
    mockSendRequest.mockResolvedValue({});

    const onChunk = jest.fn();
    const onDone = jest.fn();
    await smartChatStream('mint', 'q', [], onChunk, onDone);

    // Get the idempotencyKey from the sendRequest call
    const callArgs = mockSendRequest.mock.calls[0]?.[1] as Record<string, unknown>;
    const runId = callArgs?.idempotencyKey as string;

    // Simulate delta events (cumulative text)
    subscribeCb!({ runId, state: 'delta', message: { content: [{ type: 'text', text: 'Hello' }] } });
    subscribeCb!({ runId, state: 'delta', message: { content: [{ type: 'text', text: 'Hello world' }] } });

    expect(onChunk).toHaveBeenCalledTimes(2);
    expect(onChunk).toHaveBeenNthCalledWith(1, 'Hello');
    expect(onChunk).toHaveBeenNthCalledWith(2, ' world');
  });

  it('calls onDone on final event', async () => {
    mockSendRequest.mockResolvedValue({});

    const onDone = jest.fn();
    await smartChatStream('mint', 'q', [], jest.fn(), onDone);

    const callArgs = mockSendRequest.mock.calls[0]?.[1] as Record<string, unknown>;
    const runId = callArgs?.idempotencyKey as string;

    subscribeCb!({ runId, state: 'final', message: { content: [{ type: 'text', text: 'Done' }] } });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('calls onError on error event', async () => {
    mockSendRequest.mockResolvedValue({});

    const onError = jest.fn();
    await smartChatStream('mint', 'q', [], jest.fn(), jest.fn(), onError);

    const callArgs = mockSendRequest.mock.calls[0]?.[1] as Record<string, unknown>;
    const runId = callArgs?.idempotencyKey as string;

    subscribeCb!({ runId, state: 'error', errorMessage: 'AI failed' });
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it('falls back to chatStream when sendRequest throws', async () => {
    mockSendRequest.mockRejectedValue(new Error('WS error'));
    const cancel = jest.fn();
    mockChatStream.mockResolvedValue(cancel);

    const onChunk = jest.fn();
    const onDone = jest.fn();
    const result = await smartChatStream('mint', 'q', [], onChunk, onDone);

    // Should fall back to chatStream
    expect(mockChatStream).toHaveBeenCalled();
    expect(result).toBe(cancel);
  });
});
