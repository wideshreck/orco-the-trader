---
name: post_trade_review
description: When the user says "I took the trade", "I got stopped", "what went wrong", or wants to review a completed trade. Structured debrief.
---

# Post-Trade Review Playbook

Use this when the user reports a trade result (win or loss) and wants to debrief.

## Gather the facts

Ask for what's missing (use `ask_user` if more than one piece is unclear):
- Symbol and timeframe
- Entry price, exit price, side (long/short)
- Stop-loss and take-profit that were set
- What triggered the exit: stop hit, TP hit, manual close, or liquidation
- Approximate date/time if relevant

## Rebuild the tape

Fetch the candles covering the trade window:
- `get_ohlcv` at the user's timeframe, 200 bars, covering the entry-to-exit period.
- `compute_indicators` with the standard set (sma20, sma50, rsi14, macd, atr14, bb20, adx14).
- `detect_support_resistance` and `detect_divergence` on the same candles.

## Assess

Walk through in this order:

1. **Was the thesis valid at entry?** Read the indicators at the entry bar. Was RSI supporting? Was ADX confirming trend/range? Was S/R respected? If the thesis was sound but the stop was hit by noise, that's execution error, not thesis error.

2. **Was the stop placement reasonable?** Compute `stop distance / ATR14 at entry`. Between 1× and 2× ATR is standard. Below 0.75× → noise stop. Above 3× → too wide (poor risk management).

3. **Was the exit optimal?** If TP was hit, compare the TP level to the nearest structural resistance at that time. If the trade ran further, note potential upside left. If the trade was exited early (manual), check whether the indicators at exit supported holding longer.

4. **What was the R-multiple?** Calculate `(exit - entry) / (entry - stop)` for long, inverted for short. Above 1R is acceptable. Below 0 is a loss.

## Summarize

Present:
- One sentence: was this a good trade, a bad trade, or a good trade that lost (variance)?
- What specifically to repeat (good thesis identification, patience on entry, etc.)
- What specifically to change (tighter/wider stop, waiting for confirmation, checking the higher TF)

## Tone

Objective. Losses are not failures — they're data points. A 1R stop-loss on a valid setup is the system working as designed. Focus on process, not outcome.
