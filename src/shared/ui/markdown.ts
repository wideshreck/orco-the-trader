import chalk from 'chalk';
import { Marked } from 'marked';
import { markedTerminal } from 'marked-terminal';
import { stripAnsi } from './strip-ansi.js';

// marked-terminal + GFM task lists double-render the `[X]`/`[ ]` marker
// (emits the extension's checkbox AND leaves the raw bracket text in place).
// Collapse the duplicate pair into a single marker.
const DUPLICATE_TASK = /\[([xX ])\]\s+\[\1\]/g;

// Rebuild the parser on every call so the width always reflects the CURRENT
// terminal columns — users resize freely and stale widths make output look
// cropped or over-padded. marked is a global singleton but `new Marked()`
// gives us a fresh instance per call, cheap enough at conversational cadence.
function currentWidth(): number {
  const cols = process.stdout.columns;
  const raw = cols && cols > 0 ? cols : 100;
  // ChatView wraps the content in paddingX={2} boxes (4 cols of padding
  // total); reserve them so marked-terminal doesn't emit lines wider than
  // Ink's actual available area and cause cosmetic breakage on narrow terms.
  const usable = raw - 4;
  return Math.max(40, Math.min(usable, 120));
}

export function renderMarkdown(text: string): string {
  if (!text) return '';
  // Scrub escape sequences from the model's text *before* marked-terminal
  // layers its own styling on top. Otherwise a crafted response could toggle
  // alt-screen, move the cursor, or set the window title.
  const safe = stripAnsi(text);
  const m = new Marked();
  m.use(
    markedTerminal({
      reflowText: false,
      tab: 2,
      width: currentWidth(),
      showSectionPrefix: false,
      unescape: true,
      hr: () => '\n\x1b[2m────────────────────────────────\x1b[0m\n',
      // Italic is almost always a disclaimer/aside in ORCO output — dim so
      // it reads as "soft caveat", not as an emphasized sentence.
      em: chalk.dim.italic,
      // Blockquotes should feel quieter too (dim gray) so structured notes
      // sit underneath the main content instead of competing with it.
      blockquote: chalk.dim.italic,
    }) as Parameters<typeof m.use>[0],
  );
  const out = m.parse(safe, { async: false }) as string;
  return out
    .replace(DUPLICATE_TASK, '[$1]')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n+$/, '');
}
