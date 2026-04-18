import { Text } from 'ink';
import { useEffect, useState } from 'react';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const INTERVAL_MS = 80;

type Color = 'cyan' | 'yellow' | 'magenta' | 'green' | 'red' | 'gray';

// Braille spinner. Component is the only source of animation — it mounts,
// drives its own 80ms interval, unmounts, and never re-triggers redraws on
// parent re-renders.
export function Spinner(props: { color?: Color }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setFrame((f) => (f + 1) % FRAMES.length), INTERVAL_MS);
    return () => clearInterval(id);
  }, []);
  return <Text color={props.color ?? 'cyan'}>{FRAMES[frame]}</Text>;
}

// Count-up timer that ticks every second. Cheaper than an elapsed calc in the
// parent because only this leaf re-renders each tick.
export function Elapsed(props: { startMs?: number; dim?: boolean }) {
  const start = props.startMs ?? Date.now();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const s = Math.max(0, Math.floor((now - start) / 1000));
  return <Text dimColor={props.dim ?? true}>{formatSeconds(s)}</Text>;
}

// Count-down timer. Returns null once it hits zero so callers can swap to a
// terminal state without extra checks.
export function Countdown(props: {
  endMs: number;
  color?: Color;
  warnAt?: number;
  dangerAt?: number;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const remaining = Math.max(0, Math.ceil((props.endMs - now) / 1000));
  if (remaining <= 0) return null;
  const warn = props.warnAt ?? 30;
  const danger = props.dangerAt ?? 10;
  const color: Color =
    remaining <= danger ? 'red' : remaining <= warn ? 'yellow' : (props.color ?? 'gray');
  return <Text color={color}>{formatSeconds(remaining)}</Text>;
}

function formatSeconds(total: number): string {
  if (total < 60) return `${total}s`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}
