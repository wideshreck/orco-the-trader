import { z } from 'zod';
import { defineTool } from '../../tools/define.js';

type FngRaw = {
  data?: Array<{ value: string; value_classification: string; timestamp: string }>;
};

type GlobalRaw = {
  data?: {
    total_market_cap?: Record<string, number>;
    total_volume?: Record<string, number>;
    market_cap_percentage?: Record<string, number>;
    market_cap_change_percentage_24h_usd?: number;
  };
};

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T | null> {
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export const getMarketContext = defineTool({
  name: 'get_market_context',
  description: [
    'Fetch macro / regime context for crypto: the current Fear & Greed index',
    '(alternative.me) plus total crypto market cap, 24h change, BTC',
    'dominance, and ETH dominance (CoinGecko).',
    '',
    'Call this once at the start of an analysis session to read the room.',
    'Fear & Greed < 25 = extreme fear (contrarian long bias), > 75 =',
    'extreme greed (contrarian short bias). Rising BTC dominance = alt',
    'weakness; falling dominance with rising total cap = alt season.',
    '',
    'Either data source may transiently fail; missing fields come back as',
    'null rather than throwing.',
  ].join('\n'),
  permission: 'auto',
  inputSchema: z.object({}),
  async execute(_input, ctx) {
    const [fng, global] = await Promise.all([
      fetchJson<FngRaw>('https://api.alternative.me/fng/?limit=1', ctx.abortSignal),
      fetchJson<GlobalRaw>('https://api.coingecko.com/api/v3/global', ctx.abortSignal),
    ]);
    const fngRow = fng?.data?.[0];
    const fngValue = fngRow ? Number(fngRow.value) : Number.NaN;
    const gd = global?.data;
    return {
      fearGreed: fngRow
        ? {
            value: Number.isFinite(fngValue) ? fngValue : null,
            label: fngRow.value_classification,
            timestamp: Number(fngRow.timestamp) * 1000,
          }
        : null,
      totalMarketCapUsd: gd?.total_market_cap?.usd ?? null,
      totalVolume24hUsd: gd?.total_volume?.usd ?? null,
      marketCapChange24hPct: gd?.market_cap_change_percentage_24h_usd ?? null,
      btcDominancePct: gd?.market_cap_percentage?.btc ?? null,
      ethDominancePct: gd?.market_cap_percentage?.eth ?? null,
    };
  },
});
