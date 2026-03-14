// Mock openapi-fetch (ESM-only package) — jest resolves it through the unit project's transform config
jest.mock('openapi-fetch', () => ({
  __esModule: true,
  default: () => ({ use: () => {} }),
}));

import { ApiError } from '../lib/api-client';

describe('ApiError', () => {
  it('is an instance of Error', () => {
    const err = new ApiError(404, 'Not found');
    expect(err).toBeInstanceOf(Error);
  });

  it('sets status, detail, type and message correctly', () => {
    const err = new ApiError(
      422,
      'Validation failed',
      'https://httpproblems.com/http-status/422',
      '/scan/bad-mint',
    );
    expect(err.status).toBe(422);
    expect(err.detail).toBe('Validation failed');
    expect(err.message).toBe('Validation failed');
    expect(err.type).toBe('https://httpproblems.com/http-status/422');
    expect(err.instance).toBe('/scan/bad-mint');
    expect(err.name).toBe('ApiError');
  });

  it('defaults type to about:blank when not supplied', () => {
    const err = new ApiError(500, 'Server error');
    expect(err.type).toBe('about:blank');
    expect(err.instance).toBeUndefined();
  });

  it('is caught as Error by generic catch', () => {
    const throwIt = () => {
      throw new ApiError(403, 'Forbidden');
    };
    expect(throwIt).toThrow(Error);
    expect(throwIt).toThrow('Forbidden');
  });
});
