# ORCO Tool Framework v1 — Design

**Date:** 2026-04-15
**Scope:** Native tool-calling framework. No MCP this sprint. Two demo tools (`get_time`, `echo`). New commands: `/help`, `/tools`. Persistent "Always allow" approvals.
**Approver:** orcun

---

## 1. Goals

1. Foundation rock-solid: the same framework will host every future tool (trading, RAG, file ops) without churn.
2. Secure-by-default: a new tool with no permission declared is `ask`. No accidental auto-execute.
3. Multi-step reasoning works: model can chain N tool calls in a single user turn.
4. UI tells the truth: every tool call, result, and error visible to the user with provenance.
5. Approval is first-class: pause stream, ask user, persist "Always allow" to disk so it survives restart — same UX as Claude Code and OpenCode.
6. Abort propagation works for tool execution too (Ctrl+C cancels in-flight tool work).

**Non-goals:** MCP, dynamic tool discovery, per-project tool config, tool sandboxing, real trading tools.

---

## 2. Research Synthesis

| Topic | Decision | Source |
|---|---|---|
| Tool API | `tool({description, inputSchema, execute})` from AI SDK v6 | AI SDK docs |
| Schema lib | **zod** — first-class in AI SDK, free type inference | AI SDK |
| Multi-step | `streamText({ stopWhen: stepCountIs(20) })` | AI SDK Loop Control |
| Stream consumption | `fullStream` (text-delta + tool-call/result/error chunks) | AI SDK |
| Permission tiers | `auto / ask / deny` — Claude Code precedence model | Claude Code Permissions |
| Default permission | `ask` — secure by default | Claude Code, OpenCode |
| Approval persistence | Per-tool "always allow" written to `~/.config/orco/approvals.json` | Claude Code settings.json, OpenCode ApprovalManager |
| HITL flow | Permission loop — prepare → request → approve/deny → execute or abort | "Permission Loop" spec |
| Abort | `abortSignal` forwarded to `execute()`, propagates through stream | AI SDK |

---

## 3. Architecture

```
src/
  tools/
    types.ts                → OrcoTool, Permission, ToolEvent, ToolCallRow
    define.ts               → defineTool() helper (zod-typed)
    registry.ts             → register, list, getActive (filters deny), buildAiSdkTools
    approvals.ts            → load/save ~/.config/orco/approvals.json
    builtin/
      get-time.ts           → permission: 'auto'
      echo.ts               → permission: 'auto'
    index.ts                → re-exports + registers builtins
  app/
    use-approval.ts         → React hook: pending request channel
    approval-prompt.tsx     → inline panel: tool name, input JSON, [a/d/A] keys
    tool-call-view.tsx      → renders ToolCallRow inside chat
    commands.ts             → adds /help, /tools
  ai.ts                     → switch to fullStream, accept tools, emit StreamEvent
  app.tsx                   → wires approval channel through useChat
  app/use-chat.ts           → consumes StreamEvent, builds ChatRow timeline
  app/chat-view.tsx         → renders mixed timeline (text + tool calls)
```

**Dependency direction unchanged:**
UI → ai.ts → providers.ts → SDK
tools/* is a leaf; ai.ts pulls a tool map from `tools/registry.ts`.

---

## 4. Tool Definition Contract

```ts
import { defineTool } from '../define.js';
import { z } from 'zod';

export const getTime = defineTool({
  name: 'get_time',
  description: 'Returns the current time in ISO 8601, optionally in a specified IANA timezone.',
  permission: 'auto', // optional; default 'ask'
  inputSchema: z.object({
    tz: z.string().optional().describe('IANA tz name, e.g. Europe/Istanbul'),
  }),
  async execute(input, ctx) {
    const now = new Date();
    return {
      iso: input.tz
        ? new Intl.DateTimeFormat('en-CA', { timeZone: input.tz, dateStyle: 'short', timeStyle: 'long' }).format(now)
        : now.toISOString(),
    };
  },
});
```

### Types

```ts
export type Permission = 'auto' | 'ask' | 'deny';

export type ToolContext = {
  toolCallId: string;
  abortSignal: AbortSignal;
};

export type OrcoTool<I = unknown, O = unknown> = {
  name: string;
  description: string;
  permission: Permission; // resolved (default 'ask')
  inputSchema: ZodType<I>;
  execute: (input: I, ctx: ToolContext) => Promise<O>;
};
```

### Rules
- `name` must match `/^[a-z][a-z0-9_]*$/` (Claude/OpenAI tool name spec).
- Output must be JSON-serializable. Framework will `JSON.stringify` it before passing to the model.
- `execute` may throw — framework converts to `tool-error` chunk; LLM sees the error string and may retry/correct.
- `execute` MUST honor `abortSignal` — pass it to fetch, fs streams, etc.

---

## 5. Permission System

### 5.1 Tiers

| Tier | LLM sees? | Run on call? |
|---|---|---|
| `auto` | yes | yes, immediately |
| `ask` | yes | only after explicit user approval |
| `deny` | **no** (filtered out before send) | n/a |

### 5.2 Approval persistence

`~/.config/orco/approvals.json`:

```json
{
  "always": {
    "get_time": true,
    "read_file": true
  }
}
```

When user picks **Always allow** on an `ask` tool, the tool name is written here. On future calls, framework treats it as `auto`. The tool's declared `permission` is the floor; persistence can only loosen `ask → auto`. (`deny` is sticky and only changeable in code.)

### 5.3 Approval flow

1. Stream is mid-`fullStream`. Model emits `tool-call` chunk for an `ask` tool.
2. ai.ts pauses execution: tool is NOT executed yet.
3. ai.ts emits `OrcoEvent { type: 'approval-request', toolCallId, name, input }`.
4. use-chat puts it in `pendingApproval` state. Input field disables; approval prompt renders.
5. User keys: `a` allow once · `d` deny · `A` always allow (writes to disk).
6. UI calls `resolveApproval(toolCallId, decision)` → ai.ts continues:
   - allow / always → call `execute`, emit `tool-result` or `tool-error`
   - deny → emit synthetic `tool-error: "denied by user"`, do NOT call execute
7. Stream resumes (next text-delta or model decides to call another tool).

### 5.4 Why a custom approval channel (not AI SDK's `needsApproval`)
AI SDK v6 has a `needsApproval` field on tool definitions but its UI/flow integration is server-oriented (UIMessage stream). For our terminal UI we want full control over the pause/resume cycle, including the abort case. Custom channel = predictable + already-typed.

---

## 6. Streaming Layer (`ai.ts`)

### 6.1 New return type

```ts
export type StreamEvent =
  | { type: 'text-delta'; delta: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown }
  | { type: 'tool-result'; toolCallId: string; toolName: string; output: unknown }
  | { type: 'tool-error'; toolCallId: string; toolName: string; error: string }
  | { type: 'approval-request'; toolCallId: string; toolName: string; input: unknown };
```

`streamChat` becomes:

```ts
export async function* streamChat(
  provider: CatalogProvider,
  ref: ModelRef,
  messages: ChatMessage[],
  opts: {
    signal?: AbortSignal;
    approver: (req: ApprovalRequest) => Promise<ApprovalDecision>;
  },
): AsyncGenerator<StreamEvent, void, void>
```

### 6.2 Implementation sketch

```ts
const tools = buildAiSdkTools({ approver, signal });
const result = streamText({
  model,
  messages: modelMessages,
  tools,
  stopWhen: stepCountIs(20),
  ...(signal ? { abortSignal: signal } : {}),
});

for await (const part of result.fullStream) {
  switch (part.type) {
    case 'text-delta': yield { type: 'text-delta', delta: part.delta }; break;
    case 'tool-call': yield { type: 'tool-call', ... }; break;
    case 'tool-result': yield { type: 'tool-result', ... }; break;
    case 'tool-error': yield { type: 'tool-error', ... }; break;
    // 'reasoning', 'finish', 'error' etc — passed through or ignored
  }
}
```

`buildAiSdkTools` wraps each `OrcoTool` so its `execute` first calls `approver` for `ask` tools, then dispatches to user code. Approval is the only thing that yields an `approval-request` event — that happens **inside** the wrapper via a callback channel back to the generator.

### 6.3 Approval bridge implementation

The async generator needs to yield an `approval-request` event AND wait for a Promise to resolve. Pattern: a per-stream `EventEmitter`-like queue that the generator both reads from and writes to.

Mechanism:
- Generator owns a `pendingEvents: StreamEvent[]` queue + a `wakeup: Deferred<void>`.
- The tool-wrapper's execute pushes `{ type: 'approval-request', ... }` to the queue and awaits a Promise that the UI resolves.
- Generator drains queue between `fullStream` ticks.

This is a small piece of plumbing — testable in isolation. ~30 lines.

### 6.4 `deny` filtering

`buildAiSdkTools` only includes `auto` and `ask` tools. `deny` tools are never sent to the model.

---

## 7. UI Changes

### 7.1 `ChatRow` becomes a discriminated union

```ts
export type ChatRow =
  | { id: number; kind: 'user'; content: string }
  | { id: number; kind: 'assistant'; content: string; error?: boolean }
  | { id: number; kind: 'tool'; toolCallId: string; name: string;
      input: unknown; output?: unknown; error?: string;
      status: 'pending' | 'awaiting-approval' | 'done' | 'error' | 'denied' };
```

### 7.2 Tool render
Compact one-liner with status icon + collapsible body:

```
⚙ get_time({})  →  { iso: "2026-04-15T15:32:11.043Z" }
✗ echo({"text":"hi"})  →  Error: tool execution failed
… read_file({"path":"/etc/passwd"})  awaiting approval
✗ delete_branch  denied by user
```

When body is too long (>200 chars), show first 200 + `... (N more chars)`.

### 7.3 Approval prompt
Full-width yellow-bordered panel between message list and input:

```
┌─ approval required ──────────────────────────────────────┐
│ ⚠ run_shell                                              │
│   { "cmd": "rm -rf /tmp/foo" }                           │
│                                                          │
│ [a] allow once · [d] deny · [A] always allow             │
└──────────────────────────────────────────────────────────┘
```

While the prompt is active:
- Input is disabled (`focus` enum gets a new value `approval`)
- Up/down/tab in input do nothing
- Ctrl+C cancels the whole stream (consistent with current behavior)

### 7.4 New commands

- `/help` — list all slash commands + usage hints
- `/tools` — list registered tools, permission, and "always allow" status

Both render full-width info panels temporarily; press any key to dismiss. Implementation: phase enum gains `info` kind with payload.

Add to `commands.ts` so autocomplete picks them up automatically.

---

## 8. Demo Tools

### `get_time` (`tools/builtin/get-time.ts`)
- Permission: `auto`
- Input: `{ tz?: string }`
- Output: `{ iso: string }`
- Errors: throws `Invalid time zone` if `tz` is unknown

### `echo` (`tools/builtin/echo.ts`)
- Permission: `auto`
- Input: `{ text: string }`
- Output: `{ echo: string }`
- Useful as a reachability test the model can call to verify tools work

These are intentionally trivial. Their job is to prove the framework wires correctly end-to-end.

---

## 9. Error Taxonomy

| Source | Surface | LLM continues? |
|---|---|---|
| Schema validation fails | `tool-error` chunk: `Invalid input: <zod message>` | yes — model can correct |
| `execute` throws | `tool-error` chunk: error message | yes |
| User denies approval | `tool-error` chunk: `denied by user` | yes — model can adapt or stop |
| Abort during tool execute | Stream throws `AbortError` (existing path) | n/a — whole turn cancelled |
| Tool name not in registry (model hallucinates) | `tool-error`: `unknown tool` | yes |

All `tool-error`s appear in the chat as red rows AND go back to the LLM so it can react.

---

## 10. Validation

Per CLAUDE.md §8 plus tool-specific cases:

1. `npm run check` green
2. `npm run dev`:
   - Plain text question → no tool calls, behaves as before
   - "What time is it?" → model calls `get_time` (auto), sees result, answers
   - "Echo 'hello'" → model calls `echo` (auto)
   - Add a temporary `ask`-permission tool, ask model to call it → approval prompt appears, allow/deny both work
   - `[A]` always allow → restart app, call same tool → no prompt this time
   - `/tools` → lists `get_time`, `echo`, with permissions
   - `/help` → lists slash commands
   - Ctrl+C mid tool execute → stream cancels, terminal stays clean
   - Model calls unknown tool name → tool-error visible, model recovers

---

## 11. File-Level Diff Summary

| File | Action | Notes |
|---|---|---|
| `package.json` | + `zod` dependency | Latest v3 stable |
| `src/tools/types.ts` | new | Type definitions |
| `src/tools/define.ts` | new | `defineTool()` helper |
| `src/tools/registry.ts` | new | Register / list / build AI SDK map |
| `src/tools/approvals.ts` | new | Disk persistence |
| `src/tools/builtin/get-time.ts` | new | Demo |
| `src/tools/builtin/echo.ts` | new | Demo |
| `src/tools/index.ts` | new | Public API + builtin registration |
| `src/ai.ts` | rewrite | `fullStream`, tool wiring, approval bridge |
| `src/app/use-chat.ts` | rewrite | Handle StreamEvent, approval state |
| `src/app/use-approval.ts` | new | Approval queue hook |
| `src/app/approval-prompt.tsx` | new | UI |
| `src/app/tool-call-view.tsx` | new | Tool row render |
| `src/app/chat-view.tsx` | edit | Mixed timeline rendering |
| `src/app/commands.ts` | edit | Add `/help`, `/tools` |
| `src/app.tsx` | edit | Wire approval channel; add info phase for /help, /tools |

Estimated final state: every file ≤ 250 lines (per CLAUDE.md).

---

## 12. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Approval bridge deadlock if user never answers | Stream is bound by `abortSignal` (Ctrl+C). Add 5min default timeout → auto-deny? Decision: **no timeout** for v1; Ctrl+C is the escape hatch. |
| `fullStream` chunk type drift between AI SDK minor versions | Wrap in a switch with default-passthrough; `// TODO` for unknown types instead of throwing |
| zod schemas need to round-trip to JSON Schema for some providers | AI SDK handles this internally — verified in v6 docs |
| Tool execute holds memory if abort comes mid-await | Tool author's responsibility to wire `abortSignal` to fetch/fs; framework cannot enforce |
| User picks "Always allow" by accident | Persistence file is human-editable; `/tools` shows current state. Future: `/tools forget <name>` |

---

## 13. Out of Scope (Explicit)

- MCP client wiring (next sprint — `tools/mcp.ts` + registry adapter, no other changes)
- Per-project approvals (`.orco/approvals.json` like Claude Code's project settings)
- Tool sandboxing / process isolation
- Real tools (filesystem, shell, http, trading APIs)
- Streaming tool output (only return-on-complete this sprint)
- Tool-side rate limiting / cost accounting
