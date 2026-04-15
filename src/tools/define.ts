import type { ZodType } from 'zod';
import type { OrcoTool, Permission, ToolContext } from './types.js';

const NAME_RE = /^[a-z][a-z0-9_]*$/;

type DefineToolInput<I, O> = {
  name: string;
  description: string;
  permission?: Permission;
  inputSchema: ZodType<I>;
  execute: (input: I, ctx: ToolContext) => Promise<O>;
};

export function defineTool<I, O>(spec: DefineToolInput<I, O>): OrcoTool<I, O> {
  if (!NAME_RE.test(spec.name)) {
    throw new Error(`tool name must match ${NAME_RE}: got "${spec.name}"`);
  }
  return {
    name: spec.name,
    description: spec.description,
    permission: spec.permission ?? 'ask',
    inputSchema: spec.inputSchema,
    execute: spec.execute,
  };
}
