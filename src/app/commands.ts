export type SlashCommand = {
  name: string;
  description: string;
};

export const SLASH_COMMANDS: readonly SlashCommand[] = [
  { name: '/model', description: 'select model' },
  { name: '/clear', description: 'clear chat history' },
  { name: '/exit', description: 'exit orco' },
] as const;

export function matchCommands(input: string): SlashCommand[] {
  if (!input.startsWith('/')) return [];
  const q = input.toLowerCase();
  const matches = SLASH_COMMANDS.filter((c) => c.name.startsWith(q));
  if (matches.length === 1 && matches[0]?.name === input) return [];
  return matches;
}
