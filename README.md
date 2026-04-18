<!-- GitHub topics (set in repo settings): cli, terminal, tui, ai-agent, llm, crypto, trading, backtesting, technical-analysis, ink, react, bun, mcp, typescript, anthropic, openai, ollama -->

# orco

> Your terminal. Your LLM. No black box.

Ask Orco to analyze a coin, backtest a strategy, or size a position — it calls real functions, shows its work, and never makes up a number.

[![CI](https://github.com/wideshreck/orco-the-trader/actions/workflows/ci.yml/badge.svg)](https://github.com/wideshreck/orco-the-trader/actions/workflows/ci.yml)
[![Apache 2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)
[![Bun](https://img.shields.io/badge/bun-%E2%89%A51.3-ffdda1)](https://bun.sh)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/typescript-strict-3178c6)](https://www.typescriptlang.org)

### Why not just ask ChatGPT?

| | ChatGPT / web chat | Orco |
|---|---|---|
| Price data | Guesses or uses training cutoff | Fetches live from Binance (OHLCV, order book, funding, OI) |
| Indicators | "RSI is around 45" | Computes SMA, EMA, RSI, MACD, ATR, Bollinger, Stoch, VWAP, ADX from real candles |
| Support / resistance | Eyeballs a chart it can't see | Fractal pivot detection + price clustering with touch counts |
| Backtesting | "Historically this strategy tends to..." | Event-driven engine, 4 presets, no look-ahead, fee + slippage, Sharpe / PF / max DD |
| Position sizing | "Risk 1-2% of your account" | `balance × riskPct / stopDistance` → exact qty, notional, R:R |
| News & context | Stale training data | Live headlines (CryptoCompare + RSS), DeFi TVL, EVM gas, correlations, seasonality |
| Audit trail | None — output is a monologue | Every number links to a tool call you can inspect |
| Provider lock-in | OpenAI only | Anthropic, OpenAI, Google, Groq, xAI, OpenRouter, Ollama |
| Extensibility | Plugins, maybe | MCP (HTTP + STDIO) + drop-in skill files |

---

### What's new in v0.2

- **Live data** — `get_news`, `get_defi_tvl`, `get_gas_price`, `correlate_assets`, `relative_strength`, `seasonality`
- **Agent discipline** — base prompt now mandates timeframe discipline (≥300 daily bars for swing reads), stand-aside as a first-class answer, and a coupling-vs-leadership check. `trade_analysis` skill rewritten to require bull + bear cases before any plan. Position-size authoritative with `riskBand` warning blocking covert YOLO sizing.
- **Breakout qualification** — `volumeSignal` on `compute_indicators` (surge / above / normal / below / dry) so thin-volume breakouts don't get recommended unqualified.
- **UX overhaul** — braille spinner + elapsed counter, ASCII context bar `[████░░░░] 42%`, approval countdown with expand, queue preview, bootstrap progressive status, MCP ready/connecting/failed pill, progressive thinking indicator ("processing results" → "still synthesising" → "ctrl+c helps"), long-paste viewport clipping in the input, tool-call rows inline short arrays.
- **Hardening** — 0o600 perms on config/auth/session files, 120s approval auto-deny, 10s catalog fetch timeout, property-by-property JSON validation, ANSI escape scrubbing on model output, news "relaxed" filter flag so empty results don't become "no bad news" hallucinations.
- **Perf** — streaming assistant rows skip the markdown parse (renders once on commit to scrollback), `marked-terminal` parser cached by width. Base prompt pushes composite-first tool use and step-level parallelism so typical turns batch 3–4 big tool calls instead of 15 sequential ones.

---

## Quickstart

```bash
git clone https://github.com/wideshreck/orco-the-trader.git
cd orco-the-trader
bun install
bun dev
```

Set at least one API key:

```bash
export ANTHROPIC_API_KEY=...
# or OPENAI_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, GROQ_API_KEY,
#    XAI_API_KEY, OPENROUTER_API_KEY, or just run Ollama locally
```

Then type:

```
> full analysis on BTCUSDT 4h
> top 10 gainers, scan momentum on 1h
> backtest donchian_breakout on SOLUSDT 1d, last 1000 candles
> what's the nearest resistance for ETH and how far is the ATR stop
```

Orco speaks your language — English, Turkish, or anything in between.

---

## Features

**Agent & workflow**
- Multi-provider LLMs: Anthropic, OpenAI, Google, Groq, xAI, OpenRouter, Ollama (local)
- Built-in base system prompt (role + methodology + tool-use posture), user overlay on top
- Prompt caching on Anthropic (ephemeral), streaming on every provider
- Message queue while streaming, multi-line input (`Shift+Enter` or trailing `\`)
- Up/down input history, session persistence (JSONL), session picker, auto-resume
- Manual `/compact` + auto-compact at 90% context
- 7 built-in skills (trade analysis, breakout, mean-reversion, divergence hunt, risk-first sizing, common mistakes, post-trade review) + user-installable (Claude-Code compatible, `~/.config/orco/skills/`)
- Native tool framework with `auto / ask / deny` permissions and always-allowed store
- Model Context Protocol (HTTP + STDIO) — MCP tools ride the same approval flow

**Market analysis**
- OHLCV, 24h ticker, order book, funding rate, open interest, long/short ratio
- 9 indicators: SMA, EMA, RSI (Wilder), MACD, ATR, Bollinger Bands, Stochastic, VWAP, ADX — plus a breakout-qualifying `volumeSignal` (surge / above / normal / below / dry) on the latest bar
- Support/resistance detection via fractal pivots + price clustering
- RSI and MACD divergence detection (bullish + bearish)
- Multi-timeframe confluence with alignment scoring
- Market regime (Fear & Greed, BTC / ETH dominance, global mcap)
- Top-movers scanner, parallel per-symbol digest
- Position-size calculator (balance + risk% → qty, margin, R:R) with `riskBand` + warning output blocking covert YOLO sizing
- Trade-plan validator (wrong-side stop, sub-RR, ATR misalignment, chasing)
- Pairwise Pearson correlation of log returns (2–8 symbols)
- Relative strength vs. a benchmark (log-ratio trend + 30d/90d deltas) — distinguishes "coupled with BTC" from "leading BTC"
- Day-of-week / hour-of-day return distribution (seasonality)

**Live context**
- Crypto news headlines — CryptoCompare aggregator (600+ sources) with RSS fallback (CoinDesk, CoinTelegraph, Decrypt, The Block, Bitcoin Magazine)
- DeFi TVL (protocol / chain / top-N) via DefiLlama — no auth
- Gas price + EIP-1559 base fee for 6 EVM chains (eth, arbitrum, optimism, base, polygon, bsc)

**Backtesting**
- Event-driven engine, no look-ahead bias (signals on close of bar *i*, fills on open of bar *i+1*)
- 4 presets: RSI reversal, MA crossover, Bollinger mean reversion, Donchian breakout
- ATR-based risk sizing, optional chandelier trailing stop
- Realistic fee + slippage modeling
- Full metrics: total return, CAGR, Sharpe, Sortino, max drawdown + duration, profit factor, expectancy, payoff ratio, average R multiple, win rate, exposure %, buy-and-hold benchmark
- Parameter sweep: grid-search 1–4 params, top-30 by Sharpe + best by return / PF, <5-trade rows auto-excluded

**Quality**
- 271 unit tests with `bun:test`
- Strict TypeScript, Biome lint + format, CI on every push
- Feature-first architecture; each file stays under ~300 lines

---

## Tool catalog

| Tool | What it does |
|---|---|
| `full_analysis` | One-shot digest: ticker + multi-TF + indicators + S/R + divergence + funding + order book + macro, in parallel |
| `validate_trade_plan` | Sanity-check a plan before publishing (wrong-side stop/TP, sub-minRR, ATR alignment, stale or chasing entry) |
| `get_ohlcv` | Binance klines (11 intervals, up to 1000 bars) |
| `get_ticker_24h` | 24-hour rolling stats (price, volume, change) |
| `get_order_book` | Depth + bid/ask imbalance summary |
| `get_funding_rate` | Perp funding rate, mark + index price (Binance fapi) |
| `get_open_interest` | OI history with change %, period-configurable |
| `get_long_short_ratio` | Top-trader positioning ratio (fapi) |
| `get_market_context` | Fear & Greed index + BTC / ETH dominance + global mcap |
| `list_top_symbols` | Rank by 24h volume, gainers, losers, or trade count |
| `scan_market` | Parallel per-symbol digest: ticker + RSI(14) + SMA deviation + interval change |
| `multi_timeframe_analysis` | Trend / momentum / strength biases across N timeframes + alignment |
| `compute_indicators` | SMA, EMA, RSI, MACD, ATR, Bollinger, Stochastic, VWAP, ADX on a candle series |
| `detect_support_resistance` | Fractal pivots clustered into levels with touch counts |
| `detect_divergence` | Two-point RSI / MACD divergence scan |
| `position_size` | Risk-based qty sizing with optional take-profit and leverage |
| `backtest` | Event-driven simulation with 4 presets and full metrics |
| `sweep_backtest` | Grid-search parameter sweep: 1–4 ranges, top-30 by Sharpe + best by return/PF |
| `correlate_assets` | Pairwise Pearson correlation of log returns, 2–8 symbols, with alignment-length reporting |
| `relative_strength` | Symbol vs. benchmark ratio trajectory: 30d/90d change + trend label (rising/flat/falling). Distinguishes "coupled with BTC" from "leading BTC" |
| `seasonality` | Weekday / hour-of-day return distribution — avg, median, win rate, std-dev per bucket |
| `get_news` | Crypto headlines via CryptoCompare (600+ sources) with RSS fallback, filters by symbol / category / since |
| `get_defi_tvl` | DefiLlama TVL + 7d/30d % change — by protocol, by chain, or top-N ranking |
| `get_gas_price` | Current gas + EIP-1559 base fee for 6 EVM chains via LlamaRPC (no auth) |
| `watchlist` | Persistent symbol list (list / add / remove / clear) |
| `ask_user` | LLM pauses to ask the user a scoped question |
| `todo_write` | LLM-managed task list rendered live in the chat |
| `skill` | Load an installed skill's playbook into the current turn |

---

## Providers & API keys

| Provider | Env var |
|---|---|
| Anthropic | `ANTHROPIC_API_KEY` |
| OpenAI | `OPENAI_API_KEY` |
| Google (Gemini) | `GOOGLE_GENERATIVE_AI_API_KEY` |
| Groq | `GROQ_API_KEY` |
| xAI (Grok) | `XAI_API_KEY` |
| OpenRouter | `OPENROUTER_API_KEY` |
| Ollama | — (runs locally) |

Models are discovered dynamically from [models.dev](https://models.dev) and cached in `~/.cache/orco/` with a 1-hour TTL and stale fallback. Pick a default through `/model`, change it any time.

---

## Configuration

| Path | Purpose |
|---|---|
| `~/.config/orco/config.json` | user overrides (default model, system prompt overlay, MCP servers, tool permissions) |
| `~/.config/orco/skills/` | installed skills (Claude-Code-compatible `SKILL.md`) |
| `~/.config/orco/watchlist.json` | persistent symbol list |
| `~/.config/orco/sessions/` | JSONL chat history with JSON index |
| `~/.cache/orco/models.json` | models.dev catalog cache |
| `~/.cache/orco/debug.log` | opt-in debug log (`ORCO_LOG=debug`) |

---

## Slash commands

| Command | What it does |
|---|---|
| `/model` | pick a provider and model |
| `/sessions` | browse, switch, delete sessions |
| `/new` `/clear` | start a fresh session (and wipe terminal) |
| `/compact` | summarize older messages to free context |
| `/cost` | tokens + USD breakdown per turn |
| `/tools` | list registered tools and their permission tier |
| `/skills` | list installed skills |
| `/mcp` | list configured MCP servers and their status |
| `/mcp reload` | reconnect all MCP servers |
| `/watchlist` | show saved symbols |
| `/prompt` | show the active base + user system prompts |
| `/config` | config file location and current values |
| `/log` | debug log path and status |
| `/help` | all commands |
| `/exit` | quit |

Keybindings: `Shift+Enter` or trailing `\` inserts a newline · `↑/↓` walks input history · `Ctrl+C` cancels the in-flight stream · second `Ctrl+C` quits · during an approval prompt: `a` allow once, `d` deny, `A` always allow, `e` toggle full-JSON detail, `esc` deny.

---

## Skills

Skills are Claude-Code-compatible markdown playbooks the LLM can load on demand.

```markdown
---
name: my_strategy
description: When to use — short trigger the LLM reads to decide relevance
---

Detailed playbook: tools to call, thresholds to check, output shape.
```

Place the file at `~/.config/orco/skills/my_strategy/SKILL.md` (or `.../my_strategy.md`).

Orco ships with 8 built-in skills (loaded from the bundled `dist/` layout; user skills in `~/.config/orco/skills/` override same-name built-ins):

| Skill | Trigger |
|---|---|
| `trade_analysis` | General-purpose TA workflow (clarify → multi-TF → digest → validate → recommend → disclose) |
| `breakout_setup` | "Is it breaking out?", range breaks, channel exits |
| `mean_reversion_setup` | Oversold/overbought bounces, dip buying, band fades |
| `divergence_hunt` | RSI/MACD divergence scan and validation |
| `risk_first` | Position sizing, "how much should I buy?" |
| `common_mistakes` | Background awareness: no-stop, chasing, revenge trading, size creep |
| `post_trade_review` | "I got stopped out" — structured debrief with tape reconstruction |
| `news_impact` | Did a headline move the price? Catalyst-vs-price reads, "is this priced in?" |

---

## Model Context Protocol

Add HTTP and STDIO MCP servers to `~/.config/orco/config.json`:

```json
{
  "mcpServers": {
    "my-http-server": {
      "transport": "http",
      "url": "https://example.com/mcp"
    },
    "my-local-server": {
      "transport": "stdio",
      "command": "node",
      "args": ["./path/to/server.js"]
    }
  }
}
```

MCP tools register into the same catalog as native ones, obey the same permission rules, and surface in `/tools`. Inspect connection status with `/mcp`.

---

## Backtesting

```
> backtest ma_crossover on BTCUSDT 1d, last 1000 bars, 1% risk, 1.5× ATR stop, 2R TP
```

Defaults: $10 000 balance, 1% risk per trade, ATR(14) × 1.5 stop, 2R take-profit, 0.1% taker fee, 2 bps slippage, long-only. Every knob is overridable.

| Preset | Logic |
|---|---|
| `rsi_reversal` | long on RSI cross-up through oversold, short on cross-down through overbought |
| `ma_crossover` | fast SMA crossing slow SMA |
| `bollinger_mean_reversion` | fade closes beyond the bands, exit on mid-band |
| `donchian_breakout` | Turtle-style N-bar range break |

Returns a trade log, downsampled equity curve, and the full metric block. Results shorter than ~30 trades are flagged as small-sample by the skill.

### Parameter sweep

```
> sweep RSI oversold from 20 to 40 step 5 on BTCUSDT 4h, last 500 bars
```

Grid-searches 1–4 parameter ranges, runs a backtest per combination (max 500), and returns the top-30 sorted by Sharpe plus the single best row by total return and by profit factor. Rows with fewer than 5 trades are auto-excluded from the winners to resist curve-fitting. Always caveat: in-sample optimization overfits.

---

## Development

```bash
bun install
bun test                    # run the test suite
bun run check               # biome + tsc + tests
bun dev                     # run from source
bun run build               # tsc → dist/
bun run compile             # single-binary via bun build --compile (Linux x64)
```

Layout:

```
src/
  cli/              entry, signal handling, alt-screen
  app/              root composition, slash dispatch
  commands/         slash registry
  features/
    chat/           streaming, compact, base-prompt, cost
    sessions/       JSONL persistence + picker
    tools/          native registry + approvals + question channel
    models/         catalog + provider auth + picker
    skills/         SKILL.md loader
    mcp/            HTTP + STDIO clients
    trading/        market data + analysis tools
    backtesting/    engine + metrics + presets
    watchlist/      persistent symbol list
    todos/          TodoWrite panel
  shared/           config, logging, errors, UI primitives
```

See [`CLAUDE.md`](./CLAUDE.md) for the contributor style guide (kept intentionally strict — 300-line file cap, 50-line function cap, no `any`, Turkish-language explanatory notes where context matters).

---

## Roadmap

- [x] Specialized skills (breakout, mean-reversion, divergence, risk-first, mistakes, post-trade review, news impact)
- [x] Parameter-sweep backtests
- [x] Live news feed (CryptoCompare + RSS)
- [x] DeFi TVL + EVM gas tracker
- [x] Correlation + seasonality analysis
- [ ] Walk-forward (IS/OOS) backtest split
- [ ] Background alert watcher (price / indicator triggers with notification)
- [ ] Paper trading (simulated positions, persistent PnL)
- [ ] Live execution (exchange API integration behind hard safety gates)
- [ ] Candle ASCII chart in the terminal
- [ ] Extended-thinking auto-toggle on reasoning-capable models
- [ ] Lightweight shell-tool spec for third-party extensions

Issues and PRs welcome — please open an issue before large changes.

---

## Disclaimer

Orco is a research and analysis tool. It does not execute trades. Its output is not financial advice. Crypto markets are volatile and you can lose money.

---

## License

[Apache License 2.0](./LICENSE) © orco contributors.
