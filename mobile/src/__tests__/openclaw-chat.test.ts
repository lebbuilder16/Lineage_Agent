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
    mockChatStream.mockReturnValue(cancel);

    const onChunk = jest.fn();
    const onDone = jest.fn();
    const result = await smartChatStream('mint123', 'hello', [], onChunk, onDone);

    expect(mockChatStream).toHaveBeenCalledWith('mint123', 'hello', [], onChunk, onDone, undefined);
    expect(result).toBe(cancel);
  });

  it('passes undefined mint correctly', async () => {
    mockIsAvailable.mockReturnValue(false);
    mockChatStream.mockReturnValue(jest.fn());

    await smartChatStream(undefined, 'hello', [], jest.fn(), jest.fn());
    expect(mockChatStream).toHaveBeenCalledWith(undefined, 'hello', [], expect.any(Function), expect.any(Function), undefined);
  });

  it('passes error callback to chatStream', async () => {
    mockIsAvailable.mockReturnValue(false);
    mockChatStream.mockReturnValue(jest.fn());
    const onError = jest.fn();

    await smartChatStream('mint', 'hi', [], jest.fn(), jest.fn(), onError);
    expect(mockChatStream).toHaveBeenCalledWith('mint', 'hi', [], expect.any(Function), expect.any(Function), onError);
  });
});

describe('smartChatStream — OpenClaw mode', () => {
  beforeEach(() => {
    mockIsAvailable.mockReturnValue(true);
  });

  it('sends chat.send request with correct sessionKey for a mint', async () => {
    mockSendRequest.mockResolvedValue({ text: 'Hello world' });

    const onChunk = jest.fn();
    const onDone = jest.fn();
    await smartChatStream('abc123', 'hi', [], onChunk, onDone);

    expect(mockSendRequest).toHaveBeenCalledWith('chat.send', expect.objectContaining({
      sessionKey: 'lineage:token:abc123',
      stream: false,
    }));
  });

  it('uses global session key when no mint provided', async () => {
    mockSendRequest.mockResolvedValue({ text: 'response' });

    await smartChatStream(undefined, 'question', [], jest.fn(), jest.fn());

    expect(mockSendRequest).toHaveBeenCalledWith('chat.send', expect.objectContaining({
      sessionKey: 'lineage:chat:global',
    }));
  });

  it('includes context prefix in message', async () => {
    mockSendRequest.mockResolvedValue({ text: 'answer' });

    await smartChatStream('mint999', 'what is risk?', [], jest.fn(), jest.fn());

    const callArgs = mockSendRequest.mock.calls[0][1];
    expect(callArgs.message).toContain('mint999');
    expect(callArgs.message).toContain('what is risk?');
  });

  it('delivers response as word chunks via interval', async () => {
    mockSendRequest.mockResolvedValue({ text: 'hello world test' });

    const onChunk = jest.fn();
    const onDone = jest.fn();
    await smartChatStream('mint', 'q', [], onChunk, onDone);

    // Advance timer to deliver all chunks (3 words * 20ms each)
    jest.advanceTimersByTime(200);

    expect(onChunk).toHaveBeenCalledTimes(3);
    expect(onChunk).toHaveBeenNthCalledWith(1, 'hello');
    expect(onChunk).toHaveBeenNthCalledWith(2, ' world');
    expect(onChunk).toHaveBeenNthCalledWith(3, ' test');
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('handles string response (not object)', async () => {
    mockSendRequest.mockResolvedValue('plain string response');

    const onChunk = jest.fn();
    const onDone = jest.fn();
    await smartChatStream('mint', 'q', [], onChunk, onDone);
    jest.advanceTimersByTime(500);

    expect(onChunk).toHaveBeenCalled();
    expect(onDone).toHaveBeenCalled();
  });

  it('cancel() stops chunk delivery before onDone', async () => {
    mockSendRequest.mockResolvedValue({ text: 'word1 word2 word3 word4 word5' });

    const onChunk = jest.fn();
    const onDone = jest.fn();
    const cancel = await smartChatStream('mint', 'q', [], onChunk, onDone);

    // Fire first chunk
    jest.advanceTimersByTime(20);
    expect(onChunk).toHaveBeenCalledTimes(1);

    // Cancel mid-stream
    cancel();

    // Advance past all remaining words
    jest.advanceTimersByTime(500);

    // No more chunks or done after cancel
    expect(onChunk).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
  });

  it('calls onError and onDone when sendRequest throws (does not fall back)', async () => {
    mockSendRequest.mockRejectedValue(new Error('WS error'));

    const onError = jest.fn();
    const onDone = jest.fn();
    const cancel = await smartChatStream('mint', 'q', [], jest.fn(), onDone, onError);

    // openClawChatStream catches internally — onError + onDone called, chatStream NOT called
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(onDone).toHaveBeenCalled();
    expect(mockChatStream).not.toHaveBeenCalled();
    expect(typeof cancel).toBe('function');
  });
});
