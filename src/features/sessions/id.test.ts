import { describe, expect, it } from 'bun:test';
import { newSessionId } from './id.js';

const FORMAT_RE = /^[0-9A-HJKMNP-TV-Z]{12}-[0-9a-f]{6}$/;

describe('newSessionId', () => {
  it('matches the expected format (crockford base32 time + hex random)', () => {
    expect(newSessionId()).toMatch(FORMAT_RE);
  });

  it('generates unique ids on rapid consecutive calls', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(newSessionId());
    expect(seen.size).toBe(200);
  });

  it('time-prefix sorts lexicographically with creation time', async () => {
    const early = newSessionId();
    await new Promise((r) => setTimeout(r, 5));
    const late = newSessionId();
    expect(late > early).toBe(true);
  });
});
