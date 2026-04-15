import { useCallback, useEffect, useRef, useState } from 'react';
import {
  appendToSession,
  chatRowToEvent,
  createSession,
  eventsToChatRows,
  listSessions,
  loadSession,
  reconcileIndex,
  refreshMeta,
  removeSession,
  type SessionId,
  type SessionMeta,
  titleFromUserMessage,
} from '../sessions/index.js';
import type { ChatRow } from './use-chat.js';

export type SessionChannel = {
  currentId: SessionId | null;
  initialRows: ChatRow[];
  ready: boolean;
  recordRow: (row: ChatRow, modelInfo?: { providerId: string; modelId: string }) => void;
  startNew: () => void;
  switchTo: (id: SessionId) => ChatRow[];
  list: () => SessionMeta[];
  remove: (id: SessionId) => void;
};

export function useSession(): SessionChannel {
  const [currentId, setCurrentIdState] = useState<SessionId | null>(null);
  const [initialRows, setInitialRows] = useState<ChatRow[]>([]);
  const [ready, setReady] = useState(false);
  // Refs are the source of truth so synchronous successive recordRow calls in the
  // same render cycle see consistent state (React state updates are async).
  const currentIdRef = useRef<SessionId | null>(null);
  const titleRef = useRef<string | null>(null);
  const messageCountRef = useRef(0);
  const createdAtRef = useRef<number>(0);
  const modelLoggedRef = useRef(false);

  const setCurrentId = useCallback((id: SessionId | null) => {
    currentIdRef.current = id;
    setCurrentIdState(id);
  }, []);

  useEffect(() => {
    reconcileIndex();
    const sessions = listSessions();
    const head = sessions[0];
    if (head) {
      const events = loadSession(head.id);
      const rows = eventsToChatRows(events);
      setCurrentId(head.id);
      setInitialRows(rows);
      titleRef.current = head.title;
      messageCountRef.current = head.messageCount;
      createdAtRef.current = head.createdAt;
      modelLoggedRef.current = true;
    }
    setReady(true);
  }, [setCurrentId]);

  const ensureSession = useCallback(
    (
      firstUserContent: string | null,
      modelInfo?: { providerId: string; modelId: string },
    ): SessionId => {
      if (currentIdRef.current) return currentIdRef.current;
      const id = createSession();
      const now = Date.now();
      createdAtRef.current = now;
      messageCountRef.current = 0;
      modelLoggedRef.current = false;
      titleRef.current = firstUserContent ? titleFromUserMessage(firstUserContent) : '(untitled)';
      appendToSession(id, { t: 'meta', ts: now, v: 1, sessionId: id, createdAt: now });
      if (modelInfo) {
        appendToSession(id, {
          t: 'model',
          ts: now,
          providerId: modelInfo.providerId,
          modelId: modelInfo.modelId,
        });
        modelLoggedRef.current = true;
      }
      setCurrentId(id);
      return id;
    },
    [setCurrentId],
  );

  const recordRow = useCallback(
    (row: ChatRow, modelInfo?: { providerId: string; modelId: string }) => {
      const ts = Date.now();
      const id = ensureSession(row.kind === 'user' ? row.content : null, modelInfo);
      if (modelInfo && !modelLoggedRef.current) {
        appendToSession(id, {
          t: 'model',
          ts,
          providerId: modelInfo.providerId,
          modelId: modelInfo.modelId,
        });
        modelLoggedRef.current = true;
      }
      appendToSession(id, chatRowToEvent(row, ts));
      messageCountRef.current += 1;
      refreshMeta({
        id,
        title: titleRef.current ?? '(untitled)',
        createdAt: createdAtRef.current || ts,
        lastModified: ts,
        messageCount: messageCountRef.current,
      });
    },
    [ensureSession],
  );

  const startNew = useCallback(() => {
    setCurrentId(null);
    setInitialRows([]);
    titleRef.current = null;
    messageCountRef.current = 0;
    createdAtRef.current = 0;
    modelLoggedRef.current = false;
  }, [setCurrentId]);

  const switchTo = useCallback(
    (id: SessionId): ChatRow[] => {
      const events = loadSession(id);
      const rows = eventsToChatRows(events);
      const meta = listSessions().find((s) => s.id === id);
      setCurrentId(id);
      setInitialRows(rows);
      titleRef.current = meta?.title ?? '(untitled)';
      messageCountRef.current = meta?.messageCount ?? rows.length;
      createdAtRef.current = meta?.createdAt ?? Date.now();
      modelLoggedRef.current = true;
      return rows;
    },
    [setCurrentId],
  );

  const list = useCallback(() => listSessions(), []);
  const remove = useCallback(
    (id: SessionId) => {
      removeSession(id);
      if (id === currentIdRef.current) startNew();
    },
    [startNew],
  );

  return { currentId, initialRows, ready, recordRow, startNew, switchTo, list, remove };
}
