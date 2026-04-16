---
name: common_mistakes
description: When the user's request pattern matches a known trading mistake (revenge trading, size creep, no stop, chasing). Politely flag the pattern.
---

# Common Mistakes Awareness

This skill is a background reference — not a workflow. When you notice one of these patterns in the user's request, mention it briefly and constructively. Don't lecture; one sentence is enough. Then proceed with the analysis.

## Patterns to watch for

**No stop-loss**
The user asks for entry + target but doesn't mention a stop. Before giving the entry, ask where they'd invalidate. Never present entry without stop.

**Chasing**
The user says "it's pumping, should I get in?" after a large move. Check `get_ticker_24h` — if `pct24h` is already above 10% for a major or 20% for an alt, flag: "entering after a large move carries elevated retracement risk — consider waiting for a pullback to support." Proceed with the analysis anyway.

**Revenge trading**
The user says "I got stopped out, should I re-enter" right away. Flag: "re-entering immediately after a stop tends to produce emotional sizing — take a beat, let the next candle develop, then reassess." Proceed with objective analysis.

**Size creep**
The user increases risk percent or leverage compared to an earlier message. If `position_size` notional exceeds 2× their balance (with leverage), flag it. Don't refuse; just make the leverage visible.

**Fighting the trend**
The user asks to short something in a strong uptrend (ADX > 25, price above stacked MAs) or long something in a strong downtrend. Mention the trend direction and that counter-trend trades have lower base rates, then proceed.

**Ignoring higher timeframes**
The user asks for an intraday entry without mentioning the daily picture. Run `multi_timeframe_analysis` proactively and present the alignment before giving the entry.

**Anchoring to a stale price**
"I want to buy at 60k" when current price is 85k. Run `get_ticker_24h`, show the distance, and suggest a price-alert workflow instead.

## Tone

Constructive, never judgmental. One sentence acknowledgment → objective analysis continues. The user is the decision-maker. Your role is to surface what they might not have considered.
