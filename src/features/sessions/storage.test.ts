import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  appendEvent,
  deleteSession,
  loadEvents,
  readIndex,
  reconcile,
  upsertMeta,
  writeIndex,
} from './storage.js';
import type { SessionEvent, SessionMeta } from './types.js';

let tmpHome: string;
let spy: ReturnType<typeof spyOn> | null = null;

function sessionsDir(): string {
  return path.join(tmpHome, '.config', 'orco', 'sessions');
}

function sessionFile(id: string): string {
  return path.join(sessionsDir(), `${id}.jsonl`);
}

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'orco-sessions-'));
  spy = spyOn(os, 'homedir').mockReturnValue(tmpHome);
});

afterEach(() => {
  spy?.mockRestore();
  fs.rmSync(tmpHome, { recursive: true, force: true });
});

const meta: SessionMeta = {
  id: 'abc',
  title: 't',
  createdAt: 1,
  lastModified: 2,
  messageCount: 3,
};

describe('session index', () => {
  it('returns an empty index when the file is absent', () => {
    expect(readIndex()).toEqual({ v: 1, sessions: [] });
  });

  it('writes and reads back an index entry', () => {
    writeIndex({ v: 1, sessions: [meta] });
    expect(readIndex().sessions).toEqual([meta]);
  });

  it('drops entries missing required fields', () => {
    fs.mkdirSync(sessionsDir(), { recursive: true });
    fs.writeFileSync(
      path.join(sessionsDir(), 'index.json'),
      JSON.stringify({
        v: 1,
        sessions: [
          { id: 'ok', title: 't', createdAt: 1, lastModified: 2, messageCount: 3 },
          { id: 123 },
        ],
      }),
    );
    const idx = readIndex();
    expect(idx.sessions.map((s) => s.id)).toEqual(['ok']);
  });

  it('sorts by lastModified descending on write', () => {
    writeIndex({
      v: 1,
      sessions: [
        { ...meta, id: 'old', lastModified: 1 },
        { ...meta, id: 'new', lastModified: 10 },
        { ...meta, id: 'mid', lastModified: 5 },
      ],
    });
    expect(readIndex().sessions.map((s) => s.id)).toEqual(['new', 'mid', 'old']);
  });
});

describe('session append and load', () => {
  it('appends events to a JSONL file and reads them back', () => {
    const events: SessionEvent[] = [
      { t: 'meta', ts: 0, v: 1, sessionId: 'x', createdAt: 0 },
      { t: 'user', ts: 1, id: 1, content: 'hi' },
      { t: 'assistant', ts: 2, id: 2, content: 'hey' },
    ];
    for (const ev of events) appendEvent('x', ev);
    expect(loadEvents('x')).toEqual(events);
  });

  it('skips malformed lines but keeps the valid ones', () => {
    fs.mkdirSync(sessionsDir(), { recursive: true });
    fs.writeFileSync(
      sessionFile('y'),
      `{"t":"user","ts":0,"id":1,"content":"ok"}\nnot-json\n{"t":"assistant","ts":1,"id":2,"content":"yo"}\n`,
    );
    const events = loadEvents('y');
    expect(events).toHaveLength(2);
  });

  it('returns empty when the session file does not exist', () => {
    expect(loadEvents('nope')).toEqual([]);
  });
});

describe('upsertMeta', () => {
  it('inserts a new entry', () => {
    upsertMeta(meta);
    expect(readIndex().sessions).toEqual([meta]);
  });

  it('updates in place when the id exists', () => {
    upsertMeta(meta);
    upsertMeta({ ...meta, title: 'renamed', lastModified: 99 });
    const idx = readIndex();
    expect(idx.sessions).toHaveLength(1);
    expect(idx.sessions[0]?.title).toBe('renamed');
    expect(idx.sessions[0]?.lastModified).toBe(99);
  });
});

describe('deleteSession', () => {
  it('removes the file and index entry', () => {
    appendEvent('a', { t: 'meta', ts: 0, v: 1, sessionId: 'a', createdAt: 0 });
    upsertMeta({ ...meta, id: 'a' });
    expect(fs.existsSync(sessionFile('a'))).toBe(true);
    deleteSession('a');
    expect(fs.existsSync(sessionFile('a'))).toBe(false);
    expect(readIndex().sessions).toEqual([]);
  });

  it('is a no-op when the session does not exist', () => {
    expect(() => deleteSession('ghost')).not.toThrow();
  });
});

describe('reconcile', () => {
  it('removes index entries with no matching file', () => {
    upsertMeta({ ...meta, id: 'real' });
    upsertMeta({ ...meta, id: 'orphan' });
    appendEvent('real', { t: 'meta', ts: 0, v: 1, sessionId: 'real', createdAt: 0 });
    reconcile();
    expect(readIndex().sessions.map((s) => s.id)).toEqual(['real']);
  });
});
