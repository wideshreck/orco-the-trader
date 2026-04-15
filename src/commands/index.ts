export type SlashCommand = {
  name: string;
  description: string;
};

export const SLASH_COMMANDS: readonly SlashCommand[] = [
  { name: '/clear', description: 'start a new session (alias of /new)' },
  { name: '/compact', description: 'summarize older messages to free context' },
  { name: '/cost', description: 'show token usage and cost breakdown' },
  { name: '/exit', description: 'exit orco' },
  { name: '/help', description: 'show all commands' },
  { name: '/model', description: 'select model' },
  { name: '/new', description: 'start a new session' },
  { name: '/prompt', description: 'show active system prompt' },
  { name: '/sessions', description: 'browse and switch sessions' },
  { name: '/skills', description: 'list installed skills' },
  { name: '/tools', description: 'list registered tools' },
] as const;

export function matchCommands(input: string): SlashCommand[] {
  if (!input.startsWith('/')) return [];
  const q = input.toLowerCase();
  const matches = SLASH_COMMANDS.filter((c) => c.name.startsWith(q));
  if (matches.length === 1 && matches[0]?.name === input) return [];
  return matches;
}

export function isKnownCommand(name: string): boolean {
  return SLASH_COMMANDS.some((c) => c.name === name);
}
