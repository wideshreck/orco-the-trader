import { newSessionId } from './id.js';
import {
  appendEvent,
  deleteSession,
  loadEvents,
  readIndex,
  reconcile,
  upsertMeta,
} from './storage.js';
import { type SessionEvent, type SessionId, type SessionMeta, TITLE_MAX_LEN } from './types.js';

export function listSessions(): SessionMeta[] {
  return readIndex().sessions;
}

export function loadSession(id: SessionId): SessionEvent[] {
  return loadEvents(id);
}

export function removeSession(id: SessionId): void {
  deleteSession(id);
}

export function createSession(): SessionId {
  return newSessionId();
}

export function appendToSession(id: SessionId, ev: SessionEvent): void {
  appendEvent(id, ev);
}

export function refreshMeta(meta: SessionMeta): void {
  upsertMeta(meta);
}

export function reconcileIndex(): void {
  reconcile();
}

export function titleFromUserMessage(content: string): string {
  const single = content.replace(/\s+/g, ' ').trim();
  if (single.length <= TITLE_MAX_LEN) return single || '(untitled)';
  return `${single.slice(0, TITLE_MAX_LEN - 1)}…`;
}

export type { CompactionPoint, LoadedSession } from './serialize.js';
export {
  chatRowsToModelMessages,
  chatRowToEvent,
  eventsToChatRows,
  eventsToSession,
} from './serialize.js';
export type { SessionEvent, SessionId, SessionIndex, SessionMeta } from './types.js';
