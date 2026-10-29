import type { ArticleMetadata, ArticleProgress } from "./types";

type ArticleIdentity = Pick<ArticleMetadata, "id" | "version">;

export function articleProgressKey(
  record: Pick<ArticleProgress, "articleId" | "articleVersion">,
): string {
  return JSON.stringify([record.articleId, record.articleVersion ?? null]);
}

// 未记录版本的历史进度无法确定对应正文，保留存档但不归入当前版本。
export function buildArticleProgressMap(
  articles: readonly ArticleIdentity[],
  progress: readonly ArticleProgress[],
): Map<string, ArticleProgress> {
  const records = new Map(progress.map((row) => [articleProgressKey(row), row]));
  const current = new Map<string, ArticleProgress>();
  for (const article of articles) {
    const record = records.get(articleProgressKey({
      articleId: article.id,
      articleVersion: article.version,
    }));
    if (record) current.set(article.id, record);
  }
  return current;
}
