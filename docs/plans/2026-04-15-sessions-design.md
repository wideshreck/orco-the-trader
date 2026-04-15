# ORCO Session History v1 — Design

**Date:** 2026-04-15
**Scope:** Persistent chat sessions on disk (JSONL append-only). Auto-resume last session on launch. `/new` and `/sessions` commands. Fix: properly send tool-call history to the LLM on subsequent turns.
**Approver:** orcun

---

## 1. Goals

1. Conversations survive app restart. The user never loses chat history.
2. Auto-resume the last session on launch — zero ceremony.
3. Tool calls (input/output/status) round-trip: when you resume, the model sees what already happened.
4. Format remains human-readable and tool-friendly (`grep`, `less`, future export scripts).
5. No corruption on Ctrl+C, crash, or two parallel writes.
6. Foundation for future features: search, export, summarization, multi-terminal sync.

**Non-goals:** context-window pruning/summarization, per-CWD project layout, multi-terminal locking, full-text search, cloud sync, encryption-at-rest.

---

## 2. Research Synthesis

| Topic | Decision | Source |
|---|---|---|
| Storage format | JSONL append-only | Claude Code, Codex CLI, Gemini CLI |
| When to migrate to SQLite | When `/sessions` listing or full-text search becomes slow (hundreds of sessions, thousands of messages) | OpenCode migration story |
| Layout | Global `~/.config/orco/sessions/` (no per-CWD for v1) | ORCO is chat-only, not per-project |
| Resume model | Auto-resume last on launch | Claude Code default |
| Title | First user message, first 50 chars | Pragmatic, no extra LLM call |
| Tool-call persistence | Persist full ChatRow timeline incl. tool rows; convert to AI SDK `ModelMessage[]` on send | AI SDK guidance: UI-message as truth |
| Index file | `index.json` summarizing all sessions for fast `/sessions` listing | Claude Code's `history.jsonl` model |
| Lazy file creation | Don't create empty session files; first message materializes session | User decision |

---

## 3. Architecture

```
~/.config/orco/
  sessions/
    index.json           ← { sessions: [{id, title, lastModified, messageCount}, ...] }
    <session-id>.jsonl   ← one event per line, append-only
```

```
src/
  sessions/
    types.ts             → SessionEvent (discriminated union), SessionMeta, SessionId
    storage.ts           → append(id, ev), load(id), list, delete (JSONL + index ops)
    serialize.ts         → ChatRow ↔ SessionEvent ↔ ModelMessage[]
    index.ts             → public API + bootstrap
  app/
    use-session.ts       → React hook: current sessionId, load/new/switch, persistence
    use-chat.ts          → calls session.append() on every ChatRow change
  ai.ts                  → accepts richer message type (with tool steps)
  ui/
    session-picker.tsx   → model-picker-style: list, filter, delete, ↑↓ + Enter
  app.tsx                → wire useSession; /new and /sessions handlers
  app/commands.ts        → register /new, /sessions
```

**Dependency direction:**
UI → use-session → sessions/index → sessions/storage. ai.ts only knows about ModelMessage; sessions/serialize converts. No circular deps.

---

## 4. Data Model

### 4.1 Event types (one JSON object per JSONL line)

```ts
type SessionEvent =
  | { t: 'meta'; ts: number; v: 1; sessionId: string; createdAt: number }
  | { t: 'model'; ts: number; providerId: string; modelId: string }
  | { t: 'user'; ts: number; id: number; content: string }
  | { t: 'assistant'; ts: number; id: number; content: string; error?: boolean }
  | { t: 'tool'; ts: number; id: number; toolCallId: string; name: string;
      input: unknown; output?: unknown; error?: string;
      status: 'pending' | 'awaiting-approval' | 'done' | 'error' | 'denied' };
```

**Rules:**
- First line MUST be `meta` (schema versioning hook).
- `model` event written when model selection changes (lets future `/sessions` show which model produced what).
- `user` / `assistant` / `tool` events mirror the existing `ChatRow` discriminated union. `id` is the same numeric id used in UI for stable React keys.
- Streaming assistant text is NOT appended chunk by chunk. Final assistant message is appended on stream completion. Tool events are appended on status transition.

### 4.2 Index file

```jsonc
{
  "v": 1,
  "sessions": [
    {
      "id": "01J9...",
      "title": "What time is it in Istanbul?",
      "createdAt": 1734567890000,
      "lastModified": 1734567920000,
      "messageCount": 4
    }
  ]
}
```

- Sorted by `lastModified` desc.
- Atomic write (tmp + rename).
- Truncate to 200 entries on save (keep recent — older sessions remain on disk but drop from quick list). Future: trim policy in config.

### 4.3 Session ID

ULID-like sortable string. Format: `{timestamp-base32}-{random-hex}`. Hand-rolled, no dep:

```
01J9AABBCCDD-7f3a2c
```

26 chars, sorts lexicographically by creation time. Filesystem-safe. Generated locally with `Date.now()` + `crypto.randomBytes(3).toString('hex')`.

---

## 5. Lifecycle

### 5.1 Launch sequence

1. App boots — bootstrap phase (catalog load, etc.).
2. After catalog ready, `useSession` initializes:
   - Read index.json
   - If a session exists → load its events into ChatRow[] state, set `currentSessionId`
   - If no sessions → start with empty messages, `currentSessionId = null` (no file yet)
3. UI enters chat phase as usual.

### 5.2 First message in a fresh session

When `currentSessionId === null` and user sends a message:
1. Generate new sessionId.
2. Create file with `meta` and `model` events (atomic-ish: open with `wx` flag).
3. Append `user` event.
4. Add to index.json.
5. Set `currentSessionId`.
6. Continue normal stream.

### 5.3 Subsequent messages

For each terminal `ChatRow` change (final state, not streaming intermediate):
- Append corresponding `SessionEvent` to `<id>.jsonl`.
- Update index entry's `lastModified` and `messageCount`.

Index update is debounced (e.g. 500 ms or on stream-end) to avoid hammering the file during multi-step turns.

### 5.4 `/new`

- Stop streaming if active (treat like Ctrl+C cancel).
- Reset ChatRow[] to empty.
- Reset `currentSessionId` to null.
- Old session file stays on disk; index unchanged.
- UI returns to empty chat state.

### 5.5 `/sessions` picker

Full-screen picker (model-picker style):
- Lists sessions from index, newest first.
- Up to 20 visible at a time (scroll window).
- Type to filter by title.
- `Enter` → load that session.
- `d` → delete (with one-shot confirm via second `d` press within 2s; same pattern as Ctrl+C exit).
- `Esc` → back to chat.
- Each row: `▸ 2026-04-15 14:32  4 msg  What time is it in Istanbul?`

Loading replays events from JSONL into ChatRow[]; tool rows reconstruct with original status.

### 5.6 Crash recovery

- Each `tool` event status is stored. On resume, a tool row stuck in `pending` or `awaiting-approval` is rewritten to `error` with message "interrupted" — clear visual indicator without confusing the LLM.
- This rewrite happens at load time, in memory only (history file untouched). Then the recovery row is appended on next user turn so disk also reflects truth.

---

## 6. Wire Conversion (`serialize.ts`)

Today's `streamChat` only sends `{role: 'user'|'assistant', content: string}`. After this work it sends AI SDK `ModelMessage[]` with proper tool-call structure:

```ts
function chatRowsToModelMessages(rows: ChatRow[]): ModelMessage[] {
  // walk in order; collapse runs of (assistant text + tool calls + tool results) into the
  // canonical AI SDK shape:
  //   user      → { role: 'user',      content: string }
  //   assistant → { role: 'assistant', content: [
  //                   { type: 'text', text },
  //                   { type: 'tool-call', toolCallId, toolName, input },
  //                 ] }
  //   tool      → { role: 'tool',      content: [
  //                   { type: 'tool-result', toolCallId, toolName, output },
  //                 ] }
}
```

Edge cases:
- Tool with `status: 'denied'` or `'error'` → emit `tool-result` with the error text as `output`. Model needs to see it tried.
- Trailing empty assistant rows from `trimEmptyTrailingAssistant` → already filtered out before serialization.
- `pending` / `awaiting-approval` from a crash → after the in-memory rewrite they become `error`.

This change touches `ai.ts` signature: `messages: ChatMessage[]` → `messages: ChatRow[]` (plus internal conversion).

---

## 7. UI Changes

### 7.1 New components
- `src/ui/session-picker.tsx` — list + filter + delete (`d`+`d`) + load.

### 7.2 Updated commands
`/new` and `/sessions` added. Final list (alphabetical):
`/clear · /exit · /help · /model · /new · /sessions · /tools`

`/clear` keeps current behavior (wipes UI + appends a synthetic clear marker? — **no**, simpler: `/clear` only resets the view; if you want a fresh persisted session, use `/new`. Mention this in `/help`).

Actually, simplest: `/clear` becomes a wrapper for `/new` (they're functionally identical now that history is auto-persisted). **Decision: deprecate `/clear`, replace with `/new`. Users who type `/clear` get a one-line info panel pointing them to `/new`.** Cleaner mental model.

### 7.3 Banner subtitle
Add session indicator when one is active:
```
The Trader v0.1 · anthropic/claude-sonnet-4.6 · session: What time is it...
```
Truncate session title to ~30 chars.

---

## 8. Failure Modes

| Scenario | Handling |
|---|---|
| Disk full mid-append | Append throws; surface as red banner row "could not save"; chat continues in memory |
| Corrupt JSONL line on load | Skip that line; warn (silent in v1, future: warn panel) |
| Index out of sync with files | On launch, reconcile: list files in dir, drop missing from index, add new to index |
| Two ORCO instances writing same session | Currently no lock. Append-only mitigates corruption but interleaving could happen. Document as known limitation; v2 add lock file. |
| Resume a tool row stuck `awaiting-approval` | Rewrite to `error: 'interrupted'` in memory; persist correction on next user turn |

---

## 9. Performance Budget

- Append: O(1) — single write, no rewrite. Target < 5 ms typical.
- Load: O(N events) where N = events in chosen session. Target < 50 ms for 1k events.
- Index update: debounced; O(sessions in index) — capped at 200.
- Session picker open: O(index size) — instant.

If we hit users with 10k-msg sessions, index load slows linearly. Acceptable for v1 — migrate to SQLite when this becomes user-visible.

---

## 10. Validation

`npm run check` + `npm run dev` smoke:

1. Fresh launch (no `~/.config/orco/sessions/`) → empty chat, send "hi" → file appears with meta+model+user+assistant events.
2. Restart → previous session auto-loads, scroll history visible.
3. Send "What time is it?" → tool call persists to file with full state.
4. Quit mid-tool → restart → tool row shows as `error: interrupted`; next user message works normally.
5. `/new` → empty chat; previous session stays on disk.
6. `/sessions` → picker shows both sessions; load older one, send a message — appends to that session.
7. `/sessions` then `d`+`d` → session deleted (file + index entry).
8. Edit `~/.config/orco/sessions/<id>.jsonl` to inject a malformed line → load skips it, others render.
9. Multi-step: ask question that triggers tool calls; restart; ask follow-up — model demonstrably remembers the tool result (this validates the wire fix).

---

## 11. File-Level Diff Summary

| File | Action |
|---|---|
| `src/sessions/types.ts` | new |
| `src/sessions/storage.ts` | new — append/load/list/delete + atomic index write |
| `src/sessions/serialize.ts` | new — ChatRow ↔ SessionEvent ↔ ModelMessage |
| `src/sessions/index.ts` | new — public API + ULID-ish ID generator |
| `src/app/use-session.ts` | new — bootstrap + load/new/switch + auto-append on chat changes |
| `src/app/use-chat.ts` | edit — accept initial messages, emit on every commit, signature for session sink |
| `src/ai.ts` | edit — `messages: ChatRow[]` → builds ModelMessage[] via serialize |
| `src/app.tsx` | edit — wire useSession, `/new` + `/sessions` handlers, banner subtitle |
| `src/app/commands.ts` | edit — register /new and /sessions, replace /clear behavior |
| `src/app/chat-view.tsx` | edit — banner subtitle includes session title |
| `src/ui/session-picker.tsx` | new |

Estimated final state: every file ≤ 250 lines.

---

## 12. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Wire conversion breaks streamChat for users without tool calls | Plain user/assistant turns produce identical wire output to today; verified by smoke #1 |
| Index drift from manual file edits | Reconcile-on-load |
| Tool row reconstruction misses a status | Status enum is exhaustive; switch with `never` exhaustiveness check |
| Replacing `/clear` semantics surprises users | Migration message panel on `/clear` for one release |
| ULID-ish collisions | 24 bits random + ms timestamp → collision needs 2 IDs in same ms with same random; effectively impossible in single-user CLI |

---

## 13. Out of Scope (Explicit)

- Per-CWD project organization
- Multi-terminal locking / interleaving fixes
- Full-text search across sessions
- Export to markdown
- Context window summarization
- Encryption at rest
- Cloud sync
- Session sharing
