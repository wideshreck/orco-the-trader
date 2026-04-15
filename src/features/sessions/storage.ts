import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  MAX_INDEX_ENTRIES,
  type SessionEvent,
  type SessionId,
  type SessionIndex,
  type SessionMeta,
} from './types.js';

function rootDir(): string {
  return path.join(os.homedir(), '.config', 'orco', 'sessions');
}

function indexPath(): string {
  return path.join(rootDir(), 'index.json');
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function sessionPath(id: SessionId): string {
  return path.join(rootDir(), `${id}.jsonl`);
}

function ensureDir(): void {
  fs.mkdirSync(rootDir(), { recursive: true });
}

export function readIndex(): SessionIndex {
  try {
    const raw = JSON.parse(fs.readFileSync(indexPath(), 'utf8')) as unknown;
    if (!isObject(raw) || !Array.isArray(raw.sessions)) return { v: 1, sessions: [] };
    const sessions: SessionMeta[] = [];
    for (const s of raw.sessions) {
      if (!isObject(s)) continue;
      if (
        typeof s.id !== 'string' ||
        typeof s.title !== 'string' ||
        typeof s.createdAt !== 'number' ||
        typeof s.lastModified !== 'number' ||
        typeof s.messageCount !== 'number'
      ) {
        continue;
      }
      sessions.push({
        id: s.id,
        title: s.title,
        createdAt: s.createdAt,
        lastModified: s.lastModified,
        messageCount: s.messageCount,
      });
    }
    return { v: 1, sessions };
  } catch {
    return { v: 1, sessions: [] };
  }
}

export function writeIndex(idx: SessionIndex): void {
  ensureDir();
  const sorted = [...idx.sessions]
    .sort((a, b) => b.lastModified - a.lastModified)
    .slice(0, MAX_INDEX_ENTRIES);
  const payload: SessionIndex = { v: 1, sessions: sorted };
  const file = indexPath();
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2));
  fs.renameSync(tmp, file);
}

export function appendEvent(id: SessionId, ev: SessionEvent): void {
  ensureDir();
  fs.appendFileSync(sessionPath(id), `${JSON.stringify(ev)}\n`);
}

export function loadEvents(id: SessionId): SessionEvent[] {
  let raw: string;
  try {
    raw = fs.readFileSync(sessionPath(id), 'utf8');
  } catch {
    return [];
  }
  const out: SessionEvent[] = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as unknown;
      if (isObject(parsed) && typeof parsed.t === 'string') {
        out.push(parsed as unknown as SessionEvent);
      }
    } catch {
      // skip malformed line
    }
  }
  return out;
}

export function deleteSession(id: SessionId): void {
  try {
    fs.unlinkSync(sessionPath(id));
  } catch {
    // ignore: file may already be gone
  }
  const idx = readIndex();
  idx.sessions = idx.sessions.filter((s) => s.id !== id);
  writeIndex(idx);
}

export function upsertMeta(meta: SessionMeta): void {
  const idx = readIndex();
  const i = idx.sessions.findIndex((s) => s.id === meta.id);
  if (i >= 0) idx.sessions[i] = meta;
  else idx.sessions.push(meta);
  writeIndex(idx);
}

export function reconcile(): void {
  ensureDir();
  const idx = readIndex();
  const present = new Set<string>();
  try {
    for (const f of fs.readdirSync(rootDir())) {
      if (f.endsWith('.jsonl')) present.add(f.slice(0, -6));
    }
  } catch {
    return;
  }
  idx.sessions = idx.sessions.filter((s) => present.has(s.id));
  writeIndex(idx);
}
