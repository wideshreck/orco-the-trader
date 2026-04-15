import os from 'node:os';
import path from 'node:path';
import { isKnownCommand, SLASH_COMMANDS } from '../commands/index.js';
import type { InfoPanel } from '../features/chat/chat-view.js';
import { computeCost, formatTokens, formatUsd } from '../features/chat/cost.js';
import type { ChatRow } from '../features/chat/use-chat.js';
import { listMcpServers } from '../features/mcp/index.js';
import type { Catalog, ModelRef } from '../features/models/catalog.js';
import { listSkills, skillsDir } from '../features/skills/index.js';
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
  compactChat: () => void;
  messages: ChatRow[];
  catalog: Catalog;
  ref: ModelRef;
  systemPrompt?: string;
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
  if (trimmed === '/cost') {
    ctx.setInfoPanel(buildCostPanel(ctx.messages, ctx.catalog, ctx.ref));
    return 'handled';
  }
  if (trimmed === '/compact') {
    ctx.compactChat();
    return 'handled';
  }
  if (trimmed === '/mcp') {
    const servers = listMcpServers();
    if (servers.length === 0) {
      ctx.setInfoPanel({
        title: 'mcp',
        lines: [
          '  (no MCP servers configured)',
          '  add them under "mcpServers" in ~/.config/orco/config.json',
        ],
      });
    } else {
      const lines = servers.map((s) => {
        if (s.status.state === 'ready')
          return `  ✓ ${s.name.padEnd(16)} ready · ${s.status.toolCount} tools  ${s.config.url}`;
        if (s.status.state === 'connecting')
          return `  … ${s.name.padEnd(16)} connecting  ${s.config.url}`;
        return `  ✗ ${s.name.padEnd(16)} failed: ${s.status.error}`;
      });
      ctx.setInfoPanel({ title: 'mcp servers', lines });
    }
    return 'handled';
  }
  if (trimmed === '/skills') {
    const skills = listSkills();
    const home = os.homedir();
    const dirLabel = skillsDir().replace(home, '~');
    if (skills.length === 0) {
      ctx.setInfoPanel({
        title: 'skills',
        lines: ['  (no skills installed)', `  drop SKILL.md files into ${dirLabel}/`],
      });
    } else {
      const lines = skills.map((s) => `  ${s.name.padEnd(16)}  ${s.description}`);
      lines.push('', `  directory: ${dirLabel}`);
      ctx.setInfoPanel({ title: 'skills', lines });
    }
    return 'handled';
  }
  if (trimmed === '/prompt') {
    const sp = ctx.systemPrompt?.trim();
    const configLabel = path.join('~', '.config', 'orco', 'config.json');
    if (sp) {
      const preview = sp.length > 600 ? `${sp.slice(0, 597)}...` : sp;
      ctx.setInfoPanel({
        title: 'system prompt',
        lines: preview
          .split('\n')
          .map((l) => `  ${l}`)
          .concat('', `  edit: ${configLabel} (systemPrompt)`),
      });
    } else {
      ctx.setInfoPanel({
        title: 'system prompt',
        lines: ['  (no system prompt set)', `  add "systemPrompt" string in ${configLabel}`],
      });
    }
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

function buildCostPanel(messages: ChatRow[], catalog: Catalog, ref: ModelRef): InfoPanel {
  let inTotal = 0;
  let outTotal = 0;
  let costTotal = 0;
  let costAvailable = false;
  const lines: string[] = [];
  let turn = 0;
  for (const row of messages) {
    if (row.kind !== 'assistant' || !row.usage) continue;
    turn++;
    const cost = computeCost(row.usage, catalog, ref);
    inTotal += row.usage.inputTokens;
    outTotal += row.usage.outputTokens;
    if (cost) {
      costTotal += cost.totalUsd;
      costAvailable = true;
    }
    const costStr = cost ? formatUsd(cost.totalUsd) : '—';
    lines.push(
      `  #${String(turn).padStart(2, ' ')}  ${formatTokens(row.usage.inputTokens).padStart(6, ' ')} in · ${formatTokens(row.usage.outputTokens).padStart(6, ' ')} out · ${costStr}`,
    );
  }
  if (lines.length === 0) return { title: 'cost', lines: ['  (no usage recorded yet)'] };
  lines.push(
    `  ────────────────────────────────────────`,
    `  total ${formatTokens(inTotal)} in · ${formatTokens(outTotal)} out${costAvailable ? ` · ${formatUsd(costTotal)}` : ''}`,
  );
  return { title: 'cost', lines };
}
