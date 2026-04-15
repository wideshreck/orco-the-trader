# Jarvis the Trader — Quality Overhaul Design

**Date:** 2026-04-15
**Scope:** Hygiene/quality only. No new user-facing features. UI language switches from Turkish to English.
**Approver:** orcun (subs@spaceflow.tech)

---

## 1. Goals

1. Eliminate every `CLAUDE.md` red-line violation in the current source.
2. Tighten TypeScript to the strictest profile compatible with Ink+React 18.
3. Add Biome (lint + format) — the only tooling addition approved.
4. Harden runtime: signal handling, alt-screen recovery, abort semantics, schema validation.
5. Translate UI strings to English. Keep docs (`CLAUDE.md`) Turkish.
6. Keep behavior identical: same flows, same files, same key bindings.

**Non-goals:** tool-calling, system prompts, markdown rendering, themes, OS keychain, tests, CI, publint, `@arethetypeswrong/cli`.

---

## 2. Findings From Research

Research conducted on AI SDK v6, Ink 5, Node 25 process model, TS 5.9+/6.0, Biome 2.3, models.dev schema. Key takeaways:

- **AI SDK v6** — `streamText` exposes `onAbort`, `onError`, `onFinish`, `onChunk`. Aborting a `textStream` consumer with `for await` rethrows as `AbortError` — current pattern is correct. `fullStream` would be needed only for tool-call/error chunks; we do not need it yet.
- **Ink 5** — `useInput` requires raw mode; `useStdin().isRawModeSupported` must be checked when stdin is piped/CI. Multiple `useInput` hooks fire in parallel; the `isActive` flag scopes them. We currently rely on phase routing instead — acceptable, but the root `useInput` in `app.tsx` must be the only listener for global keys (Ctrl+C).
- **Node signals** — installing a SIGINT/SIGTERM/SIGHUP listener removes the default exit. We must call `process.exit()` ourselves, and we must restore the alt-screen buffer on **every** exit path (normal, signal, uncaughtException, unhandledRejection). The `exit` event is synchronous-only — perfect for emitting `\x1b[?1049l`.
- **TypeScript** — `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are now baseline best practice. `verbatimModuleSyntax` enforces `import type` discipline and is compatible with our `moduleResolution: "bundler"` + `.js` extension contract.
- **Biome 2.3** — schema reference uses pinned version. Recommended rules + custom severity for `noExplicitAny: error`, `useImportType: error`. JSX is auto-detected via filename.
- **models.dev** — confirmed schema; one new field present in production (`last_updated`) that we ignore safely. Catalog parser will validate required fields and tolerate unknown fields.

---

## 3. File-Level Changes

### 3.1 New layout

```
src/
  cli.tsx                     # terminal lifecycle, signal cleanup, render
  app.tsx                     # phase state machine, top-level useInput, routing (~140 lines)
  app/
    chat-view.tsx             # banner + message list + input bar + tools bar
    use-chat.ts               # streaming hook: state, abort, command dispatch
    banner.tsx                # ASCII logo (deduped from app.tsx + bootstrap.tsx)
  ai.ts                       # streamChat + typed error helpers
  providers.ts                # provider factories (unchanged behavior, types tightened)
  catalog.ts                  # fetch + cache + runtime schema guard
  config.ts                   # load/save user config
  auth.ts                     # api key + auth store, env first
  errors.ts                   # NEW: isAbortError, errorMessage, narrowError
  ui/
    model-picker.tsx          # cursor reset on query change, keyboard nav
    auth-prompt.tsx           # english copy
    bootstrap.tsx             # uses banner.tsx
biome.json                    # NEW
.gitignore                    # NEW (or updated)
docs/plans/                   # NEW: design + plan docs live here
```

No file exceeds 300 lines after split.

### 3.2 Behavior contract (must remain identical)

| Flow | Before | After |
|------|--------|-------|
| Send message + stream | works | works |
| Ctrl+C single (during stream) | aborts stream | aborts stream |
| Ctrl+C double (idle) | exits | exits |
| `/model` | opens picker | opens picker |
| `/clear` | clears messages | clears messages |
| `/exit` `/quit` | exits | exits |
| Missing API key | picker shows `[locked]`, auth prompt on pick | same |
| Stale catalog (network down) | falls back silently | same |
| Crash | terminal stuck in alt-screen | **fixed** — alt-screen restored |

---

## 4. Concrete Diffs By File

### 4.1 `src/cli.tsx`

- Install listeners for `SIGINT`, `SIGTERM`, `SIGHUP`, `uncaughtException`, `unhandledRejection`.
- Use the synchronous `process.on('exit', ...)` to write `\x1b[?1049l` exactly once via a guard flag, so every exit path restores the buffer.
- Keep `exitOnCtrlC: false` — Ink's Ctrl+C is still managed in `app.tsx`.
- Detect `!process.stdout.isTTY` → log a friendly message and exit (no alt-screen, no Ink) — guards CI/piped invocation.

### 4.2 `src/app.tsx`

- Strip chat view, banner, tools bar, input bar — move to `src/app/chat-view.tsx`.
- Strip streaming logic into `useChat` hook (`src/app/use-chat.ts`).
- Keep: phase enum, root `useInput` (Ctrl+C + tools-bar nav), bootstrap effect, routing.
- Replace every `err: any` with `unknown` + `errorMessage(err)` from `errors.ts`.
- Translate user-facing text to English.

### 4.3 `src/app/use-chat.ts` (new)

```ts
export function useChat(opts: { provider: CatalogProvider; ref: ModelRef }) {
  // returns { messages, streaming, send, clear, cancel }
}
```

- Owns `AbortController` ref + cleanup on unmount.
- Owns the message array.
- Delegates command parsing (`/clear`, `/exit`, `/quit`, `/model` returns a sentinel that `app.tsx` handles to switch phase).

### 4.4 `src/app/chat-view.tsx` (new)

- Pure presentational. Props: `messages`, `streaming`, `input`, `onInputChange`, `onSubmit`, `focus`, `exitWarning`, `modelLabel`.
- No effects, no abort, no streaming knowledge. Lifts the entire JSX subtree out of `app.tsx`.

### 4.5 `src/app/banner.tsx` (new)

- Single source of the ASCII logo, used by `chat-view.tsx` and `bootstrap.tsx`.

### 4.6 `src/ai.ts`

- Pass an `onError` callback to surface SDK errors (currently they only arrive via the iterator throw; we keep the iterator catch as the primary path).
- Change `apiKey: string | undefined` to `apiKey?: string` — `exactOptionalPropertyTypes` requires explicit optional vs nullable.
- Type the generator yield/return precisely.

### 4.7 `src/errors.ts` (new)

```ts
export function isAbortError(err: unknown): boolean {
  return (
    err instanceof Error && (err.name === 'AbortError' || err.name === 'AbortSignalError')
  );
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return String(err);
}
```

Used everywhere we currently write `err?.message ?? String(err)`.

### 4.8 `src/catalog.ts`

- Add `parseCatalog(raw: unknown): Catalog` that walks the JSON, asserts shape on required fields, drops malformed providers/models with a one-line note (no logger; just skip silently — the picker simply won't list them).
- `as Catalog` and `as CacheFile` casts replaced by guards.
- Tolerate unknown fields (`last_updated`, future additions).
- Cache write is atomic (write to `models.json.tmp`, `rename` to `models.json`) — protects against torn writes on Ctrl+C mid-write.

### 4.9 `src/config.ts` and `src/auth.ts`

- Same atomic-write treatment for `config.json` and `auth.json`.
- `unknown` narrow on JSON parse; reject anything that isn't a plain object.
- `auth.json`: keep `0600` mode; also recreate file with correct mode if it exists with looser permissions (best-effort, ignore on Windows).

### 4.10 `src/providers.ts`

- Replace `Record<string, () => Promise<ProviderFactory>>` with a typed map keyed by `ProviderId` union (single source of truth) — TypeScript will catch any forgotten case.
- Throw a typed `UnsupportedProviderError` instead of generic `Error`.

### 4.11 `src/ui/model-picker.tsx`

- Reset cursor to 0 when `query` changes (currently masked by `safeCursor`).
- Stable key already used (`provider/model`) ✓.
- Translate strings to English.

### 4.12 `src/ui/auth-prompt.tsx`

- Translate strings.
- After `setAuth`, ensure the in-memory `key` state is overwritten with empty string on unmount (defensive — best-effort, JS GC limits).

### 4.13 `src/ui/bootstrap.tsx`

- Use `banner.tsx`.
- Translate strings.

---

## 5. `tsconfig.json`

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react",
    "esModuleInterop": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitOverride": true,
    "forceConsistentCasingInFileNames": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

`noUnusedLocals`/`noUnusedParameters`: deferred — Biome's `noUnusedVariables` covers the same ground with better DX.

---

## 6. `biome.json`

```jsonc
{
  "$schema": "https://biomejs.dev/schemas/2.3.11/schema.json",
  "files": { "includes": ["src/**", "*.json"] },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "semicolons": "always",
      "trailingCommas": "all",
      "arrowParentheses": "always"
    }
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "suspicious": { "noExplicitAny": "error" },
      "style": {
        "useImportType": "error",
        "useNodejsImportProtocol": "error"
      },
      "correctness": { "noUnusedVariables": "error" }
    }
  }
}
```

---

## 7. `package.json`

- Add `engines.node: ">=20"`.
- Add `files: ["dist", "README.md", "LICENSE"]` (LICENSE may not exist — only list what exists).
- Scripts:
  - `build` — `tsc`
  - `dev` — `tsx src/cli.tsx`
  - `start` — `node dist/cli.js`
  - `typecheck` — `tsc --noEmit`
  - `lint` — `biome lint .`
  - `format` — `biome format --write .`
  - `check` — `biome check . && tsc --noEmit`
- Add `@biomejs/biome` to devDependencies.
- Verify no unused deps; `@types/react-dom` is not present so nothing to remove there.

---

## 8. `.gitignore`

```
node_modules/
dist/
*.log
.DS_Store
```

(`~/.config/jarvis/` and `~/.cache/jarvis/` live outside the repo by design.)

---

## 9. `CLAUDE.md` Updates

- §11 diagram: `models.ts` → `providers.ts`; add `app/` subfolder; mention `errors.ts`.
- §11 dependency-direction note unchanged (still UI → ai.ts → providers.ts → SDK).
- §12 "Test altyapısı yok" stays (still no tests). "Lint/format aracı henüz yok" → replaced with "Biome kurulu, `npm run check` zorunlu doğrulama adımı."
- §8 doğrulama matrisi: `npm run check` ekle.
- No other doc additions. CLAUDE.md stays Turkish.

---

## 10. Validation

Per CLAUDE.md §8, after every domain commit:

1. `npm run check` — typecheck + biome must pass.
2. `npm run build` — clean.
3. `npm run dev` — manual run-through of all 6 flows in §8 plus the new crash-recovery flow:
   - Trigger `throw` mid-stream → terminal returns to normal screen.
   - SIGTERM (`kill -TERM <pid>`) → terminal returns to normal screen.
   - Ctrl+C single during stream → cancels.
   - Ctrl+C double idle → exits cleanly.
4. `node --input-type=module -e "import('./dist/cli.js')"` — ESM resolves.

---

## 11. Commit Plan

Atomic, per CLAUDE.md §9. One commit per row:

1. `chore: add biome config and gitignore`
2. `chore: tighten tsconfig with noUncheckedIndexedAccess and exactOptionalPropertyTypes`
3. `errors: extract isAbortError and errorMessage helpers`
4. `catalog: validate models.dev response and write cache atomically`
5. `config,auth: atomic writes and unknown-narrow on parse`
6. `providers: type provider id union and typed unsupported error`
7. `ai: tighten streamChat types and optional apiKey contract`
8. `ui: extract banner and translate strings to english`
9. `app: extract chat-view component and use-chat hook`
10. `cli: install signal handlers and restore alt-screen on every exit`
11. `picker: reset cursor when query changes`
12. `docs: refresh CLAUDE.md to match new layout and tooling`

Each commit ends with `npm run check` green. No `--no-verify`. No `Co-Authored-By` unless requested.

---

## 12. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| `verbatimModuleSyntax` breaks existing `import` lines | Sweep file-by-file; Biome `useImportType` flags missing `type` |
| Splitting `app.tsx` introduces re-render regression | Keep state at the top; pass primitives down; manual smoke test |
| `exactOptionalPropertyTypes` reveals hidden `undefined` paths | Each one is a real bug — fix as found |
| Atomic cache write changes file mtime semantics | Acceptable — TTL is what matters |
| Signal handler conflicts with Ink's own handlers | Ink only owns Ctrl+C (we set `exitOnCtrlC: false`); SIGTERM/SIGHUP are ours alone |
| English translation breaks user muscle memory | User explicitly approved English-only UI |

---

## 13. Out of Scope (Explicit)

- No tests, no CI workflow.
- No tool-calling, no MCP, no system prompt.
- No markdown rendering.
- No keychain integration.
- No new providers.
- No theming.
- No telemetry.
- No README authoring (not requested; would also violate CLAUDE.md "no new .md unless asked" — design docs in `docs/plans/` are on-request artifacts of this brainstorming flow).
