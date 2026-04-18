import { Box, Text, useInput } from 'ink';
import { useColumns } from './use-columns.js';

/** Minimal multi-line text input for Ink. Handles:
 *  - Enter submits the current value
 *  - Shift+Enter inserts a newline (where the terminal passes the modifier)
 *  - Trailing `\` followed by Enter inserts a newline (works in every terminal)
 *  - Backspace removes one char (including newlines)
 *  - Typing appends characters; pasted text with embedded newlines is preserved
 *
 *  Long pastes (> MAX_VISIBLE_LINES or wider than the terminal) collapse into
 *  a viewport: the tail of the value is shown, a dim header tells the user
 *  how much is hidden above, and individual visible lines are clipped to
 *  the terminal width with an ellipsis. The full value is still what gets
 *  submitted — this is a render concern only.
 *
 *  Arrow keys, Tab, Esc, Ctrl/Meta combos are ignored here so the parent
 *  useInput handlers (history, suggestions, focus routing) remain authoritative.
 */
const MAX_VISIBLE_LINES = 6;
const MIN_VISIBLE_COLS = 20;
// Chat-view wraps the input in a bordered `Box paddingX={1}` plus emits a
// "$ " prefix before us. Reserve those columns so our clipped lines don't
// themselves get wrapped by Ink a second time.
const COLUMN_OVERHEAD = 8;

export function MultiLineInput(props: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  placeholder?: string;
  isActive: boolean;
  showCursor?: boolean;
}) {
  const { value, onChange, onSubmit, placeholder, isActive, showCursor = true } = props;
  const cols = useColumns();
  const maxChars = Math.max(MIN_VISIBLE_COLS, cols - COLUMN_OVERHEAD);

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
  const hiddenCount = Math.max(0, lines.length - MAX_VISIBLE_LINES);
  const visibleLines = hiddenCount > 0 ? lines.slice(-MAX_VISIBLE_LINES) : lines;

  return (
    <Box flexDirection="column">
      {hiddenCount > 0 && (
        <Text dimColor>
          ↑ {hiddenCount} more line{hiddenCount === 1 ? '' : 's'} above · {value.length} chars total
        </Text>
      )}
      {visibleLines.map((line, i) => {
        const clipped = line.length > maxChars ? `${line.slice(0, maxChars - 1)}…` : line;
        const isLast = i === visibleLines.length - 1;
        return (
          <Text key={`${i}-${line.length}`}>
            {clipped}
            {isLast && showCursor ? '▎' : ''}
          </Text>
        );
      })}
    </Box>
  );
}
