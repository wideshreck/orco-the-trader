<!-- GitHub topics (set in repo settings): cli, terminal, tui, ai-agent, llm, crypto, trading, backtesting, technical-analysis, ink, react, bun, mcp, typescript, anthropic, openai, ollama -->

# orco

_Terminal-native AI trading assistant for crypto — multi-provider LLMs, 18+ native tools, event-driven backtesting engine, Model Context Protocol support._

[![CI](https://github.com/wideshreck/orco-the-trader/actions/workflows/ci.yml/badge.svg)](https://github.com/wideshreck/orco-the-trader/actions/workflows/ci.yml)
[![Apache 2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)
[![Bun](https://img.shields.io/badge/bun-%E2%89%A51.3-ffdda1)](https://bun.sh)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/typescript-strict-3178c6)](https://www.typescriptlang.org)

```
 ██████╗ ██████╗  ██████╗ ██████╗
██╔═══██╗██╔══██╗██╔════╝██╔═══██╗
██║   ██║██████╔╝██║     ██║   ██║
██║   ██║██╔══██╗██║     ██║   ██║
╚██████╔╝██║  ██║╚██████╗╚██████╔╝
 ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚═════╝
```

Orco is a terminal-first AI agent built for cryptocurrency market analysis. It pulls live data from Binance, computes technical indicators, detects divergences and support/resistance, runs event-driven backtests, and assembles disciplined trade plans — through whichever LLM you prefer: Anthropic, OpenAI, Google, Groq, xAI, OpenRouter, or a local Ollama model. Sessions persist. Tool calls are auditable. Every number comes from a function, not a guess.

Built on Ink + React for the UI, the Vercel AI SDK for streaming and tool calling, and the Model Context Protocol for plug-in extensibility.

---

## Quickstart

```bash
git clone https://github.com/wideshreck/orco-the-trader.git
cd orco-the-trader
bun install

# pick a provider — one key is enough
export ANTHROPIC_API_KEY=...

bun dev
```

Then at the prompt:

```
> full analysis on BTCUSDT 4h
> top 10 gainers last 24h, scan momentum on 1h
> backtest donchian_breakout on SOLUSDT 1d, last 1000 candles
> what's the nearest resistance for ETH and how far is the ATR stop
```

Orco picks up your language — English, Turkish, or anything in between.

---

## Features

**Agent & workflow**
- Multi-provider LLMs: Anthropic, OpenAI, Google, Groq, xAI, OpenRouter, Ollama (local)
- Built-in base system prompt (role + methodology + tool-use posture), user overlay on top
- Prompt caching on Anthropic (ephemeral), streaming on every provider
- Message queue while streaming, multi-line input (`Shift+Enter` or trailing `\`)
- Up/down input history, session persistence (JSONL), session picker, auto-resume
- Manual `/compact` + auto-compact at 90% context
- Skills (Claude-Code compatible, `~/.config/orco/skills/`)
- Native tool framework with `auto / ask / deny` permissions and always-allowed store
- Model Context Protocol (HTTP + STDIO) — MCP tools ride the same approval flow

**Market analysis**
- OHLCV, 24h ticker, order book, funding rate, open interest, long/short ratio
- 9 indicators: SMA, EMA, RSI (Wilder), MACD, ATR, Bollinger Bands, Stochastic, VWAP, ADX
- Support/resistance detection via fractal pivots + price clustering
- RSI and MACD divergence detection (bullish + bearish)
- Multi-timeframe confluence with alignment scoring
- Market regime (Fear & Greed, BTC / ETH dominance, global mcap)
- Top-movers scanner, parallel per-symbol digest
- Position-size calculator (balance + risk% → qty, margin, R:R)
- Trade-plan validator (wrong-side stop, sub-RR, ATR misalignment, chasing)

**Backtesting**
- Event-driven engine, no look-ahead bias (signals on close of bar *i*, fills on open of bar *i+1*)
- 4 presets: RSI reversal, MA crossover, Bollinger mean reversion, Donchian breakout
- ATR-based risk sizing, optional chandelier trailing stop
- Realistic fee + slippage modeling
- Full metrics: total return, CAGR, Sharpe, Sortino, max drawdown + duration, profit factor, expectancy, payoff ratio, average R multiple, win rate, exposure %, buy-and-hold benchmark

**Quality**
- 200+ unit tests with `bun:test`
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
| `/watchlist` | show saved symbols |
| `/prompt` | show the active base + user system prompts |
| `/config` | config file location and current values |
| `/log` | debug log path and status |
| `/help` | all commands |
| `/exit` | quit |

Keybindings: `Shift+Enter` or trailing `\` inserts a newline · `↑/↓` walks input history · `Ctrl+C` cancels the in-flight stream · second `Ctrl+C` quits.

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

Place the file at `~/.config/orco/skills/my_strategy/SKILL.md` (or `.../my_strategy.md`). Orco ships with a built-in `trade_analysis` skill that wires the full workflow — clarify → multi-symbol filter → multi-TF confluence → fast-path digest → validate → compute → read tape → recommend → disclose.

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

- [ ] Specialized skills: `risk_first`, `breakout_setup`, `mean_reversion_setup`, `divergence_hunt`, `post_trade_review`, `common_mistakes`
- [ ] Walk-forward and parameter-sweep backtests
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
