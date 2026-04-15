import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { errorMessage, isAbortError } from '../../shared/errors/index.js';
import type { CatalogProvider, ModelRef } from '../models/catalog.js';
import type { Approver } from '../tools/index.js';
import { streamChat } from './stream.js';

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

export type UseChatOptions = {
  seedRows?: ChatRow[];
  onCommit?: (row: ChatRow) => void;
};

export function useChat(target: Target | null, approver: Approver, opts: UseChatOptions = {}) {
  const { onCommit } = opts;
  // scrollback: monotonically growing; rendered via Ink <Static> so it lands in
  // terminal scrollback and never re-renders.
  // live: actively mutating (current turn). Re-renders on every event.
  const [scrollback, setScrollback] = useState<ChatRow[]>(opts.seedRows ?? []);
  const [live, setLive] = useState<ChatRow[]>([]);
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const idRef = useRef(maxIdOf(opts.seedRows ?? []));
  const committedIdsRef = useRef<Set<number>>(new Set((opts.seedRows ?? []).map((r) => r.id)));
  const nextId = useCallback(() => ++idRef.current, []);

  const messages = useMemo(() => [...scrollback, ...live], [scrollback, live]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const cancel = useCallback(() => abortRef.current?.abort(), []);

  // Switch sessions: append loaded rows to scrollback (they print to terminal
  // history below whatever was already there) and clear live. Past sessions
  // remain visible above in scrollback.
  const reset = useCallback((newRows: ChatRow[]) => {
    setScrollback((prev) => [...prev, ...newRows]);
    setLive([]);
    committedIdsRef.current = new Set([...committedIdsRef.current, ...newRows.map((r) => r.id)]);
    const max = maxIdOf(newRows);
    if (max > idRef.current) idRef.current = max;
  }, []);

  // /new and /clear: just clear the live area; scrollback stays printed.
  const clear = useCallback(() => {
    setLive([]);
  }, []);

  const send = useCallback(
    async (text: string): Promise<SubmitOutcome> => {
      const trimmed = text.trim();
      if (!trimmed) return 'empty';
      if (streaming) return 'busy';
      if (!target) return 'no-model';

      const userMsg: UserRow = { id: nextId(), kind: 'user', content: trimmed };
      const assistantId = nextId();
      const initialAssistant: AssistantRow = {
        id: assistantId,
        kind: 'assistant',
        content: '',
      };
      const baseHistory = [...messages, userMsg];
      setLive((prev) => [...prev, userMsg, initialAssistant]);
      setStreaming(true);
      committedIdsRef.current.add(userMsg.id);
      onCommit?.(userMsg);

      const controller = new AbortController();
      abortRef.current = controller;

      let assistantAcc = '';
      let activeAssistantId = assistantId;

      try {
        for await (const ev of streamChat(target.provider, target.ref, baseHistory, {
          signal: controller.signal,
          approver,
        })) {
          switch (ev.type) {
            case 'text-delta': {
              assistantAcc += ev.delta;
              const captured = assistantAcc;
              const targetId = activeAssistantId;
              setLive((prev) =>
                prev.map((r) =>
                  r.id === targetId && r.kind === 'assistant' ? { ...r, content: captured } : r,
                ),
              );
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
              const newAssistantId = nextId();
              activeAssistantId = newAssistantId;
              assistantAcc = '';
              setLive((prev) => [
                ...prev,
                row,
                { id: newAssistantId, kind: 'assistant', content: '' },
              ]);
              break;
            }
            case 'approval-request': {
              setLive((prev) =>
                prev.map((r) =>
                  r.kind === 'tool' && r.toolCallId === ev.toolCallId
                    ? { ...r, status: 'awaiting-approval' }
                    : r,
                ),
              );
              break;
            }
            case 'tool-result': {
              setLive((prev) =>
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
              setLive((prev) =>
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
        const errText = aborted ? '(canceled)' : `Error: ${errorMessage(err)}`;
        const targetId = activeAssistantId;
        setLive((prev) =>
          prev.map((r) => {
            if (r.id !== targetId || r.kind !== 'assistant') return r;
            const next: AssistantRow = { ...r, content: errText };
            if (!aborted) next.error = true;
            return next;
          }),
        );
      } finally {
        setStreaming(false);
        abortRef.current = null;
        // Promote the entire turn from live to scrollback (so Ink <Static>
        // commits it to terminal history). Drop trailing empty assistant.
        setLive((current) => {
          const trimmed = trimEmptyTrailingAssistant(current);
          for (const row of trimmed) {
            if (committedIdsRef.current.has(row.id)) continue;
            committedIdsRef.current.add(row.id);
            onCommit?.(row);
          }
          setScrollback((prev) => [...prev, ...trimmed]);
          return [];
        });
      }
      return 'sent';
    },
    [messages, streaming, target, approver, nextId, onCommit],
  );

  return { messages, scrollback, live, streaming, send, clear, cancel, reset };
}

function maxIdOf(rows: ChatRow[]): number {
  let m = 0;
  for (const r of rows) if (r.id > m) m = r.id;
  return m;
}

function trimEmptyTrailingAssistant(rows: ChatRow[]): ChatRow[] {
  if (rows.length === 0) return rows;
  const last = rows[rows.length - 1];
  if (last && last.kind === 'assistant' && last.content === '' && !last.error) {
    return rows.slice(0, -1);
  }
  return rows;
}
