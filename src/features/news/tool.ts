import { z } from 'zod';
import { defineTool } from '../tools/define.js';
import { fetchNews } from './fetch.js';

export const getNews = defineTool({
  name: 'get_news',
  description: [
    'Fetch recent cryptocurrency news headlines from curated sources',
    '(CoinDesk, CoinTelegraph, Decrypt, The Block, Bitcoin Magazine, Reuters',
    'crypto, and ~600 others via CryptoCompare). No auth required.',
    '',
    'Defaults to the CryptoCompare aggregator (one fast endpoint, ~300ms);',
    'falls back to direct RSS feeds if the aggregator is unreachable.',
    '',
    'Filters:',
    '  - symbols: match by asset. Passes through an alias table so "BTC"',
    '    also catches "Bitcoin". Loose substring match on titles + tags.',
    '  - categories: CryptoCompare-only tags like Regulation, Mining,',
    '    Market, Trading, Hack. Ignored in RSS fallback.',
    '  - since: ISO date, Date object, or unix timestamp (seconds or ms);',
    '    only articles newer than this are returned.',
    '  - limit: 1-50, default 20.',
    '',
    'Use to contextualize price moves, check regulatory catalysts, or scan',
    'for breaking news before recommending a trade. Pair with get_ohlcv so',
    'the thesis cites both the headline and the price reaction.',
  ].join('\n'),
  permission: 'auto',
  inputSchema: z.object({
    symbols: z.array(z.string()).optional().describe('Filter by asset symbol (BTC, ETH, ...)'),
    categories: z.array(z.string()).optional().describe('CryptoCompare categories'),
    limit: z.number().int().min(1).max(50).optional().describe('Max articles (default 20)'),
    since: z
      .union([z.string(), z.number()])
      .optional()
      .describe('ISO date or unix timestamp — only newer articles'),
    source: z
      .enum(['cryptocompare', 'rss', 'auto'])
      .optional()
      .describe('Force a provider (default auto)'),
  }),
  async execute(input, ctx) {
    const result = await fetchNews({
      ...(input.symbols ? { symbols: input.symbols } : {}),
      ...(input.categories ? { categories: input.categories } : {}),
      ...(input.limit !== undefined ? { limit: input.limit } : {}),
      ...(input.since !== undefined ? { since: input.since } : {}),
      ...(input.source ? { source: input.source } : {}),
      signal: ctx.abortSignal,
    });
    return result;
  },
});
