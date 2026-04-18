# Changelog

All notable changes to Orco are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
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
