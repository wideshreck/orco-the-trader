import { z } from 'zod';
import { defineTool } from '../tools/define.js';
import { PRESETS } from './presets/index.js';
import { runSweep } from './sweep.js';
import type { Bar } from './types.js';

const barSchema = z.object({
  t: z.number(),
  o: z.number(),
  h: z.number(),
  l: z.number(),
  c: z.number(),
  v: z.number(),
});

const rangeSchema = z.object({
  param: z.string(),
  from: z.number(),
  to: z.number(),
  step: z.number().positive(),
});

const strategyNames = PRESETS.map((p) => p.name) as [string, ...string[]];

export const sweepBacktest = defineTool({
  name: 'sweep_backtest',
  description: [
    'Parameter sweep over a backtest strategy. Expands one or more parameter',
    'ranges into a grid, runs a backtest for each combination, and returns',
    'the top-30 results sorted by Sharpe plus the best row by Sharpe, by',
    'total return, and by profit factor.',
    '',
    'Use when the user asks "what parameters work best", "optimize this',
    'strategy", or "what RSI oversold level is most profitable". Feed it',
    'the same candles you would give to `backtest`.',
    '',
    'Ranges example — sweep RSI oversold from 20 to 40 in steps of 5:',
    '  { param: "oversold", from: 20, to: 40, step: 5 }',
    '',
    'Max 500 combinations per call (the tool rejects larger grids). Keep',
    'ranges coarse (step 5–10) for a first pass, then narrow around the',
    'winner with a finer step.',
    '',
    'Results with fewer than 5 trades are excluded from the "best" picks',
    'to avoid curve-fitting to noise. Always caveat: in-sample optimization',
    'overfits — the numbers look better than real trading.',
  ].join('\n'),
  permission: 'auto',
  inputSchema: z.object({
    candles: z.array(barSchema).min(30),
    strategy: z.enum(strategyNames),
    baseParams: z.record(z.string(), z.number()).optional(),
    ranges: z.array(rangeSchema).min(1).max(4),
    initialBalance: z.number().positive().optional(),
    riskPerTradePct: z.number().positive().max(100).optional(),
    atrPeriod: z.number().int().min(2).max(100).optional(),
    stopAtrMult: z.number().positive().max(10).optional(),
    takeProfitR: z.number().positive().max(20).optional(),
    trailing: z.boolean().optional(),
    takerFeePct: z.number().min(0).max(1).optional(),
    slippageBps: z.number().min(0).max(100).optional(),
    side: z.enum(['long', 'short', 'both']).optional(),
    maxCombinations: z.number().int().min(1).max(500).optional(),
  }),
  async execute(input) {
    const side = input.side ?? 'long';
    const allowedSides = side === 'both' ? (['long', 'short'] as const) : ([side] as const);
    const result = runSweep({
      bars: input.candles as Bar[],
      strategyName: input.strategy,
      baseParams: input.baseParams ?? {},
      ranges: input.ranges,
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
      ...(input.maxCombinations !== undefined ? { maxCombinations: input.maxCombinations } : {}),
    });
    return result;
  },
});
