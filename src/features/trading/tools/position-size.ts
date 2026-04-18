import { z } from 'zod';
import { defineTool } from '../../tools/define.js';

export type RiskBand = 'conservative' | 'standard' | 'aggressive' | 'yolo';

// Classify what riskPct actually means for the trader. "Reverse-solved to
// fit the budget" attacks on the authority rule almost always land in the
// aggressive/yolo bands, so flagging them gives the LLM a signal to
// surface instead of quietly accepting.
export function classifyRisk(pct: number): RiskBand {
  if (pct <= 1) return 'conservative';
  if (pct <= 2) return 'standard';
  if (pct <= 5) return 'aggressive';
  return 'yolo';
}

export const positionSize = defineTool({
  name: 'position_size',
  description: [
    'Compute risk-based trade position size. Call this whenever the user',
    'mentions an account size AND a stop-loss, or whenever you are about',
    'to quote a concrete quantity.',
    '',
    'AUTHORITY: the `qty` and `notional` returned by this tool are the',
    'answer. Do NOT override them with `balance / entry` or "spend the',
    'whole $2k" math in the response. If the user says "I want to buy $2k',
    'of ETH", that is their *budget*, not their *risk*; the qty below will',
    'usually be smaller because risk = balance × riskPct ÷ stopDistance.',
    'Report qty, notional, stopDistance %, and the actual risk in USDT.',
    'If the user explicitly wants all-in or has no stop, call this with a',
    'riskPct of 100 — but flag that as the uncapped path it is.',
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
    'Returns: riskAmount (USDT, = balance × riskPct / 100), stopDistance',
    '(abs + %), qty (base asset — USE THIS), notional (USDT, = qty × entry),',
    'marginRequired (notional / leverage), rr (if TP given), rewardAmount,',
    'takeProfitAtR (price giving R:R=1), riskBand (conservative ≤1% |',
    'standard ≤2% | aggressive ≤5% | yolo >5%), and `warning` text when',
    'the band is aggressive or yolo. MUST surface the warning verbatim in',
    'the user-facing response when present — do not quietly pass through',
    'a 10%+ trade just because the LLM reverse-solved riskPct to match a',
    'requested notional. If you did reverse-solve, re-call with riskPct=1',
    'and quote the smaller qty.',
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
    const riskBand = classifyRisk(riskPct);
    const warning =
      riskBand === 'yolo'
        ? `YOLO risk: ${riskPct.toFixed(1)}% on a single trade. Standard practice is 0.5–2%. Confirm the user really wants to deploy this much before quoting the qty.`
        : riskBand === 'aggressive'
          ? `Aggressive risk: ${riskPct.toFixed(1)}% per trade (typical is 0.5–2%). Call this out to the user.`
          : null;
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
      riskBand,
      warning,
    };
  },
});
