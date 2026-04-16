---
name: mean_reversion_setup
description: When the user asks about oversold/overbought bounces, "is it a dip to buy", or Bollinger band fades. Mean-reversion trade playbook.
---

# Mean-Reversion Setup Playbook

Use this when the question involves oversold bounces, overbought fades, "is this a good dip", or band-fade trades.

## Confirm the regime

Mean-reversion works in ranges, not trends. Check:
- `strength.adx` below 25 (weak trend). ADX above 30 means the move has trend momentum — fading it is fighting the tape.
- `multiTimeframe.alignment.aligned` should be false or neutral. If all timeframes agree on a direction, the "extreme" reading is trend continuation, not a reversal.

## Find the extreme

Call `full_analysis` and read:
- `momentum.rsi14` — below 30 is oversold (long candidate), above 70 is overbought (short candidate).
- `momentum.bb.percentB` — below 0 (price below lower band) or above 1 (above upper band).
- `divergence.bullish` — a bullish RSI divergence at the low adds conviction. Bearish divergence at the high adds conviction for a short.

Two of these three agreeing is the minimum for a setup. A lone RSI touch of 30 without BB or divergence confirmation is noise.

## Entry, stop, TP

- Entry: when price shows a reversal candle (hammer at a low, shooting star at a high) AND the signal bar closes. Not before.
- Stop: beyond the extreme (below the lowest low of the pullback for a long). Buffer with `ATR14 × 0.5`.
- TP: the mean — Bollinger mid-band (`momentum.bb.mid`) or the 20-SMA (`trend.sma20`). This is a short ride to the center, not a trend trade.
- R:R check: if the distance to the mean is less than 1.5× stop distance, skip — the risk is not worth it.

Run `validate_trade_plan` before presenting.

## Backtest if asked

Use `backtest` with `rsi_reversal` or `bollinger_mean_reversion` preset on the same symbol and interval.

## What kills the thesis

- ADX rises above 25 while you're in the trade (range is breaking, you're fading a trend now).
- Price makes a new extreme beyond your entry candle without recovering.
- Volume spikes on the move away from the mean (institutional conviction behind the trend).
