declare module 'marked-terminal' {
  import type { MarkedExtension } from 'marked';
  export interface TerminalRendererOptions {
    code?: (text: string) => string;
    blockquote?: (text: string) => string;
    html?: (text: string) => string;
    heading?: (text: string) => string;
    firstHeading?: (text: string) => string;
    hr?: (text: string) => string;
    listitem?: (text: string) => string;
    list?: (text: string, ordered: boolean) => string;
    paragraph?: (text: string) => string;
    table?: (header: string, body: string) => string;
    tablerow?: (text: string) => string;
    tablecell?: (text: string) => string;
    strong?: (text: string) => string;
    em?: (text: string) => string;
    codespan?: (text: string) => string;
    del?: (text: string) => string;
    link?: (href: string, title: string, text: string) => string;
    href?: (href: string) => string;
    text?: (text: string) => string;
    unescape?: boolean;
    emoji?: boolean;
    width?: number;
    showSectionPrefix?: boolean;
    reflowText?: boolean;
    tab?: number;
    tableOptions?: Record<string, unknown>;
  }
  export function markedTerminal(
    options?: TerminalRendererOptions,
    highlightOptions?: Record<string, unknown>,
  ): MarkedExtension;
}
