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

export type BollingerResult = {
  upper: number;
  mid: number;
  lower: number;
  bandwidth: number;
  percentB: number;
};

/** Bollinger Bands(period, mult). mid = SMA of closes; upper/lower = mid ±
 * mult × population standard deviation. `percentB` = (close − lower) /
 * (upper − lower); `bandwidth` = (upper − lower) / mid. */
export function bollinger(candles: Candle[], period = 20, mult = 2): BollingerResult | null {
  if (period <= 0 || candles.length < period) return null;
  const start = candles.length - period;
  let sum = 0;
  for (let i = start; i < candles.length; i++) {
    const c = candles[i];
    if (!c) return null;
    sum += c.c;
  }
  const mid = sum / period;
  let varSum = 0;
  for (let i = start; i < candles.length; i++) {
    const c = candles[i];
    if (!c) return null;
    varSum += (c.c - mid) ** 2;
  }
  const std = Math.sqrt(varSum / period);
  const upper = mid + mult * std;
  const lower = mid - mult * std;
  const last = candles[candles.length - 1];
  if (!last) return null;
  const range = upper - lower;
  return {
    upper,
    mid,
    lower,
    bandwidth: mid !== 0 ? range / mid : 0,
    percentB: range !== 0 ? (last.c - lower) / range : 0.5,
  };
}

export type StochasticResult = { k: number; d: number };

/** Stochastic oscillator (k, d, smoothing). Computes raw %K = 100 × (C − L) /
 * (H − L) over the last `k` candles, smooths with SMA(smoothing) to get slow
 * %K, then %D = SMA(%K, d). Classic (14, 3, 3). */
export function stochastic(
  candles: Candle[],
  k = 14,
  d = 3,
  smoothing = 3,
): StochasticResult | null {
  const need = k + smoothing - 1 + (d - 1);
  if (candles.length < need) return null;
  const rawK: number[] = [];
  for (let i = k - 1; i < candles.length; i++) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - k + 1; j <= i; j++) {
      const c = candles[j];
      if (!c) return null;
      if (c.h > hi) hi = c.h;
      if (c.l < lo) lo = c.l;
    }
    const cur = candles[i];
    if (!cur) return null;
    const range = hi - lo;
    rawK.push(range === 0 ? 50 : (100 * (cur.c - lo)) / range);
  }
  const slowK: number[] = [];
  for (let i = smoothing - 1; i < rawK.length; i++) {
    let s = 0;
    for (let j = i - smoothing + 1; j <= i; j++) s += rawK[j] ?? 0;
    slowK.push(s / smoothing);
  }
  if (slowK.length < d) return null;
  let dSum = 0;
  for (let i = slowK.length - d; i < slowK.length; i++) dSum += slowK[i] ?? 0;
  const kLatest = slowK[slowK.length - 1];
  if (kLatest === undefined) return null;
  return { k: kLatest, d: dSum / d };
}

/** Volume-weighted average price across the full candle series, anchored
 * at the first candle. Typical price = (H + L + C) / 3. Returns null on
 * zero total volume. Callers should note this is anchored VWAP, not a
 * session/rolling VWAP. */
export function vwap(candles: Candle[]): number | null {
  if (candles.length === 0) return null;
  let pv = 0;
  let vv = 0;
  for (const c of candles) {
    const typical = (c.h + c.l + c.c) / 3;
    pv += typical * c.v;
    vv += c.v;
  }
  if (vv <= 0) return null;
  return pv / vv;
}

export type AdxResult = { adx: number; plusDI: number; minusDI: number };

/** Average Directional Index (Wilder). Returns the latest ADX, +DI, −DI.
 * Needs at least 2 × period candles — one period to seed the smoothed DM/TR
 * and another period to average the DX values into ADX. */
export function adx(candles: Candle[], period = 14): AdxResult | null {
  if (candles.length < 2 * period + 1) return null;
  const plusDM: number[] = [];
  const minusDM: number[] = [];
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1];
    const cur = candles[i];
    if (!prev || !cur) return null;
    const up = cur.h - prev.h;
    const down = prev.l - cur.l;
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
    trs.push(Math.max(cur.h - cur.l, Math.abs(cur.h - prev.c), Math.abs(cur.l - prev.c)));
  }
  if (trs.length < 2 * period) return null;
  let sPlus = 0;
  let sMinus = 0;
  let sTr = 0;
  for (let i = 0; i < period; i++) {
    sPlus += plusDM[i] ?? 0;
    sMinus += minusDM[i] ?? 0;
    sTr += trs[i] ?? 0;
  }
  const dxSeries: number[] = [];
  const computeDx = (): number => {
    if (sTr === 0) return 0;
    const plusDI = (100 * sPlus) / sTr;
    const minusDI = (100 * sMinus) / sTr;
    const sum = plusDI + minusDI;
    return sum === 0 ? 0 : (100 * Math.abs(plusDI - minusDI)) / sum;
  };
  dxSeries.push(computeDx());
  for (let i = period; i < trs.length; i++) {
    sPlus = sPlus - sPlus / period + (plusDM[i] ?? 0);
    sMinus = sMinus - sMinus / period + (minusDM[i] ?? 0);
    sTr = sTr - sTr / period + (trs[i] ?? 0);
    dxSeries.push(computeDx());
  }
  if (dxSeries.length < period) return null;
  let adxVal = 0;
  for (let i = 0; i < period; i++) adxVal += dxSeries[i] ?? 0;
  adxVal /= period;
  for (let i = period; i < dxSeries.length; i++) {
    adxVal = (adxVal * (period - 1) + (dxSeries[i] ?? 0)) / period;
  }
  const plusDI = sTr === 0 ? 0 : (100 * sPlus) / sTr;
  const minusDI = sTr === 0 ? 0 : (100 * sMinus) / sTr;
  return { adx: adxVal, plusDI, minusDI };
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
