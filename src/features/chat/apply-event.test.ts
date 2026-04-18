import { describe, expect, it } from 'bun:test';
import { dedupeAssistantPrefixRestarts } from './apply-event.js';
import type { ChatRow } from './types.js';

function assistant(id: number, content: string): ChatRow {
  return { id, kind: 'assistant', content };
}
function tool(id: number, name: string): ChatRow {
  return {
    id,
    kind: 'tool',
    toolCallId: `c${id}`,
    name,
    input: {},
    status: 'done',
    output: {},
  };
}

describe('dedupeAssistantPrefixRestarts', () => {
  it('drops an earlier assistant whose content is a strict prefix of a later one', () => {
    const intro = "It's a solid setup. ETH is in a clear uptrend on both timeframes.";
    const full = `${intro}\n\n1. Context & Health Checks\n  * BTC correlation: 91%`;
    const rows: ChatRow[] = [assistant(1, intro), tool(2, 'get_ohlcv'), assistant(3, full)];
    const deduped = dedupeAssistantPrefixRestarts(rows);
    expect(deduped).toHaveLength(2);
    expect(deduped[0]?.kind).toBe('tool');
    expect((deduped[1] as { content: string }).content).toBe(full);
  });

  it('keeps earlier rows when content is unrelated', () => {
    const rows: ChatRow[] = [
      assistant(1, 'First observation: price is at resistance.'),
      tool(2, 'compute_indicators'),
      assistant(3, 'Second observation: RSI shows divergence.'),
    ];
    const deduped = dedupeAssistantPrefixRestarts(rows);
    expect(deduped).toHaveLength(3);
  });

  it('does not drop rows whose content is too short to be confident about', () => {
    const rows: ChatRow[] = [assistant(1, 'ok'), tool(2, 'x'), assistant(3, 'ok and more detail')];
    const deduped = dedupeAssistantPrefixRestarts(rows);
    expect(deduped).toHaveLength(3);
  });

  it('preserves tool rows between duplicated assistants', () => {
    const intro = 'A'.repeat(80);
    const full = `${intro} — continuation`;
    const rows: ChatRow[] = [
      assistant(1, intro),
      tool(2, 'a'),
      tool(3, 'b'),
      tool(4, 'c'),
      assistant(5, full),
    ];
    const deduped = dedupeAssistantPrefixRestarts(rows);
    expect(deduped.filter((r) => r.kind === 'tool')).toHaveLength(3);
    expect(deduped.filter((r) => r.kind === 'assistant')).toHaveLength(1);
  });

  it('drops multiple earlier prefixes that all match a later extended row', () => {
    const s1 = 'A'.repeat(50);
    const s2 = `${s1} B`.repeat(1); // 52 chars
    const s3 = `${s2} extra content that keeps building on the previous`;
    const rows: ChatRow[] = [
      assistant(1, s1),
      tool(2, 'x'),
      assistant(3, s2),
      tool(4, 'y'),
      assistant(5, s3),
    ];
    const deduped = dedupeAssistantPrefixRestarts(rows);
    expect(deduped.filter((r) => r.kind === 'assistant')).toHaveLength(1);
  });

  it('leaves rows untouched when there is no duplication', () => {
    const rows: ChatRow[] = [assistant(1, 'x'.repeat(50)), tool(2, 'a')];
    expect(dedupeAssistantPrefixRestarts(rows)).toEqual(rows);
  });
});
