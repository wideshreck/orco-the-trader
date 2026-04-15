import { describe, expect, it } from 'bun:test';
import { parseFrontmatter } from './loader.js';

describe('parseFrontmatter', () => {
  it('parses a minimal valid document', () => {
    const raw = `---
name: greet
description: say hi
---

Hello world.`;
    const p = parseFrontmatter(raw);
    expect(p).not.toBeNull();
    expect(p?.fields.name).toBe('greet');
    expect(p?.fields.description).toBe('say hi');
    expect(p?.body).toBe('Hello world.');
  });

  it('returns null when no frontmatter block is present', () => {
    expect(parseFrontmatter('just text')).toBeNull();
    expect(parseFrontmatter('')).toBeNull();
  });

  it('returns null when the block is never closed', () => {
    const raw = `---
name: x
description: missing close`;
    expect(parseFrontmatter(raw)).toBeNull();
  });

  it('trims whitespace around keys and values', () => {
    const raw = `---
  name :    space_keys
  description :   spaces everywhere
---
body`;
    const p = parseFrontmatter(raw);
    expect(p?.fields.name).toBe('space_keys');
    expect(p?.fields.description).toBe('spaces everywhere');
  });

  it('preserves values containing colons (only first colon is the separator)', () => {
    const raw = `---
name: x
description: a: b: c
---
body`;
    const p = parseFrontmatter(raw);
    expect(p?.fields.description).toBe('a: b: c');
  });

  it('ignores lines without a colon', () => {
    const raw = `---
name: x
this-line-has-no-colon
description: valid
---
body`;
    const p = parseFrontmatter(raw);
    expect(Object.keys(p?.fields ?? {})).toEqual(['name', 'description']);
  });

  it('returns an empty body when the document stops at the fence', () => {
    const raw = `---
name: x
description: y
---
`;
    expect(parseFrontmatter(raw)?.body).toBe('');
  });

  it('trims trailing whitespace from the body', () => {
    const raw = `---
name: x
description: y
---

body content


`;
    expect(parseFrontmatter(raw)?.body).toBe('body content');
  });
});
