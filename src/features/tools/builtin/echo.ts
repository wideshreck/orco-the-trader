import { z } from 'zod';
import { defineTool } from '../define.js';

export const echo = defineTool({
  name: 'echo',
  description: 'Echoes the input text back. Useful for testing tool wiring.',
  permission: 'auto',
  inputSchema: z.object({
    text: z.string().describe('Text to echo back'),
  }),
  async execute(input) {
    return { echo: input.text };
  },
});
