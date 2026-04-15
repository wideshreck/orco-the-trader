import { describe, expect, it } from 'bun:test';
import type { Catalog } from '../models/catalog.js';
import { computeCost, formatTokens, formatUsageLine, formatUsd } from './cost.js';

const catalog: Catalog = {
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    env: ['ANTHROPIC_API_KEY'],
    models: {
      'claude-sonnet-4.5': {
        id: 'claude-sonnet-4.5',
        name: 'Claude Sonnet 4.5',
        cost: { input: 3, output: 15 },
      },
    },
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    env: ['OPENAI_API_KEY'],
    models: {
      'no-cost': { id: 'no-cost', name: 'no cost data' },
    },
  },
};

describe('computeCost', () => {
  it('computes cost from per-million rates', () => {
    const cost = computeCost({ inputTokens: 1_000_000, outputTokens: 500_000 }, catalog, {
      providerId: 'anthropic',
      modelId: 'claude-sonnet-4.5',
    });
    expect(cost).toEqual({ inputUsd: 3, outputUsd: 7.5, totalUsd: 10.5 });
  });

  it('returns null when model has no cost data', () => {
    const cost = computeCost({ inputTokens: 100, outputTokens: 50 }, catalog, {
      providerId: 'openai',
      modelId: 'no-cost',
    });
    expect(cost).toBeNull();
  });

  it('returns null for unknown provider/model', () => {
    expect(
      computeCost({ inputTokens: 1, outputTokens: 1 }, catalog, {
        providerId: 'ghost',
        modelId: 'x',
      }),
    ).toBeNull();
  });

  it('handles zero tokens', () => {
    const cost = computeCost({ inputTokens: 0, outputTokens: 0 }, catalog, {
      providerId: 'anthropic',
      modelId: 'claude-sonnet-4.5',
    });
    expect(cost).toEqual({ inputUsd: 0, outputUsd: 0, totalUsd: 0 });
  });
});

describe('formatTokens', () => {
  it('shows raw count below 1k', () => {
    expect(formatTokens(0)).toBe('0');
    expect(formatTokens(999)).toBe('999');
  });

  it('uses k suffix below 1M', () => {
    expect(formatTokens(1000)).toBe('1.0k');
    expect(formatTokens(2500)).toBe('2.5k');
    expect(formatTokens(999_999)).toBe('1000.0k');
  });

  it('uses M suffix at 1M and above', () => {
    expect(formatTokens(1_000_000)).toBe('1.00M');
    expect(formatTokens(2_300_000)).toBe('2.30M');
  });
});

describe('formatUsd', () => {
  it('renders zero specially', () => {
    expect(formatUsd(0)).toBe('$0');
  });

  it('uses 4 decimals below a cent', () => {
    expect(formatUsd(0.0023)).toBe('$0.0023');
  });

  it('uses 3 decimals below a dollar', () => {
    expect(formatUsd(0.123)).toBe('$0.123');
  });

  it('uses 2 decimals at dollar and above', () => {
    expect(formatUsd(1.237)).toBe('$1.24');
    expect(formatUsd(12.5)).toBe('$12.50');
  });
});

describe('formatUsageLine', () => {
  it('omits cost when null', () => {
    expect(formatUsageLine({ inputTokens: 500, outputTokens: 100 }, null)).toBe('500 in · 100 out');
  });

  it('appends cost when available', () => {
    expect(
      formatUsageLine(
        { inputTokens: 1000, outputTokens: 500 },
        { inputUsd: 0.003, outputUsd: 0.0075, totalUsd: 0.0105 },
      ),
    ).toBe('1.0k in · 500 out · $0.011');
  });

  it('uses 4-decimal precision for sub-cent costs', () => {
    expect(
      formatUsageLine(
        { inputTokens: 100, outputTokens: 50 },
        { inputUsd: 0.001, outputUsd: 0.003, totalUsd: 0.004 },
      ),
    ).toBe('100 in · 50 out · $0.0040');
  });
});
