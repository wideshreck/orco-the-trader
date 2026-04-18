import type { Dispatch, SetStateAction } from 'react';
import type { StreamEvent } from '../tools/index.js';
import type { AssistantRow, ChatRow, ToolRow } from './types.js';

// Mutable per-turn context. assistantAcc and activeAssistantId advance within
// a single send() call; we carry them in an object so the event handler can
// mutate them without re-threading callback parameters.
export type TurnContext = {
  assistantAcc: string;
  activeAssistantId: number;
  stepAssistantId: number;
  nextId: () => number;
};

export function applyStreamEvent(
  ev: StreamEvent,
  ctx: TurnContext,
  setLive: Dispatch<SetStateAction<ChatRow[]>>,
): void {
  switch (ev.type) {
    case 'text-delta': {
      ctx.assistantAcc += ev.delta;
      const captured = ctx.assistantAcc;
      const targetId = ctx.activeAssistantId;
      setLive((prev) =>
        prev.map((r) =>
          r.id === targetId && r.kind === 'assistant' ? { ...r, content: captured } : r,
        ),
      );
      return;
    }
    case 'tool-call': {
      const row: ToolRow = {
        id: ctx.nextId(),
        kind: 'tool',
        toolCallId: ev.toolCallId,
        name: ev.toolName,
        input: ev.input,
        status: 'pending',
      };
      const newAssistantId = ctx.nextId();
      ctx.activeAssistantId = newAssistantId;
      ctx.assistantAcc = '';
      setLive((prev) => [...prev, row, { id: newAssistantId, kind: 'assistant', content: '' }]);
      return;
    }
    case 'approval-request': {
      setLive((prev) =>
        prev.map((r) =>
          r.kind === 'tool' && r.toolCallId === ev.toolCallId
            ? { ...r, status: 'awaiting-approval' }
            : r,
        ),
      );
      return;
    }
    case 'tool-result': {
      setLive((prev) =>
        prev.map((r) =>
          r.kind === 'tool' && r.toolCallId === ev.toolCallId
            ? { ...r, output: ev.output, status: 'done' }
            : r,
        ),
      );
      return;
    }
    case 'tool-error': {
      const denied = ev.error.startsWith('denied by user');
      setLive((prev) =>
        prev.map((r) =>
          r.kind === 'tool' && r.toolCallId === ev.toolCallId
            ? { ...r, error: ev.error, status: denied ? 'denied' : 'error' }
            : r,
        ),
      );
      return;
    }
    case 'usage': {
      const targetId = ctx.stepAssistantId;
      const usage = ev.usage;
      setLive((prev) =>
        prev.map((r) => (r.id === targetId && r.kind === 'assistant' ? { ...r, usage } : r)),
      );
      ctx.stepAssistantId = ctx.activeAssistantId;
      return;
    }
  }
}

export function handleTurnError(
  activeAssistantId: number,
  setLive: Dispatch<SetStateAction<ChatRow[]>>,
  aborted: boolean,
  errText: string,
): void {
  setLive((prev) =>
    prev.map((r) => {
      if (r.id !== activeAssistantId || r.kind !== 'assistant') return r;
      const next: AssistantRow = { ...r, content: errText };
      if (!aborted) next.error = true;
      return next;
    }),
  );
}

// On stream end: promote any tool rows still 'pending' or 'awaiting-approval'
// (Ctrl+C mid-call) to 'error' so they don't commit as zombies, then handle
// the trailing empty assistant row based on what came before:
//   - any tool row present → drop the trailer silently (it was the step
//     container after a successful tool chain that ended without commentary)
//   - nothing else produced → flag a red "(empty response)" so the user
//     doesn't stare at a vanished turn wondering if the model hung up
export function finalizeLive(current: ChatRow[]): ChatRow[] {
  const finalized: ChatRow[] = current.map((r) => {
    if (r.kind === 'tool' && (r.status === 'pending' || r.status === 'awaiting-approval')) {
      return { ...r, status: 'error', error: r.error ?? '(canceled)' };
    }
    return r;
  });
  if (finalized.length === 0) return finalized;
  const last = finalized[finalized.length - 1];
  const isEmptyTrailingAssistant =
    last && last.kind === 'assistant' && last.content === '' && !last.error;
  if (!isEmptyTrailingAssistant) return finalized;

  const hasTool = finalized.some((r) => r.kind === 'tool');
  const hasAssistantContent = finalized.some(
    (r, i) => i !== finalized.length - 1 && r.kind === 'assistant' && (r.content || r.error),
  );
  // Tool or earlier assistant produced output — drop the empty trailer.
  if (hasTool || hasAssistantContent) return finalized.slice(0, -1);

  // True silent turn. Keep the row and mark it as an empty-response error.
  return finalized.slice(0, -1).concat([
    {
      ...last,
      kind: 'assistant',
      content: '(empty response — model returned no output)',
      error: true,
    },
  ]);
}

export function maxIdOf(rows: ChatRow[]): number {
  let m = 0;
  for (const r of rows) if (r.id > m) m = r.id;
  return m;
}
