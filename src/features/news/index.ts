import { register } from '../tools/registry.js';
import { getNews } from './tool.js';

let bootstrapped = false;

export function bootstrapNews(): void {
  if (bootstrapped) return;
  bootstrapped = true;
  register(getNews);
}

export { fetchNews } from './fetch.js';
export type { NewsArticle, NewsProvider, NewsResult } from './types.js';
