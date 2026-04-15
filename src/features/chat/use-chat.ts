import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { errorMessage, isAbortError } from '../../shared/errors/index.js';
import type { CatalogProvider, ModelRef } from '../models/catalog.js';
import type { CompactionPoint } from '../sessions/index.js';
import type { Approver, TokenUsage } from '../tools/index.js';
import { summarizeRows } from './compact.js';
import { streamChat } from './stream.js';

export type UserRow = { id: number; kind: 'user'; content: string };
export type AssistantRow = {
  id: number;
  kind: 'assistant';
  content: string;
  error?: boolean;
  usage?: TokenUsage;
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
export type CompactOutcome = 'compacted' | 'too-short' | 'no-model' | 'busy' | 'error';

type Target = { provider: CatalogProvider; ref: ModelRef };

export type UseChatOptions = {
  seedRows?: ChatRow[];
  seedCompactionPoint?: CompactionPoint | null;
  systemPrompt?: string;
  onCommit?: (row: ChatRow) => void;
  onCompact?: (cp: CompactionPoint) => void;
};

const KEEP_TAIL_ROWS = 6;

export function useChat(target: Target | null, approver: Approver, opts: UseChatOptions = {}) {
  const { onCommit, onCompact, systemPrompt } = opts;
  // scrollback: monotonically growing; rendered via Ink <Static> so it lands in
  // terminal scrollback and never re-renders.
  // live: actively mutating (current turn). Re-renders on every event.
  const [scrollback, setScrollback] = useState<ChatRow[]>(opts.seedRows ?? []);
  const [live, setLive] = useState<ChatRow[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [compactionPoint, setCompactionPoint] = useState<CompactionPoint | null>(
    opts.seedCompactionPoint ?? null,
  );
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
  const reset = useCallback(
    (load: { rows: ChatRow[]; compactionPoint: CompactionPoint | null }) => {
      setScrollback((prev) => [...prev, ...load.rows]);
      setLive([]);
      setCompactionPoint(load.compactionPoint);
      committedIdsRef.current = new Set([
        ...committedIdsRef.current,
        ...load.rows.map((r) => r.id),
      ]);
      const max = maxIdOf(load.rows);
      if (max > idRef.current) idRef.current = max;
    },
    [],
  );

  // /new and /clear: just clear the live area; scrollback stays printed.
  const clear = useCallback(() => {
    setLive([]);
    setCompactionPoint(null);
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
      const activeCp = compactionPoint;
      const visibleHistory = activeCp ? messages.filter((r) => r.id > activeCp.afterId) : messages;
      const baseHistory = [...visibleHistory, userMsg];
      setLive((prev) => [...prev, userMsg, initialAssistant]);
      setStreaming(true);
      committedIdsRef.current.add(userMsg.id);
      onCommit?.(userMsg);

      const controller = new AbortController();
      abortRef.current = controller;

      let assistantAcc = '';
      let activeAssistantId = assistantId;
      // The assistant row that corresponds to the current LLM step. A step
      // emits text-delta → (optional) tool-call → finish-step (with usage).
      // activeAssistantId advances immediately on tool-call to receive the
      // next step's text, but the just-finishing step's usage still belongs
      // to the PREVIOUS assistant row. Track it separately.
      let stepAssistantId = assistantId;

      try {
        const systemParts: string[] = [];
        if (systemPrompt?.trim()) systemParts.push(systemPrompt.trim());
        if (activeCp) systemParts.push(`Summary of earlier conversation:\n${activeCp.summary}`);
        const system = systemParts.length > 0 ? systemParts.join('\n\n') : undefined;
        for await (const ev of streamChat(target.provider, target.ref, baseHistory, {
          signal: controller.signal,
          approver,
          ...(system ? { system } : {}),
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
            case 'usage': {
              const targetId = stepAssistantId;
              const usage = ev.usage;
              setLive((prev) =>
                prev.map((r) =>
                  r.id === targetId && r.kind === 'assistant' ? { ...r, usage } : r,
                ),
              );
              stepAssistantId = activeAssistantId;
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
    [messages, streaming, target, approver, nextId, onCommit, compactionPoint, systemPrompt],
  );

  const compact = useCallback(async (): Promise<CompactOutcome> => {
    if (streaming) return 'busy';
    if (!target) return 'no-model';
    const activeCp = compactionPoint;
    const sourceRows = activeCp ? messages.filter((r) => r.id > activeCp.afterId) : messages;
    if (sourceRows.length <= KEEP_TAIL_ROWS) return 'too-short';
    const toSummarize = sourceRows.slice(0, sourceRows.length - KEEP_TAIL_ROWS);
    const lastSummarized = toSummarize[toSummarize.length - 1];
    if (!lastSummarized) return 'too-short';
    const controller = new AbortController();
    abortRef.current = controller;
    setStreaming(true);
    try {
      const contextForSummary = activeCp
        ? [
            {
              id: 0,
              kind: 'assistant' as const,
              content: `Previously summarized context:\n${activeCp.summary}`,
            },
            ...toSummarize,
          ]
        : toSummarize;
      const summary = await summarizeRows(
        contextForSummary,
        target.provider,
        target.ref,
        controller.signal,
      );
      if (!summary) return 'error';
      const cp: CompactionPoint = { afterId: lastSummarized.id, summary };
      setCompactionPoint(cp);
      onCompact?.(cp);
      return 'compacted';
    } catch {
      return 'error';
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [messages, compactionPoint, target, streaming, onCompact]);

  return {
    messages,
    scrollback,
    live,
    streaming,
    compactionPoint,
    send,
    clear,
    cancel,
    reset,
    compact,
  };
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
