import { z } from 'zod';
import { defineTool } from '../tools/define.js';
import { runBacktest } from './engine.js';
import { findPreset, PRESETS } from './presets/index.js';
import type { Bar } from './types.js';

const barSchema = z.object({
  t: z.number(),
  o: z.number(),
  h: z.number(),
  l: z.number(),
  c: z.number(),
  v: z.number(),
});

const strategyNames = PRESETS.map((p) => p.name) as [string, ...string[]];

const strategyCatalog = PRESETS.map(
  (s) =>
    `  ${s.name} — ${s.description}\n    params: ${Object.entries(s.defaults)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ')}`,
).join('\n');

export const backtest = defineTool({
  name: 'backtest',
  description: [
    'Run an event-driven backtest on an OHLCV candle series (from get_ohlcv)',
    'using a preset strategy. Event-driven: signals fire on close of bar i',
    'and fills happen at open of bar i+1 — no look-ahead bias. Intrabar',
    'conflicts resolve pessimistically (stop before take-profit).',
    '',
    'Position sizing is risk-based: qty = (balance × riskPct) / (ATR ×',
    'stopAtrMult). Fees + slippage applied on every fill.',
    '',
    'Strategies:',
    strategyCatalog,
    '',
    'Returns a full metrics block (total return, CAGR, Sharpe, Sortino,',
    'max DD + duration, profit factor, expectancy, win rate, payoff ratio,',
    'avg R, avg bars held, exposure %, buy&hold benchmark) plus the trade',
    'log and a trimmed equity curve.',
    '',
    'Minimum 100 candles recommended for meaningful metrics.',
  ].join('\n'),
  permission: 'auto',
  inputSchema: z.object({
    candles: z.array(barSchema).min(30),
    strategy: z.enum(strategyNames),
    params: z.record(z.string(), z.number()).optional(),
    initialBalance: z.number().positive().optional(),
    riskPerTradePct: z.number().positive().max(100).optional(),
    atrPeriod: z.number().int().min(2).max(100).optional(),
    stopAtrMult: z.number().positive().max(10).optional(),
    takeProfitR: z.number().positive().max(20).optional(),
    trailing: z.boolean().optional(),
    takerFeePct: z.number().min(0).max(1).optional(),
    slippageBps: z.number().min(0).max(100).optional(),
    side: z.enum(['long', 'short', 'both']).optional(),
  }),
  async execute(input) {
    const strategy = findPreset(input.strategy);
    if (!strategy) throw new Error(`unknown strategy ${input.strategy}`);
    const params = { ...strategy.defaults, ...(input.params ?? {}) };
    const bars = input.candles as Bar[];
    const side = input.side ?? 'long';
    const allowedSides = side === 'both' ? (['long', 'short'] as const) : ([side] as const);
    const result = runBacktest({
      bars,
      strategy,
      params,
      risk: {
        initialBalance: input.initialBalance ?? 10_000,
        riskPerTradePct: input.riskPerTradePct ?? 1,
        atrPeriod: input.atrPeriod ?? 14,
        stopAtrMult: input.stopAtrMult ?? 1.5,
        takeProfitR: input.takeProfitR ?? 2,
        trailing: input.trailing ?? false,
      },
      fees: {
        takerPct: input.takerFeePct ?? 0.1,
        slippageBps: input.slippageBps ?? 2,
      },
      allowedSides,
    });

    // Trim equity curve to at most ~200 points so the result stays readable.
    const equity = downsample(result.equity, 200);
    return {
      strategy: result.strategy,
      params: result.params,
      risk: result.risk,
      fees: result.fees,
      metrics: result.metrics,
      trades: result.trades,
      tradeCount: result.trades.length,
      equity,
    };
  },
});

function downsample<T>(points: T[], target: number): T[] {
  if (points.length <= target) return points;
  const step = points.length / target;
  const out: T[] = [];
  for (let i = 0; i < target; i++) {
    const idx = Math.min(points.length - 1, Math.floor(i * step));
    const p = points[idx];
    if (p !== undefined) out.push(p);
  }
  const last = points[points.length - 1];
  if (last !== undefined && out[out.length - 1] !== last) out.push(last);
  return out;
}
