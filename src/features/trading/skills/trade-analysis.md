---
name: trade_analysis
description: Structured technical analysis workflow for crypto/forex pairs. Use when the user asks for a trade idea, market read, entry/exit advice, or "should I buy X".
---

# Technical Analysis Workflow

Follow this workflow precisely when the user asks for market analysis. Do not skip steps. Use the `todo_write` tool if the task spans more than two indicators or multiple symbols — it keeps the user informed.

## 1. Clarify if needed

If the user's request is genuinely ambiguous (no symbol, no timeframe), call `ask_user` with specific choices rather than guessing. Skip this step when the intent is clear.

## 2. Fetch data

Call `get_ohlcv` with a Binance spot pair (BTCUSDT, ETHUSDT, etc.). Pick the interval by horizon:

| User horizon | Interval |
|---|---|
| scalp / intraday quick | 5m – 15m |
| intraday / day trade | 30m – 1h |
| swing | 4h – 1d |
| position / investor | 1d – 1w |

Fetch 200 candles by default (enough history for sma200 when relevant; fewer if the interval or pair does not support it).

## 3. Compute indicators

Always use `compute_indicators` — never estimate these by reading candles. Recommended default set:

- `sma20`, `sma50` — trend direction
- `sma200` (only if ≥200 candles available) — long-term trend bias
- `rsi14` — momentum
- `macd` — momentum confirmation
- `atr14` — volatility gauge for stop sizing

## 4. Read the tape

Summarize the structure in this exact order (keeps the output scannable):

1. **Price action** — last close, recent range, notable swing highs/lows visible in the last 20 candles.
2. **Trend** — price vs sma20/sma50 (and sma200 if present). Stacking order tells the trend.
3. **Momentum** — RSI reading (overbought > 70, oversold < 30, neutral 40–60); MACD line vs signal and histogram direction.
4. **Volatility** — ATR in price units AND as a % of close. High vs recent norm → tighter stops or wider.
5. **Volume** — recent avg vs longer avg if the user asks or it stands out.

## 5. Recommendation (if user asked for a trade)

Always include:

- **Bias:** long / short / neutral with confidence: low / med / high.
- **Entry:** a specific price or condition ("break above X on 4h close").
- **Stop-loss:** based on structure (recent swing) AND ATR (e.g., `entry − 1.5 × ATR14`).
- **Take-profit:** first TP at next structural resistance, second TP optionally with a measured move. Include the resulting R:R.
- **Invalidation:** one line describing what would kill the thesis.

If the user mentioned risk tolerance or account size, translate the stop distance into position size:
`size = risk_usd / stop_distance`.

## 6. Disclose

End every recommendation with the literal line:

> _This is technical analysis, not financial advice. Crypto is volatile and you can lose money._

## Rules

- **Never fabricate data.** If a tool fails or returns null for an indicator, say so and stop or revise the plan.
- **Round honestly.** Round to sensible precision (BTC to 2 decimals, small alts to 4–6). Don't invent decimals you didn't compute.
- **Prefer confluence.** One signal is weak; two agreeing signals is interesting; three or more is a setup.
- **Always include a stop.** No trade recommendation without an invalidation level.
- **Stay in the user's language.** If they wrote in Turkish, reply in Turkish; if English, English.
