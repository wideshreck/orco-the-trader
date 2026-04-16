import type { Bar } from './types.js';

export function smaSeries(bars: Bar[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(bars.length).fill(null);
  if (period <= 0 || bars.length < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += bars[i]?.c ?? 0;
  out[period - 1] = sum / period;
  for (let i = period; i < bars.length; i++) {
    sum += (bars[i]?.c ?? 0) - (bars[i - period]?.c ?? 0);
    out[i] = sum / period;
  }
  return out;
}

export function rsiSeries(bars: Bar[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(bars.length).fill(null);
  if (bars.length < period + 1) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const prev = bars[i - 1];
    const cur = bars[i];
    if (!prev || !cur) return out;
    const d = cur.c - prev.c;
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let ag = gain / period;
  let al = loss / period;
  out[period] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  for (let i = period + 1; i < bars.length; i++) {
    const prev = bars[i - 1];
    const cur = bars[i];
    if (!prev || !cur) continue;
    const d = cur.c - prev.c;
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    ag = (ag * (period - 1) + g) / period;
    al = (al * (period - 1) + l) / period;
    out[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  }
  return out;
}

export function bollingerSeries(
  bars: Bar[],
  period = 20,
  mult = 2,
): { upper: (number | null)[]; mid: (number | null)[]; lower: (number | null)[] } {
  const upper: (number | null)[] = new Array(bars.length).fill(null);
  const mid: (number | null)[] = new Array(bars.length).fill(null);
  const lower: (number | null)[] = new Array(bars.length).fill(null);
  if (period <= 0 || bars.length < period) return { upper, mid, lower };
  for (let i = period - 1; i < bars.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += bars[j]?.c ?? 0;
    const m = sum / period;
    mid[i] = m;
    let v = 0;
    for (let j = i - period + 1; j <= i; j++) v += ((bars[j]?.c ?? 0) - m) ** 2;
    const sd = Math.sqrt(v / period);
    upper[i] = m + mult * sd;
    lower[i] = m - mult * sd;
  }
  return { upper, mid, lower };
}

export function rollingHigh(bars: Bar[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(bars.length).fill(null);
  for (let i = period - 1; i < bars.length; i++) {
    let max = -Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      const h = bars[j]?.h ?? -Infinity;
      if (h > max) max = h;
    }
    out[i] = max;
  }
  return out;
}

export function rollingLow(bars: Bar[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(bars.length).fill(null);
  for (let i = period - 1; i < bars.length; i++) {
    let min = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      const l = bars[j]?.l ?? Infinity;
      if (l < min) min = l;
    }
    out[i] = min;
  }
  return out;
}
