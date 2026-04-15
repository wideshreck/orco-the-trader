import { z } from 'zod';
import { getSkill, listSkills } from '../../skills/index.js';
import { defineTool } from '../define.js';

export function buildSkillTool() {
  const skills = listSkills();
  if (skills.length === 0) return null;
  const catalogLines = skills.map((s) => `- ${s.name}: ${s.description}`).join('\n');
  const description = [
    'Load a specialized skill by name. A skill is a packaged set of instructions',
    'to follow for a specific task. Available skills:',
    '',
    catalogLines,
    '',
    'Invoke this tool with the skill name before attempting the task. The tool',
    'returns the full skill instructions which you must then follow precisely.',
  ].join('\n');
  return defineTool({
    name: 'skill',
    description,
    permission: 'auto',
    inputSchema: z.object({
      name: z.string().describe('skill name, must match one of the available skills'),
    }),
    async execute(input) {
      const skill = getSkill(input.name);
      if (!skill) {
        throw new Error(
          `unknown skill: ${input.name}. Available: ${listSkills()
            .map((s) => s.name)
            .join(', ')}`,
        );
      }
      return { name: skill.name, instructions: skill.body };
    },
  });
}
