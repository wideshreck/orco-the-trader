import { stripAnsi } from '../../shared/ui/strip-ansi.js';
import type { NewsArticle } from './types.js';

const ENDPOINT = 'https://min-api.cryptocompare.com/data/v2/news/';

type RawItem = {
  id?: unknown;
  title?: unknown;
  url?: unknown;
  body?: unknown;
  published_on?: unknown;
  source?: unknown;
  source_info?: unknown;
  tags?: unknown;
  categories?: unknown;
  lang?: unknown;
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// Clip to a tweet-ish length and scrub ANSI so the CLI never renders
// escape sequences smuggled into a news body.
function clipBody(body: string): string {
  const safe = stripAnsi(body).replace(/\s+/g, ' ').trim();
  return safe.length > 280 ? `${safe.slice(0, 279)}…` : safe;
}

function parseItem(raw: unknown): NewsArticle | null {
  if (!isObject(raw)) return null;
  const r = raw as RawItem;
  if (typeof r.title !== 'string' || typeof r.url !== 'string') return null;
  if (typeof r.published_on !== 'number') return null;
  const sourceInfo = isObject(r.source_info) ? r.source_info : null;
  const sourceName =
    (sourceInfo && typeof sourceInfo.name === 'string' && sourceInfo.name) ||
    (typeof r.source === 'string' && r.source) ||
    'unknown';
  const tagList =
    typeof r.tags === 'string'
      ? r.tags
          .split('|')
          .map((t) => t.trim())
          .filter(Boolean)
      : [];
  const categoryList =
    typeof r.categories === 'string'
      ? r.categories
          .split('|')
          .map((t) => t.trim())
          .filter(Boolean)
      : [];
  const tags = [...new Set([...categoryList, ...tagList])].slice(0, 8);
  return {
    title: stripAnsi(r.title).trim(),
    url: r.url,
    source: sourceName,
    publishedAt: new Date(r.published_on * 1000).toISOString(),
    summary: typeof r.body === 'string' ? clipBody(r.body) : '',
    ...(tags.length > 0 ? { tags } : {}),
  };
}

export function parseCryptoCompareResponse(raw: unknown): NewsArticle[] {
  if (!isObject(raw)) return [];
  const data = raw.Data;
  if (!Array.isArray(data)) return [];
  const out: NewsArticle[] = [];
  for (const item of data) {
    const parsed = parseItem(item);
    if (parsed) out.push(parsed);
  }
  return out;
}

export async function fetchCryptoCompare(opts: {
  categories?: string[];
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<NewsArticle[]> {
  const params = new URLSearchParams({ lang: 'EN' });
  if (opts.categories && opts.categories.length > 0) {
    params.set('categories', opts.categories.join(','));
  }
  const url = `${ENDPOINT}?${params.toString()}`;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error('cryptocompare timeout')),
    opts.timeoutMs ?? 5000,
  );
  const onOuterAbort = () => controller.abort(opts.signal?.reason);
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort(opts.signal.reason);
    else opts.signal.addEventListener('abort', onOuterAbort, { once: true });
  }
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`cryptocompare ${res.status}`);
    const raw = (await res.json()) as unknown;
    return parseCryptoCompareResponse(raw);
  } finally {
    clearTimeout(timeout);
    opts.signal?.removeEventListener('abort', onOuterAbort);
  }
}
