import { z } from 'zod';
import { defineTool } from '../tools/define.js';
import { addSymbol, clearWatchlist, loadWatchlist, removeSymbol } from './storage.js';

export const watchlistTool = defineTool({
  name: 'watchlist',
  description: [
    "Manage the user's persistent symbol watchlist stored at",
    '~/.config/orco/watchlist.json. Use for coins the user is tracking',
    'across sessions.',
    '',
    'Actions:',
    '  list           — return current symbols',
    '  add            — add `symbol` (uppercased; duplicates ignored)',
    '  remove         — remove `symbol`',
    '  clear          — wipe the list',
    '',
    'After `add` / `remove` / `clear` the fresh list is returned. Call',
    "`list` at the start of a multi-symbol session to honour the user's",
    'saved focus.',
  ].join('\n'),
  permission: 'auto',
  inputSchema: z.object({
    action: z.enum(['list', 'add', 'remove', 'clear']),
    symbol: z.string().optional().describe('Required for add/remove'),
  }),
  async execute(input) {
    switch (input.action) {
      case 'list':
        return loadWatchlist();
      case 'add':
        if (!input.symbol) throw new Error('add requires `symbol`');
        return addSymbol(input.symbol);
      case 'remove':
        if (!input.symbol) throw new Error('remove requires `symbol`');
        return removeSymbol(input.symbol);
      case 'clear':
        clearWatchlist();
        return { symbols: [] };
    }
  },
});
