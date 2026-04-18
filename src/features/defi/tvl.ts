import { z } from 'zod';
import { defineTool } from '../tools/define.js';

const PROTOCOL_ENDPOINT = 'https://api.llama.fi/protocol';
const CHAIN_ENDPOINT = 'https://api.llama.fi/v2/historicalChainTvl';
const PROTOCOLS_LIST = 'https://api.llama.fi/protocols';
const CHAINS_LIST = 'https://api.llama.fi/v2/chains';

const FETCH_TIMEOUT_MS = 8000;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

type TvlPoint = { date: number; tvl: number };

function parseTvlSeries(raw: unknown): TvlPoint[] {
  if (!Array.isArray(raw)) return [];
  const out: TvlPoint[] = [];
  for (const p of raw) {
    if (!isObject(p)) continue;
    const date = Number(p.date);
    const tvl = typeof p.tvl === 'number' ? p.tvl : Number(p.totalLiquidityUSD);
    if (Number.isFinite(date) && Number.isFinite(tvl)) out.push({ date, tvl });
  }
  return out.sort((a, b) => a.date - b.date);
}

// Finds the point whose timestamp is closest to `targetDate` (unix seconds)
// without going *after* it — so we report the TVL as it was "at least X ago",
// not a future leak on sparsely-sampled series.
function tvlNearOrBefore(series: TvlPoint[], targetDate: number): number | null {
  let best: TvlPoint | null = null;
  for (const p of series) {
    if (p.date > targetDate) break;
    best = p;
  }
  return best?.tvl ?? null;
}

export function computeDeltas(series: TvlPoint[]): {
  currentTvl: number | null;
  tvl7dChangePct: number | null;
  tvl30dChangePct: number | null;
  sampleCount: number;
} {
  if (series.length === 0) {
    return { currentTvl: null, tvl7dChangePct: null, tvl30dChangePct: null, sampleCount: 0 };
  }
  const latest = series[series.length - 1];
  if (!latest)
    return { currentTvl: null, tvl7dChangePct: null, tvl30dChangePct: null, sampleCount: 0 };
  const now = latest.date;
  const sevenDayAgo = now - 7 * 24 * 3600;
  const thirtyDayAgo = now - 30 * 24 * 3600;
  const ref7 = tvlNearOrBefore(series, sevenDayAgo);
  const ref30 = tvlNearOrBefore(series, thirtyDayAgo);
  return {
    currentTvl: latest.tvl,
    tvl7dChangePct: ref7 && ref7 > 0 ? ((latest.tvl - ref7) / ref7) * 100 : null,
    tvl30dChangePct: ref30 && ref30 > 0 ? ((latest.tvl - ref30) / ref30) * 100 : null,
    sampleCount: series.length,
  };
}

async function fetchJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error('defillama timeout')),
    FETCH_TIMEOUT_MS,
  );
  const onOuterAbort = () => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener('abort', onOuterAbort, { once: true });
  }
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`defillama ${res.status}`);
    return (await res.json()) as unknown;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onOuterAbort);
  }
}

export const getDefiTvl = defineTool({
  name: 'get_defi_tvl',
  description: [
    'Fetch DeFi TVL (total value locked) from DefiLlama — no auth, public data.',
    '',
    'Three modes:',
    '  - protocol: slug like "uniswap", "aave", "lido". Returns current TVL +',
    '    7d/30d change.',
    '  - chain: slug like "Ethereum", "Arbitrum", "Solana". Same shape.',
    '  - top: list the top N protocols (default) or chains by current TVL.',
    '',
    'Protocol slugs are lowercase, hyphenated; when the user says "Aave",',
    'try "aave" first, fall back to listing via `top` if 404.',
    'Chain names are capitalized ("Ethereum" not "ethereum") per DefiLlama.',
    '',
    'Use to confirm regime: TVL rising during a price selloff is constructive',
    'divergence; TVL falling faster than price is deleveraging.',
  ].join('\n'),
  permission: 'auto',
  inputSchema: z.object({
    protocol: z.string().optional().describe('DefiLlama slug, e.g. "uniswap", "aave"'),
    chain: z.string().optional().describe('Chain name, e.g. "Ethereum", "Arbitrum"'),
    top: z.number().int().min(1).max(50).optional().describe('Return top-N ranking'),
    rankBy: z.enum(['protocol', 'chain']).optional().describe('What to rank (default protocol)'),
  }),
  async execute(input, ctx) {
    if (input.top) {
      const kind = input.rankBy ?? 'protocol';
      const url = kind === 'chain' ? CHAINS_LIST : PROTOCOLS_LIST;
      const raw = await fetchJson(url, ctx.abortSignal);
      if (!Array.isArray(raw)) throw new Error('defillama: unexpected list shape');
      const rows = raw
        .filter(isObject)
        .map((p) => ({
          name: typeof p.name === 'string' ? p.name : 'unknown',
          tvl: typeof p.tvl === 'number' ? p.tvl : 0,
          ...(typeof p.chain === 'string' ? { chain: p.chain } : {}),
          ...(typeof p.category === 'string' ? { category: p.category } : {}),
        }))
        .filter((p) => p.tvl > 0)
        .sort((a, b) => b.tvl - a.tvl)
        .slice(0, input.top);
      return { kind, count: rows.length, top: rows };
    }

    if (input.protocol) {
      const url = `${PROTOCOL_ENDPOINT}/${encodeURIComponent(input.protocol)}`;
      const raw = await fetchJson(url, ctx.abortSignal);
      if (!isObject(raw)) throw new Error('defillama: bad protocol response');
      const series = parseTvlSeries(raw.tvl);
      const deltas = computeDeltas(series);
      return {
        kind: 'protocol',
        slug: input.protocol,
        name: typeof raw.name === 'string' ? raw.name : input.protocol,
        ...(typeof raw.category === 'string' ? { category: raw.category } : {}),
        ...deltas,
      };
    }

    if (input.chain) {
      const url = `${CHAIN_ENDPOINT}/${encodeURIComponent(input.chain)}`;
      const raw = await fetchJson(url, ctx.abortSignal);
      const series = parseTvlSeries(raw);
      const deltas = computeDeltas(series);
      return { kind: 'chain', name: input.chain, ...deltas };
    }

    throw new Error('get_defi_tvl: provide one of { protocol, chain, top }');
  },
});
