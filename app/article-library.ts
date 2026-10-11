import type { ArticleFilter, ArticleProgress, PracticeArticle } from "./types";

export const MAX_FAVORITE_ARTICLES = 500;
export type ArticleSort = "default" | "recent";

export function isFavoriteArticleId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 160;
}

export function isFavoriteArticleIds(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= MAX_FAVORITE_ARTICLES &&
    value.every(isFavoriteArticleId) && new Set(value).size === value.length;
}

export function normalizeFavoriteArticleIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(isFavoriteArticleId))].slice(0, MAX_FAVORITE_ARTICLES);
}

export function selectLibraryArticles({
  articles,
  filter,
  progressMap,
  query,
  favoriteIds,
  favoritesOnly,
  sort,
}: {
  articles: PracticeArticle[];
  filter: ArticleFilter;
  progressMap: ReadonlyMap<string, ArticleProgress>;
  query: string;
  favoriteIds: ReadonlySet<string>;
  favoritesOnly: boolean;
  sort: ArticleSort;
}): PracticeArticle[] {
  const search = query.trim().toLocaleLowerCase("zh-CN");
  const selected = articles.filter((item) => {
    const record = progressMap.get(item.id);
    return (filter.length === "all" || item.length === filter.length) &&
      (filter.topic === "all" || item.topic === filter.topic) &&
      (filter.status !== "new" || !record) &&
      (filter.status !== "practiced" || Boolean(record)) &&
      (!search || item.title.toLocaleLowerCase("zh-CN").includes(search)) &&
      (!favoritesOnly || favoriteIds.has(item.id));
  });
  if (sort === "recent") {
    // Stable sorting keeps the library order for unpracticed articles and ties.
    selected.sort((a, b) => {
      const aTime = Date.parse(progressMap.get(a.id)?.lastPracticed ?? "");
      const bTime = Date.parse(progressMap.get(b.id)?.lastPracticed ?? "");
      return (Number.isFinite(bTime) ? bTime : 0) -
        (Number.isFinite(aTime) ? aTime : 0);
    });
  }
  return selected;
}
