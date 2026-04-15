# Jarvis the Trader — Quality Overhaul Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Bring the existing CLI to maximum quality — no new features, no regressions. Translate UI to English, fix every CLAUDE.md violation, harden runtime, add Biome.

**Architecture:** Keep the layered structure (UI → ai → providers → SDK). Split the monolithic `app.tsx` into a phase router + presentational `chat-view` + `useChat` hook. Add `errors.ts` helper, runtime catalog validation, atomic file writes, and full signal-handler coverage in `cli.tsx`.

**Tech Stack:** Node 20+ ESM, React 18, Ink 5, AI SDK v6, TypeScript 5.x strict+, Biome 2.3.

**Reference design:** `docs/plans/2026-04-15-overhaul-design.md`

---

## Pre-flight

- Working directory: `/home/orcun/projects/jarvis-the-trader`
- Project is **not** a git repository yet — Task 0 initializes it.
- After every task: `npm run check` (added in Task 2) must be green before committing.
- Manual smoke after each UI-touching commit (Tasks 8–11): run `npm run dev`, walk through the §8 matrix in `CLAUDE.md`.

---

## Task 0: Initialize git and capture baseline

**Files:**
- Create: `.gitignore`

**Step 1 — init repo and write .gitignore**

```bash
cd /home/orcun/projects/jarvis-the-trader
git init -q
git branch -m main
```

Write `.gitignore`:

```gitignore
node_modules/
dist/
*.log
.DS_Store
```

**Step 2 — baseline commit**

```bash
git add -A
git commit -q -m "chore: import baseline before overhaul"
```

**Verify:**

```bash
git log --oneline
```

Expected: one commit `chore: import baseline before overhaul`.

---

## Task 1: Add Biome config

**Files:**
- Create: `biome.json`

**Step 1 — install biome**

```bash
npm install --save-dev --save-exact @biomejs/biome@2.3.11
```

**Step 2 — write `biome.json`**

```jsonc
{
  "$schema": "https://biomejs.dev/schemas/2.3.11/schema.json",
  "files": { "includes": ["src/**", "*.json", "*.jsonc"] },
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

**Step 3 — add scripts to `package.json`**

Edit `package.json` `"scripts"`:

```json
{
  "build": "tsc",
  "dev": "tsx src/cli.tsx",
  "start": "node dist/cli.js",
  "typecheck": "tsc --noEmit",
  "lint": "biome lint .",
  "format": "biome format --write .",
  "check": "biome check . && tsc --noEmit"
}
```

Also add: `"engines": { "node": ">=20" }` and `"files": ["dist"]` at root.

**Step 4 — first format pass (auto-fix only)**

```bash
npx biome format --write .
```

**Step 5 — verify**

```bash
npx biome check . 2>&1 | tail -20
npm run typecheck
```

Expected: lint may report violations (we'll fix them in subsequent tasks); typecheck clean.

**Step 6 — commit**

```bash
git add biome.json package.json package-lock.json src
git commit -q -m "chore: add biome config and npm scripts"
```

---

## Task 2: Tighten tsconfig

**Files:**
- Modify: `tsconfig.json`

**Step 1 — replace `tsconfig.json`**

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

**Step 2 — run typecheck and capture errors**

```bash
npm run typecheck 2>&1 | tee /tmp/jarvis-tsc-errors.log
```

Expected: errors will surface — most are `import type` violations and `possibly undefined` from `noUncheckedIndexedAccess`. **Do not fix here.** The next tasks fix them per file.

**Step 3 — commit (intentionally red)**

The repo is temporarily not green. We commit the config so subsequent fixes have a stable baseline:

```bash
git add tsconfig.json
git commit -q -m "chore: tighten tsconfig with stricter type-checking flags"
```

**Note:** Subsequent tasks each end with `npm run typecheck` clean for the files they touch. The full `npm run check` will pass at the end of Task 7.

---

## Task 3: Create `errors.ts` helper

**Files:**
- Create: `src/errors.ts`

**Step 1 — write the file**

```ts
export function isAbortError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.name === 'AbortError' || err.name === 'AbortSignalError';
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return String(err);
}
```

**Step 2 — verify**

```bash
npx tsc --noEmit src/errors.ts
```

Expected: clean.

**Step 3 — commit**

```bash
git add src/errors.ts
git commit -q -m "errors: add isAbortError and errorMessage helpers"
```

---

## Task 4: Harden `catalog.ts`

**Files:**
- Modify: `src/catalog.ts`

**Step 1 — add a runtime parser and atomic write**

Replace the file body with:

```ts
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CATALOG_URL = 'https://models.dev/api.json';
const CACHE_DIR = path.join(os.homedir(), '.cache', 'jarvis');
const CACHE_PATH = path.join(CACHE_DIR, 'models.json');
const TTL_MS = 60 * 60 * 1000;

export type ModelModalities = { input: string[]; output: string[] };
export type ModelCost = {
  input?: number;
  output?: number;
  cache_read?: number;
  cache_write?: number;
};
export type ModelLimit = { context?: number; output?: number };

export type CatalogModel = {
  id: string;
  name: string;
  attachment?: boolean;
  reasoning?: boolean;
  tool_call?: boolean;
  temperature?: boolean;
  knowledge?: string;
  modalities?: ModelModalities;
  cost?: ModelCost;
  limit?: ModelLimit;
  release_date?: string;
  open_weights?: boolean;
};

export type CatalogProvider = {
  id: string;
  name: string;
  env: string[];
  npm?: string;
  doc?: string;
  models: Record<string, CatalogModel>;
};

export type Catalog = Record<string, CatalogProvider>;
export type ModelRef = { providerId: string; modelId: string };

type CacheFile = { fetchedAt: number; data: Catalog };

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseModel(raw: unknown): CatalogModel | null {
  if (!isObject(raw)) return null;
  if (typeof raw.id !== 'string' || typeof raw.name !== 'string') return null;
  return raw as unknown as CatalogModel;
}

function parseProvider(raw: unknown): CatalogProvider | null {
  if (!isObject(raw)) return null;
  if (
    typeof raw.id !== 'string' ||
    typeof raw.name !== 'string' ||
    !Array.isArray(raw.env)
  ) {
    return null;
  }
  if (!isObject(raw.models)) return null;
  const models: Record<string, CatalogModel> = {};
  for (const [k, v] of Object.entries(raw.models)) {
    const m = parseModel(v);
    if (m) models[k] = m;
  }
  return { ...(raw as unknown as CatalogProvider), models };
}

function parseCatalog(raw: unknown): Catalog {
  if (!isObject(raw)) throw new Error('catalog: root is not an object');
  const out: Catalog = {};
  for (const [k, v] of Object.entries(raw)) {
    const p = parseProvider(v);
    if (p) out[k] = p;
  }
  return out;
}

function readCache(): CacheFile | null {
  try {
    const raw = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')) as unknown;
    if (!isObject(raw)) return null;
    if (typeof raw.fetchedAt !== 'number') return null;
    const data = parseCatalog(raw.data);
    return { fetchedAt: raw.fetchedAt, data };
  } catch {
    return null;
  }
}

function writeCache(data: Catalog): void {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const payload: CacheFile = { fetchedAt: Date.now(), data };
  const tmp = `${CACHE_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(payload));
  fs.renameSync(tmp, CACHE_PATH);
}

async function fetchCatalog(signal?: AbortSignal): Promise<Catalog> {
  const res = await fetch(CATALOG_URL, signal ? { signal } : undefined);
  if (!res.ok) throw new Error(`models.dev ${res.status}`);
  const raw = (await res.json()) as unknown;
  return parseCatalog(raw);
}

export type LoadResult = { catalog: Catalog; stale: boolean; fromCache: boolean };

export async function loadCatalog(
  options: { forceRefresh?: boolean; signal?: AbortSignal } = {},
): Promise<LoadResult> {
  const cache = readCache();
  const fresh = cache !== null && Date.now() - cache.fetchedAt < TTL_MS;

  if (!options.forceRefresh && fresh && cache) {
    return { catalog: cache.data, stale: false, fromCache: true };
  }

  try {
    const data = await fetchCatalog(options.signal);
    writeCache(data);
    return { catalog: data, stale: false, fromCache: false };
  } catch (err) {
    if (cache) return { catalog: cache.data, stale: true, fromCache: true };
    throw err;
  }
}

export function findModel(
  catalog: Catalog,
  ref: ModelRef,
): CatalogModel | undefined {
  return catalog[ref.providerId]?.models[ref.modelId];
}

export function listAllModels(
  catalog: Catalog,
): Array<{ provider: CatalogProvider; model: CatalogModel }> {
  const out: Array<{ provider: CatalogProvider; model: CatalogModel }> = [];
  for (const provider of Object.values(catalog)) {
    for (const model of Object.values(provider.models)) {
      out.push({ provider, model });
    }
  }
  return out;
}
```

**Step 2 — verify**

```bash
npx tsc --noEmit
npx biome check src/catalog.ts
```

Expected: this file clean. Other files may still error.

**Step 3 — commit**

```bash
git add src/catalog.ts
git commit -q -m "catalog: validate models.dev response and write cache atomically"
```

---

## Task 5: Atomic writes + unknown-narrow in `config.ts` and `auth.ts`

**Files:**
- Modify: `src/config.ts`
- Modify: `src/auth.ts`

**Step 1 — rewrite `src/config.ts`**

```ts
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CONFIG_DIR = path.join(os.homedir(), '.config', 'jarvis');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

export type Config = {
  providerId?: string;
  modelId?: string;
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function loadConfig(): Config {
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) as unknown;
    if (!isObject(raw)) return {};
    const cfg: Config = {};
    if (typeof raw.providerId === 'string') cfg.providerId = raw.providerId;
    if (typeof raw.modelId === 'string') cfg.modelId = raw.modelId;
    return cfg;
  } catch {
    return {};
  }
}

export function saveConfig(config: Config): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  const tmp = `${CONFIG_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2));
  fs.renameSync(tmp, CONFIG_PATH);
}
```

**Step 2 — rewrite `src/auth.ts`**

```ts
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const AUTH_DIR = path.join(os.homedir(), '.config', 'jarvis');
const AUTH_PATH = path.join(AUTH_DIR, 'auth.json');

export type ApiKeyAuth = { type: 'api'; key: string };
export type OAuthAuth = {
  type: 'oauth';
  access: string;
  refresh?: string;
  expiresAt?: number;
};
export type AuthEntry = ApiKeyAuth | OAuthAuth;
export type AuthStore = Record<string, AuthEntry>;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseEntry(raw: unknown): AuthEntry | null {
  if (!isObject(raw)) return null;
  if (raw.type === 'api' && typeof raw.key === 'string') {
    return { type: 'api', key: raw.key };
  }
  if (raw.type === 'oauth' && typeof raw.access === 'string') {
    const out: OAuthAuth = { type: 'oauth', access: raw.access };
    if (typeof raw.refresh === 'string') out.refresh = raw.refresh;
    if (typeof raw.expiresAt === 'number') out.expiresAt = raw.expiresAt;
    return out;
  }
  return null;
}

function readStore(): AuthStore {
  try {
    const raw = JSON.parse(fs.readFileSync(AUTH_PATH, 'utf8')) as unknown;
    if (!isObject(raw)) return {};
    const out: AuthStore = {};
    for (const [k, v] of Object.entries(raw)) {
      const entry = parseEntry(v);
      if (entry) out[k] = entry;
    }
    return out;
  } catch {
    return {};
  }
}

function writeStore(store: AuthStore): void {
  fs.mkdirSync(AUTH_DIR, { recursive: true, mode: 0o700 });
  const tmp = `${AUTH_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, AUTH_PATH);
}

export function setAuth(providerId: string, entry: AuthEntry): void {
  const store = readStore();
  store[providerId] = entry;
  writeStore(store);
}

export function removeAuth(providerId: string): void {
  const store = readStore();
  delete store[providerId];
  writeStore(store);
}

export function getAuth(providerId: string): AuthEntry | undefined {
  return readStore()[providerId];
}

export function getAllAuth(): AuthStore {
  return readStore();
}

export function getApiKey(
  providerId: string,
  envKeys: string[],
): string | undefined {
  for (const env of envKeys) {
    const v = process.env[env];
    if (v) return v;
  }
  const entry = readStore()[providerId];
  if (entry?.type === 'api') return entry.key;
  return undefined;
}

export function isAuthenticated(providerId: string, envKeys: string[]): boolean {
  return Boolean(getApiKey(providerId, envKeys));
}
```

**Step 3 — verify**

```bash
npx tsc --noEmit src/config.ts src/auth.ts
npx biome check src/config.ts src/auth.ts
```

**Step 4 — commit**

```bash
git add src/config.ts src/auth.ts
git commit -q -m "config,auth: atomic writes and unknown-narrow on parse"
```

---

## Task 6: Type-safe provider registry

**Files:**
- Modify: `src/providers.ts`

**Step 1 — rewrite**

```ts
import type { LanguageModel } from 'ai';

export const PROVIDER_IDS = [
  'anthropic',
  'openai',
  'google',
  'openrouter',
  'groq',
  'xai',
  'ollama',
] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export class UnsupportedProviderError extends Error {
  readonly providerId: string;
  constructor(providerId: string) {
    super(`Unsupported provider: ${providerId}`);
    this.name = 'UnsupportedProviderError';
    this.providerId = providerId;
  }
}

type FactoryOpts = { apiKey?: string; baseURL?: string };
type ProviderFactory = (opts: FactoryOpts) => (modelId: string) => LanguageModel;

const FACTORIES: Record<ProviderId, () => Promise<ProviderFactory>> = {
  anthropic: async () => {
    const { createAnthropic } = await import('@ai-sdk/anthropic');
    return ({ apiKey }) => createAnthropic({ apiKey });
  },
  openai: async () => {
    const { createOpenAI } = await import('@ai-sdk/openai');
    return ({ apiKey }) => createOpenAI({ apiKey });
  },
  google: async () => {
    const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
    return ({ apiKey }) => createGoogleGenerativeAI({ apiKey });
  },
  openrouter: async () => {
    const { createOpenRouter } = await import('@openrouter/ai-sdk-provider');
    return ({ apiKey }) => {
      const p = createOpenRouter({ apiKey });
      return (id: string) => p.chat(id);
    };
  },
  groq: async () => {
    const { createGroq } = await import('@ai-sdk/groq');
    return ({ apiKey }) => createGroq({ apiKey });
  },
  xai: async () => {
    const { createXai } = await import('@ai-sdk/xai');
    return ({ apiKey }) => createXai({ apiKey });
  },
  ollama: async () => {
    const { createOllama } = await import('ollama-ai-provider-v2');
    return ({ baseURL }) =>
      createOllama({ baseURL: baseURL ?? 'http://localhost:11434/api' });
  },
};

export function isSupportedProvider(id: string): id is ProviderId {
  return (PROVIDER_IDS as readonly string[]).includes(id);
}

export function supportedProviderIds(): readonly ProviderId[] {
  return PROVIDER_IDS;
}

export async function resolveModel(opts: {
  providerId: string;
  modelId: string;
  apiKey?: string;
  baseURL?: string;
}): Promise<LanguageModel> {
  if (!isSupportedProvider(opts.providerId)) {
    throw new UnsupportedProviderError(opts.providerId);
  }
  const factory = await FACTORIES[opts.providerId]();
  const provider = factory({ apiKey: opts.apiKey, baseURL: opts.baseURL });
  return provider(opts.modelId);
}
```

**Step 2 — verify**

```bash
npx tsc --noEmit src/providers.ts
npx biome check src/providers.ts
```

**Step 3 — commit**

```bash
git add src/providers.ts
git commit -q -m "providers: type provider id union and add typed unsupported error"
```

---

## Task 7: Tighten `ai.ts`

**Files:**
- Modify: `src/ai.ts`

**Step 1 — rewrite**

```ts
import { streamText, type ModelMessage } from 'ai';
import { resolveModel } from './providers.js';
import { getApiKey } from './auth.js';
import type { CatalogProvider, ModelRef } from './catalog.js';

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export async function* streamChat(
  provider: CatalogProvider,
  ref: ModelRef,
  messages: ChatMessage[],
  signal?: AbortSignal,
): AsyncGenerator<string, void, void> {
  const apiKey = getApiKey(provider.id, provider.env);
  const model = await resolveModel({
    providerId: ref.providerId,
    modelId: ref.modelId,
    ...(apiKey ? { apiKey } : {}),
  });

  const modelMessages: ModelMessage[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const result = streamText({
    model,
    messages: modelMessages,
    ...(signal ? { abortSignal: signal } : {}),
  });

  for await (const chunk of result.textStream) {
    yield chunk;
  }
}
```

**Step 2 — verify full project compiles**

```bash
npm run typecheck
```

Expected: `app.tsx` may still error on `err: any` and on the picker phase access — that's Task 9. The other files should be clean.

**Step 3 — commit**

```bash
git add src/ai.ts
git commit -q -m "ai: tighten streamChat types and respect optional apiKey contract"
```

---

## Task 8: Extract banner and translate UI copy

**Files:**
- Create: `src/app/banner.tsx`
- Modify: `src/ui/bootstrap.tsx`
- Modify: `src/ui/auth-prompt.tsx`
- Modify: `src/ui/model-picker.tsx`

**Step 1 — create `src/app/banner.tsx`**

```tsx
import React from 'react';
import { Box, Text } from 'ink';

const LINES = [
  '     ██╗ █████╗ ██████╗ ██╗   ██╗██╗███████╗',
  '     ██║██╔══██╗██╔══██╗██║   ██║██║██╔════╝',
  '     ██║███████║██████╔╝██║   ██║██║███████╗',
  '██   ██║██╔══██║██╔══██╗╚██╗ ██╔╝██║╚════██║',
  '╚█████╔╝██║  ██║██║  ██║ ╚████╔╝ ██║███████║',
  ' ╚════╝ ╚═╝  ╚═╝╚═╝  ╚═╝  ╚═══╝  ╚═╝╚══════╝',
];

export function Banner(props: { subtitle?: React.ReactNode }) {
  return (
    <Box
      flexDirection="column"
      alignItems="center"
      borderStyle="round"
      borderColor="cyan"
      paddingX={2}
      paddingY={1}
    >
      {LINES.map((line) => (
        <Text key={line} color="cyan" bold>
          {line}
        </Text>
      ))}
      {props.subtitle ? <Box marginTop={1}>{props.subtitle}</Box> : null}
    </Box>
  );
}
```

**Step 2 — rewrite `src/ui/bootstrap.tsx`**

```tsx
import React from 'react';
import { Box, Text } from 'ink';
import { Banner } from '../app/banner.js';

export function Bootstrap(props: { status: string; error?: string | null }) {
  return (
    <Box flexDirection="column" padding={1}>
      <Banner subtitle={<Text dimColor>The Trader v0.1</Text>} />
      <Box marginTop={1}>
        {props.error ? (
          <Text color="red">✗ {props.error}</Text>
        ) : (
          <Text color="cyan">⏳ {props.status}</Text>
        )}
      </Box>
    </Box>
  );
}
```

**Step 3 — translate `src/ui/auth-prompt.tsx`**

Find and replace within the file:

| Turkish | English |
|---|---|
| `api key gerekli` | `requires an API key` |
| `boş olamaz` | `cannot be empty` |
| `enter kaydet · esc iptal · ~/.config/jarvis/auth.json (0600)` | `enter saves · esc cancels · stored at ~/.config/jarvis/auth.json (0600)` |
| `Env: ` | `Env: ` (unchanged) |
| `Docs: ` | `Docs: ` (unchanged) |
| `key: ` | `key: ` (unchanged) |
| `(yok)` | `(none)` |

Also: replace the heading line so it reads `{provider.name} requires an API key`.

**Step 4 — translate `src/ui/model-picker.tsx`**

| Turkish | English |
|---|---|
| `select model` | `select model` (unchanged) |
| `search: ` | `search: ` (unchanged) |
| `filter...` | `filter...` (unchanged) |
| `(eşleşen model yok)` | `(no matching models)` |
| `↑↓ gez · pgup/pgdn · enter seç · esc iptal · yaz ile filtrele` | `↑↓ navigate · pgup/pgdn · enter select · esc cancel · type to filter` |

Also add the cursor reset (Task 11 covers logic; here only the strings).

**Step 5 — verify**

```bash
npm run typecheck
npx biome check src/ui src/app/banner.tsx
```

**Step 6 — commit**

```bash
git add src/app/banner.tsx src/ui
git commit -q -m "ui: extract banner and translate user-facing copy to english"
```

---

## Task 9: Extract `chat-view` and `useChat`, slim down `app.tsx`

**Files:**
- Create: `src/app/use-chat.ts`
- Create: `src/app/chat-view.tsx`
- Modify: `src/app.tsx`

**Step 1 — create `src/app/use-chat.ts`**

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { streamChat, type ChatMessage } from '../ai.js';
import type { CatalogProvider, ModelRef } from '../catalog.js';
import { errorMessage, isAbortError } from '../errors.js';

export type ChatRow = {
  role: 'user' | 'assistant';
  content: string;
  error?: boolean;
};

export type SubmitOutcome = 'sent' | 'empty' | 'busy' | 'no-model';

export function useChat(target: { provider: CatalogProvider; ref: ModelRef } | null) {
  const [messages, setMessages] = useState<ChatRow[]>([]);
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clear = useCallback(() => setMessages([]), []);

  const send = useCallback(
    async (text: string): Promise<SubmitOutcome> => {
      const trimmed = text.trim();
      if (!trimmed) return 'empty';
      if (streaming) return 'busy';
      if (!target) return 'no-model';

      const userMsg: ChatRow = { role: 'user', content: trimmed };
      const history = [...messages, userMsg];
      setMessages([...history, { role: 'assistant', content: '' }]);
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const wire: ChatMessage[] = history.map((m) => ({
          role: m.role,
          content: m.content,
        }));
        let acc = '';
        for await (const chunk of streamChat(
          target.provider,
          target.ref,
          wire,
          controller.signal,
        )) {
          acc += chunk;
          setMessages((prev) => {
            const copy = [...prev];
            copy[copy.length - 1] = { role: 'assistant', content: acc };
            return copy;
          });
        }
      } catch (err: unknown) {
        const aborted = isAbortError(err);
        const text = aborted ? '(canceled)' : `Error: ${errorMessage(err)}`;
        setMessages((prev) => {
          const copy = [...prev];
          const row: ChatRow = { role: 'assistant', content: text };
          if (!aborted) row.error = true;
          copy[copy.length - 1] = row;
          return copy;
        });
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
      return 'sent';
    },
    [messages, streaming, target],
  );

  return { messages, streaming, send, clear, cancel };
}
```

**Step 2 — create `src/app/chat-view.tsx`**

```tsx
import React from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import { Banner } from './banner.js';
import type { ChatRow } from './use-chat.js';

export type ChatFocus = 'input' | 'tools-bar' | 'tools-panel';

export function ChatView(props: {
  modelLabel: string;
  messages: ChatRow[];
  streaming: boolean;
  input: string;
  onInputChange: (v: string) => void;
  onSubmit: (v: string) => void;
  focus: ChatFocus;
  exitWarning: boolean;
}) {
  const { modelLabel, messages, streaming, input, focus, exitWarning } = props;
  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Banner
          subtitle={
            <Box>
              <Text dimColor>The Trader v0.1 · </Text>
              <Text color="magenta">{modelLabel}</Text>
            </Box>
          }
        />
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        {messages.length === 0 && (
          <Text dimColor>
            Type a message and press enter · /model select model · /clear reset
          </Text>
        )}
        {messages.map((msg, i) => (
          <Box key={i} flexDirection="column" marginBottom={1}>
            <Text color={msg.role === 'user' ? 'green' : 'magenta'} bold>
              {msg.role === 'user' ? '› you' : '‹ jarvis'}
            </Text>
            <Text color={msg.error ? 'red' : undefined}>
              {msg.content || (streaming && i === messages.length - 1 ? '…' : '')}
            </Text>
          </Box>
        ))}
      </Box>

      <Box flexDirection="column">
        <Box
          borderStyle="round"
          borderColor={focus === 'input' && input.length > 0 ? 'cyan' : 'gray'}
          paddingX={1}
        >
          <Text color="cyan" bold>{'$ '}</Text>
          <Box flexGrow={1}>
            {focus === 'input' && !streaming ? (
              <TextInput
                value={input}
                onChange={props.onInputChange}
                onSubmit={props.onSubmit}
                placeholder="ask jarvis anything... (/model, /clear)"
                showCursor
              />
            ) : (
              <Text dimColor>
                {streaming
                  ? 'jarvis is typing... (ctrl+c to cancel)'
                  : input || 'ask jarvis anything...'}
              </Text>
            )}
          </Box>
        </Box>

        <Box paddingX={2} justifyContent="space-between">
          <Box>
            <Text
              color={focus === 'tools-bar' ? 'cyan' : undefined}
              dimColor={focus !== 'tools-bar'}
              inverse={focus === 'tools-bar'}
            >
              {focus === 'tools-bar' ? ' tools ' : 'tools'}
            </Text>
            <Text dimColor>
              {focus === 'input'
                ? '  (↓ to focus)'
                : focus === 'tools-bar'
                  ? '  (enter to open · esc to close)'
                  : ''}
            </Text>
          </Box>
          {exitWarning ? (
            <Text color="yellow">press ctrl+c again to exit</Text>
          ) : (
            <Text dimColor>/model · ctrl+c to exit</Text>
          )}
        </Box>

        {focus === 'tools-panel' && (
          <Box
            flexDirection="column"
            borderStyle="round"
            borderColor="cyan"
            paddingX={1}
            paddingY={1}
            marginTop={1}
          >
            <Text color="cyan" bold>tools</Text>
            <Box marginTop={1}>
              <Text dimColor>no tools yet — coming soon...</Text>
            </Box>
            <Box marginTop={1}>
              <Text dimColor>esc to close</Text>
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}
```

**Step 3 — rewrite `src/app.tsx`**

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { useApp, useInput } from 'ink';
import { loadConfig, saveConfig, type Config } from './config.js';
import { loadCatalog, findModel, type Catalog, type ModelRef } from './catalog.js';
import { isAuthenticated } from './auth.js';
import { errorMessage } from './errors.js';
import { ModelPicker } from './ui/model-picker.js';
import { AuthPrompt } from './ui/auth-prompt.js';
import { Bootstrap } from './ui/bootstrap.js';
import { ChatView, type ChatFocus } from './app/chat-view.js';
import { useChat } from './app/use-chat.js';

type Phase =
  | { kind: 'bootstrap'; status: string; error?: string | null }
  | { kind: 'picker' }
  | { kind: 'auth'; providerId: string }
  | { kind: 'chat' };

export function App() {
  const { exit } = useApp();
  const [phase, setPhase] = useState<Phase>({
    kind: 'bootstrap',
    status: 'loading catalog...',
  });
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [config, setConfig] = useState<Config>(() => loadConfig());
  const [input, setInput] = useState('');
  const [focus, setFocus] = useState<ChatFocus>('input');
  const [exitWarning, setExitWarning] = useState(false);
  const warningTimer = useRef<NodeJS.Timeout | null>(null);

  const provider =
    catalog && config.providerId ? catalog[config.providerId] : undefined;
  const target =
    provider && config.providerId && config.modelId
      ? {
          provider,
          ref: { providerId: config.providerId, modelId: config.modelId },
        }
      : null;

  const chat = useChat(target);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { catalog: cat } = await loadCatalog();
        if (cancelled) return;
        setCatalog(cat);
        const ref: ModelRef | null =
          config.providerId && config.modelId
            ? { providerId: config.providerId, modelId: config.modelId }
            : null;
        const model = ref ? findModel(cat, ref) : undefined;
        const prov = ref ? cat[ref.providerId] : undefined;
        const authed = prov ? isAuthenticated(prov.id, prov.env) : false;
        setPhase(model && authed ? { kind: 'chat' } : { kind: 'picker' });
      } catch (err: unknown) {
        if (cancelled) return;
        setPhase({
          kind: 'bootstrap',
          status: '',
          error: `failed to load catalog: ${errorMessage(err)}`,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useInput((ch, key) => {
    if (key.ctrl && ch === 'c') {
      if (chat.streaming) {
        chat.cancel();
        return;
      }
      if (exitWarning) {
        exit();
        return;
      }
      setExitWarning(true);
      if (warningTimer.current) clearTimeout(warningTimer.current);
      warningTimer.current = setTimeout(() => setExitWarning(false), 2000);
      return;
    }
    if (phase.kind !== 'chat') return;
    if (focus === 'input' && key.downArrow) {
      setFocus('tools-bar');
      return;
    }
    if (focus === 'tools-bar') {
      if (key.upArrow || key.escape) setFocus('input');
      else if (key.return) setFocus('tools-panel');
      return;
    }
    if (focus === 'tools-panel' && key.escape) setFocus('tools-bar');
  });

  useEffect(() => {
    return () => {
      if (warningTimer.current) clearTimeout(warningTimer.current);
    };
  }, []);

  const handleSubmit = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (trimmed === '/model') {
      setInput('');
      setPhase({ kind: 'picker' });
      return;
    }
    if (trimmed === '/clear') {
      chat.clear();
      setInput('');
      return;
    }
    if (trimmed === '/exit' || trimmed === '/quit') {
      exit();
      return;
    }
    setInput('');
    void chat.send(trimmed);
  };

  if (phase.kind === 'bootstrap') {
    return <Bootstrap status={phase.status} error={phase.error ?? null} />;
  }

  if (phase.kind === 'picker' && catalog) {
    return (
      <ModelPicker
        catalog={catalog}
        current={
          config.providerId && config.modelId
            ? { providerId: config.providerId, modelId: config.modelId }
            : undefined
        }
        onCancel={() => {
          if (config.providerId && config.modelId) setPhase({ kind: 'chat' });
        }}
        onPick={(ref, authed) => {
          const next: Config = { providerId: ref.providerId, modelId: ref.modelId };
          setConfig(next);
          saveConfig(next);
          setPhase(authed ? { kind: 'chat' } : { kind: 'auth', providerId: ref.providerId });
        }}
      />
    );
  }

  if (phase.kind === 'auth' && catalog) {
    const prov = catalog[phase.providerId];
    if (!prov) {
      setPhase({ kind: 'picker' });
      return null;
    }
    return (
      <AuthPrompt
        provider={prov}
        onCancel={() => setPhase({ kind: 'picker' })}
        onDone={() => setPhase({ kind: 'chat' })}
      />
    );
  }

  if (!catalog || !target) {
    return <Bootstrap status="..." />;
  }

  const modelLabel = `${target.ref.providerId}/${target.ref.modelId}`;

  return (
    <ChatView
      modelLabel={modelLabel}
      messages={chat.messages}
      streaming={chat.streaming}
      input={input}
      onInputChange={setInput}
      onSubmit={handleSubmit}
      focus={focus}
      exitWarning={exitWarning}
    />
  );
}
```

**Step 4 — verify**

```bash
npm run check
wc -l src/app.tsx src/app/*.{ts,tsx}
```

Expected: `npm run check` clean. `app.tsx` < 200 lines, every other file < 200 lines.

**Step 5 — manual smoke**

```bash
npm run dev
```

Walk through every flow in `CLAUDE.md` §8. Confirm no behavior regression.

**Step 6 — commit**

```bash
git add src/app.tsx src/app
git commit -q -m "app: extract chat-view component and use-chat hook"
```

---

## Task 10: Harden `cli.tsx` with full signal coverage

**Files:**
- Modify: `src/cli.tsx`

**Step 1 — rewrite**

```tsx
#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import fs from 'node:fs';
import process from 'node:process';
import { App } from './app.js';

const ENTER_ALT = '\x1b[?1049h\x1b[2J\x1b[H';
const LEAVE_ALT = '\x1b[?1049l';

let restored = false;
function restoreScreen(): void {
  if (restored) return;
  restored = true;
  try {
    process.stdout.write(LEAVE_ALT);
  } catch {
    // best-effort: stdout may already be closed
  }
}

function fatal(prefix: string, err: unknown): void {
  const msg =
    err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
  try {
    fs.writeSync(process.stderr.fd, `[jarvis] ${prefix}: ${msg}\n`);
  } catch {
    // ignore
  }
}

if (!process.stdout.isTTY) {
  process.stderr.write('jarvis requires an interactive terminal (TTY).\n');
  process.exit(1);
}

process.stdout.write(ENTER_ALT);

process.on('exit', restoreScreen);

for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.on(sig, () => {
    restoreScreen();
    process.exit(128 + (sig === 'SIGINT' ? 2 : sig === 'SIGTERM' ? 15 : 1));
  });
}

process.on('uncaughtException', (err) => {
  restoreScreen();
  fatal('uncaught exception', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  restoreScreen();
  fatal('unhandled rejection', reason);
  process.exit(1);
});

const app = render(<App />, { exitOnCtrlC: false });

app.waitUntilExit().finally(restoreScreen);
```

**Step 2 — verify**

```bash
npm run check
npm run build
node --input-type=module -e "import('./dist/cli.js').then(()=>process.exit(0))" 2>&1 | head -3
```

Expected: build clean. The `import()` test exits because `isTTY` is false in piped node — that's the new guard working. Confirm message reads `jarvis requires an interactive terminal`.

**Step 3 — manual crash test**

In one terminal:

```bash
npm run dev
```

In another terminal:

```bash
pkill -TERM -f "tsx src/cli.tsx"
```

Confirm the first terminal returns to normal screen (alt-screen restored). Repeat with `-INT` and `-HUP`.

**Step 4 — commit**

```bash
git add src/cli.tsx
git commit -q -m "cli: install signal handlers and restore alt-screen on every exit"
```

---

## Task 11: Reset model picker cursor on query change

**Files:**
- Modify: `src/ui/model-picker.tsx`

**Step 1 — add a `useEffect` to reset cursor**

Inside the `ModelPicker` component, after the existing `useState`/`useMemo` block, add:

```tsx
useEffect(() => {
  setCursor(0);
}, [query]);
```

Add the import: `import React, { useEffect, useMemo, useState } from 'react';`

**Step 2 — verify**

```bash
npm run check
npm run dev
```

In the picker, type a few characters into the search field and confirm the highlight returns to the first result instead of staying on a filtered-out row.

**Step 3 — commit**

```bash
git add src/ui/model-picker.tsx
git commit -q -m "picker: reset cursor when search query changes"
```

---

## Task 12: Refresh `CLAUDE.md` to match new layout

**Files:**
- Modify: `CLAUDE.md`

**Step 1 — apply edits**

In §8 doğrulama tablosu, add a row:

| `npm run check` | Her commit öncesi zorunlu (typecheck + biome). |

In §11, replace the diagram block with:

```
cli.tsx              → render bootstrap, alt-screen + signal cleanup
 └─ app.tsx          → phase routing, top-level useInput, command dispatch
     ├─ app/
     │   ├─ chat-view.tsx → presentation
     │   ├─ use-chat.ts   → streaming hook + abort
     │   └─ banner.tsx    → ASCII logo
     ├─ ai.ts         → streaming soyutlaması
     ├─ providers.ts  → ProviderId union + factories
     ├─ catalog.ts    → models.dev cache + runtime guard
     ├─ config.ts     → user config (atomic write)
     ├─ auth.ts       → api key store (atomic write, 0600)
     └─ errors.ts     → isAbortError, errorMessage
```

In §12, replace the lint bullet:

> Lint/format: **Biome 2.x kurulu**. `npm run check` (biome + tsc) zorunlu doğrulama adımı.

**Step 2 — verify**

```bash
npm run check
```

**Step 3 — commit**

```bash
git add CLAUDE.md
git commit -q -m "docs: refresh CLAUDE.md to match new layout and tooling"
```

---

## Final Verification

```bash
npm run check
npm run build
node --input-type=module -e "import('./dist/cli.js').catch(e=>{console.error(e);process.exit(1)})" 2>&1 | head -3
wc -l src/**/*.{ts,tsx}
git log --oneline
```

Expected:
- `npm run check` green
- `npm run build` clean
- `import()` test exits with the `requires an interactive terminal` message
- No file > 300 lines
- ~13 commits in the log, each atomic and domain-scoped

Then run `npm run dev` and walk through the full §8 matrix one final time.

---

## Done Criteria

- [ ] All 13 tasks committed.
- [ ] `npm run check` green.
- [ ] No file over 300 lines.
- [ ] No `any` in source.
- [ ] All UI strings English.
- [ ] Crash + SIGTERM + SIGHUP all restore the alt-screen buffer.
- [ ] Behavior matrix in CLAUDE.md §8 + new crash row pass manually.
- [ ] CLAUDE.md updated; no stale references.
