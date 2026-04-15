import { describe, expect, it } from 'bun:test';
import type { ChatRow } from '../chat/use-chat.js';
import {
  chatRowsToModelMessages,
  chatRowToEvent,
  eventsToChatRows,
  eventsToSession,
} from './serialize.js';
import type { SessionEvent } from './types.js';

describe('chatRowToEvent', () => {
  it('serializes a user row', () => {
    const ev = chatRowToEvent({ id: 1, kind: 'user', content: 'hi' }, 1000);
    expect(ev).toEqual({ t: 'user', ts: 1000, id: 1, content: 'hi' });
  });

  it('serializes an assistant row with usage and error', () => {
    const ev = chatRowToEvent(
      {
        id: 2,
        kind: 'assistant',
        content: 'err',
        error: true,
        usage: { inputTokens: 100, outputTokens: 50 },
      },
      2000,
    );
    expect(ev).toEqual({
      t: 'assistant',
      ts: 2000,
      id: 2,
      content: 'err',
      error: true,
      usage: { inputTokens: 100, outputTokens: 50 },
    });
  });

  it('omits optional assistant fields when absent', () => {
    const ev = chatRowToEvent({ id: 3, kind: 'assistant', content: 'ok' }, 3000);
    expect(ev).toEqual({ t: 'assistant', ts: 3000, id: 3, content: 'ok' });
  });

  it('serializes a tool row with all fields', () => {
    const ev = chatRowToEvent(
      {
        id: 4,
        kind: 'tool',
        toolCallId: 'call-1',
        name: 'echo',
        input: { text: 'hi' },
        output: { echo: 'hi' },
        status: 'done',
      },
      4000,
    );
    expect(ev).toEqual({
      t: 'tool',
      ts: 4000,
      id: 4,
      toolCallId: 'call-1',
      name: 'echo',
      input: { text: 'hi' },
      output: { echo: 'hi' },
      status: 'done',
    });
  });
});

describe('eventsToChatRows', () => {
  it('rehydrates rows in event order', () => {
    const events: SessionEvent[] = [
      { t: 'meta', ts: 0, v: 1, sessionId: 'x', createdAt: 0 },
      { t: 'user', ts: 1, id: 1, content: 'hi' },
      { t: 'assistant', ts: 2, id: 2, content: 'hello' },
    ];
    expect(eventsToChatRows(events)).toEqual([
      { id: 1, kind: 'user', content: 'hi' },
      { id: 2, kind: 'assistant', content: 'hello' },
    ]);
  });

  it('converts stuck pending/awaiting-approval tool rows to error on load', () => {
    const events: SessionEvent[] = [
      {
        t: 'tool',
        ts: 0,
        id: 1,
        toolCallId: 'c',
        name: 'x',
        input: {},
        status: 'pending',
      },
    ];
    const rows = eventsToChatRows(events);
    expect(rows).toHaveLength(1);
    const tool = rows[0];
    if (!tool || tool.kind !== 'tool') throw new Error('expected tool row');
    expect(tool.status).toBe('error');
    expect(tool.error).toBe('interrupted');
  });

  it('rehydrates assistant usage', () => {
    const events: SessionEvent[] = [
      {
        t: 'assistant',
        ts: 0,
        id: 1,
        content: 'x',
        usage: { inputTokens: 50, outputTokens: 10 },
      },
    ];
    const rows = eventsToChatRows(events);
    const row = rows[0];
    if (!row || row.kind !== 'assistant') throw new Error('expected assistant');
    expect(row.usage).toEqual({ inputTokens: 50, outputTokens: 10 });
  });
});

describe('eventsToSession', () => {
  it('extracts the compactionPoint from a compact event', () => {
    const events: SessionEvent[] = [
      { t: 'user', ts: 0, id: 1, content: 'q' },
      { t: 'assistant', ts: 1, id: 2, content: 'a' },
      { t: 'compact', ts: 2, afterId: 2, summary: 'we talked about stuff' },
      { t: 'user', ts: 3, id: 3, content: 'again' },
    ];
    const load = eventsToSession(events);
    expect(load.compactionPoint).toEqual({ afterId: 2, summary: 'we talked about stuff' });
    expect(load.rows).toHaveLength(3);
  });

  it('returns null compactionPoint when no compact event present', () => {
    const events: SessionEvent[] = [{ t: 'user', ts: 0, id: 1, content: 'q' }];
    expect(eventsToSession(events).compactionPoint).toBeNull();
  });

  it('uses the last compact event when multiple are present', () => {
    const events: SessionEvent[] = [
      { t: 'compact', ts: 0, afterId: 2, summary: 'first' },
      { t: 'compact', ts: 1, afterId: 6, summary: 'second' },
    ];
    expect(eventsToSession(events).compactionPoint).toEqual({ afterId: 6, summary: 'second' });
  });
});

describe('chatRowsToModelMessages', () => {
  it('converts plain user/assistant exchange', () => {
    const rows: ChatRow[] = [
      { id: 1, kind: 'user', content: 'hi' },
      { id: 2, kind: 'assistant', content: 'hello' },
    ];
    const msgs = chatRowsToModelMessages(rows);
    expect(msgs).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: [{ type: 'text', text: 'hello' }] },
    ]);
  });

  it('emits assistant tool-call parts and a tool-result message', () => {
    const rows: ChatRow[] = [
      { id: 1, kind: 'user', content: 'what time' },
      { id: 2, kind: 'assistant', content: '' },
      {
        id: 3,
        kind: 'tool',
        toolCallId: 'c1',
        name: 'get_time',
        input: {},
        output: { iso: '2026-04-15T00:00:00Z' },
        status: 'done',
      },
      { id: 4, kind: 'assistant', content: 'it is 00:00' },
    ];
    const msgs = chatRowsToModelMessages(rows);
    expect(msgs).toHaveLength(4);
    expect(msgs[0]).toEqual({ role: 'user', content: 'what time' });
    expect(msgs[1]).toMatchObject({ role: 'assistant' });
    expect(msgs[2]).toMatchObject({ role: 'tool' });
    expect(msgs[3]).toMatchObject({ role: 'assistant' });
  });

  it('surfaces tool errors as error payloads', () => {
    const rows: ChatRow[] = [
      { id: 1, kind: 'user', content: 'do it' },
      { id: 2, kind: 'assistant', content: '' },
      {
        id: 3,
        kind: 'tool',
        toolCallId: 'c1',
        name: 'x',
        input: {},
        error: 'denied by user',
        status: 'denied',
      },
    ];
    const msgs = chatRowsToModelMessages(rows);
    const toolMsg = msgs.find((m) => m.role === 'tool');
    expect(toolMsg).toBeDefined();
  });
});
