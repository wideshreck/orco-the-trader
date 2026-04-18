import { tool as aiTool, type ToolSet } from 'ai';
import { isAlwaysAllowed } from './approvals.js';
import type { Approver, OrcoTool, Permission } from './types.js';

const REGISTRY = new Map<string, OrcoTool<unknown, unknown>>();
let overrides: Record<string, Permission> = {};

export function register<I, O>(tool: OrcoTool<I, O>): void {
  if (REGISTRY.has(tool.name)) {
    throw new Error(`tool already registered: ${tool.name}`);
  }
  REGISTRY.set(tool.name, tool as unknown as OrcoTool<unknown, unknown>);
}

export function setPermissionOverrides(next: Record<string, Permission>): void {
  overrides = { ...next };
}

export function effectivePermission(tool: OrcoTool<unknown, unknown>): Permission {
  return overrides[tool.name] ?? tool.permission;
}

export function listAll(): OrcoTool<unknown, unknown>[] {
  return [...REGISTRY.values()];
}

export function listActive(): OrcoTool<unknown, unknown>[] {
  return listAll().filter((t) => effectivePermission(t) !== 'deny');
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
        const needsApproval = effectivePermission(t) === 'ask' && !isAlwaysAllowed(t.name);
        if (needsApproval) {
          const decision = await opts.approver({
            toolCallId: callCtx.toolCallId,
            toolName: t.name,
            input: parsed.data,
          });
          if (decision === 'deny') {
            // Message is surfaced to the model as the tool-result error. Keep
            // it explicit: retrying the same call with the same args will be
            // denied again, so the model should ask the user instead.
            throw new Error('denied by user — do not retry this tool; ask the user what to do');
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
