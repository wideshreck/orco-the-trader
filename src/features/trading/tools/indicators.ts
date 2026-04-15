import type { Candle } from './get-ohlcv.js';

/** Simple moving average of the last `period` closes. */
export function sma(candles: Candle[], period: number): number | null {
  if (period <= 0 || candles.length < period) return null;
  let sum = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const c = candles[i];
    if (!c) return null;
    sum += c.c;
  }
  return sum / period;
}

/** Exponential moving average seeded with the SMA of the first `period`
 * candles, then iterated with k = 2 / (period + 1). */
export function ema(candles: Candle[], period: number): number | null {
  if (period <= 0 || candles.length < period) return null;
  let acc = 0;
  for (let i = 0; i < period; i++) {
    const c = candles[i];
    if (!c) return null;
    acc += c.c;
  }
  let ma = acc / period;
  const k = 2 / (period + 1);
  for (let i = period; i < candles.length; i++) {
    const c = candles[i];
    if (!c) return null;
    ma = c.c * k + ma * (1 - k);
  }
  return ma;
}

/** Relative Strength Index using Wilder smoothing. */
export function rsi(candles: Candle[], period = 14): number | null {
  if (candles.length < period + 1) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const prev = candles[i - 1];
    const cur = candles[i];
    if (!prev || !cur) return null;
    const diff = cur.c - prev.c;
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  for (let i = period + 1; i < candles.length; i++) {
    const prev = candles[i - 1];
    const cur = candles[i];
    if (!prev || !cur) return null;
    const diff = cur.c - prev.c;
    const g = diff > 0 ? diff : 0;
    const l = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export type MacdResult = { macd: number; signal: number; histogram: number };

/** MACD(12, 26, 9) computed at the latest candle. Returns null if the series
 * is too short to fully seed both EMAs and the signal line. */
export function macd(candles: Candle[]): MacdResult | null {
  const fast = 12;
  const slow = 26;
  const signalPeriod = 9;
  if (candles.length < slow + signalPeriod) return null;
  const macdLine: number[] = [];
  // compute MACD line for every candle >= slow - 1
  // We reproduce EMA computation over the series to collect the full MACD line.
  function emaSeries(src: number[], period: number): number[] {
    const out: number[] = [];
    if (src.length < period) return out;
    let acc = 0;
    for (let i = 0; i < period; i++) acc += src[i] ?? 0;
    let ma = acc / period;
    out[period - 1] = ma;
    const k = 2 / (period + 1);
    for (let i = period; i < src.length; i++) {
      ma = (src[i] ?? 0) * k + ma * (1 - k);
      out[i] = ma;
    }
    return out;
  }
  const closes = candles.map((c) => c.c);
  const fastSeries = emaSeries(closes, fast);
  const slowSeries = emaSeries(closes, slow);
  for (let i = slow - 1; i < closes.length; i++) {
    const f = fastSeries[i];
    const s = slowSeries[i];
    if (f === undefined || s === undefined) continue;
    macdLine[i] = f - s;
  }
  const compactMacd = macdLine.filter((v): v is number => v !== undefined);
  const signalSeries = emaSeries(compactMacd, signalPeriod);
  const lastMacd = compactMacd[compactMacd.length - 1];
  const lastSignal = signalSeries[signalSeries.length - 1];
  if (lastMacd === undefined || lastSignal === undefined) return null;
  return { macd: lastMacd, signal: lastSignal, histogram: lastMacd - lastSignal };
}

/** Average True Range (Wilder) — volatility gauge in price units. */
export function atr(candles: Candle[], period = 14): number | null {
  if (candles.length < period + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1];
    const cur = candles[i];
    if (!prev || !cur) return null;
    const tr = Math.max(cur.h - cur.l, Math.abs(cur.h - prev.c), Math.abs(cur.l - prev.c));
    trs.push(tr);
  }
  if (trs.length < period) return null;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += trs[i] ?? 0;
  let wilder = sum / period;
  for (let i = period; i < trs.length; i++) {
    wilder = (wilder * (period - 1) + (trs[i] ?? 0)) / period;
  }
  return wilder;
}
