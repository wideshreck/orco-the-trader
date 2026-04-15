# ORCO Tool Framework v1 — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a native tool-calling framework: registry, three-tier permission system with disk-persisted "always allow", multi-step `streamText` integration, terminal UI for tool calls and approval prompts, plus `/help` and `/tools` commands.

**Architecture:** New `src/tools/` package owns tool definitions, registry, and approval persistence. `ai.ts` switches from `textStream` to `fullStream`, builds AI SDK tools from the registry, and yields a typed `StreamEvent` union (text + tool-call + tool-result + tool-error + approval-request). UI consumes the event stream into a discriminated `ChatRow` union and renders mixed text/tool timelines plus an approval prompt that pauses the input.

**Tech Stack:** Node 20+ ESM, React 18, Ink 5, AI SDK v6 (`streamText` with `fullStream` + `tools` + `stopWhen`), zod 3.x, TypeScript 5.x strict+, Biome 2.3.

**Reference:** `docs/plans/2026-04-15-tools-design.md`

---

## Pre-flight

- Working directory: `/home/orcun/projects/jarvis-the-trader`
- Branch: `main`. Base: commit `058caa8` (design doc).
- `npm run check` must be GREEN before each commit. No exceptions.
- Manual smoke required after Tasks 7, 12, 13, 14 (anything UI-touching).
- Zod is the ONLY new dependency for this sprint.

---

## Task 1: Add zod and define core types

**Files:**
- Modify: `package.json` (add `zod`)
- Create: `src/tools/types.ts`

**Step 1 — install zod**
```bash
cd /home/orcun/projects/jarvis-the-trader
npm install zod@^3.23.8 --save-exact
```

**Step 2 — write `src/tools/types.ts`**
```ts
import type { ZodType } from 'zod';

export type Permission = 'auto' | 'ask' | 'deny';

export type ToolContext = {
  toolCallId: string;
  abortSignal: AbortSignal;
};

export type OrcoTool<I = unknown, O = unknown> = {
  name: string;
  description: string;
  permission: Permission;
  inputSchema: ZodType<I>;
  execute: (input: I, ctx: ToolContext) => Promise<O>;
};

export type ApprovalRequest = {
  toolCallId: string;
  toolName: string;
  input: unknown;
};

export type ApprovalDecision = 'allow' | 'deny' | 'always';

export type StreamEvent =
  | { type: 'text-delta'; delta: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown }
  | { type: 'tool-result'; toolCallId: string; toolName: string; output: unknown }
  | { type: 'tool-error'; toolCallId: string; toolName: string; error: string }
  | { type: 'approval-request'; toolCallId: string; toolName: string; input: unknown };

export type Approver = (req: ApprovalRequest) => Promise<ApprovalDecision>;
```

**Step 3 — verify**
```bash
npm run check
```
Expected: clean (or biome auto-format suggestion — apply with `npx biome check --write src/tools/types.ts`).

**Step 4 — commit**
```bash
git add package.json package-lock.json src/tools/types.ts
git commit -q -m "tools: add zod and core type definitions"
```

---

## Task 2: `defineTool()` helper

**Files:**
- Create: `src/tools/define.ts`

**Step 1 — write file**
```ts
import type { ZodType } from 'zod';
import type { OrcoTool, Permission, ToolContext } from './types.js';

const NAME_RE = /^[a-z][a-z0-9_]*$/;

type DefineToolInput<I, O> = {
  name: string;
  description: string;
  permission?: Permission;
  inputSchema: ZodType<I>;
  execute: (input: I, ctx: ToolContext) => Promise<O>;
};

export function defineTool<I, O>(spec: DefineToolInput<I, O>): OrcoTool<I, O> {
  if (!NAME_RE.test(spec.name)) {
    throw new Error(`tool name must match ${NAME_RE}: got "${spec.name}"`);
  }
  return {
    name: spec.name,
    description: spec.description,
    permission: spec.permission ?? 'ask',
    inputSchema: spec.inputSchema,
    execute: spec.execute,
  };
}
```

**Step 2 — verify**
```bash
npm run check
```

**Step 3 — commit**
```bash
git add src/tools/define.ts
git commit -q -m "tools: defineTool helper with name validation and ask default"
```

---

## Task 3: Approvals persistence

**Files:**
- Create: `src/tools/approvals.ts`

**Step 1 — write file**
```ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APPROVALS_DIR = path.join(os.homedir(), '.config', 'orco');
const APPROVALS_PATH = path.join(APPROVALS_DIR, 'approvals.json');

type Persisted = {
  always: Record<string, boolean>;
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function read(): Persisted {
  try {
    const raw = JSON.parse(fs.readFileSync(APPROVALS_PATH, 'utf8')) as unknown;
    if (!isObject(raw) || !isObject(raw.always)) return { always: {} };
    const always: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(raw.always)) {
      if (typeof v === 'boolean') always[k] = v;
    }
    return { always };
  } catch {
    return { always: {} };
  }
}

function write(data: Persisted): void {
  fs.mkdirSync(APPROVALS_DIR, { recursive: true });
  const tmp = `${APPROVALS_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, APPROVALS_PATH);
}

export function isAlwaysAllowed(toolName: string): boolean {
  return read().always[toolName] === true;
}

export function setAlwaysAllowed(toolName: string): void {
  const data = read();
  data.always[toolName] = true;
  write(data);
}

export function listAlwaysAllowed(): string[] {
  return Object.keys(read().always).filter((k) => read().always[k] === true);
}

export function forgetAlwaysAllowed(toolName: string): void {
  const data = read();
  delete data.always[toolName];
  write(data);
}
```

**Step 2 — verify**
```bash
npm run check
```

**Step 3 — commit**
```bash
git add src/tools/approvals.ts
git commit -q -m "tools: persistent always-allow approvals at ~/.config/orco/approvals.json"
```

---

## Task 4: Registry

**Files:**
- Create: `src/tools/registry.ts`

**Step 1 — write file**
```ts
import { tool as aiTool, type ToolSet } from 'ai';
import { isAlwaysAllowed } from './approvals.js';
import type { Approver, OrcoTool } from './types.js';

const REGISTRY = new Map<string, OrcoTool<unknown, unknown>>();

export function register(tool: OrcoTool<unknown, unknown>): void {
  if (REGISTRY.has(tool.name)) {
    throw new Error(`tool already registered: ${tool.name}`);
  }
  REGISTRY.set(tool.name, tool);
}

export function listAll(): OrcoTool<unknown, unknown>[] {
  return [...REGISTRY.values()];
}

export function listActive(): OrcoTool<unknown, unknown>[] {
  return listAll().filter((t) => t.permission !== 'deny');
}

export function get(name: string): OrcoTool<unknown, unknown> | undefined {
  return REGISTRY.get(name);
}

export function buildAiSdkTools(opts: {
  approver: Approver;
  signal: AbortSignal | undefined;
}): ToolSet {
  const out: ToolSet = {};
  for (const t of listActive()) {
    out[t.name] = aiTool({
      description: t.description,
      inputSchema: t.inputSchema,
      execute: async (rawInput, callCtx) => {
        const parsed = t.inputSchema.safeParse(rawInput);
        if (!parsed.success) {
          throw new Error(`invalid input: ${parsed.error.message}`);
        }
        const needsApproval = t.permission === 'ask' && !isAlwaysAllowed(t.name);
        if (needsApproval) {
          const decision = await opts.approver({
            toolCallId: callCtx.toolCallId,
            toolName: t.name,
            input: parsed.data,
          });
          if (decision === 'deny') {
            throw new Error('denied by user');
          }
        }
        return t.execute(parsed.data, {
          toolCallId: callCtx.toolCallId,
          abortSignal: opts.signal ?? callCtx.abortSignal,
        });
      },
    });
  }
  return out;
}

export function clearForTesting(): void {
  REGISTRY.clear();
}
```

**Step 2 — verify**
```bash
npm run check
```
Note: `ToolSet` import from `ai` should resolve. If TS complains about index signature, we may need to use `Record<string, ReturnType<typeof aiTool>>` instead — try that as fallback.

**Step 3 — commit**
```bash
git add src/tools/registry.ts
git commit -q -m "tools: registry with ai-sdk adapter and approval gating"
```

---

## Task 5: Builtin demo tools

**Files:**
- Create: `src/tools/builtin/get-time.ts`
- Create: `src/tools/builtin/echo.ts`

**Step 1 — write `src/tools/builtin/get-time.ts`**
```ts
import { z } from 'zod';
import { defineTool } from '../define.js';

export const getTime = defineTool({
  name: 'get_time',
  description:
    'Returns the current time in ISO 8601 format. Optionally accepts an IANA timezone name to format the result in that zone.',
  permission: 'auto',
  inputSchema: z.object({
    tz: z
      .string()
      .optional()
      .describe('IANA timezone name, e.g. "Europe/Istanbul" or "America/New_York"'),
  }),
  async execute(input) {
    const now = new Date();
    if (!input.tz) return { iso: now.toISOString() };
    try {
      const formatted = new Intl.DateTimeFormat('en-CA', {
        timeZone: input.tz,
        dateStyle: 'short',
        timeStyle: 'long',
      }).format(now);
      return { iso: now.toISOString(), formatted, tz: input.tz };
    } catch (err) {
      throw new Error(`invalid timezone: ${input.tz}`);
    }
  },
});
```

**Step 2 — write `src/tools/builtin/echo.ts`**
```ts
import { z } from 'zod';
import { defineTool } from '../define.js';

export const echo = defineTool({
  name: 'echo',
  description: 'Echoes the input text back. Useful for testing tool wiring.',
  permission: 'auto',
  inputSchema: z.object({
    text: z.string().describe('Text to echo back'),
  }),
  async execute(input) {
    return { echo: input.text };
  },
});
```

**Step 3 — verify**
```bash
npm run check
```

**Step 4 — commit**
```bash
git add src/tools/builtin
git commit -q -m "tools: add get_time and echo builtin demo tools"
```

---

## Task 6: Public tools index

**Files:**
- Create: `src/tools/index.ts`

**Step 1 — write file**
```ts
import { echo } from './builtin/echo.js';
import { getTime } from './builtin/get-time.js';
import { register } from './registry.js';

let bootstrapped = false;

export function bootstrapTools(): void {
  if (bootstrapped) return;
  bootstrapped = true;
  register(getTime);
  register(echo);
}

export { defineTool } from './define.js';
export {
  forgetAlwaysAllowed,
  isAlwaysAllowed,
  listAlwaysAllowed,
  setAlwaysAllowed,
} from './approvals.js';
export { buildAiSdkTools, get, listActive, listAll } from './registry.js';
export type {
  ApprovalDecision,
  ApprovalRequest,
  Approver,
  OrcoTool,
  Permission,
  StreamEvent,
  ToolContext,
} from './types.js';
```

**Step 2 — verify**
```bash
npm run check
```

**Step 3 — commit**
```bash
git add src/tools/index.ts
git commit -q -m "tools: public index with bootstrap and re-exports"
```

---

## Task 7: Rewrite `ai.ts` with fullStream + tools + approval bridge

**Files:**
- Modify: `src/ai.ts`

**Step 1 — replace `src/ai.ts` entirely**
```ts
import { type ModelMessage, stepCountIs, streamText } from 'ai';
import { getApiKey } from './auth.js';
import type { CatalogProvider, ModelRef } from './catalog.js';
import { resolveModel } from './providers.js';
import { bootstrapTools, buildAiSdkTools } from './tools/index.js';
import type { Approver, StreamEvent } from './tools/index.js';

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type StreamOptions = {
  signal?: AbortSignal;
  approver: Approver;
};

bootstrapTools();

export async function* streamChat(
  provider: CatalogProvider,
  ref: ModelRef,
  messages: ChatMessage[],
  opts: StreamOptions,
): AsyncGenerator<StreamEvent, void, void> {
  const apiKey = getApiKey(provider.id, provider.env);
  const model = await resolveModel({
    providerId: ref.providerId,
    modelId: ref.modelId,
    ...(apiKey !== undefined ? { apiKey } : {}),
  });

  const modelMessages: ModelMessage[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const tools = buildAiSdkTools({ approver: wrapApprover(opts.approver), signal: opts.signal });

  const result = streamText({
    model,
    messages: modelMessages,
    tools,
    stopWhen: stepCountIs(20),
    ...(opts.signal ? { abortSignal: opts.signal } : {}),
  });

  for await (const part of result.fullStream) {
    switch (part.type) {
      case 'text-delta':
        yield { type: 'text-delta', delta: part.text };
        break;
      case 'tool-call':
        yield {
          type: 'tool-call',
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          input: part.input,
        };
        break;
      case 'tool-result':
        yield {
          type: 'tool-result',
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          output: part.output,
        };
        break;
      case 'tool-error':
        yield {
          type: 'tool-error',
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          error: errorString(part.error),
        };
        break;
      // text-start, text-end, reasoning, finish, start-step, finish-step, etc — ignored
    }
  }
}

// The approver passed in is called from inside tool execute(). It's the bridge
// to the UI: tool execution awaits it; UI emits an approval-request event and
// resolves the promise when the user picks. See use-chat.ts.
function wrapApprover(approver: Approver): Approver {
  return approver;
}

function errorString(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return String(err);
}
```

**Step 2 — verify**
```bash
npm run check
```
Expected fixes: TS may complain about `part.text` vs `part.delta` — check AI SDK v6 type. If `text-delta` chunk uses `delta` field instead of `text`, swap accordingly. Same for any other field-name mismatch.

If `ToolSet` import in registry.ts breaks, change to `Record<string, ReturnType<typeof aiTool>>` in `buildAiSdkTools` return type and re-run check.

**Step 3 — commit**
```bash
git add src/ai.ts
git commit -q -m "ai: switch to fullStream and emit typed StreamEvent union"
```

---

## Task 8: Approval queue hook

**Files:**
- Create: `src/app/use-approval.ts`

**Step 1 — write file**
```ts
import { useCallback, useRef, useState } from 'react';
import type { ApprovalDecision, ApprovalRequest, Approver } from '../tools/index.js';

type Pending = ApprovalRequest & { resolve: (d: ApprovalDecision) => void };

export function useApproval(): {
  pending: ApprovalRequest | null;
  approver: Approver;
  resolve: (decision: ApprovalDecision) => void;
} {
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);

  const approver = useCallback<Approver>(async (req) => {
    return new Promise<ApprovalDecision>((resolve) => {
      const entry: Pending = { ...req, resolve };
      pendingRef.current = entry;
      setPending(entry);
    });
  }, []);

  const resolve = useCallback((decision: ApprovalDecision) => {
    const entry = pendingRef.current;
    if (!entry) return;
    pendingRef.current = null;
    setPending(null);
    entry.resolve(decision);
  }, []);

  return {
    pending: pending ? { toolCallId: pending.toolCallId, toolName: pending.toolName, input: pending.input } : null,
    approver,
    resolve,
  };
}
```

**Step 2 — verify**
```bash
npm run check
```

**Step 3 — commit**
```bash
git add src/app/use-approval.ts
git commit -q -m "app: useApproval hook bridging tool execute to UI"
```

---

## Task 9: Rewrite `use-chat.ts` for StreamEvent + ChatRow union

**Files:**
- Modify: `src/app/use-chat.ts`

**Step 1 — replace file**
```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { type ChatMessage, streamChat } from '../ai.js';
import type { CatalogProvider, ModelRef } from '../catalog.js';
import { errorMessage, isAbortError } from '../errors.js';
import type { Approver } from '../tools/index.js';

export type UserRow = { id: number; kind: 'user'; content: string };
export type AssistantRow = {
  id: number;
  kind: 'assistant';
  content: string;
  error?: boolean;
};
export type ToolRow = {
  id: number;
  kind: 'tool';
  toolCallId: string;
  name: string;
  input: unknown;
  output?: unknown;
  error?: string;
  status: 'pending' | 'awaiting-approval' | 'done' | 'error' | 'denied';
};
export type ChatRow = UserRow | AssistantRow | ToolRow;

export type SubmitOutcome = 'sent' | 'empty' | 'busy' | 'no-model';

type Target = { provider: CatalogProvider; ref: ModelRef };

export function useChat(target: Target | null, approver: Approver) {
  const [messages, setMessages] = useState<ChatRow[]>([]);
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const idRef = useRef(0);
  const nextId = useCallback(() => ++idRef.current, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  const cancel = useCallback(() => abortRef.current?.abort(), []);
  const clear = useCallback(() => setMessages([]), []);

  const send = useCallback(
    async (text: string): Promise<SubmitOutcome> => {
      const trimmed = text.trim();
      if (!trimmed) return 'empty';
      if (streaming) return 'busy';
      if (!target) return 'no-model';

      const userMsg: UserRow = { id: nextId(), kind: 'user', content: trimmed };
      const assistantId = nextId();
      const initialAssistant: AssistantRow = { id: assistantId, kind: 'assistant', content: '' };
      const baseHistory = [...messages, userMsg];
      setMessages([...baseHistory, initialAssistant]);
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      let assistantAcc = '';
      let activeAssistantId = assistantId;

      const wire: ChatMessage[] = baseHistory
        .filter((m): m is UserRow | AssistantRow => m.kind === 'user' || m.kind === 'assistant')
        .map((m) => ({ role: m.kind, content: m.content }));

      try {
        for await (const ev of streamChat(target.provider, target.ref, wire, {
          signal: controller.signal,
          approver,
        })) {
          switch (ev.type) {
            case 'text-delta': {
              assistantAcc += ev.delta;
              const captured = assistantAcc;
              setMessages((prev) => updateRow(prev, activeAssistantId, (r) =>
                r.kind === 'assistant' ? { ...r, content: captured } : r,
              ));
              break;
            }
            case 'tool-call': {
              const row: ToolRow = {
                id: nextId(),
                kind: 'tool',
                toolCallId: ev.toolCallId,
                name: ev.toolName,
                input: ev.input,
                status: 'pending',
              };
              setMessages((prev) => [...prev, row]);
              // After a tool call, model will emit more text in a new step.
              // Pre-allocate the next assistant row so subsequent text-deltas have a target.
              const newAssistantId = nextId();
              activeAssistantId = newAssistantId;
              assistantAcc = '';
              setMessages((prev) => [
                ...prev,
                { id: newAssistantId, kind: 'assistant', content: '' },
              ]);
              break;
            }
            case 'approval-request': {
              setMessages((prev) =>
                prev.map((r) =>
                  r.kind === 'tool' && r.toolCallId === ev.toolCallId
                    ? { ...r, status: 'awaiting-approval' }
                    : r,
                ),
              );
              break;
            }
            case 'tool-result': {
              setMessages((prev) =>
                prev.map((r) =>
                  r.kind === 'tool' && r.toolCallId === ev.toolCallId
                    ? { ...r, output: ev.output, status: 'done' }
                    : r,
                ),
              );
              break;
            }
            case 'tool-error': {
              const denied = ev.error === 'denied by user';
              setMessages((prev) =>
                prev.map((r) =>
                  r.kind === 'tool' && r.toolCallId === ev.toolCallId
                    ? { ...r, error: ev.error, status: denied ? 'denied' : 'error' }
                    : r,
                ),
              );
              break;
            }
          }
        }
      } catch (err: unknown) {
        const aborted = isAbortError(err);
        const text = aborted ? '(canceled)' : `Error: ${errorMessage(err)}`;
        setMessages((prev) =>
          updateRow(prev, activeAssistantId, (r) =>
            r.kind === 'assistant'
              ? { ...r, content: text, ...(aborted ? {} : { error: true }) }
              : r,
          ),
        );
      } finally {
        setStreaming(false);
        abortRef.current = null;
        // If the pre-allocated assistant row is still empty after the run, drop it.
        setMessages((prev) => trimEmptyTrailingAssistant(prev));
      }
      return 'sent';
    },
    [messages, streaming, target, approver, nextId],
  );

  return { messages, streaming, send, clear, cancel };
}

function updateRow(rows: ChatRow[], id: number, fn: (r: ChatRow) => ChatRow): ChatRow[] {
  return rows.map((r) => (r.id === id ? fn(r) : r));
}

function trimEmptyTrailingAssistant(rows: ChatRow[]): ChatRow[] {
  if (rows.length === 0) return rows;
  const last = rows[rows.length - 1];
  if (last && last.kind === 'assistant' && last.content === '' && !last.error) {
    return rows.slice(0, -1);
  }
  return rows;
}
```

**Step 2 — verify**
```bash
npm run check
```

**Step 3 — commit**
```bash
git add src/app/use-chat.ts
git commit -q -m "app: use-chat consumes StreamEvent and builds mixed ChatRow timeline"
```

---

## Task 10: Approval prompt component

**Files:**
- Create: `src/app/approval-prompt.tsx`

**Step 1 — write file**
```tsx
import { Box, Text } from 'ink';
import type { ApprovalRequest } from '../tools/index.js';

export function ApprovalPrompt(props: { request: ApprovalRequest }) {
  const { request } = props;
  const inputJson = formatInput(request.input);
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="yellow"
      paddingX={1}
      paddingY={1}
      marginY={1}
    >
      <Text color="yellow" bold>
        ⚠ approval required: {request.toolName}
      </Text>
      <Box marginTop={1}>
        <Text dimColor>{inputJson}</Text>
      </Box>
      <Box marginTop={1}>
        <Text>
          <Text color="green">[a]</Text> allow once · <Text color="red">[d]</Text> deny ·{' '}
          <Text color="cyan">[A]</Text> always allow
        </Text>
      </Box>
    </Box>
  );
}

function formatInput(input: unknown): string {
  try {
    const s = JSON.stringify(input, null, 2);
    if (s.length <= 400) return s;
    return `${s.slice(0, 400)}... (${s.length - 400} more chars)`;
  } catch {
    return String(input);
  }
}
```

**Step 2 — verify**
```bash
npm run check
```

**Step 3 — commit**
```bash
git add src/app/approval-prompt.tsx
git commit -q -m "app: approval prompt component with allow/deny/always keys"
```

---

## Task 11: Tool call view component

**Files:**
- Create: `src/app/tool-call-view.tsx`

**Step 1 — write file**
```tsx
import { Box, Text } from 'ink';
import type { ToolRow } from './use-chat.js';

const PREVIEW_LIMIT = 200;

export function ToolCallView(props: { row: ToolRow }) {
  const { row } = props;
  const icon = iconFor(row.status);
  const color = colorFor(row.status);
  const inputPreview = preview(row.input);
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color={color} bold>
          {icon} {row.name}
        </Text>
        <Text dimColor>({inputPreview})</Text>
      </Box>
      {row.status === 'done' && row.output !== undefined && (
        <Box paddingLeft={2}>
          <Text dimColor>→ {preview(row.output)}</Text>
        </Box>
      )}
      {(row.status === 'error' || row.status === 'denied') && row.error && (
        <Box paddingLeft={2}>
          <Text color="red">→ {row.error}</Text>
        </Box>
      )}
      {row.status === 'awaiting-approval' && (
        <Box paddingLeft={2}>
          <Text color="yellow">awaiting approval</Text>
        </Box>
      )}
      {row.status === 'pending' && (
        <Box paddingLeft={2}>
          <Text dimColor>running...</Text>
        </Box>
      )}
    </Box>
  );
}

function iconFor(status: ToolRow['status']): string {
  switch (status) {
    case 'pending':
      return '…';
    case 'awaiting-approval':
      return '?';
    case 'done':
      return '✓';
    case 'error':
      return '✗';
    case 'denied':
      return '✗';
  }
}

function colorFor(status: ToolRow['status']): 'cyan' | 'green' | 'red' | 'yellow' {
  switch (status) {
    case 'pending':
      return 'cyan';
    case 'awaiting-approval':
      return 'yellow';
    case 'done':
      return 'green';
    case 'error':
    case 'denied':
      return 'red';
  }
}

function preview(value: unknown): string {
  try {
    const s = typeof value === 'string' ? value : JSON.stringify(value);
    if (!s) return '';
    if (s.length <= PREVIEW_LIMIT) return s;
    return `${s.slice(0, PREVIEW_LIMIT)}... (${s.length - PREVIEW_LIMIT} more)`;
  } catch {
    return String(value);
  }
}
```

**Step 2 — verify**
```bash
npm run check
```

**Step 3 — commit**
```bash
git add src/app/tool-call-view.tsx
git commit -q -m "app: tool call view with status icon and output preview"
```

---

## Task 12: Update `chat-view.tsx` for mixed timeline + approval slot

**Files:**
- Modify: `src/app/chat-view.tsx`

**Step 1 — read current file** (already in context)

**Step 2 — replace the messages-rendering block and add approval-prompt slot.**

Replace this block:
```tsx
        {messages.map((msg, i) => (
          <Box key={msg.id} flexDirection="column" marginBottom={1}>
            <Text color={msg.role === 'user' ? 'green' : 'magenta'} bold>
              {msg.role === 'user' ? '› you' : '‹ orco'}
            </Text>
            {msg.error ? (
              <Text color="red">{msg.content}</Text>
            ) : (
              <Text>{msg.content || (streaming && i === messages.length - 1 ? '…' : '')}</Text>
            )}
          </Box>
        ))}
```

With:
```tsx
        {messages.map((msg, i) => {
          if (msg.kind === 'tool') return <ToolCallView key={msg.id} row={msg} />;
          const isLastAssistant =
            msg.kind === 'assistant' && i === messages.length - 1 && streaming;
          return (
            <Box key={msg.id} flexDirection="column" marginBottom={1}>
              <Text color={msg.kind === 'user' ? 'green' : 'magenta'} bold>
                {msg.kind === 'user' ? '› you' : '‹ orco'}
              </Text>
              {msg.kind === 'assistant' && msg.error ? (
                <Text color="red">{msg.content}</Text>
              ) : (
                <Text>
                  {msg.content || (isLastAssistant ? '…' : '')}
                </Text>
              )}
            </Box>
          );
        })}
```

Add to the imports at the top:
```tsx
import { ApprovalPrompt } from './approval-prompt.js';
import { ToolCallView } from './tool-call-view.js';
import type { ApprovalRequest } from '../tools/index.js';
```

Update the Props type to include:
```tsx
  approval: ApprovalRequest | null;
  infoPanel?: { title: string; lines: string[] } | null;
```

Just above the `<Box flexDirection="column">` that wraps the input section, render the approval prompt if present:
```tsx
        {props.approval && <ApprovalPrompt request={props.approval} />}
        {props.infoPanel && (
          <Box
            flexDirection="column"
            borderStyle="round"
            borderColor="cyan"
            paddingX={1}
            paddingY={1}
            marginY={1}
          >
            <Text color="cyan" bold>{props.infoPanel.title}</Text>
            {props.infoPanel.lines.map((line) => (
              <Text key={line}>{line}</Text>
            ))}
            <Box marginTop={1}>
              <Text dimColor>press any key to dismiss</Text>
            </Box>
          </Box>
        )}
```

Also: when `approval` is non-null, the input box should be visually disabled. Inside the input region, replace the `focus === 'input' && !streaming` condition with:
```tsx
            {focus === 'input' && !streaming && !props.approval ? (
```

**Step 3 — verify**
```bash
npm run check
```

**Step 4 — commit**
```bash
git add src/app/chat-view.tsx
git commit -q -m "app: chat-view renders tool rows, approval prompt and info panels"
```

---

## Task 13: `/help` and `/tools` commands + autocomplete entries

**Files:**
- Modify: `src/app/commands.ts`

**Step 1 — replace file**
```ts
export type SlashCommand = {
  name: string;
  description: string;
};

export const SLASH_COMMANDS: readonly SlashCommand[] = [
  { name: '/model', description: 'select model' },
  { name: '/clear', description: 'clear chat history' },
  { name: '/tools', description: 'list registered tools' },
  { name: '/help', description: 'show all commands' },
  { name: '/exit', description: 'exit orco' },
] as const;

export function matchCommands(input: string): SlashCommand[] {
  if (!input.startsWith('/')) return [];
  const q = input.toLowerCase();
  const matches = SLASH_COMMANDS.filter((c) => c.name.startsWith(q));
  if (matches.length === 1 && matches[0]?.name === input) return [];
  return matches;
}
```

**Step 2 — verify**
```bash
npm run check
```

**Step 3 — commit**
```bash
git add src/app/commands.ts
git commit -q -m "commands: register /tools and /help in autocomplete list"
```

---

## Task 14: Wire approval channel and command handlers in `app.tsx`

**Files:**
- Modify: `src/app.tsx`

**Step 1 — apply edits**

Add imports:
```tsx
import { useApproval } from './app/use-approval.js';
import { listActive, listAlwaysAllowed, setAlwaysAllowed } from './tools/index.js';
import { SLASH_COMMANDS } from './app/commands.js';
```

Inside `App()`, after `const chat = useChat(...)`, change to:
```tsx
const approval = useApproval();
const chat = useChat(target, approval.approver);
const [infoPanel, setInfoPanel] = useState<{ title: string; lines: string[] } | null>(null);
```

In the global `useInput`, add at the very top (before the existing ctrl+c check):
```tsx
  if (approval.pending) {
    if (key.ctrl && ch === 'c') {
      // fall through to normal ctrl+c handling — cancels stream which rejects approval
    } else if (ch === 'a') {
      approval.resolve('allow');
      return;
    } else if (ch === 'd') {
      approval.resolve('deny');
      return;
    } else if (ch === 'A') {
      setAlwaysAllowed(approval.pending.toolName);
      approval.resolve('always');
      return;
    } else {
      return; // swallow all other keys while approval is pending
    }
  }
  if (infoPanel) {
    setInfoPanel(null);
    return; // any key dismisses
  }
```

Update `handleSubmit` to handle the new commands:
```tsx
if (trimmed === '/tools') {
  setInput('');
  const allowed = new Set(listAlwaysAllowed());
  const lines = listActive().map((t) => {
    const tier = t.permission === 'auto' || allowed.has(t.name) ? 'auto' : 'ask';
    return `  ${t.name}  [${tier}]  ${t.description}`;
  });
  setInfoPanel({ title: 'tools', lines: lines.length ? lines : ['(none registered)'] });
  return;
}
if (trimmed === '/help') {
  setInput('');
  const lines = SLASH_COMMANDS.map((c) => `  ${c.name.padEnd(8)}  ${c.description}`);
  setInfoPanel({ title: 'commands', lines });
  return;
}
```

Pass new props to `<ChatView ... />`:
```tsx
approval={approval.pending}
infoPanel={infoPanel}
```

Make sure `approval.pending` properly cancels on ctrl+c: when stream aborts, the rejected promise propagates from `streamText` which throws — caught in `use-chat`. The pending approval is left dangling; reset it after the stream ends. Add this effect inside `App()`:
```tsx
useEffect(() => {
  if (!chat.streaming && approval.pending) {
    approval.resolve('deny'); // safety: if stream ended without resolving, deny
  }
}, [chat.streaming, approval.pending, approval]);
```

**Step 2 — verify**
```bash
npm run check
npm run build
```

**Step 3 — manual smoke**
```bash
npm run dev
```
Walk through:
- Plain "hi" → text streams, no tools
- "What time is it now?" → model calls `get_time`, sees result, answers
- "Echo 'banana'" → `echo` runs
- `/tools` → panel shows two tools, both `[auto]`
- `/help` → panel shows 5 commands
- `/clear`, `/model`, `/exit` still work
- Ctrl+C single → cancels mid-stream
- Ctrl+C double → exits

**Step 4 — commit**
```bash
git add src/app.tsx
git commit -q -m "app: wire approval channel, /help, /tools and info panel dismissal"
```

---

## Task 15: Manual approval smoke test

**Files:** none modified — temporary test only.

**Step 1 — temporarily flip `echo` to `permission: 'ask'` in `src/tools/builtin/echo.ts`**, save, then in another terminal run `npm run dev`.

Ask the model: `Use the echo tool with text "test"`.

Expect:
- Tool row appears with status `awaiting-approval`
- Approval panel shows
- Press `a` → tool runs, status `done`, model continues
- Re-ask, press `d` → status `denied`, model adapts
- Re-ask, press `A` → tool runs; restart app; ask again → no prompt this time (always-allow persisted)

**Step 2 — revert `echo` back to `permission: 'auto'`**.

Verify `~/.config/orco/approvals.json` contains `{"always":{"echo":true}}`. Optionally delete it to reset.

**Step 3 — commit nothing.** This task is a verification gate.

If anything fails, file a fix-up commit with explanation.

---

## Final Verification

```bash
npm run check
npm run build
node --input-type=module -e "import('./dist/cli.js').catch(e=>{console.error(e);process.exit(1)})" 2>&1 | head -3
wc -l src/**/*.{ts,tsx}
git log --oneline | head -20
```

Expected:
- `npm run check` green
- Build clean
- TTY guard message
- No file > 300 lines
- 14 atomic commits since the design doc

---

## Done Criteria

- [ ] Tasks 1–14 committed.
- [ ] Manual smoke (Task 15) passes for both `auto` and `ask` tools.
- [ ] `~/.config/orco/approvals.json` round-trips correctly.
- [ ] Aborting mid tool-call returns terminal cleanly.
- [ ] No `any` introduced.
- [ ] All UI strings English.
