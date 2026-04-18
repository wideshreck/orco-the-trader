import { describe, expect, it } from 'bun:test';
import { parseRss } from './rss.js';

const SAMPLE_RSS = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <item>
      <title><![CDATA[BTC rallies past $100k on ETF flows]]></title>
      <link>https://example.com/a</link>
      <pubDate>Mon, 06 Jan 2026 12:00:00 GMT</pubDate>
      <description><![CDATA[<p>Bitcoin broke above <strong>$100k</strong> amid record ETF inflows.</p>]]></description>
    </item>
    <item>
      <title>ETH staking unlocks surge 30%</title>
      <link>https://example.com/b</link>
      <pubDate>Mon, 06 Jan 2026 09:30:00 GMT</pubDate>
      <description>Plain &amp; simple description with &lt;br&gt; tags.</description>
    </item>
  </channel>
</rss>`;

describe('parseRss', () => {
  it('extracts title, url, summary from an RSS 2.0 feed', () => {
    const items = parseRss(SAMPLE_RSS, 'TestFeed');
    expect(items).toHaveLength(2);
    expect(items[0]?.title).toBe('BTC rallies past $100k on ETF flows');
    expect(items[0]?.url).toBe('https://example.com/a');
    expect(items[0]?.source).toBe('TestFeed');
    // HTML tags get stripped, CDATA unwrapped
    expect(items[0]?.summary).toContain('Bitcoin broke above $100k');
    expect(items[0]?.summary).not.toContain('<strong>');
  });

  it('decodes named XML entities in the description', () => {
    const items = parseRss(SAMPLE_RSS, 'TestFeed');
    expect(items[1]?.summary).toContain('Plain & simple');
    expect(items[1]?.summary).not.toContain('&amp;');
  });

  it('normalizes pubDate to ISO 8601', () => {
    const items = parseRss(SAMPLE_RSS, 'TestFeed');
    const ts = Date.parse(items[0]?.publishedAt ?? '');
    expect(Number.isFinite(ts)).toBe(true);
  });

  it('skips items missing title or link', () => {
    const broken = `<rss><channel>
      <item><title>No link</title></item>
      <item><link>https://example.com/x</link></item>
    </channel></rss>`;
    expect(parseRss(broken, 'X')).toHaveLength(0);
  });

  it('handles an empty feed without throwing', () => {
    expect(parseRss('<rss><channel></channel></rss>', 'X')).toEqual([]);
  });
});
