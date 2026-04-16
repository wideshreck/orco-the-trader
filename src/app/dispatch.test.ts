import { beforeEach, describe, expect, it } from 'bun:test';
import { clearForTesting } from '../features/tools/registry.js';
import { type DispatchCtx, dispatchCommand, type Phase } from './dispatch.js';

function makeCtx(overrides: Partial<DispatchCtx> = {}): DispatchCtx {
  let lastPhase: Phase | null = null;
  let lastPanel: DispatchCtx['setInfoPanel'] extends (p: infer P) => void ? P : never = null;
  let exited = false;
  let cleared = false;
  let compacted = false;
  const base: DispatchCtx = {
    setPhase: (p) => {
      lastPhase = p;
    },
    setInfoPanel: (p) => {
      lastPanel = p;
    },
    exit: () => {
      exited = true;
    },
    clearChat: () => {
      cleared = true;
    },
    compactChat: () => {
      compacted = true;
    },
    messages: [],
    catalog: {},
    ref: { providerId: '', modelId: '' },
    ...overrides,
  };
  // Attach inspectors for assertions
  const api = base as DispatchCtx & {
    _last: () => {
      phase: Phase | null;
      panel: typeof lastPanel;
      exited: boolean;
      cleared: boolean;
      compacted: boolean;
    };
  };
  api._last = () => ({
    phase: lastPhase,
    panel: lastPanel,
    exited,
    cleared,
    compacted,
  });
  return api;
}

describe('dispatchCommand', () => {
  beforeEach(() => {
    clearForTesting();
  });

  it('routes /model to the picker phase', () => {
    const ctx = makeCtx();
    expect(dispatchCommand('/model', ctx)).toBe('handled');
    expect((ctx as ReturnType<typeof makeCtx>)._last().phase).toEqual({ kind: 'picker' });
  });

  it('routes /sessions to the sessions phase', () => {
    const ctx = makeCtx();
    dispatchCommand('/sessions', ctx);
    expect((ctx as ReturnType<typeof makeCtx>)._last().phase).toEqual({ kind: 'sessions' });
  });

  it('treats /clear and /new the same way', () => {
    const a = makeCtx();
    dispatchCommand('/clear', a);
    expect((a as ReturnType<typeof makeCtx>)._last().cleared).toBe(true);
    const b = makeCtx();
    dispatchCommand('/new', b);
    expect((b as ReturnType<typeof makeCtx>)._last().cleared).toBe(true);
  });

  it('triggers exit on /exit', () => {
    const ctx = makeCtx();
    dispatchCommand('/exit', ctx);
    expect((ctx as ReturnType<typeof makeCtx>)._last().exited).toBe(true);
  });

  it('triggers compaction on /compact', () => {
    const ctx = makeCtx();
    dispatchCommand('/compact', ctx);
    expect((ctx as ReturnType<typeof makeCtx>)._last().compacted).toBe(true);
  });

  it('shows a help panel on /help listing all commands', () => {
    const ctx = makeCtx();
    dispatchCommand('/help', ctx);
    const panel = (ctx as ReturnType<typeof makeCtx>)._last().panel;
    expect(panel?.title).toBe('commands');
    expect(panel?.lines.length).toBeGreaterThan(5);
  });

  it('shows a tools panel on /tools (empty registry)', () => {
    const ctx = makeCtx();
    dispatchCommand('/tools', ctx);
    const panel = (ctx as ReturnType<typeof makeCtx>)._last().panel;
    expect(panel?.title).toBe('tools');
    expect(panel?.lines[0]).toContain('(none registered)');
  });

  it('returns unknown for an unregistered slash command and surfaces a hint', () => {
    const ctx = makeCtx();
    expect(dispatchCommand('/foobar', ctx)).toBe('unknown');
    const panel = (ctx as ReturnType<typeof makeCtx>)._last().panel;
    expect(panel?.title).toBe('unknown command');
    expect(panel?.lines.join('\n')).toContain('/foobar');
  });

  it('returns send for plain text', () => {
    const ctx = makeCtx();
    expect(dispatchCommand('hello world', ctx)).toBe('send');
  });

  it('/cost with no usage rows emits a placeholder line', () => {
    const ctx = makeCtx();
    dispatchCommand('/cost', ctx);
    const panel = (ctx as ReturnType<typeof makeCtx>)._last().panel;
    expect(panel?.title).toBe('cost');
    expect(panel?.lines[0]).toContain('no usage recorded');
  });

  it('/prompt with no user overlay shows base prompt + empty overlay notice', () => {
    const ctx = makeCtx();
    dispatchCommand('/prompt', ctx);
    const panel = (ctx as ReturnType<typeof makeCtx>)._last().panel;
    expect(panel?.title).toBe('system prompt');
    const joined = (panel?.lines ?? []).join('\n');
    expect(joined).toContain('built-in base prompt');
    expect(joined).toContain('user overlay: (none)');
  });

  it('/prompt with a systemPrompt renders it line-by-line', () => {
    const ctx = makeCtx({ systemPrompt: 'line one\nline two' });
    dispatchCommand('/prompt', ctx);
    const panel = (ctx as ReturnType<typeof makeCtx>)._last().panel;
    const joined = (panel?.lines ?? []).join('\n');
    expect(joined).toContain('line one');
    expect(joined).toContain('line two');
  });
});
