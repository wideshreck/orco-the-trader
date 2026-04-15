import { z } from 'zod';
import { defineTool } from '../define.js';
import { askHumanUser } from '../question.js';

export const askUser = defineTool({
  name: 'ask_user',
  description: [
    'Ask the user a clarifying question and wait for their answer.',
    'Use this sparingly — prefer acting on reasonable assumptions when the',
    'intent is clear. Only call when a decision genuinely depends on the',
    'user and cannot be made without their input.',
    '',
    'If you supply `choices`, the user picks from that list. Otherwise they',
    'type a free-form answer.',
  ].join('\n'),
  permission: 'auto',
  inputSchema: z.object({
    question: z.string().describe('The question to ask the user, in plain prose.'),
    choices: z
      .array(z.string())
      .optional()
      .describe(
        'Optional multiple-choice options. When provided, the user picks one; when omitted, they type a free-form answer.',
      ),
  }),
  async execute(input) {
    const answer = await askHumanUser({
      question: input.question,
      ...(input.choices ? { choices: input.choices } : {}),
    });
    return { answer };
  },
});
