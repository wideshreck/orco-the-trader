import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { SessionId, SessionMeta } from '../sessions/index.js';

const VISIBLE = 12;

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function SessionPicker(props: {
  sessions: SessionMeta[];
  currentId: SessionId | null;
  onPick: (id: SessionId) => void;
  onDelete: (id: SessionId) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const [armedId, setArmedId] = useState<string | null>(null);
  const armedAtRef = useRef(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: query is the trigger
  useEffect(() => {
    setCursor(0);
  }, [query]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return props.sessions;
    return props.sessions.filter((s) => s.title.toLowerCase().includes(q));
  }, [props.sessions, query]);

  const safeCursor = Math.min(cursor, Math.max(0, filtered.length - 1));
  const windowStart = Math.max(
    0,
    Math.min(safeCursor - Math.floor(VISIBLE / 2), filtered.length - VISIBLE),
  );
  const windowEnd = Math.min(filtered.length, windowStart + VISIBLE);
  const windowRows = filtered.slice(windowStart, windowEnd);

  useInput((ch, key) => {
    if (key.escape) {
      props.onCancel();
      return;
    }
    if (key.upArrow) {
      setCursor((c) => Math.max(0, c - 1));
      return;
    }
    if (key.downArrow) {
      setCursor((c) => Math.min(filtered.length - 1, c + 1));
      return;
    }
    if (key.pageUp) {
      setCursor((c) => Math.max(0, c - VISIBLE));
      return;
    }
    if (key.pageDown) {
      setCursor((c) => Math.min(filtered.length - 1, c + VISIBLE));
      return;
    }
    if (key.return) {
      const r = filtered[safeCursor];
      if (r) props.onPick(r.id);
      return;
    }
    if (ch === 'd') {
      const r = filtered[safeCursor];
      if (!r) return;
      const now = Date.now();
      if (armedId === r.id && now - armedAtRef.current < 2000) {
        setArmedId(null);
        props.onDelete(r.id);
        return;
      }
      armedAtRef.current = now;
      setArmedId(r.id);
      return;
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1} paddingY={1}>
      <Text color="cyan" bold>
        sessions
      </Text>
      <Box marginTop={1}>
        <Text color="cyan">filter: </Text>
        <Box flexGrow={1}>
          <TextInput value={query} onChange={setQuery} placeholder="title..." showCursor={false} />
        </Box>
        <Text dimColor>
          {' '}
          {filtered.length}/{props.sessions.length}
        </Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        {windowRows.length === 0 && <Text dimColor>(no sessions)</Text>}
        {windowRows.map((s, i) => {
          const globalIdx = windowStart + i;
          const selected = globalIdx === safeCursor;
          const isCurrent = props.currentId === s.id;
          const armedHere = armedId === s.id;
          return (
            <Box key={s.id}>
              <Text
                {...(selected ? { color: 'cyan' as const } : {})}
                inverse={selected}
                bold={selected}
              >
                {selected ? '▸ ' : '  '}
                {formatDate(s.lastModified)}
              </Text>
              <Text dimColor>
                {'  '}
                {s.messageCount} msg
              </Text>
              <Text> {s.title}</Text>
              {isCurrent && <Text color="green"> ●</Text>}
              {armedHere && <Text color="yellow"> press d again to delete</Text>}
            </Box>
          );
        })}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>↑↓ navigate · enter load · d d delete · esc cancel · type to filter</Text>
      </Box>
    </Box>
  );
}
