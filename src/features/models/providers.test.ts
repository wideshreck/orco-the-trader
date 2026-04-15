import { describe, expect, it } from 'bun:test';
import {
  isSupportedProvider,
  PROVIDER_IDS,
  resolveModel,
  supportedProviderIds,
  UnsupportedProviderError,
} from './providers.js';

describe('isSupportedProvider', () => {
  it('returns true for each registered provider id', () => {
    for (const id of PROVIDER_IDS) {
      expect(isSupportedProvider(id)).toBe(true);
    }
  });

  it('returns false for unknown ids', () => {
    expect(isSupportedProvider('nosuch')).toBe(false);
    expect(isSupportedProvider('')).toBe(false);
  });
});

describe('supportedProviderIds', () => {
  it('returns the PROVIDER_IDS tuple', () => {
    expect(supportedProviderIds()).toBe(PROVIDER_IDS);
  });
});

describe('UnsupportedProviderError', () => {
  it('records the offending providerId', () => {
    const err = new UnsupportedProviderError('bogus');
    expect(err.providerId).toBe('bogus');
    expect(err.name).toBe('UnsupportedProviderError');
    expect(err.message).toContain('bogus');
  });
});

describe('resolveModel', () => {
  it('throws UnsupportedProviderError for unknown providers', async () => {
    await expect(resolveModel({ providerId: 'ghost', modelId: 'x' })).rejects.toBeInstanceOf(
      UnsupportedProviderError,
    );
  });
});
