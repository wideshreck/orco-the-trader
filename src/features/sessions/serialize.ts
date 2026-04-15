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

export function eventsToChatRows(events: SessionEvent[]): ChatRow[] {
  const rows: ChatRow[] = [];
  for (const ev of events) {
    if (ev.t === 'user') {
      rows.push({ id: ev.id, kind: 'user', content: ev.content });
    } else if (ev.t === 'assistant') {
      const r: ChatRow = { id: ev.id, kind: 'assistant', content: ev.content };
      if (ev.error) r.error = true;
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
      flushTool();
      if (!assistantBuf) assistantBuf = { text: '', toolCalls: [] };
      if (row.content) assistantBuf.text += assistantBuf.text ? `\n${row.content}` : row.content;
    } else {
      if (!assistantBuf) assistantBuf = { text: '', toolCalls: [] };
      assistantBuf.toolCalls.push({ id: row.toolCallId, name: row.name, input: row.input });
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
