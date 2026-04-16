---
name: divergence_hunt
description: When the user asks about divergences, momentum vs price disagreement, or hidden signals. Focused workflow for finding and acting on RSI/MACD divergences.
---

# Divergence Hunt Playbook

Use this when the user asks "any divergences on X", "is momentum confirming", or you detect a divergence in `full_analysis` output.

## Scan

Call `full_analysis` or `get_ohlcv` + `detect_divergence` with at least 200 candles. Check both RSI and MACD (`indicator: 'both'`).

Read `divergence.latest` first. If null, no divergence in the scanned window — say so and stop. Don't manufacture one.

## Classify

- **Regular bullish**: price makes a lower low, indicator makes a higher low. Momentum is not confirming the weakness → potential reversal up.
- **Regular bearish**: price makes a higher high, indicator makes a lower high. Momentum fading at the top → potential reversal down.

The tool returns `pricePrev`, `priceCur`, `indPrev`, `indCur` — quote these numbers rather than paraphrasing so the user can verify.

## Validate

Divergence alone is a necessary condition, not sufficient. Before upgrading it to a trade:
- Check the regime: `strength.adx` below 25 is ideal. In a strong trend (ADX > 30), divergences can persist for many bars before resolving.
- Check the higher TF: if the higher TF trend aligns with the divergence direction, confidence goes up. Against it, the divergence is a counter-trend signal (lower confidence, tighter stops).
- Check structure: is the second pivot near a known support or resistance from `structure.nearestSupport/nearestResistance`? Confluence with a level doubles the setup's weight.
- Check funding/positioning (if perp): extreme `lastFundingRatePct` in the same direction as the divergence (e.g., very positive funding + bearish divergence = crowded longs fading) is strong confirmation.

## Entry, stop, TP

- Wait for a confirmation bar: a candle that closes in the direction the divergence predicts. Enter on the next bar's open.
- Stop: beyond the second pivot's extreme + ATR buffer.
- TP: nearest structural level in the divergence direction, or Bollinger mid-band for a conservative target.

Run `validate_trade_plan` before presenting.

## What kills the thesis

- Price makes a THIRD extreme that also diverges — the pattern is stretching and may not resolve soon.
- Confirmation bar never comes within 3–5 bars → setup is stale, discard.
- A news event or funding-rate spike overrides the technical read.
