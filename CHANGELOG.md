# Changelog

All notable changes to Orco are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- `relative_strength` tool — pair the symbol against a benchmark (default
  BTCUSDT), compute the ratio series on aligned bars, 30d/90d % change, and
  a 2σ-normalized trend label (rising / flat / falling). Distinguishes
  "coupled" from "leading" so a 91 %-correlated ETH long that's actually
  bleeding against BTC gets flagged as leveraged-worse-BTC instead of being
  quietly passed through.
- `volumeSignal` on `compute_indicators` — latest bar's volume classified
  against its 20-bar reference average: surge (≥2×) / above / normal /
  below / dry. Self-excluded reference so the spike bar can't dilute its
  own comparison. Skill layer now forbids recommending breakout trades
  without surfacing this field.
- Gas regime bands on `get_gas_price` — per-chain idle/quiet/normal/busy/
  congested classification so the LLM can reason about 0.15 gwei on ETH
  (post-Pectra idle) vs. on Arbitrum (normal) instead of quoting the raw
  number and getting confused.
- `riskBand` + `warning` on `position_size` — conservative / standard /
  aggressive / yolo classification driven off riskPct, with a verbatim
  warning string the model must surface for aggressive and yolo calls.
  Blocks the reverse-solve-to-budget vector where the model passes
  riskPct=11 to make qty equal balance ÷ entry.
- Multi-line paste viewport in the input box — long pastes clip to the
  tail MAX_VISIBLE_LINES (6) with a dim `↑ N more lines · M chars total`
  header, and individual visible lines clip to terminal width so Ink
  doesn't re-wrap them. Full value still ships on submit — render-only
  concern.
- Progressive thinking indicator — 4 stages (dim → yellow → yellow-with-
  hint → red-with-ctrl+c advice) so a 2-minute model-synthesis pause on
  a large tool-output context doesn't look like a dead stream.
- `get_news` tool — crypto headlines from CryptoCompare (600+ sources) with RSS
  fallback over CoinDesk, CoinTelegraph, Decrypt, The Block, Bitcoin Magazine.
  Filters by symbol (with BTC→Bitcoin alias table), category, and `since`.
- `get_defi_tvl` tool — DefiLlama TVL for a protocol, a chain, or a top-N
  ranking. 7d and 30d % deltas use a closest-not-after lookup so sparse
  series don't leak future points into the reference.
- `get_gas_price` tool — current gas + EIP-1559 base fee for 6 EVM chains via
  public LlamaRPC JSON-RPC (no auth). Wei→gwei conversion routes through
  BigInt to avoid float precision loss.
- `correlate_assets` tool — pairwise Pearson correlation of log returns for
  2–8 symbols on the same interval. Right-aligns to the shortest series so
  newer listings don't produce undefined correlations, reports alignment
  length so the caller can flag truncated windows.
- `seasonality` tool — day-of-week or hour-of-day return distribution. Per-
  bucket avg / median / win rate / std-dev, best and worst buckets, thin
  buckets (<5 samples) excluded from the winner picks.
- `news_impact` built-in skill — catalyst-vs-price playbook that brackets a
  pre/post window around a headline, classifies the reaction against the
  symbol's typical hourly range, and cross-checks BTC/ETH correlation.
- Responsive chat status bar with an ASCII context bar (`[████░░] 42%`),
  `Σ`-prefixed session token + cost totals, and `model ▾` hint that the
  model is changeable via `/model`. Items drop progressively at narrow
  terminal widths.
- Queue preview above the input surfaces the first 3 queued messages during
  a stream so drained submissions aren't a surprise.
- Braille spinner, count-up elapsed timer, and traffic-light countdown
  primitives (`src/shared/ui/spinner.tsx`).
- Bootstrap screen: animated spinner, progressive "(still trying…)" →
  "(network issue?)" hints, and live MCP `ready / connecting / failed`
  pill polled every 200ms until every server settles.
- Approval prompt countdown (green → yellow → red around 30s / 10s), `e`
  key toggles full-JSON expand vs. 320-char collapsed preview, explicit
  `esc` = deny hint.
- Empty-response detection — a turn that returns zero tokens with no tool
  calls now surfaces a red `(empty response — model returned no output)`
  marker instead of vanishing silently.
- Tool-call row shows the tool's description line while running (both
  native and MCP tools via `registerExternalDescription`).
- `/mcp reload` promoted to autocomplete + `/help`.
- `CHANGELOG.md` (this file).

### Fixed
- Session creation race — `ensureSession` claims its ref before any I/O, so
  a re-entrant `recordRow` during React effects can't spin up a second
  JSONL file.
- Zombie pending / awaiting-approval tool rows on Ctrl+C now get promoted
  to `error` with `(canceled)` before committing to scrollback.
- Catalog fetch no longer hangs forever — 10s timeout with proper outer-
  AbortSignal forwarding, plus property-by-property JSON validation so a
  malformed models.dev response can't poison state.
- Approval prompts no longer hang forever — 120s auto-deny timeout (also
  cleared on unmount) prevents resolver leaks when the user walks away.
- Tool-call debug log trimmed to `{ name, id }` — no tool-argument leak
  to `~/.cache/orco/debug.log` when MCP tools carry secrets in args.
- Built-in skill playbooks now actually load: loader merges built-in
  (bundled next to the compiled files via `import.meta.url`) with user
  skills; user files override built-ins on name collision. Previously
  `/skills` showed empty and the `skill` tool returned "unknown skill"
  for all shipped playbooks. Build now runs a postbuild copy so `dist/`
  carries the `.md` files.
- ANSI escape sequences in model / tool output are stripped before
  rendering so a crafted response can't toggle alt-screen, move the
  cursor, or set the window title.
- Tool-call rows inline short primitive arrays (`symbols=[BTCUSDT,ETHUSDT]`)
  instead of the cryptic `symbols=[2]`. Arrays with >4 items, long
  strings, or complex elements still fall back to the count.
- `get_news` no longer confabulates absence: when the strict symbol
  filter finds no matches it now relaxes to the unfiltered recent feed
  and tags the result `filter: 'relaxed'`. Tool description explicitly
  tells the LLM that relaxed ≠ "no bad news".
- `position_size` is now authoritative: the tool description + base
  prompt tell the model not to substitute `balance ÷ entry` math over
  the tool's qty, and to treat stated user budgets as a *cap* on
  deployment rather than the target. Combined with the riskBand
  warning this closes the "find a way to go all-in" loophole.
- Model restart-prefix dedupe in `finalizeLive`: some models (Gemini
  3.1 Pro caught live) re-emit their opening paragraph after tool
  results instead of continuing, which landed the same intro on two
  consecutive assistant rows. Earlier rows whose full content is a
  strict prefix of a later row's are now dropped before commit.

### Changed
- Denied tool errors now include retry guidance ("do not retry this
  tool; ask the user what to do") so the LLM breaks out of retry loops
  instead of firing the same call into the approval gate repeatedly.
- Step limit raised from 20 to 40 for multi-step MCP chains.
- Config, auth, session, approvals, and watchlist files are now written
  with mode 0o600 (parent dirs 0o700). Previously they used the default
  umask and were readable by other users on shared hosts.
- Italic emphasis and blockquotes render via `chalk.dim.italic` so
  disclaimers and asides read as soft caveats instead of emphasized
  claims.
- Base system prompt asks the model to use markdown tables when
  comparing numeric results (backtests, sweeps, risk tiers) so key
  metrics sit side-by-side instead of drowning in prose.
- `⚠` replaced with `[!]` in context-full and stale-catalog banners for
  CJK-locale safety (ambiguous-width codepoint).
- Compacted indicator colour changed from cyan to blue to reduce cyan
  overload across the UI.
- Base prompt extended with three methodology edits: (1) timeframe
  discipline — 100-bar daily is ~14 weeks and cherry-picks a recovery
  leg out of a multi-year regime, swing reads must fetch ≥300 daily
  bars; (2) stand-aside is a first-class answer, state the counter-case
  before any directional recommendation, don't manufacture a plan when
  the bear case is equal-or-stronger; (3) coupling is not leadership,
  check relative-strength trajectory before treating a long on a
  correlated asset as more than leveraged benchmark exposure.
- `<tool_use>` prompt section rewritten to push composite-first
  (full_analysis / multi_timeframe_analysis / scan_market over individual
  calls) and name the step-vs-tool trap for parallelism: independent
  calls must be emitted in the *same* step so the SDK runs them
  concurrently, not in successive steps where the model pays the
  reasoning-latency cost every time.
- `trade_analysis` skill rewritten: macro-first (1-year daily fetch),
  relative-strength call made mandatory for non-BTC symbols, bull-case
  AND bear-case required before any plan, stand-aside output shape
  defined as an if-then flip-condition plan. Volume-signal check
  mandated on breakout setups. Position-sizing guidance forbids
  reverse-solving riskPct to match a stated budget.
- `get_ohlcv` description now calls out the limit=100 cherry-pick trap
  and asks for ≥300 bars on swing reads, ≥500 on position reads, full
  1000 for backtests. Default unchanged so quick price-check callers
  don't regress.

### Performance
- Streaming assistant rows skip the markdown parse entirely — live
  text renders as plain `stripAnsi`'d string while growing. Markdown
  lands once when the row moves to scrollback, so the per-token render
  cost drops from O(content²) to O(n) overall. UX cost: bold/headings/
  code-fences pop in at the end of the turn instead of previewing
  mid-stream.
- `marked-terminal` parser cached by terminal width. Previously
  `new Marked() + m.use(markedTerminal({...}))` ran on every renderMarkdown
  call; now it rebuilds only on SIGWINCH-driven width changes. In a
  long static conversation this turns hundreds of parser rebuilds into
  one.

### Refactored
- `app.tsx` (507 → 273 lines), `use-chat.ts` (339 → 218), `chat-view.tsx`
  (331 → 241) split under the 300-line cap. New modules:
  `app/{phase-router, submit-handler, use-app-input, use-auto-compact,
  use-bootstrap}`, `features/chat/{apply-event, types, chat-row-view,
  context-bar, info-panel, queue-preview, status-bar}`, shared
  `shared/ui/{spinner, strip-ansi, use-columns}`.
- Binance klines fetch extracted to `features/trading/binance.ts` so
  `correlate_assets` and `seasonality` can reuse the same transport
  without going through the LLM.

### Removed
- Ambiguous session short-id `(01AB23CD)` from the footer — it read like
  trailing noise on the session title. Still visible in `/sessions`
  picker rows and the JSONL filename on disk.
