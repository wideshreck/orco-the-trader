import type { Bar, EquityPoint, Metrics, Trade } from './types.js';

function estimateBarsPerYear(bars: Bar[]): number | null {
  if (bars.length < 2) return null;
  const first = bars[0];
  const last = bars[bars.length - 1];
  if (!first || !last || last.t <= first.t) return null;
  const ms = last.t - first.t;
  const perMs = (bars.length - 1) / ms;
  return perMs * 365 * 24 * 60 * 60 * 1000;
}

function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  let acc = 0;
  for (const v of values) acc += (v - mean) ** 2;
  return Math.sqrt(acc / (values.length - 1));
}

function maxDrawdown(equity: EquityPoint[]): {
  maxDdPct: number;
  maxDdDurationBars: number;
} {
  let peak = equity[0]?.equity ?? 0;
  let peakIdx = 0;
  let maxDdPct = 0;
  let maxDur = 0;
  for (let i = 0; i < equity.length; i++) {
    const e = equity[i];
    if (!e) continue;
    if (e.equity > peak) {
      peak = e.equity;
      peakIdx = i;
      continue;
    }
    const ddPct = peak > 0 ? ((peak - e.equity) / peak) * 100 : 0;
    if (ddPct > maxDdPct) maxDdPct = ddPct;
    const dur = i - peakIdx;
    if (dur > maxDur) maxDur = dur;
  }
  return { maxDdPct, maxDdDurationBars: maxDur };
}

export function computeMetrics(
  bars: Bar[],
  equity: EquityPoint[],
  trades: Trade[],
  initialBalance: number,
): Metrics {
  const last = equity[equity.length - 1]?.equity ?? initialBalance;
  const totalReturnPct = ((last - initialBalance) / initialBalance) * 100;

  const barsPerYear = estimateBarsPerYear(bars);
  const years = barsPerYear && bars.length > 0 ? bars.length / barsPerYear : null;
  const cagrPct =
    years && years > 0 && last > 0 ? ((last / initialBalance) ** (1 / years) - 1) * 100 : null;

  // Bar-to-bar equity returns for Sharpe / Sortino.
  const retSeries: number[] = [];
  for (let i = 1; i < equity.length; i++) {
    const prev = equity[i - 1];
    const cur = equity[i];
    if (!prev || !cur || prev.equity === 0) continue;
    retSeries.push((cur.equity - prev.equity) / prev.equity);
  }
  const avgRet = retSeries.length ? retSeries.reduce((s, v) => s + v, 0) / retSeries.length : 0;
  const sd = stdev(retSeries);
  const downside = retSeries.filter((r) => r < 0);
  const sdDown = stdev(downside);
  const scale = barsPerYear && Number.isFinite(barsPerYear) ? Math.sqrt(barsPerYear) : null;
  const sharpe = sd > 0 && scale !== null ? (avgRet / sd) * scale : null;
  const sortino = sdDown > 0 && scale !== null ? (avgRet / sdDown) * scale : null;

  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);
  const grossWin = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = -losses.reduce((s, t) => s + t.pnl, 0);
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : null;
  const expectancy = trades.length > 0 ? trades.reduce((s, t) => s + t.pnl, 0) / trades.length : 0;
  const avgWin = wins.length > 0 ? grossWin / wins.length : 0;
  const avgLoss = losses.length > 0 ? grossLoss / losses.length : 0;
  const payoffRatio = avgLoss > 0 ? avgWin / avgLoss : null;
  const avgRMultiple =
    trades.length > 0 ? trades.reduce((s, t) => s + t.rMultiple, 0) / trades.length : 0;
  const avgBarsHeld =
    trades.length > 0 ? trades.reduce((s, t) => s + t.barsHeld, 0) / trades.length : 0;
  const barsInMarket = trades.reduce((s, t) => s + t.barsHeld, 0);
  const exposurePct = bars.length > 0 ? (barsInMarket / bars.length) * 100 : 0;

  const { maxDdPct, maxDdDurationBars } = maxDrawdown(equity);

  const firstClose = bars[0]?.c ?? 0;
  const lastClose = bars[bars.length - 1]?.c ?? 0;
  const buyHoldReturnPct = firstClose > 0 ? ((lastClose - firstClose) / firstClose) * 100 : 0;

  return {
    initialBalance,
    finalBalance: last,
    totalReturnPct,
    cagrPct,
    maxDrawdownPct: maxDdPct,
    maxDrawdownDurationBars: maxDdDurationBars,
    sharpe,
    sortino,
    trades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRatePct: trades.length > 0 ? (wins.length / trades.length) * 100 : 0,
    profitFactor,
    expectancy,
    avgWin,
    avgLoss,
    payoffRatio,
    avgRMultiple,
    avgBarsHeld,
    exposurePct,
    buyHoldReturnPct,
  };
}
