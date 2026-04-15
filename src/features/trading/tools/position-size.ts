import { z } from 'zod';
import { defineTool } from '../../tools/define.js';

export const positionSize = defineTool({
  name: 'position_size',
  description: [
    'Compute trade position size from risk parameters. Never estimate by',
    'hand — run this whenever the user mentions account size and risk, or',
    'when the recommendation needs a concrete quantity.',
    '',
    'Inputs:',
    '  balance       — account balance in quote currency (USDT)',
    '  riskPct       — % of balance at risk on this trade (e.g. 1, 0.5)',
    '  entry         — planned entry price',
    '  stopLoss      — planned stop-loss price',
    '  takeProfit?   — optional TP to compute R:R',
    '  leverage?     — default 1; >1 only relevant for margin/contract notional',
    '  side?         — "long" | "short"; auto-inferred from entry vs stopLoss',
    '',
    'Returns: riskAmount (USDT), stopDistance (abs + %), qty (base asset),',
    'notional (USDT, = qty × entry), marginRequired (notional / leverage),',
    'rr (if TP given), rewardAmount, takeProfitAtR (price giving R:R=1).',
  ].join('\n'),
  permission: 'auto',
  inputSchema: z.object({
    balance: z.number().positive(),
    riskPct: z.number().positive().max(100),
    entry: z.number().positive(),
    stopLoss: z.number().positive(),
    takeProfit: z.number().positive().optional(),
    leverage: z.number().positive().max(125).optional(),
    side: z.enum(['long', 'short']).optional(),
  }),
  async execute(input) {
    const { balance, riskPct, entry, stopLoss, takeProfit } = input;
    const leverage = input.leverage ?? 1;
    const side = input.side ?? (stopLoss < entry ? 'long' : 'short');
    const stopDistance = Math.abs(entry - stopLoss);
    if (stopDistance === 0) throw new Error('entry equals stopLoss — stop distance is zero');
    if (side === 'long' && stopLoss >= entry) {
      throw new Error('long trade requires stopLoss below entry');
    }
    if (side === 'short' && stopLoss <= entry) {
      throw new Error('short trade requires stopLoss above entry');
    }
    const riskAmount = balance * (riskPct / 100);
    const qty = riskAmount / stopDistance;
    const notional = qty * entry;
    const marginRequired = notional / leverage;
    const stopDistancePct = (stopDistance / entry) * 100;
    // Price that yields exactly 1R on the profit side.
    const takeProfitAtR = side === 'long' ? entry + stopDistance : entry - stopDistance;
    let rr: number | null = null;
    let rewardAmount: number | null = null;
    if (takeProfit !== undefined) {
      const reward = side === 'long' ? takeProfit - entry : entry - takeProfit;
      if (reward <= 0) {
        throw new Error(`takeProfit is on the wrong side of entry for a ${side} trade`);
      }
      rr = reward / stopDistance;
      rewardAmount = qty * reward;
    }
    return {
      side,
      leverage,
      balance,
      riskPct,
      riskAmount,
      entry,
      stopLoss,
      takeProfit: takeProfit ?? null,
      stopDistance,
      stopDistancePct,
      qty,
      notional,
      marginRequired,
      takeProfitAtR,
      rr,
      rewardAmount,
    };
  },
});
