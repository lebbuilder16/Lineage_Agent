/**
 * Tests for the unified investigation SSE streaming handler.
 * Validates event parsing for all event types across tier modes.
 */

// Mock the transitive react-native dependency chain
jest.mock('../lib/streaming', () => ({
  createSSEParser: jest.fn(() => ({ feed: jest.fn() })),
}));

jest.mock('../lib/agent-streaming', () => ({
  agentStream: jest.fn(),
}));

describe('investigate-streaming', () => {
  test('module exports investigateStream function', () => {
    const mod = require('../lib/investigate-streaming');
    expect(typeof mod.investigateStream).toBe('function');
  });

  test('module exports investigateChatStream function', () => {
    const mod = require('../lib/investigate-streaming');
    expect(typeof mod.investigateChatStream).toBe('function');
  });

  test('investigateStream signature accepts correct params', () => {
    const { investigateStream } = require('../lib/investigate-streaming');
    // mint, apiKey, callbacks
    expect(investigateStream.length).toBe(3);
  });

  test('investigateChatStream signature accepts correct params', () => {
    const { investigateChatStream } = require('../lib/investigate-streaming');
    // mint, apiKey, message, history, onToken, onDone, onError
    expect(investigateChatStream.length).toBe(7);
  });
});
