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
  fetchedAt: string;
};
