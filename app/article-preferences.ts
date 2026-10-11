"use client";

import {
  isFavoriteArticleId,
  MAX_FAVORITE_ARTICLES,
  normalizeFavoriteArticleIds,
} from "./article-library.ts";
import { readLocal, readLocalArray, STORAGE, writeLocal } from "./storage.ts";

export function readFavoriteArticleIds(): string[] {
  const saved = readLocal<unknown>(STORAGE.favoriteArticles, null);
  if (saved !== null) return normalizeFavoriteArticleIds(saved);
  // Older backups stored favorites only on custom article objects.
  return normalizeFavoriteArticleIds(
    readLocalArray<Record<string, unknown>>(STORAGE.customTexts)
      .filter((article) => article && article.favorite === true)
      .map((article) => article.id),
  );
}

export function toggleFavoriteArticle(id: string): {
  ok: boolean;
  ids: string[];
  message: string;
} {
  const previous = readFavoriteArticleIds();
  try {
    if (typeof window === "undefined") throw new Error("no browser storage");
    const raw = window.localStorage.getItem(STORAGE.favoriteArticles);
    if (raw !== null) JSON.parse(raw);
    if (raw === null || JSON.parse(raw) === null) {
      const custom = window.localStorage.getItem(STORAGE.customTexts);
      if (custom !== null) JSON.parse(custom);
    }
  } catch {
    return { ok: false, ids: previous, message: "无法读取文章收藏，未作修改。请检查浏览器存储权限后重试。" };
  }
  if (!isFavoriteArticleId(id)) {
    return { ok: false, ids: previous, message: "文章编号无效，无法收藏。" };
  }
  const existing = previous.includes(id);
  if (!existing && previous.length >= MAX_FAVORITE_ARTICLES) {
    return { ok: false, ids: previous, message: `最多收藏 ${MAX_FAVORITE_ARTICLES} 篇文章，请先取消部分收藏。` };
  }
  const ids = existing ? previous.filter((item) => item !== id) : [...previous, id];
  if (!writeLocal(STORAGE.favoriteArticles, ids)) {
    return { ok: false, ids: previous, message: "收藏未能保存，请检查浏览器存储空间后重试。" };
  }
  return { ok: true, ids, message: "" };
}
