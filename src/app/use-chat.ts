import { useCallback, useEffect, useRef, useState } from 'react';
import { type ChatMessage, streamChat } from '../ai.js';
import type { CatalogProvider, ModelRef } from '../catalog.js';
import { errorMessage, isAbortError } from '../errors.js';
import type { Approver } from '../tools/index.js';

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

export function useChat(target: Target | null, approver: Approver) {
  const [messages, setMessages] = useState<ChatRow[]>([]);
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const idRef = useRef(0);
  const nextId = useCallback(() => ++idRef.current, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  const cancel = useCallback(() => abortRef.current?.abort(), []);
  const clear = useCallback(() => setMessages([]), []);

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
      setMessages([...baseHistory, initialAssistant]);
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      let assistantAcc = '';
      let activeAssistantId = assistantId;

      const wire: ChatMessage[] = baseHistory
        .filter((m): m is UserRow | AssistantRow => m.kind === 'user' || m.kind === 'assistant')
        .map((m) => ({ role: m.kind, content: m.content }));

      try {
        for await (const ev of streamChat(target.provider, target.ref, wire, {
          signal: controller.signal,
          approver,
        })) {
          switch (ev.type) {
            case 'text-delta': {
              assistantAcc += ev.delta;
              const captured = assistantAcc;
              const targetId = activeAssistantId;
              setMessages((prev) =>
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
              setMessages((prev) => [
                ...prev,
                row,
                { id: newAssistantId, kind: 'assistant', content: '' },
              ]);
              break;
            }
            case 'approval-request': {
              setMessages((prev) =>
                prev.map((r) =>
                  r.kind === 'tool' && r.toolCallId === ev.toolCallId
                    ? { ...r, status: 'awaiting-approval' }
                    : r,
                ),
              );
              break;
            }
            case 'tool-result': {
              setMessages((prev) =>
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
              setMessages((prev) =>
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
        const text = aborted ? '(canceled)' : `Error: ${errorMessage(err)}`;
        const targetId = activeAssistantId;
        setMessages((prev) =>
          prev.map((r) => {
            if (r.id !== targetId || r.kind !== 'assistant') return r;
            const next: AssistantRow = { ...r, content: text };
            if (!aborted) next.error = true;
            return next;
          }),
        );
      } finally {
        setStreaming(false);
        abortRef.current = null;
        setMessages((prev) => trimEmptyTrailingAssistant(prev));
      }
      return 'sent';
    },
    [messages, streaming, target, approver, nextId],
  );

  return { messages, streaming, send, clear, cancel };
}

function trimEmptyTrailingAssistant(rows: ChatRow[]): ChatRow[] {
  if (rows.length === 0) return rows;
  const last = rows[rows.length - 1];
  if (last && last.kind === 'assistant' && last.content === '' && !last.error) {
    return rows.slice(0, -1);
  }
  return rows;
}
