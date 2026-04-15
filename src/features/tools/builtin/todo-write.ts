import { z } from 'zod';
import { writeTodos } from '../../todos/index.js';
import { defineTool } from '../define.js';

const todoSchema = z.object({
  content: z.string().describe('Short imperative description of the task, e.g. "Fetch BTC OHLCV"'),
  status: z.enum(['pending', 'in_progress', 'completed']).describe('Current state of this item'),
  activeForm: z
    .string()
    .optional()
    .describe('Present-continuous form shown while in_progress, e.g. "Fetching BTC OHLCV"'),
});

export const todoWrite = defineTool({
  name: 'todo_write',
  description: [
    'Record or update the current todo list. Each call REPLACES the previous list',
    'with the one you send — always include every item (even completed ones).',
    '',
    'When to use:',
    '  - Multi-step tasks that span more than two or three tool calls',
    '  - Tasks where the user would benefit from visible progress',
    '  - Complex analyses with distinct phases (fetch → analyze → summarize)',
    '',
    'Rules:',
    '  - Exactly one item should be `in_progress` at a time',
    '  - Mark items `completed` as soon as they finish; do not batch',
    '  - Use `activeForm` ("Fetching prices") as the live label while in_progress',
    '',
    'Skip for trivial single-step tasks — the overhead is not worth it.',
  ].join('\n'),
  permission: 'auto',
  inputSchema: z.object({
    todos: z.array(todoSchema).describe('The full todo list in the desired order'),
  }),
  async execute(input) {
    writeTodos(input.todos);
    return { count: input.todos.length };
  },
});
