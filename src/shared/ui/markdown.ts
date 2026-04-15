import { marked } from 'marked';
import { markedTerminal } from 'marked-terminal';

// Configure once at module load. marked is a singleton.
// Design: we DISABLE marked-terminal's reflow because it splits words inside
// ANSI spans (a `**bold $**` would wrap as `**bold\n$**`, breaking the styling
// and leaving visible asterisks). Ink's <Text> wraps at the Box boundary using
// an ANSI-aware width calculator, so the text flows cleanly around styling.
marked.use(
  markedTerminal({
    reflowText: false,
    tab: 2,
    width: Math.max(40, Math.min(process.stdout.columns || 100, 120)),
    showSectionPrefix: false,
    unescape: true,
  }) as Parameters<typeof marked.use>[0],
);

export function renderMarkdown(text: string): string {
  if (!text) return '';
  const out = marked.parse(text, { async: false }) as string;
  // Trim trailing newlines and collapse 3+ consecutive newlines to a single
  // blank line — marked-terminal inserts triple-spacing between blocks.
  return out.replace(/\n{3,}/g, '\n\n').replace(/\n+$/, '');
}
