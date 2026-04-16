import { computeMetrics } from './metrics.js';
import type { BacktestConfig, BacktestResult, Bar, EquityPoint, Position, Trade } from './types.js';

function atrSeries(bars: Bar[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(bars.length).fill(null);
  if (bars.length < period + 1) return out;
  const trs: number[] = [0];
  for (let i = 1; i < bars.length; i++) {
    const prev = bars[i - 1];
    const cur = bars[i];
    if (!prev || !cur) {
      trs.push(0);
      continue;
    }
    const tr = Math.max(cur.h - cur.l, Math.abs(cur.h - prev.c), Math.abs(cur.l - prev.c));
    trs.push(tr);
  }
  let sum = 0;
  for (let i = 1; i <= period; i++) sum += trs[i] ?? 0;
  let wilder = sum / period;
  out[period] = wilder;
  for (let i = period + 1; i < bars.length; i++) {
    wilder = (wilder * (period - 1) + (trs[i] ?? 0)) / period;
    out[i] = wilder;
  }
  return out;
}

// Apply slippage against the trader on fills.
function slip(price: number, bps: number, dir: 'buy' | 'sell'): number {
  const mult = 1 + (dir === 'buy' ? bps / 10000 : -bps / 10000);
  return price * mult;
}

type OpenState = {
  position: Position;
  initialRisk: number; // quote currency at risk at entry
  feesPaidOnEntry: number;
};

function openPosition(
  bar: Bar,
  barIdx: number,
  side: 'long' | 'short',
  referencePrice: number,
  atrVal: number,
  cfg: BacktestConfig,
  balance: number,
): OpenState | null {
  const { risk, fees } = cfg;
  if (!Number.isFinite(atrVal) || atrVal <= 0) return null;
  const stopDistance = atrVal * risk.stopAtrMult;
  if (stopDistance <= 0) return null;
  const riskAmount = balance * (risk.riskPerTradePct / 100);
  if (riskAmount <= 0) return null;
  const fillDir = side === 'long' ? 'buy' : 'sell';
  const entryPrice = slip(referencePrice, fees.slippageBps, fillDir);
  const qty = riskAmount / stopDistance;
  if (qty <= 0) return null;
  const stopPrice = side === 'long' ? entryPrice - stopDistance : entryPrice + stopDistance;
  const tpDistance = stopDistance * risk.takeProfitR;
  const takeProfitPrice = side === 'long' ? entryPrice + tpDistance : entryPrice - tpDistance;
  const feesPaid = entryPrice * qty * (fees.takerPct / 100);
  const position: Position = {
    side,
    entryT: bar.t,
    entryIdx: barIdx,
    entryPrice,
    stopPrice,
    takeProfitPrice,
    qty,
    initialStop: stopPrice,
    peakExtreme: entryPrice,
  };
  return { position, initialRisk: riskAmount, feesPaidOnEntry: feesPaid };
}

function updateTrailingStop(pos: Position, bar: Bar, atrVal: number, mult: number): void {
  // Chandelier-style trailing: peak close minus ATR × mult.
  if (pos.side === 'long') {
    if (bar.c > pos.peakExtreme) pos.peakExtreme = bar.c;
    const trail = pos.peakExtreme - atrVal * mult;
    if (trail > pos.stopPrice) pos.stopPrice = trail;
  } else {
    if (bar.c < pos.peakExtreme) pos.peakExtreme = bar.c;
    const trail = pos.peakExtreme + atrVal * mult;
    if (trail < pos.stopPrice) pos.stopPrice = trail;
  }
}

type ExitResolution = {
  price: number;
  reason: Trade['reason'];
};

// Pessimistic resolution: if both stop and take-profit could hit in the same
// bar we assume the stop fires first. Real-world same-bar TP hits need
// intrabar data we don't have.
function resolveExit(pos: Position, bar: Bar): ExitResolution | null {
  if (pos.side === 'long') {
    const hitStop = bar.l <= pos.stopPrice;
    const hitTp = bar.h >= pos.takeProfitPrice;
    if (hitStop) return { price: pos.stopPrice, reason: 'stop' };
    if (hitTp) return { price: pos.takeProfitPrice, reason: 'take-profit' };
    return null;
  }
  const hitStop = bar.h >= pos.stopPrice;
  const hitTp = bar.l <= pos.takeProfitPrice;
  if (hitStop) return { price: pos.stopPrice, reason: 'stop' };
  if (hitTp) return { price: pos.takeProfitPrice, reason: 'take-profit' };
  return null;
}

function closePosition(
  state: OpenState,
  bar: Bar,
  barIdx: number,
  exitPriceRaw: number,
  reason: Trade['reason'],
  fees: BacktestConfig['fees'],
): { trade: Trade; realizedPnl: number } {
  const { position, initialRisk, feesPaidOnEntry } = state;
  const fillDir = position.side === 'long' ? 'sell' : 'buy';
  const exitPrice = slip(exitPriceRaw, fees.slippageBps, fillDir);
  const exitFee = exitPrice * position.qty * (fees.takerPct / 100);
  const gross =
    position.side === 'long'
      ? (exitPrice - position.entryPrice) * position.qty
      : (position.entryPrice - exitPrice) * position.qty;
  const pnl = gross - (feesPaidOnEntry + exitFee);
  const pnlPct = position.entryPrice > 0 ? pnl / (position.entryPrice * position.qty) : 0;
  const rMultiple = initialRisk > 0 ? pnl / initialRisk : 0;
  const trade: Trade = {
    side: position.side,
    entryT: position.entryT,
    exitT: bar.t,
    entryPrice: position.entryPrice,
    exitPrice,
    qty: position.qty,
    stopPrice: position.initialStop,
    takeProfitPrice: position.takeProfitPrice,
    pnl,
    pnlPct,
    rMultiple,
    reason,
    barsHeld: barIdx - position.entryIdx,
    fees: feesPaidOnEntry + exitFee,
  };
  return { trade, realizedPnl: pnl };
}

function markToMarket(bar: Bar, state: OpenState | null, balance: number): number {
  if (!state) return balance;
  const { position, feesPaidOnEntry } = state;
  const unrealized =
    position.side === 'long'
      ? (bar.c - position.entryPrice) * position.qty
      : (position.entryPrice - bar.c) * position.qty;
  return balance + unrealized - feesPaidOnEntry;
}

export function runBacktest(cfg: BacktestConfig): BacktestResult {
  const { bars, strategy, params, risk, fees, allowedSides } = cfg;
  const atr = atrSeries(bars, risk.atrPeriod);
  const ctx = strategy.prepare(bars, params);
  const trades: Trade[] = [];
  const equity: EquityPoint[] = [];

  let balance = risk.initialBalance;
  let state: OpenState | null = null;

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    if (!bar) continue;

    // Check exits FIRST on current bar so stops on gaps land before new entries.
    if (state) {
      const resolved = resolveExit(state.position, bar);
      if (resolved) {
        const { trade, realizedPnl } = closePosition(
          state,
          bar,
          i,
          resolved.price,
          resolved.reason,
          fees,
        );
        balance += realizedPnl;
        trades.push(trade);
        state = null;
      } else if (risk.trailing) {
        const a = atr[i];
        if (a !== null && a !== undefined) {
          updateTrailingStop(state.position, bar, a, risk.stopAtrMult);
        }
      }
    }

    // Strategy decides on the CLOSE of bar i; action fills on bar i+1's open.
    const sig = strategy.signal(ctx, i, state?.position ?? null);
    const nextBar = bars[i + 1];

    if (sig === 'exit' && state && nextBar) {
      const { trade, realizedPnl } = closePosition(
        state,
        nextBar,
        i + 1,
        nextBar.o,
        'signal',
        fees,
      );
      balance += realizedPnl;
      trades.push(trade);
      state = null;
    } else if ((sig === 'enter-long' || sig === 'enter-short') && !state && nextBar) {
      const side = sig === 'enter-long' ? 'long' : 'short';
      if (allowedSides.includes(side)) {
        const a = atr[i];
        if (a !== null && a !== undefined) {
          const opened = openPosition(nextBar, i + 1, side, nextBar.o, a, cfg, balance);
          if (opened) state = opened;
        }
      }
    }

    equity.push({ t: bar.t, equity: markToMarket(bar, state, balance) });
  }

  // Close any open position at the final bar's close.
  if (state) {
    const lastIdx = bars.length - 1;
    const lastBar = bars[lastIdx];
    if (lastBar) {
      const { trade, realizedPnl } = closePosition(
        state,
        lastBar,
        lastIdx,
        lastBar.c,
        'end-of-series',
        fees,
      );
      balance += realizedPnl;
      trades.push(trade);
      state = null;
      const lastPoint = equity[equity.length - 1];
      if (lastPoint) lastPoint.equity = balance;
    }
  }

  const metrics = computeMetrics(bars, equity, trades, risk.initialBalance);
  return {
    strategy: strategy.name,
    params,
    risk,
    fees,
    metrics,
    trades,
    equity,
  };
}
