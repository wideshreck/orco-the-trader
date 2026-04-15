import { z } from 'zod';
import { defineTool } from '../define.js';

export const getTime = defineTool({
  name: 'get_time',
  description:
    'Returns the current time in ISO 8601 format. Optionally accepts an IANA timezone name to format the result in that zone.',
  permission: 'auto',
  inputSchema: z.object({
    tz: z
      .string()
      .optional()
      .describe('IANA timezone name, e.g. "Europe/Istanbul" or "America/New_York"'),
  }),
  async execute(input) {
    const now = new Date();
    if (!input.tz) return { iso: now.toISOString() };
    try {
      const formatted = new Intl.DateTimeFormat('en-CA', {
        timeZone: input.tz,
        dateStyle: 'short',
        timeStyle: 'long',
      }).format(now);
      return { iso: now.toISOString(), formatted, tz: input.tz };
    } catch {
      throw new Error(`invalid timezone: ${input.tz}`);
    }
  },
});
