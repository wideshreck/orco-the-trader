import { stripAnsi } from '../../shared/ui/strip-ansi.js';
import type { NewsArticle } from './types.js';

// Curated crypto-native feeds. All are public, stable, no auth, and
// speak standard RSS 2.0. Order matters for dedupe: earlier sources win
// on duplicate URLs.
export const RSS_FEEDS: { name: string; url: string }[] = [
  { name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
  { name: 'CoinTelegraph', url: 'https://cointelegraph.com/rss' },
  { name: 'Decrypt', url: 'https://decrypt.co/feed' },
  { name: 'The Block', url: 'https://www.theblock.co/rss.xml' },
  { name: 'Bitcoin Magazine', url: 'https://bitcoinmagazine.com/.rss/full/' },
];

// Strip CDATA wrappers, decode the five XML entities RSS actually uses,
// drop HTML tags that slip into <description>. We deliberately don't pull
// in an HTML parser — descriptions are for a one-line summary, not a
// fidelity render.
function cleanText(s: string): string {
  let out = s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
  out = stripAnsi(out).replace(/\s+/g, ' ').trim();
  return out;
}

function clip(s: string, limit: number): string {
  return s.length > limit ? `${s.slice(0, limit - 1)}…` : s;
}

function tagContent(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return m?.[1] ?? '';
}

export function parseRss(xml: string, sourceName: string): NewsArticle[] {
  const items = xml.match(/<item\b[^>]*>[\s\S]*?<\/item>/gi) ?? [];
  const out: NewsArticle[] = [];
  for (const block of items) {
    const title = cleanText(tagContent(block, 'title'));
    const link = cleanText(tagContent(block, 'link'));
    if (!title || !link) continue;
    const pubDate = cleanText(tagContent(block, 'pubDate'));
    const description = cleanText(tagContent(block, 'description'));
    const parsedDate = pubDate ? new Date(pubDate) : new Date();
    const publishedAt = Number.isNaN(parsedDate.getTime())
      ? new Date().toISOString()
      : parsedDate.toISOString();
    out.push({
      title,
      url: link,
      source: sourceName,
      publishedAt,
      summary: clip(description, 280),
    });
  }
  return out;
}

export async function fetchRssFeed(
  feed: { name: string; url: string },
  opts: { signal?: AbortSignal; timeoutMs?: number },
): Promise<NewsArticle[]> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error(`rss ${feed.name} timeout`)),
    opts.timeoutMs ?? 5000,
  );
  const onOuterAbort = () => controller.abort(opts.signal?.reason);
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort(opts.signal.reason);
    else opts.signal.addEventListener('abort', onOuterAbort, { once: true });
  }
  try {
    const res = await fetch(feed.url, {
      signal: controller.signal,
      // Several CDNs (theblock.co especially) 403 without a UA header.
      headers: {
        'user-agent': 'orco-the-trader/0.1 (+https://github.com/wideshreck/orco-the-trader)',
      },
    });
    if (!res.ok) throw new Error(`${feed.name} ${res.status}`);
    const xml = await res.text();
    return parseRss(xml, feed.name);
  } finally {
    clearTimeout(timeout);
    opts.signal?.removeEventListener('abort', onOuterAbort);
  }
}

export async function fetchAllRss(opts: {
  signal?: AbortSignal;
  timeoutMs?: number;
  feeds?: { name: string; url: string }[];
}): Promise<NewsArticle[]> {
  const feeds = opts.feeds ?? RSS_FEEDS;
  // allSettled: one slow/flaky feed shouldn't kill the whole call.
  const results = await Promise.allSettled(
    feeds.map((f) =>
      fetchRssFeed(f, {
        ...(opts.signal ? { signal: opts.signal } : {}),
        ...(opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}),
      }),
    ),
  );
  const seen = new Set<string>();
  const merged: NewsArticle[] = [];
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    for (const article of r.value) {
      if (seen.has(article.url)) continue;
      seen.add(article.url);
      merged.push(article);
    }
  }
  merged.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  return merged;
}
