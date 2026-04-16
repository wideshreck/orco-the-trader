import { runBacktest } from './engine.js';
import { findPreset } from './presets/index.js';
import type {
  BacktestConfig,
  BacktestResult,
  Bar,
  Fees,
  Metrics,
  RiskConfig,
  Side,
} from './types.js';

export type SweepRange = {
  param: string;
  from: number;
  to: number;
  step: number;
};

export type SweepRow = {
  params: Record<string, number>;
  totalReturnPct: number;
  cagrPct: number | null;
  maxDrawdownPct: number;
  sharpe: number | null;
  profitFactor: number | null;
  trades: number;
  winRatePct: number;
  expectancy: number;
  avgRMultiple: number;
  buyHoldReturnPct: number;
};

export type SweepResult = {
  strategy: string;
  ranges: SweepRange[];
  combinationsTested: number;
  rows: SweepRow[];
  best: {
    bySharpe: SweepRow | null;
    byReturn: SweepRow | null;
    byProfitFactor: SweepRow | null;
  };
};

function expandRanges(ranges: SweepRange[]): Record<string, number>[] {
  const axes: { param: string; values: number[] }[] = ranges.map((r) => {
    const values: number[] = [];
    for (let v = r.from; v <= r.to + r.step / 1000; v += r.step) {
      values.push(Math.round(v * 1e8) / 1e8);
    }
    return { param: r.param, values };
  });
  let combos: Record<string, number>[] = [{}];
  for (const axis of axes) {
    const next: Record<string, number>[] = [];
    for (const combo of combos) {
      for (const v of axis.values) {
        next.push({ ...combo, [axis.param]: v });
      }
    }
    combos = next;
  }
  return combos;
}

function pickMetric(row: SweepRow, key: 'sharpe' | 'return' | 'profitFactor'): number {
  switch (key) {
    case 'sharpe':
      return row.sharpe ?? -Infinity;
    case 'return':
      return row.totalReturnPct;
    case 'profitFactor':
      return row.profitFactor ?? -Infinity;
  }
}

function bestBy(rows: SweepRow[], key: 'sharpe' | 'return' | 'profitFactor'): SweepRow | null {
  let best: SweepRow | null = null;
  let bestVal = -Infinity;
  for (const row of rows) {
    if (row.trades < 5) continue;
    const v = pickMetric(row, key);
    if (v > bestVal) {
      bestVal = v;
      best = row;
    }
  }
  return best;
}

function toSweepRow(res: BacktestResult): SweepRow {
  const m = res.metrics;
  return {
    params: res.params,
    totalReturnPct: m.totalReturnPct,
    cagrPct: m.cagrPct,
    maxDrawdownPct: m.maxDrawdownPct,
    sharpe: m.sharpe,
    profitFactor: m.profitFactor,
    trades: m.trades,
    winRatePct: m.winRatePct,
    expectancy: m.expectancy,
    avgRMultiple: m.avgRMultiple,
    buyHoldReturnPct: m.buyHoldReturnPct,
  };
}

export function runSweep(opts: {
  bars: Bar[];
  strategyName: string;
  baseParams: Record<string, number>;
  ranges: SweepRange[];
  risk: RiskConfig;
  fees: Fees;
  allowedSides: readonly Side[];
  maxCombinations?: number;
}): SweepResult {
  const strategy = findPreset(opts.strategyName);
  if (!strategy) throw new Error(`unknown strategy ${opts.strategyName}`);
  const combos = expandRanges(opts.ranges);
  const limit = opts.maxCombinations ?? 500;
  if (combos.length > limit) {
    throw new Error(`sweep produces ${combos.length} combos, exceeds max ${limit}`);
  }
  const rows: SweepRow[] = [];
  for (const overrides of combos) {
    const params = { ...strategy.defaults, ...opts.baseParams, ...overrides };
    const cfg: BacktestConfig = {
      bars: opts.bars,
      strategy,
      params,
      risk: opts.risk,
      fees: opts.fees,
      allowedSides: opts.allowedSides,
    };
    const res = runBacktest(cfg);
    rows.push(toSweepRow(res));
  }
  rows.sort((a, b) => (b.sharpe ?? -Infinity) - (a.sharpe ?? -Infinity));
  return {
    strategy: strategy.name,
    ranges: opts.ranges,
    combinationsTested: rows.length,
    rows: rows.slice(0, 30),
    best: {
      bySharpe: bestBy(rows, 'sharpe'),
      byReturn: bestBy(rows, 'return'),
      byProfitFactor: bestBy(rows, 'profitFactor'),
    },
  };
}
