---
name: news_impact
description: When the user asks how a symbol reacted (or will react) to a news event, wants a catalyst-vs-price read, or is deciding whether a headline is already priced in.
---

# News Impact Playbook

Use this when the question involves a news event, "did this move it", "is this already priced in", regulatory headlines, hack reports, ETF approvals, major exchange listings, protocol upgrades, macro (FOMC, CPI), or any "why did X move" investigation.

## Gather

1. `get_news` with `symbols: [X]` and an appropriate `since` (last 24h for intraday questions, last 7d for trend-level ones). If the user names a specific event, skim the titles and pull the timestamp of the matching article. If `get_news` returns nothing for the symbol, retry without the symbol filter and grep the title list yourself — some stories are tagged by project name rather than ticker.
2. `get_ohlcv` on the same symbol, 1h interval, enough bars to bracket the news timestamp (before: ~24 bars, after: everything since). For intra-day high-volatility events use 15m.
3. Optional when the news is systemic (Fed meeting, ETF decision, exchange hack): `get_market_context` for Fear & Greed + dominance, and `correlate_assets` on the symbol plus BTC / ETH to check if the move was idiosyncratic or market-wide.

## Bracket the window

For each headline you're analyzing:
- Pre-window: 3 bars (hours or 15m intervals) before publication.
- Post-window: 3 bars after publication.
- Record pre-window close, bar-of-publication open, post-window close. Compute `(post - pre) / pre` as the reaction %.

## Classify the reaction

| Move size | Label |
|---|---|
| `< 0.5%` | non-reactive — either priced in or ignored |
| `0.5% – 2%` | modest reaction |
| `2% – 5%` | meaningful reaction |
| `> 5%` | headline-driven move |

Compare reaction to the 24h average bar range. A 2% move on a symbol whose typical hourly range is 3% is noise; the same move on a 0.5%-range symbol is a real response.

## Decide "already priced in"

A headline is "priced in" when:
- The reaction window shows <0.5% move despite the headline being clearly material, AND
- The run-up in the 24–48h *before* publication covered the expected magnitude (look at pre-news OHLCV for an abnormal rally).

Flag this explicitly in the output — the user's trade decision depends on it.

## Output shape

Use a compact markdown table:

| Headline | Source | Published | Pre → Post | Reaction |
|---|---|---|---|---|
| … | CoinDesk | 14:02 UTC | 4230 → 4310 | **+1.9%** |

Bold the biggest reaction. If correlated with BTC move of similar size, note "(market-wide, not idiosyncratic)". Close with a one-line verdict: *reactive / muted / already priced in / ambiguous — need more data*.

## What kills the thesis

- News timestamp uncertain (CryptoCompare `published_on` is when the aggregator ingested it; the actual wire often fires minutes earlier). Caveat "window ±5 min".
- Multiple overlapping headlines in the same window — you can't attribute the move to one.
- Low-liquidity hours (weekend, Asia deep night UTC): moves exaggerate and revert; don't read too much into a 3% reaction at 03:00 UTC on Sunday.
