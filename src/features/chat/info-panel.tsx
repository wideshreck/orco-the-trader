import { Box, Text } from 'ink';
import { useRows } from '../../shared/ui/use-columns.js';
import type { InfoPanel as InfoPanelData } from './chat-view.js';

// Half the terminal height minus borders/title is the most we'll devote to
// an info panel without squeezing the live chat area. Hard floor at 8 so
// short terminals still show something useful.
const RESERVED_ROWS = 10;
const MIN_PANEL_ROWS = 8;

export function InfoPanelView(props: { panel: InfoPanelData }) {
  const rows = useRows();
  const maxLines = Math.max(MIN_PANEL_ROWS, rows - RESERVED_ROWS);
  const { title, lines } = props.panel;
  const shown = lines.slice(0, maxLines);
  const hidden = lines.length - shown.length;
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
      paddingY={1}
      marginY={1}
    >
      <Text color="cyan" bold>
        {title}
      </Text>
      {shown.map((line, i) => (
        <Text key={`${i}-${line.slice(0, 32)}`}>{line}</Text>
      ))}
      {hidden > 0 && (
        <Text color="yellow">{`  … +${hidden} more lines (resize terminal to see more)`}</Text>
      )}
      <Box marginTop={1}>
        <Text dimColor>esc to dismiss</Text>
      </Box>
    </Box>
  );
}
