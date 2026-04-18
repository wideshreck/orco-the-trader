export type NewsArticle = {
  title: string;
  url: string;
  source: string;
  // ISO 8601, so LLM sorting and "last 24h" filters work without
  // downstream date-format guesswork.
  publishedAt: string;
  summary: string;
  tags?: string[];
};

export type NewsProvider = 'cryptocompare' | 'rss';

export type NewsResult = {
  articles: NewsArticle[];
  count: number;
  provider: NewsProvider;
  // 'strict' — symbol filter returned at least one match.
  // 'relaxed' — no strict match, falling back to unfiltered recent headlines
  //   so the caller sees what's in the feed instead of a misleading 0.
  // 'none' — no symbol filter was requested.
  filter: 'strict' | 'relaxed' | 'none';
  fetchedAt: string;
};
