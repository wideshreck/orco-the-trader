---
name: breakout_setup
description: When the user asks for a breakout trade, range break, or "is it breaking out". Structured playbook for identifying and validating breakouts with confluence.
---

# Breakout Setup Playbook

Use this when the question involves breakouts, range breaks, "is it breaking out", or channel exits.

## Identify the range

Call `full_analysis` on the target symbol at the user's horizon. Look at:
- `structure.nearestResistance` and `structure.nearestSupport` — these are the walls.
- `strength.adx` — ADX below 20 confirms a range (no trend). If ADX is already above 25, this is a continuation, not a breakout from a range.
- `momentum.bb.bandwidth` — low bandwidth (below ~0.03) = Bollinger squeeze = energy building.

## Validate the break

A candle closing above resistance (or below support) is necessary but not sufficient. Check:
- Volume: is the breakout bar's volume above the 20-bar average? Call `get_ticker_24h` if needed. Weak volume = fakeout risk.
- `multiTimeframe.alignment` — if the break is long and higher TFs are bearish, fade risk is high. Prefer aligned breakouts.
- `divergence` — a bearish divergence right before an upside break warns that momentum was already fading. Treat as lower-confidence.

## Entry, stop, TP

- Entry: on the close of the breakout bar (confirmed close, not intrabar).
- Stop: just below the breakout level (old resistance = new support for a long break). Use ATR to add buffer: `breakout_level - 0.5 × ATR14`.
- TP1: measured move = height of the range added to the breakout point.
- TP2: next structural resistance from `structure.strongest`.

Run `validate_trade_plan` on the setup before presenting it.

## Backtest if asked

If user wants historical stats: `backtest` with `donchian_breakout` preset on the same symbol and interval. Compare win rate with the user's proposed parameters vs defaults.

## What kills the thesis

- Close back inside the range (bull trap / bear trap). Exit immediately.
- Volume dries up after the break (no follow-through).
- Higher-TF alignment flips against you.
