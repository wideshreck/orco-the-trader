import { marked } from 'marked';
import { markedTerminal } from 'marked-terminal';

// Configure once at module load. marked is a singleton.
marked.use(
  markedTerminal({
    reflowText: true,
    tab: 2,
    width: Math.max(40, Math.min(process.stdout.columns || 100, 120)),
    showSectionPrefix: false,
    // Keep list layout compact — marked-terminal likes to insert extra blank
    // lines between list items by default.
    unescape: true,
  }) as Parameters<typeof marked.use>[0],
);

export function renderMarkdown(text: string): string {
  if (!text) return '';
  const out = marked.parse(text, { async: false }) as string;
  // Trim trailing newlines and collapse 3+ consecutive newlines to a single
  // blank line — marked-terminal produces ugly triple-spacing inside nested
  // lists and between paragraphs.
  return out.replace(/\n{3,}/g, '\n\n').replace(/\n+$/, '');
}
