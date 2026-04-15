import { marked } from 'marked';
import { markedTerminal } from 'marked-terminal';

// Configure once at module load. marked is a singleton.
marked.use(
  markedTerminal({
    reflowText: true,
    tab: 2,
    width: 80,
    showSectionPrefix: false,
  }) as Parameters<typeof marked.use>[0],
);

export function renderMarkdown(text: string): string {
  if (!text) return '';
  const out = marked.parse(text, { async: false }) as string;
  return out.replace(/\n+$/, '');
}
