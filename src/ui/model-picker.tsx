import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import React, { useMemo, useState } from 'react';
import { isAuthenticated } from '../auth.js';
import type { Catalog, CatalogModel, CatalogProvider, ModelRef } from '../catalog.js';
import { isSupportedProvider } from '../providers.js';

type Row = {
  provider: CatalogProvider;
  model: CatalogModel;
  authed: boolean;
};

const VISIBLE = 12;

function formatCost(m: CatalogModel): string {
  if (!m.cost?.input && !m.cost?.output) return '';
  const i = m.cost.input != null ? `$${m.cost.input}` : '-';
  const o = m.cost.output != null ? `$${m.cost.output}` : '-';
  return `${i}/${o}`;
}

function formatContext(m: CatalogModel): string {
  const c = m.limit?.context;
  if (!c) return '';
  if (c >= 1_000_000) return `${(c / 1_000_000).toFixed(1)}M`;
  if (c >= 1000) return `${Math.round(c / 1000)}k`;
  return `${c}`;
}

export function ModelPicker(props: {
  catalog: Catalog;
  current?: ModelRef;
  onPick: (ref: ModelRef, authed: boolean) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const provider of Object.values(props.catalog)) {
      if (!isSupportedProvider(provider.id)) continue;
      const authed = isAuthenticated(provider.id, provider.env);
      for (const model of Object.values(provider.models)) {
        out.push({ provider, model, authed });
      }
    }
    out.sort((a, b) => {
      if (a.authed !== b.authed) return a.authed ? -1 : 1;
      return `${a.provider.id}/${a.model.id}`.localeCompare(`${b.provider.id}/${b.model.id}`);
    });
    return out;
  }, [props.catalog]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = `${r.provider.id} ${r.provider.name} ${r.model.id} ${r.model.name}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, query]);

  const safeCursor = Math.min(cursor, Math.max(0, filtered.length - 1));
  const windowStart = Math.max(
    0,
    Math.min(safeCursor - Math.floor(VISIBLE / 2), filtered.length - VISIBLE),
  );
  const windowEnd = Math.min(filtered.length, windowStart + VISIBLE);
  const windowRows = filtered.slice(windowStart, windowEnd);

  useInput((_, key) => {
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
      if (!r) return;
      props.onPick({ providerId: r.provider.id, modelId: r.model.id }, r.authed);
      return;
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1} paddingY={1}>
      <Text color="cyan" bold>
        select model
      </Text>

      <Box marginTop={1}>
        <Text color="cyan">search: </Text>
        <Box flexGrow={1}>
          <TextInput value={query} onChange={setQuery} placeholder="filter..." showCursor={false} />
        </Box>
        <Text dimColor>
          {' '}
          {filtered.length}/{rows.length}
        </Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        {windowRows.length === 0 && <Text dimColor>(no matching models)</Text>}
        {windowRows.map((r, i) => {
          const globalIdx = windowStart + i;
          const selected = globalIdx === safeCursor;
          const isCurrent =
            props.current &&
            r.provider.id === props.current.providerId &&
            r.model.id === props.current.modelId;
          const ctx = formatContext(r.model);
          const cost = formatCost(r.model);
          const flags = [
            r.model.tool_call && 'tools',
            r.model.reasoning && 'reason',
            r.model.modalities?.input?.includes('image') && 'vision',
          ]
            .filter(Boolean)
            .join(' ');
          const rowColor: 'cyan' | 'gray' | undefined = selected
            ? 'cyan'
            : r.authed
              ? undefined
              : 'gray';
          return (
            <Box key={`${r.provider.id}/${r.model.id}`}>
              <Text
                {...(rowColor !== undefined ? { color: rowColor } : {})}
                inverse={selected}
                bold={selected}
              >
                {selected ? '▸ ' : '  '}
                {r.provider.id}/{r.model.id}
              </Text>
              {isCurrent && <Text color="green"> ●</Text>}
              {!r.authed && <Text color="red"> [locked]</Text>}
              {(ctx || cost || flags) && (
                <Text dimColor>
                  {'  '}
                  {ctx && `ctx ${ctx}`}
                  {ctx && (cost || flags) ? ' · ' : ''}
                  {cost && `$${cost}/M`}
                  {cost && flags ? ' · ' : ''}
                  {flags}
                </Text>
              )}
            </Box>
          );
        })}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>↑↓ navigate · pgup/pgdn · enter select · esc cancel · type to filter</Text>
      </Box>
    </Box>
  );
}
