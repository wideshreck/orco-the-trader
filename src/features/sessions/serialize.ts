import type { ModelMessage } from 'ai';
import type { ChatRow } from '../chat/use-chat.js';
import type { SessionEvent } from './types.js';

export function chatRowToEvent(row: ChatRow, ts: number): SessionEvent {
  if (row.kind === 'user') {
    return { t: 'user', ts, id: row.id, content: row.content };
  }
  if (row.kind === 'assistant') {
    const ev: SessionEvent = { t: 'assistant', ts, id: row.id, content: row.content };
    if (row.error) ev.error = true;
    if (row.usage) ev.usage = row.usage;
    return ev;
  }
  const ev: SessionEvent = {
    t: 'tool',
    ts,
    id: row.id,
    toolCallId: row.toolCallId,
    name: row.name,
    input: row.input,
    status: row.status,
  };
  if (row.output !== undefined) ev.output = row.output;
  if (row.error !== undefined) ev.error = row.error;
  return ev;
}

export type CompactionPoint = { afterId: number; summary: string };

export type LoadedSession = {
  rows: ChatRow[];
  compactionPoint: CompactionPoint | null;
};

export function eventsToSession(events: SessionEvent[]): LoadedSession {
  const rows = eventsToChatRows(events);
  let compactionPoint: CompactionPoint | null = null;
  for (const ev of events) {
    if (ev.t === 'compact') compactionPoint = { afterId: ev.afterId, summary: ev.summary };
  }
  return { rows, compactionPoint };
}

export function eventsToChatRows(events: SessionEvent[]): ChatRow[] {
  const rows: ChatRow[] = [];
  for (const ev of events) {
    if (ev.t === 'user') {
      rows.push({ id: ev.id, kind: 'user', content: ev.content });
    } else if (ev.t === 'assistant') {
      const r: ChatRow = { id: ev.id, kind: 'assistant', content: ev.content };
      if (ev.error) r.error = true;
      if (ev.usage) r.usage = ev.usage;
      rows.push(r);
    } else if (ev.t === 'tool') {
      const status =
        ev.status === 'pending' || ev.status === 'awaiting-approval' ? 'error' : ev.status;
      const r: ChatRow = {
        id: ev.id,
        kind: 'tool',
        toolCallId: ev.toolCallId,
        name: ev.name,
        input: ev.input,
        status,
      };
      if (ev.output !== undefined) r.output = ev.output;
      if (status === 'error' && !ev.error) r.error = 'interrupted';
      else if (ev.error !== undefined) r.error = ev.error;
      rows.push(r);
    }
  }
  return rows;
}

type AssistantBuf = {
  text: string;
  toolCalls: Array<{ id: string; name: string; input: unknown }>;
};
type ToolBuf = Array<{ id: string; name: string; output: unknown }>;

export function chatRowsToModelMessages(rows: ChatRow[]): ModelMessage[] {
  const out: ModelMessage[] = [];
  let assistantBuf: AssistantBuf | null = null;
  let toolBuf: ToolBuf | null = null;

  function flushAssistant() {
    if (!assistantBuf) return;
    const parts: Array<
      | { type: 'text'; text: string }
      | { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown }
    > = [];
    if (assistantBuf.text) parts.push({ type: 'text', text: assistantBuf.text });
    for (const c of assistantBuf.toolCalls) {
      parts.push({ type: 'tool-call', toolCallId: c.id, toolName: c.name, input: c.input });
    }
    if (parts.length > 0) {
      out.push({ role: 'assistant', content: parts });
    }
    assistantBuf = null;
  }

  function flushTool() {
    if (!toolBuf) return;
    out.push({
      role: 'tool',
      content: toolBuf.map((t) => ({
        type: 'tool-result',
        toolCallId: t.id,
        toolName: t.name,
        output: { type: 'json', value: t.output as never },
      })),
    });
    toolBuf = null;
  }

  for (const row of rows) {
    if (row.kind === 'user') {
      flushTool();
      flushAssistant();
      out.push({ role: 'user', content: row.content });
    } else if (row.kind === 'assistant') {
      // Tool results close the previous assistant's tool-use turn; a new
      // assistant row starts a fresh message.
      flushTool();
      flushAssistant();
      assistantBuf = { text: '', toolCalls: [] };
      if (row.content) assistantBuf.text = row.content;
    } else {
      // Tool row: the preceding assistant declared this call. Attach the call
      // to that assistant, flush it, then buffer the result for the tool
      // message that follows.
      if (!assistantBuf) assistantBuf = { text: '', toolCalls: [] };
      assistantBuf.toolCalls.push({ id: row.toolCallId, name: row.name, input: row.input });
      flushAssistant();
      const result =
        row.status === 'denied' || row.status === 'error'
          ? { error: row.error ?? 'tool failed' }
          : (row.output ?? null);
      if (!toolBuf) toolBuf = [];
      toolBuf.push({ id: row.toolCallId, name: row.name, output: result });
    }
  }
  flushTool();
  flushAssistant();
  return out;
}
