import { z } from 'zod';
import { defineTool } from '../../tools/define.js';

type Issue = { level: 'error' | 'warn'; message: string };

export const validateTradePlan = defineTool({
  name: 'validate_trade_plan',
  description: [
    'Sanity-check a proposed trade plan before presenting it. Runs a small',
    'set of consistency tests and returns issues by severity.',
    '',
    'Checks:',
    '  stop on the correct side of entry for the chosen direction',
    '  take-profit on the correct side of entry',
    '  reward:risk ratio computed and compared to minRR (default 1.5)',
    '  stop distance expressed as a multiple of ATR (if atr provided)',
    '  entry distance from currentPrice, flagged when the plan is stale',
    '',
    'Returns { verdict: ok | warnings | invalid, issues, rr, stopDistance,',
    'rewardDistance, stopAtrMult, entryGapPct } so the caller can decide',
    'whether to publish the plan, revise it, or kill it.',
  ].join('\n'),
  permission: 'auto',
  inputSchema: z.object({
    side: z.enum(['long', 'short']),
    entry: z.number().positive(),
    stopLoss: z.number().positive(),
    takeProfit: z.number().positive(),
    currentPrice: z.number().positive().optional(),
    atr: z.number().positive().optional(),
    minRR: z.number().positive().max(20).optional().describe('Default 1.5'),
    maxEntryGapPct: z
      .number()
      .positive()
      .max(50)
      .optional()
      .describe('Warn if |currentPrice - entry| / currentPrice exceeds this. Default 2'),
    symbol: z.string().optional(),
  }),
  async execute(input) {
    const issues: Issue[] = [];
    const { side, entry, stopLoss, takeProfit } = input;
    const minRR = input.minRR ?? 1.5;
    const maxGap = input.maxEntryGapPct ?? 2;

    if (side === 'long') {
      if (stopLoss >= entry) {
        issues.push({ level: 'error', message: 'long stopLoss must be below entry' });
      }
      if (takeProfit <= entry) {
        issues.push({ level: 'error', message: 'long takeProfit must be above entry' });
      }
    } else {
      if (stopLoss <= entry) {
        issues.push({ level: 'error', message: 'short stopLoss must be above entry' });
      }
      if (takeProfit >= entry) {
        issues.push({ level: 'error', message: 'short takeProfit must be below entry' });
      }
    }

    const stopDistance = Math.abs(entry - stopLoss);
    const rewardDistance = Math.abs(takeProfit - entry);
    const rr = stopDistance > 0 ? rewardDistance / stopDistance : null;
    if (rr !== null && rr < minRR) {
      issues.push({
        level: 'warn',
        message: `R:R ${rr.toFixed(2)} is below minRR ${minRR}`,
      });
    }

    let stopAtrMult: number | null = null;
    if (input.atr !== undefined && input.atr > 0) {
      stopAtrMult = stopDistance / input.atr;
      if (stopAtrMult < 0.75) {
        issues.push({
          level: 'warn',
          message: `stop is tight (${stopAtrMult.toFixed(2)}× ATR) — noise may knock you out`,
        });
      }
      if (stopAtrMult > 4) {
        issues.push({
          level: 'warn',
          message: `stop is wide (${stopAtrMult.toFixed(2)}× ATR) — risk per trade inflated`,
        });
      }
    }

    let entryGapPct: number | null = null;
    if (input.currentPrice !== undefined && input.currentPrice > 0) {
      entryGapPct = (Math.abs(entry - input.currentPrice) / input.currentPrice) * 100;
      if (entryGapPct > maxGap) {
        issues.push({
          level: 'warn',
          message: `entry is ${entryGapPct.toFixed(2)}% from current price — plan may be stale`,
        });
      }
      // Directional sanity: a long entry far below spot means we're waiting
      // for a dip; a long entry far above spot means we're chasing. Flag the
      // chase case.
      if (side === 'long' && input.currentPrice > entry * (1 + maxGap / 100)) {
        issues.push({
          level: 'warn',
          message: 'currentPrice is above entry for a long — chasing the move',
        });
      }
      if (side === 'short' && input.currentPrice < entry * (1 - maxGap / 100)) {
        issues.push({
          level: 'warn',
          message: 'currentPrice is below entry for a short — chasing the move',
        });
      }
    }

    const hasError = issues.some((i) => i.level === 'error');
    const hasWarn = issues.some((i) => i.level === 'warn');
    const verdict: 'ok' | 'warnings' | 'invalid' = hasError
      ? 'invalid'
      : hasWarn
        ? 'warnings'
        : 'ok';

    return {
      verdict,
      issues,
      rr,
      stopDistance,
      rewardDistance,
      stopAtrMult,
      entryGapPct,
      symbol: input.symbol ?? null,
      side,
      entry,
      stopLoss,
      takeProfit,
    };
  },
});
