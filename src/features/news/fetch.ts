import { logger } from '../../shared/logging/logger.js';
import { fetchCryptoCompare } from './cryptocompare.js';
import { fetchAllRss } from './rss.js';
import type { NewsArticle, NewsProvider, NewsResult } from './types.js';

export type FetchNewsOptions = {
  symbols?: string[];
  categories?: string[];
  limit?: number;
  since?: Date | number | string;
  source?: NewsProvider | 'auto';
  signal?: AbortSignal;
};

// Orchestrator. In 'auto' mode tries CryptoCompare first (one endpoint,
// ~300ms typical); on failure falls back to aggregated RSS so a single
// upstream outage doesn't blank the tool. When a symbol filter finds no
// matches we relax to unfiltered recent headlines rather than lie to
// the caller with count=0 — the `filter` field in the result tells the
// consumer whether the articles are on-topic or just recent.
export async function fetchNews(opts: FetchNewsOptions): Promise<NewsResult> {
  const source = opts.source ?? 'auto';
  const { categories, symbols, since, limit, signal } = opts;
  const sinceMs = normalizeSince(since);

  // CryptoCompare accepts tickers in its `categories` param (BTC, ETH, etc.)
  // so piping the user's symbols through as categories gets us server-side
  // tagging in addition to our own loose title match.
  const ccCategories = dedupe([
    ...(categories ?? []),
    ...(symbols ?? []).map((s) => s.toUpperCase()),
  ]);

  const tryCC = async (): Promise<NewsArticle[]> =>
    fetchCryptoCompare({
      ...(ccCategories.length > 0 ? { categories: ccCategories } : {}),
      ...(signal ? { signal } : {}),
    });
  const tryRss = async (): Promise<NewsArticle[]> => fetchAllRss({ ...(signal ? { signal } : {}) });

  let articles: NewsArticle[] = [];
  let provider: NewsProvider = 'cryptocompare';
  if (source === 'cryptocompare') {
    articles = await tryCC();
  } else if (source === 'rss') {
    articles = await tryRss();
    provider = 'rss';
  } else {
    try {
      articles = await tryCC();
    } catch (err) {
      logger.warn('news', 'cryptocompare failed, falling back to RSS', {
        error: err instanceof Error ? err.message : String(err),
      });
      articles = await tryRss();
      provider = 'rss';
    }
  }

  const hasSymbolFilter = Boolean(symbols && symbols.length > 0);
  const strict = filterArticles(articles, {
    sinceMs,
    ...(symbols ? { symbols } : {}),
    ...(limit !== undefined ? { limit } : {}),
  });
  if (strict.length > 0 || !hasSymbolFilter) {
    return {
      articles: strict,
      count: strict.length,
      provider,
      filter: hasSymbolFilter ? 'strict' : 'none',
      fetchedAt: new Date().toISOString(),
    };
  }

  // Strict symbol match found nothing — relax so the caller sees what the
  // feed actually has. Often this is macro news that indirectly affects
  // the symbol but doesn't mention it by ticker.
  const relaxed = filterArticles(articles, {
    sinceMs,
    ...(limit !== undefined ? { limit } : {}),
  });
  return {
    articles: relaxed,
    count: relaxed.length,
    provider,
    filter: 'relaxed',
    fetchedAt: new Date().toISOString(),
  };
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function normalizeSince(since: FetchNewsOptions['since']): number | null {
  if (since === undefined) return null;
  if (since instanceof Date) return since.getTime();
  if (typeof since === 'number') return since > 1e12 ? since : since * 1000;
  const parsed = new Date(since);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
}

function filterArticles(
  articles: NewsArticle[],
  opts: { symbols?: string[]; sinceMs: number | null; limit?: number },
): NewsArticle[] {
  // Loose title + tags + summary match so a BTC filter catches "Bitcoin",
  // "BTC/USD", mentions in the body preview, etc. The LLM can dedupe or
  // re-rank if it needs precision.
  const symbolRegexes = (opts.symbols ?? [])
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .map((s) => new RegExp(`\\b(${escapeRegExp(s)}|${escapeRegExp(aliasFor(s))})\\b`, 'i'));

  const out: NewsArticle[] = [];
  for (const a of articles) {
    if (opts.sinceMs !== null) {
      const ts = Date.parse(a.publishedAt);
      if (!Number.isFinite(ts) || ts < opts.sinceMs) continue;
    }
    if (symbolRegexes.length > 0) {
      const hay = `${a.title} ${a.summary} ${(a.tags ?? []).join(' ')}`;
      if (!symbolRegexes.some((re) => re.test(hay))) continue;
    }
    out.push(a);
  }
  const cap = Math.max(1, Math.min(50, opts.limit ?? 20));
  return out.slice(0, cap);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Cheap alias table so symbol filters catch the common spelled-out name
// without requiring the LLM to pass both.
function aliasFor(sym: string): string {
  const map: Record<string, string> = {
    BTC: 'Bitcoin',
    ETH: 'Ethereum',
    SOL: 'Solana',
    XRP: 'Ripple',
    ADA: 'Cardano',
    DOGE: 'Dogecoin',
    AVAX: 'Avalanche',
    MATIC: 'Polygon',
    DOT: 'Polkadot',
    LINK: 'Chainlink',
    LTC: 'Litecoin',
    BCH: 'Bitcoin Cash',
    BNB: 'Binance Coin',
    TON: 'Toncoin',
  };
  return map[sym] ?? sym;
}
