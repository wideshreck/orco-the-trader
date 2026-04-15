import { tool as aiTool, type ToolSet } from 'ai';
import { isAlwaysAllowed } from './approvals.js';
import type { Approver, OrcoTool } from './types.js';

const REGISTRY = new Map<string, OrcoTool<unknown, unknown>>();

export function register<I, O>(tool: OrcoTool<I, O>): void {
  if (REGISTRY.has(tool.name)) {
    throw new Error(`tool already registered: ${tool.name}`);
  }
  REGISTRY.set(tool.name, tool as unknown as OrcoTool<unknown, unknown>);
}

export function listAll(): OrcoTool<unknown, unknown>[] {
  return [...REGISTRY.values()];
}

export function listActive(): OrcoTool<unknown, unknown>[] {
  return listAll().filter((t) => t.permission !== 'deny');
}

export function get(name: string): OrcoTool<unknown, unknown> | undefined {
  return REGISTRY.get(name);
}

export function buildAiSdkTools(opts: {
  approver: Approver;
  signal: AbortSignal | undefined;
}): ToolSet {
  const out: ToolSet = {};
  for (const t of listActive()) {
    out[t.name] = aiTool({
      description: t.description,
      inputSchema: t.inputSchema,
      execute: async (rawInput, callCtx) => {
        const parsed = t.inputSchema.safeParse(rawInput);
        if (!parsed.success) {
          throw new Error(`invalid input: ${parsed.error.message}`);
        }
        const needsApproval = t.permission === 'ask' && !isAlwaysAllowed(t.name);
        if (needsApproval) {
          const decision = await opts.approver({
            toolCallId: callCtx.toolCallId,
            toolName: t.name,
            input: parsed.data,
          });
          if (decision === 'deny') {
            throw new Error('denied by user');
          }
        }
        return t.execute(parsed.data, {
          toolCallId: callCtx.toolCallId,
          abortSignal: opts.signal ?? callCtx.abortSignal ?? new AbortController().signal,
        });
      },
    });
  }
  return out;
}

export function clearForTesting(): void {
  REGISTRY.clear();
}
