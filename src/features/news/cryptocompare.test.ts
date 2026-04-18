import { describe, expect, it } from 'bun:test';
import { parseCryptoCompareResponse } from './cryptocompare.js';

const SAMPLE = {
  Type: 100,
  Message: 'News list successfully returned',
  Data: [
    {
      id: '1',
      title: 'BTC breaks $100k — ETF inflows accelerate',
      url: 'https://example.com/a',
      body: 'Bitcoin crossed the $100,000 mark on record ETF inflows this morning.',
      published_on: 1704542400, // 2024-01-06 12:00:00 UTC
      source: 'cryptocompare',
      source_info: { name: 'CoinDesk', lang: 'EN' },
      tags: 'BTC|ETF|Market',
      categories: 'BTC|Market',
      lang: 'EN',
    },
    {
      // Missing url — should be skipped
      id: '2',
      title: 'Missing URL',
      published_on: 1704542400,
    },
    {
      id: '3',
      title: 'ETH staking hits 33% of supply',
      url: 'https://example.com/c',
      body: 'Staked ETH share of total supply ticked past 33% this week.',
      published_on: 1704538800,
      source: 'rawsource',
      source_info: null,
      tags: '',
      categories: 'ETH',
    },
  ],
};

describe('parseCryptoCompareResponse', () => {
  it('parses well-formed articles and prefers source_info.name over source', () => {
    const articles = parseCryptoCompareResponse(SAMPLE);
    expect(articles).toHaveLength(2);
    expect(articles[0]?.source).toBe('CoinDesk');
    expect(articles[1]?.source).toBe('rawsource');
  });

  it('converts published_on (unix sec) to ISO string', () => {
    const articles = parseCryptoCompareResponse(SAMPLE);
    expect(articles[0]?.publishedAt).toBe(new Date(1704542400 * 1000).toISOString());
  });

  it('merges categories + tags, deduped, cap 8', () => {
    const articles = parseCryptoCompareResponse(SAMPLE);
    const tags = articles[0]?.tags ?? [];
    expect(tags).toContain('BTC');
    expect(tags).toContain('ETF');
    expect(tags).toContain('Market');
    // BTC appears in both tags+categories, should dedupe
    expect(tags.filter((t) => t === 'BTC')).toHaveLength(1);
  });

  it('drops entries missing url or title', () => {
    const articles = parseCryptoCompareResponse(SAMPLE);
    expect(articles.map((a) => a.title)).not.toContain('Missing URL');
  });

  it('returns [] for malformed payloads', () => {
    expect(parseCryptoCompareResponse(null)).toEqual([]);
    expect(parseCryptoCompareResponse({})).toEqual([]);
    expect(parseCryptoCompareResponse({ Data: 'nope' })).toEqual([]);
  });
});
