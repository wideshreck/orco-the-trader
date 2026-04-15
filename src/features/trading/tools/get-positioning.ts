import { z } from 'zod';
import { defineTool } from '../../tools/define.js';

const PERIODS = ['5m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '1d'] as const;

type OiRow = {
  symbol: string;
  sumOpenInterest: string;
  sumOpenInterestValue: string;
  timestamp: number;
};
type LsRow = {
  symbol: string;
  longShortRatio: string;
  longAccount: string;
  shortAccount: string;
  timestamp: number;
};

async function fetchArray<T>(url: string, signal: AbortSignal): Promise<T[]> {
  const res = await fetch(url, { signal });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`binance fapi ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T[];
}

export const getOpenInterest = defineTool({
  name: 'get_open_interest',
  description: [
    'Fetch open-interest history for a USDT-perp on Binance futures (fapi).',
    '',
    'Returns the latest N samples at the chosen period. Each row has',
    'sumOpenInterest (base units) and sumOpenInterestValue (USD notional).',
    '',
    'Reading OI:',
    '  Price ↑ + OI ↑ → new longs entering, trend confirmed',
    '  Price ↑ + OI ↓ → short covering, trend fragile',
    '  Price ↓ + OI ↑ → new shorts entering, trend confirmed',
    '  Price ↓ + OI ↓ → long liquidation/exit, trend fragile',
    '',
    'Allowed periods: 5m 15m 30m 1h 2h 4h 6h 12h 1d. Default 1h × 24 rows.',
  ].join('\n'),
  permission: 'auto',
  inputSchema: z.object({
    symbol: z.string().describe('Perp pair, uppercase (e.g. BTCUSDT)'),
    period: z.enum(PERIODS).optional(),
    limit: z.number().int().min(1).max(500).optional(),
  }),
  async execute(input, ctx) {
    const symbol = input.symbol.toUpperCase();
    const period = input.period ?? '1h';
    const limit = input.limit ?? 24;
    const url = `https://fapi.binance.com/futures/data/openInterestHist?symbol=${encodeURIComponent(symbol)}&period=${period}&limit=${limit}`;
    const rows = await fetchArray<OiRow>(url, ctx.abortSignal);
    const parsed = rows.map((r) => ({
      t: r.timestamp,
      oi: Number(r.sumOpenInterest),
      oiUsd: Number(r.sumOpenInterestValue),
    }));
    const first = parsed[0];
    const last = parsed[parsed.length - 1];
    const deltaPct = first && last && first.oi > 0 ? ((last.oi - first.oi) / first.oi) * 100 : null;
    return {
      symbol,
      period,
      count: parsed.length,
      latest: last ?? null,
      changePct: deltaPct,
      rows: parsed,
    };
  },
});

export const getLongShortRatio = defineTool({
  name: 'get_long_short_ratio',
  description: [
    'Fetch the top-trader long/short account ratio for a USDT-perp from',
    'Binance futures. A crowdedness gauge — ratio > 2 means 2× more longs',
    'than shorts among top accounts (crowded long). Extreme readings often',
    'fade.',
    '',
    'Returns the latest N samples and the current ratio + long/short %',
    'shares. Allowed periods: 5m 15m 30m 1h 2h 4h 6h 12h 1d.',
    'Default 1h × 24 rows.',
  ].join('\n'),
  permission: 'auto',
  inputSchema: z.object({
    symbol: z.string(),
    period: z.enum(PERIODS).optional(),
    limit: z.number().int().min(1).max(500).optional(),
  }),
  async execute(input, ctx) {
    const symbol = input.symbol.toUpperCase();
    const period = input.period ?? '1h';
    const limit = input.limit ?? 24;
    const url = `https://fapi.binance.com/futures/data/topLongShortAccountRatio?symbol=${encodeURIComponent(symbol)}&period=${period}&limit=${limit}`;
    const rows = await fetchArray<LsRow>(url, ctx.abortSignal);
    const parsed = rows.map((r) => ({
      t: r.timestamp,
      ratio: Number(r.longShortRatio),
      longPct: Number(r.longAccount) * 100,
      shortPct: Number(r.shortAccount) * 100,
    }));
    const last = parsed[parsed.length - 1];
    return {
      symbol,
      period,
      count: parsed.length,
      latest: last ?? null,
      rows: parsed,
    };
  },
});
