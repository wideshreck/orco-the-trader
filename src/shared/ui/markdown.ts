import { marked } from 'marked';
import { markedTerminal } from 'marked-terminal';

// Configure once at module load. marked is a singleton.
// reflowText is OFF so ANSI spans (bold, italic) aren't split across lines;
// Ink's <Text> wraps at the Box boundary with an ANSI-aware width calculator.
marked.use(
  markedTerminal({
    reflowText: false,
    tab: 2,
    width: Math.max(40, Math.min(process.stdout.columns || 100, 120)),
    showSectionPrefix: false,
    unescape: true,
    hr: () => '\n\x1b[2m────────────────────────────────\x1b[0m\n',
  }) as Parameters<typeof marked.use>[0],
);

// marked-terminal + GFM task lists double-render the `[X]`/`[ ]` marker
// (emits the extension's checkbox AND leaves the raw bracket text in place).
// Collapse the duplicate pair into a single marker.
const DUPLICATE_TASK = /\[([xX ])\]\s+\[\1\]/g;

export function renderMarkdown(text: string): string {
  if (!text) return '';
  const out = marked.parse(text, { async: false }) as string;
  return out
    .replace(DUPLICATE_TASK, '[$1]')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n+$/, '');
}
