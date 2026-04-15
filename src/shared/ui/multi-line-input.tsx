import { Box, Text, useInput } from 'ink';

/** Minimal multi-line text input for Ink. Handles:
 *  - Enter submits the current value
 *  - Shift+Enter inserts a newline (where the terminal passes the modifier)
 *  - Trailing `\` followed by Enter inserts a newline (works in every terminal)
 *  - Backspace removes one char (including newlines)
 *  - Typing appends characters; pasted text with embedded newlines is preserved
 *
 * Arrow keys, Tab, Esc, Ctrl/Meta combos are ignored here so the parent
 * useInput handlers (history, suggestions, focus routing) remain authoritative.
 */
export function MultiLineInput(props: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  placeholder?: string;
  isActive: boolean;
  showCursor?: boolean;
}) {
  const { value, onChange, onSubmit, placeholder, isActive, showCursor = true } = props;

  useInput(
    (ch, key) => {
      if (key.return) {
        if (key.shift) {
          onChange(`${value}\n`);
          return;
        }
        if (value.endsWith('\\')) {
          onChange(`${value.slice(0, -1)}\n`);
          return;
        }
        onSubmit(value);
        return;
      }
      if (key.backspace || key.delete) {
        onChange(value.slice(0, -1));
        return;
      }
      if (key.upArrow || key.downArrow || key.leftArrow || key.rightArrow) return;
      if (key.escape || key.tab) return;
      if (key.ctrl || key.meta) return;
      if (!ch) return;
      onChange(value + ch);
    },
    { isActive },
  );

  if (!value) {
    return (
      <Text dimColor>
        {placeholder ?? ''}
        {showCursor ? '▎' : ''}
      </Text>
    );
  }
  const lines = value.split('\n');
  return (
    <Box flexDirection="column">
      {lines.map((line, i) => (
        <Text key={`${i}-${line.length}`}>
          {line}
          {i === lines.length - 1 && showCursor ? '▎' : ''}
        </Text>
      ))}
    </Box>
  );
}
