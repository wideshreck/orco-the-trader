import { isKnownCommand, SLASH_COMMANDS } from '../commands/index.js';
import type { InfoPanel } from '../features/chat/chat-view.js';
import { listActive, listAlwaysAllowed } from '../features/tools/index.js';

export type Phase =
  | { kind: 'bootstrap'; status: string; error?: string | null }
  | { kind: 'picker' }
  | { kind: 'auth'; providerId: string }
  | { kind: 'sessions' }
  | { kind: 'chat' };

export type DispatchCtx = {
  setPhase: (p: Phase) => void;
  setInfoPanel: (p: InfoPanel | null) => void;
  exit: () => void;
  clearChat: () => void;
};

export type DispatchResult = 'handled' | 'unknown' | 'send';

export function dispatchCommand(trimmed: string, ctx: DispatchCtx): DispatchResult {
  if (trimmed === '/model') {
    ctx.setPhase({ kind: 'picker' });
    return 'handled';
  }
  if (trimmed === '/clear' || trimmed === '/new') {
    ctx.clearChat();
    return 'handled';
  }
  if (trimmed === '/sessions') {
    ctx.setPhase({ kind: 'sessions' });
    return 'handled';
  }
  if (trimmed === '/tools') {
    const allowed = new Set(listAlwaysAllowed());
    const lines = listActive().map((t) => {
      const tier = t.permission === 'auto' || allowed.has(t.name) ? 'auto' : 'ask';
      return `  ${t.name.padEnd(12)} [${tier}]  ${t.description}`;
    });
    ctx.setInfoPanel({ title: 'tools', lines: lines.length ? lines : ['  (none registered)'] });
    return 'handled';
  }
  if (trimmed === '/help') {
    const lines = SLASH_COMMANDS.map((c) => `  ${c.name.padEnd(10)}  ${c.description}`);
    ctx.setInfoPanel({ title: 'commands', lines });
    return 'handled';
  }
  if (trimmed === '/exit') {
    ctx.exit();
    return 'handled';
  }
  if (trimmed.startsWith('/') && !isKnownCommand(trimmed)) {
    ctx.setInfoPanel({
      title: 'unknown command',
      lines: [`  ${trimmed} is not a recognized command`, '  type /help to see all commands'],
    });
    return 'unknown';
  }
  return 'send';
}
