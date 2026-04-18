// Block terminal control sequences from untrusted sources (model output,
// tool results) before rendering. Alt-screen toggles (`\x1b[?1049h/l`) would
// swap Ink's active buffer out; cursor position + scroll region sequences
// corrupt scrollback; OSC (`\x1b]...\x07`) can set the window title.
//
// Keep the regex permissive — matches CSI (ESC [ … final byte), OSC (ESC ] …
// BEL/ST), and standalone two-byte escapes. Safe to run on every render.
const ANSI_RE = new RegExp(
  [
    '[\\u001B\\u009B][[\\]()#;?]*',
    '(?:',
    '(?:(?:[a-zA-Z\\d]*(?:;[a-zA-Z\\d]*)*)?\\u0007)',
    '|',
    '(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-nq-uy=><~])',
    ')',
  ].join(''),
  'g',
);

export function stripAnsi(input: string): string {
  if (!input) return input;
  return input.replace(ANSI_RE, '');
}
