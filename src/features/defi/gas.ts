import { z } from 'zod';
import { defineTool } from '../tools/define.js';

const RPC_ENDPOINTS: Record<string, string> = {
  eth: 'https://eth.llamarpc.com',
  arbitrum: 'https://arbitrum.llamarpc.com',
  optimism: 'https://optimism.llamarpc.com',
  base: 'https://base.llamarpc.com',
  polygon: 'https://polygon.llamarpc.com',
  bsc: 'https://binance.llamarpc.com',
};

const FETCH_TIMEOUT_MS = 6000;

// Chain metadata: pretty labels + whether the chain publishes EIP-1559
// baseFeePerGas, plus per-chain gwei bands so the LLM can classify a
// reading as idle/normal/busy/congested instead of guessing what "0.15
// gwei on Ethereum" means in post-Pectra + L2-migration world.
type Bands = { quiet: number; normal: number; busy: number };
const CHAINS: Record<string, { label: string; eip1559: boolean; bands: Bands }> = {
  eth: { label: 'Ethereum', eip1559: true, bands: { quiet: 2, normal: 20, busy: 60 } },
  arbitrum: {
    label: 'Arbitrum One',
    eip1559: true,
    bands: { quiet: 0.05, normal: 0.2, busy: 0.8 },
  },
  optimism: { label: 'Optimism', eip1559: true, bands: { quiet: 0.05, normal: 0.2, busy: 0.8 } },
  base: { label: 'Base', eip1559: true, bands: { quiet: 0.05, normal: 0.2, busy: 0.8 } },
  polygon: { label: 'Polygon', eip1559: true, bands: { quiet: 30, normal: 80, busy: 200 } },
  bsc: { label: 'BNB Smart Chain', eip1559: false, bands: { quiet: 1, normal: 3, busy: 10 } },
};

export type GasRegime = 'idle' | 'quiet' | 'normal' | 'busy' | 'congested';

// Compare gwei to the chain's bands. "idle" is strictly lower than the
// quiet floor — for ETH that's sub-2 gwei and is itself a signal (L2s
// are absorbing the traffic, or it's a deep-night quiet window).
export function classifyGas(gwei: number, bands: Bands): GasRegime {
  if (gwei < bands.quiet / 4) return 'idle';
  if (gwei < bands.quiet) return 'quiet';
  if (gwei < bands.normal) return 'normal';
  if (gwei < bands.busy) return 'busy';
  return 'congested';
}

async function rpc(
  url: string,
  method: string,
  params: unknown[],
  signal?: AbortSignal,
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error(`${method} timeout`)),
    FETCH_TIMEOUT_MS,
  );
  const onOuterAbort = () => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener('abort', onOuterAbort, { once: true });
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`rpc ${res.status}`);
    const body = (await res.json()) as unknown;
    if (!body || typeof body !== 'object' || !('result' in body)) {
      throw new Error('rpc: no result in response');
    }
    return (body as { result: unknown }).result;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onOuterAbort);
  }
}

// Convert a hex wei value to gwei as a regular number. Accepts bigint-scale
// hex ("0x...") — gas prices fit comfortably in JS number space once divided
// by 1e9, so we narrow through BigInt first to avoid float loss on wei.
export function hexWeiToGwei(hex: unknown): number | null {
  if (typeof hex !== 'string' || !hex.startsWith('0x')) return null;
  try {
    const wei = BigInt(hex);
    // Keep 4 decimal places of gwei precision.
    return Number((wei * 10000n) / 1_000_000_000n) / 10000;
  } catch {
    return null;
  }
}

export function hexToNumber(hex: unknown): number | null {
  if (typeof hex !== 'string' || !hex.startsWith('0x')) return null;
  try {
    return Number(BigInt(hex));
  } catch {
    return null;
  }
}

export const getGasPrice = defineTool({
  name: 'get_gas_price',
  description: [
    'Fetch current gas price for a major EVM chain via LlamaRPC (no auth).',
    '',
    'Chains: eth, arbitrum, optimism, base, polygon, bsc',
    '',
    'Returns current gas price in gwei, EIP-1559 baseFeePerGas (null on',
    'legacy chains like BSC), the anchoring block number, and a `regime`',
    'classification based on per-chain bands: idle | quiet | normal | busy',
    '| congested. Use the regime label rather than raw gwei — absolute',
    'numbers are misleading across chains (0.2 gwei is normal on Arbitrum,',
    'very quiet on Ethereum, impossible on pre-Pectra BSC).',
    '',
    'Use to gauge on-chain congestion: sustained "busy" or "congested" on',
    'ETH often coincides with DEX / memecoin activity that drives spot',
    'volume. Persistent "idle" on Ethereum after Pectra is normal during',
    'off-peak hours and does not by itself imply bearish demand.',
  ].join('\n'),
  permission: 'auto',
  inputSchema: z.object({
    chain: z
      .enum(['eth', 'arbitrum', 'optimism', 'base', 'polygon', 'bsc'])
      .describe('EVM chain to read from'),
  }),
  async execute(input, ctx) {
    const url = RPC_ENDPOINTS[input.chain];
    const meta = CHAINS[input.chain];
    if (!url || !meta) throw new Error(`unknown chain ${input.chain}`);
    // Parallel: gas price + latest block (for baseFee + block number).
    const [gasHex, block] = await Promise.all([
      rpc(url, 'eth_gasPrice', [], ctx.abortSignal),
      rpc(url, 'eth_getBlockByNumber', ['latest', false], ctx.abortSignal),
    ]);
    const gasPriceGwei = hexWeiToGwei(gasHex);
    if (gasPriceGwei === null) throw new Error(`${input.chain}: no gasPrice in response`);
    const blockNumber =
      block && typeof block === 'object' && 'number' in block
        ? hexToNumber((block as { number: unknown }).number)
        : null;
    const baseFeeGwei =
      meta.eip1559 && block && typeof block === 'object' && 'baseFeePerGas' in block
        ? hexWeiToGwei((block as { baseFeePerGas: unknown }).baseFeePerGas)
        : null;
    return {
      chain: input.chain,
      label: meta.label,
      gasPriceGwei,
      baseFeeGwei,
      blockNumber,
      regime: classifyGas(gasPriceGwei, meta.bands),
      typicalBands: meta.bands,
      fetchedAt: new Date().toISOString(),
    };
  },
});
