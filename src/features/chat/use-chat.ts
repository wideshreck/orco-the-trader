import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { errorMessage, isAbortError } from '../../shared/errors/index.js';
import type { CatalogProvider, ModelRef } from '../models/catalog.js';
import type { CompactionPoint } from '../sessions/index.js';
import type { Approver } from '../tools/index.js';
import { applyStreamEvent, finalizeLive, handleTurnError, maxIdOf } from './apply-event.js';
import { BASE_SYSTEM_PROMPT } from './base-prompt.js';
import { summarizeRows } from './compact.js';
import { streamChat } from './stream.js';
import type { AssistantRow, ChatRow, CompactOutcome, SubmitOutcome, UserRow } from './types.js';

export type {
  AssistantRow,
  ChatRow,
  CompactOutcome,
  SubmitOutcome,
  ToolRow,
  UserRow,
} from './types.js';

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

  // As soon as a tool row reaches a terminal status (done / error / denied)
  // move it out of the dynamic live area into scrollback. This keeps the
  // live block short so Ink's in-place redraws don't overflow the terminal
  // and leak old frames into scrollback on long responses.
  useEffect(() => {
    const settled = live.filter(
      (r) =>
        r.kind === 'tool' && (r.status === 'done' || r.status === 'error' || r.status === 'denied'),
    );
    if (settled.length === 0) return;
    const settledIds = new Set(settled.map((r) => r.id));
    for (const row of settled) {
      if (committedIdsRef.current.has(row.id)) continue;
      committedIdsRef.current.add(row.id);
      onCommit?.(row);
    }
    setLive((prev) => prev.filter((r) => !settledIds.has(r.id)));
    setScrollback((prev) => [...prev, ...settled]);
  }, [live, onCommit]);

  const cancel = useCallback(() => abortRef.current?.abort(), []);

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

  const clear = useCallback(() => {
    setScrollback([]);
    setLive([]);
    setCompactionPoint(null);
    committedIdsRef.current = new Set();
  }, []);

  const send = useCallback(
    async (text: string): Promise<SubmitOutcome> => {
      const trimmed = text.trim();
      if (!trimmed) return 'empty';
      if (streaming) return 'busy';
      if (!target) return 'no-model';

      const userMsg: UserRow = { id: nextId(), kind: 'user', content: trimmed };
      const assistantId = nextId();
      const initialAssistant: AssistantRow = { id: assistantId, kind: 'assistant', content: '' };
      const activeCp = compactionPoint;
      const visibleHistory = activeCp ? messages.filter((r) => r.id > activeCp.afterId) : messages;
      const baseHistory = [...visibleHistory, userMsg];
      setScrollback((prev) => [...prev, userMsg]);
      setLive([initialAssistant]);
      setStreaming(true);
      committedIdsRef.current.add(userMsg.id);
      onCommit?.(userMsg);

      const controller = new AbortController();
      abortRef.current = controller;
      const ctx = {
        assistantAcc: '',
        activeAssistantId: assistantId,
        stepAssistantId: assistantId,
        nextId,
      };

      try {
        const system = buildSystemPrompt(systemPrompt, activeCp);
        for await (const ev of streamChat(target.provider, target.ref, baseHistory, {
          signal: controller.signal,
          approver,
          system,
        })) {
          applyStreamEvent(ev, ctx, setLive);
        }
      } catch (err: unknown) {
        const aborted = isAbortError(err);
        const errText = aborted ? '(canceled)' : `Error: ${errorMessage(err)}`;
        handleTurnError(ctx.activeAssistantId, setLive, aborted, errText);
      } finally {
        setStreaming(false);
        abortRef.current = null;
        setLive((current) => {
          const trimmed = finalizeLive(current);
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

function buildSystemPrompt(userPrompt: string | undefined, cp: CompactionPoint | null): string {
  const parts: string[] = [BASE_SYSTEM_PROMPT];
  if (userPrompt?.trim()) parts.push(userPrompt.trim());
  if (cp) parts.push(`Summary of earlier conversation:\n${cp.summary}`);
  return parts.join('\n\n');
}
