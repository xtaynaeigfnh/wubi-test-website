"use client";

import type {
  ArticleMetadata,
  CommonCharacterData,
  PracticeArticle,
  WubiEntry,
} from "./types";

let articlesPromise: Promise<PracticeArticle[]> | null = null;
let articleMetadataPromise: Promise<ArticleMetadata[]> | null = null;
let wubiPromise: Promise<WubiEntry[]> | null = null;
let wubiChallengePromise: Promise<WubiEntry[]> | null = null;
let commonCharactersPromise: Promise<CommonCharacterData> | null = null;

async function fetchJson<T>(url: string, label: string): Promise<T> {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const response = await fetch(`${basePath}${url}`);
  if (!response.ok) {
    throw new Error(`${label}加载失败（HTTP ${response.status}）`);
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new Error(`${label}内容损坏，无法解析`);
  }
}

export function loadArticleMetadata(): Promise<ArticleMetadata[]> {
  articleMetadataPromise ??= fetchJson<ArticleMetadata[]>(
    "/data/articles-index.json",
    "文章索引",
  ).catch((error) => {
    articleMetadataPromise = null;
    throw error;
  });
  return articleMetadataPromise;
}

export async function loadArticles(): Promise<PracticeArticle[]> {
  articlesPromise ??= Promise.all([
    loadArticleMetadata(),
    fetchJson<Array<{ id: string; text: string }>>(
      "/data/articles-short.json",
      "短文数据",
    ),
    fetchJson<Array<{ id: string; text: string }>>(
      "/data/articles-medium.json",
      "中篇数据",
    ),
    fetchJson<Array<{ id: string; text: string }>>(
      "/data/articles-long.json",
      "长文数据",
    ),
    fetchJson<Array<{ id: string; text: string }>>(
      "/data/articles-water.json",
      "水文数据",
    ),
  ])
    .then(([index, short, medium, long, water]) => {
      const texts = new Map(
        [...short, ...medium, ...long, ...water].map((row) => [
          row.id,
          row.text,
        ]),
      );
      return index.map((metadata) => ({
        ...metadata,
        text: texts.get(metadata.id) || "",
      }));
    })
    .catch((error) => {
      articlesPromise = null;
      throw error;
    });
  return articlesPromise;
}

export async function loadWubi(): Promise<WubiEntry[]> {
  wubiPromise ??= fetchJson<WubiEntry[]>(
    "/data/wubi86.json",
    "五笔码表",
  ).catch((error) => {
    wubiPromise = null;
    throw error;
  });
  return wubiPromise;
}

export async function loadCommonCharacters(): Promise<CommonCharacterData> {
  commonCharactersPromise ??= fetchJson<CommonCharacterData>(
    "/data/common-characters.json",
    "常用字表",
  ).catch((error) => {
    commonCharactersPromise = null;
    throw error;
  });
  return commonCharactersPromise;
}

export async function loadWubiChallenge(): Promise<WubiEntry[]> {
  wubiChallengePromise ??= fetchJson<WubiEntry[]>(
    "/data/wubi86-challenge.json",
    "挑战题库",
  ).catch((error) => {
    wubiChallengePromise = null;
    throw error;
  });
  return wubiChallengePromise;
}
