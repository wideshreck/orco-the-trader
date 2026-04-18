---
name: trade_analysis
description: Structured technical analysis workflow for crypto/forex pairs. Use when the user asks for a trade idea, market read, entry/exit advice, or "should I buy X".
---

# Technical Analysis Workflow

Follow this workflow precisely when the user asks for market analysis. Do not skip steps. Use the `todo_write` tool if the task spans more than two indicators or multiple symbols — it keeps the user informed.

The workflow ends in one of two outputs: a concrete trade plan, OR a "stand aside + what would flip it" verdict. Both are valid. Do not manufacture an entry just because the user asked for one; users ask for a trade, what they actually need is the right answer.

## 1. Clarify if needed

If the user's request is genuinely ambiguous (no symbol, no timeframe), call `ask_user` with specific choices rather than guessing. Skip this step when the intent is clear.

## 1b. Multi-symbol requests

If the user asks "top movers", "what's pumping", "scan the market", or gives a list of symbols to compare — do NOT run the single-symbol workflow per coin. Instead:

- Starting blind? Call `list_top_symbols` (sortBy `gainers` / `losers` / `volume`). Cheap, one request. Take the top 5–15 results as the candidate set.
- Already have the candidate set? Call `scan_market` with the symbols and the chosen interval. It returns ticker + RSI + SMA deviation + interval-change per symbol in one response — ~2 requests per symbol, run in parallel.

Only after filtering down to 1–3 interesting symbols do you proceed to the per-symbol deep-dive below.

## 2. Macro context first (do not skip)

Before touching the 4h or 1h chart, see where the larger regime sits. Fetch daily with `limit=365` to see a full year. Look for:

- The multi-month trend direction (up / down / range). Where did the last major high and low print? How far below the all-time high is price now?
- Where price sits relative to major structural levels (prior cycle highs / lows, multi-month support).
- Whether a "current uptrend" the user is eyeing is the real trend or just a recovery leg inside a larger downtrend. Call this out explicitly.

If daily lookback is short (<300 bars) or the user's horizon is position-sized, refetch with `limit=500` or `limit=1000`. A 14-week window inside a 13-month downtrend is the classic timeframe-cherry-pick that gets traders stopped out.

## 3. Relative strength against BTC (when the symbol is not BTC)

For any altcoin trade, call `relative_strength` with `symbol` and `vs: 'BTCUSDT'` before making a directional recommendation. High correlation with BTC does not tell you whether the symbol is the leader or the weaker sibling — relative_strength does.

- `trend: rising` → the symbol is outperforming, a long here has relative edge.
- `trend: flat` → no leadership edge; the trade is effectively leveraged exposure to BTC. Label it as such.
- `trend: falling` → the symbol is bleeding against BTC. Long exposure here is a strictly worse version of long-BTC. Flag this in the output verbatim; it usually shifts the recommendation toward "trade BTC instead" or "wait for the ratio to stop bleeding".

Pair with `correlate_assets` when needed. Coupling (correlation) tells you "do they move together"; leadership (relative_strength) tells you "which one is leading" — you need both.

## 4. Multi-timeframe confluence

Prefer `multi_timeframe_analysis` over running `get_ohlcv` + `compute_indicators` three times. It runs the same indicator set across 1h / 4h / 1d in parallel and returns per-TF trend / momentum / strength biases plus an `alignment` summary.

Use `alignment.aligned` (≥75% of TFs agreeing on direction) as a gate: setups aligned with the higher TFs have meaningfully higher odds. If alignment is false, say the TFs disagree and either drop the trade or pick the higher-TF bias and state you're fading the lower.

## 5. Single-symbol deep dive

When the focus narrows to one symbol, use `full_analysis` to batch ohlcv + ticker + multi-TF + indicators + S/R + divergence + funding + order book + macro. One call replaces 6–8 sequential tool calls.

Use the targeted tools below when the user asks something focused (just price, just RSI, just a level) or when `full_analysis` returned null for a slice.

### 5a. Data depth reminder

`get_ohlcv` defaults to 100 candles. That's fine for a price check, insufficient for a swing read. For daily analysis fetch ≥300 bars. For a position trade or a backtest, 500–1000.

### 5b. Indicator pack

Always use `compute_indicators`. Read `volumeSignal` on the result — it classifies the latest bar's volume against its 20-bar average (surge / above / normal / below / dry). A breakout on "dry" or "below" volume is a low-confidence move and often reverses; a breakout on "surge" is a conviction signal. Do not recommend a breakout trade without stating the volume signal.

### 5c. Order flow + funding (when intraday / perp exposure matters)

- `get_order_book` — read `imbalance` (>0.6 bullish pressure, <0.4 bearish), `spreadPct` (>0.1% = thin book), visible walls.
- `get_funding_rate` when the symbol has a perp and horizon is intraday / swing. |rate| > 0.05% is extreme — contrarian bias.

## 6. Build the bull case AND the bear case

Before writing a trade plan, state the two cases in the internal reasoning:

**For the trade:** list the 3 strongest confluent signals (e.g. aligned MTF trend up + rising BTC ratio + surge volume on breakout).

**Against the trade:** list the strongest counter-signals (e.g. RSI overbought + funding extreme + bleeding ETH/BTC ratio + approaching major resistance with thin book).

Compare. If the bear case is equal to or stronger than the bull case, the verdict is **stand aside**; skip to step 8.

If the bull case dominates cleanly, proceed to step 7.

If neither dominates, say so and default to stand aside rather than manufacturing certainty.

## 7. Trade plan (only when bull case dominates)

Before publishing, run `validate_trade_plan` on your chosen entry / stop / takeProfit. It catches wrong-side stops, sub-minRR setups, ATR-misaligned stops, chasing entries. Fix the plan if verdict is `invalid`; surface the warning if `warnings`.

Size the position with `position_size` (balance × riskPct ÷ stopDistance). Default riskPct is **1**. If the user stated a budget ("$2k of ETH"), that is the *cap* on deployment, not the risk. Use riskPct=1 and quote the smaller qty; do not reverse-solve riskPct to make qty match the budget. If the user explicitly asked to deploy the whole balance, pass riskPct=100 and surface the `yolo` warning from the tool output.

Required sections of the published plan:

- **Verdict** — "go" with confidence (low / med / high).
- **Entry** — specific price or condition ("break above X on 4h close").
- **Stop-loss** — explain what the stop *means* structurally (below which level, why that invalidates the thesis), plus the ATR math so the choice isn't arbitrary.
- **Take-profit** — first TP at next structural resistance, second optional. Include the resulting R:R.
- **Position size** — qty and notional from `position_size`. Never quote `balance ÷ entry` instead.
- **Invalidation** — one line on what would flip the thesis (a daily close below $X, a loss of the BTC ratio support, a funding-rate flush).

If you fetched `volumeSignal` and it was "dry" or "below" on a breakout setup, downgrade the confidence and say so.

## 8. Stand-aside verdict (when bull case doesn't dominate)

This is a valid, complete answer. Do not manufacture a plan to fill the space. Output:

- **Verdict:** stand aside. One sentence on why.
- **If-then plan for later.** Two or three conditional setups, e.g.:
  - "If price closes above $X on daily with volume surge → long entry at $Y, stop $Z."
  - "If it drops to $A (structural support) on weak volume → long value entry at $B, stop $C."
- **What you would wait to see** — the specific flip conditions. Price? BTC ratio? Funding flush? Regime change? Be concrete.

A good stand-aside output is worth more to the user than a hedged trade plan — it tells them what they're waiting for.

## 9. Backtest (when user asks "does this work" / "what's the historical edge")

- Fetch ≥ 500 candles via `get_ohlcv` on the user's chosen horizon.
- Pick the preset that matches intent: `rsi_reversal`, `ma_crossover`, `bollinger_mean_reversion`, `donchian_breakout`.
- Report the key metrics: total return, CAGR, max DD %, Sharpe, profit factor, win rate, trades, expectancy, avg R, avg bars held, plus the `buyHoldReturnPct` benchmark.
- Never call a backtest "profitable" based on ≤ 10 trades. Say so explicitly.
- Results are a single historical path — flag overfitting risk when parameters are heavily tuned.

## 10. Disclose

End every recommendation (go OR stand-aside) with the literal line:

> _This is technical analysis, not financial advice. Crypto is volatile and you can lose money._

## Rules

- **Never fabricate data.** If a tool fails or returns null, say so explicitly — especially on news. A `filter: 'relaxed'` result from `get_news` means the symbol filter failed, not that there's no bad news; do not assert "no major headlines" from empty results.
- **Round honestly.** BTC to 2 decimals, small alts to 4–6. Don't invent decimals you didn't compute.
- **Prefer confluence.** One signal is weak; two agreeing is interesting; three or more is a setup.
- **Always include a stop** on any go recommendation. No trade recommendation without an invalidation level.
- **Stay in the user's language.** Turkish in, Turkish out.
