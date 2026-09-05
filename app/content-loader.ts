"use client";

import type {
  ArticleMetadata,
  CommonCharacterData,
  PracticeArticle,
  WubiEntry,
} from "./types";

export const FALLBACK_ARTICLE_COUNT = 300;

let articlesPromise: Promise<PracticeArticle[]> | null = null;
let articleMetadataPromise: Promise<ArticleMetadata[]> | null = null;
let wubiPromise: Promise<WubiEntry[]> | null = null;
let wubiChallengePromise: Promise<WubiEntry[]> | null = null;
let commonCharactersPromise: Promise<CommonCharacterData> | null = null;

type Validator<T> = (value: unknown) => value is T;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isArticleMetadata(value: unknown): value is ArticleMetadata {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.title) &&
    ["short", "medium", "long", "water"].includes(String(value.length)) &&
    isNonEmptyString(value.topic) &&
    Number.isInteger(value.wordCount) &&
    Number(value.wordCount) > 0 &&
    Number.isInteger(value.version) &&
    Number(value.version) >= 1
  );
}

function isArticleMetadataList(value: unknown): value is ArticleMetadata[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(isArticleMetadata) &&
    new Set(value.map((item) => item.id)).size === value.length
  );
}

type ArticleBody = { id: string; text: string };

function isArticleBodyList(value: unknown): value is ArticleBody[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        isRecord(item) &&
        isNonEmptyString(item.id) &&
        isNonEmptyString(item.text),
    ) &&
    new Set(value.map((item) => item.id)).size === value.length
  );
}

function isWubiEntryList(value: unknown): value is WubiEntry[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (entry) =>
        Array.isArray(entry) &&
        entry.length === 3 &&
        isNonEmptyString(entry[0]) &&
        typeof entry[1] === "string" &&
        /^[a-y]{1,4}$/i.test(entry[1]) &&
        typeof entry[2] === "number" &&
        Number.isFinite(entry[2]) &&
        entry[2] >= 0,
    )
  );
}

function isCommonCharacterData(value: unknown): value is CommonCharacterData {
  if (!isRecord(value) || !isRecord(value.source)) return false;
  return (
    value.version === 1 &&
    isNonEmptyString(value.source.name) &&
    isNonEmptyString(value.source.url) &&
    isNonEmptyString(value.source.retrievedAt) &&
    isNonEmptyString(value.characters)
  );
}

async function fetchJson<T>(
  url: string,
  label: string,
  validate: Validator<T>,
): Promise<T> {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const response = await fetch(`${basePath}${url}`);
  if (!response.ok) {
    throw new Error(`${label}加载失败（HTTP ${response.status}）`);
  }
  try {
    const value: unknown = await response.json();
    if (!validate(value)) throw new Error("invalid structure");
    return value;
  } catch {
    throw new Error(`${label}内容损坏，无法解析`);
  }
}

export function loadArticleMetadata(): Promise<ArticleMetadata[]> {
  articleMetadataPromise ??= fetchJson<ArticleMetadata[]>(
    "/data/articles-index.json",
    "文章索引",
    isArticleMetadataList,
  ).catch((error) => {
    articleMetadataPromise = null;
    throw error;
  });
  return articleMetadataPromise;
}

export async function loadArticles(): Promise<PracticeArticle[]> {
  articlesPromise ??= Promise.all([
    loadArticleMetadata(),
    fetchJson<ArticleBody[]>(
      "/data/articles-short.json",
      "短文数据",
      isArticleBodyList,
    ),
    fetchJson<ArticleBody[]>(
      "/data/articles-medium.json",
      "中篇数据",
      isArticleBodyList,
    ),
    fetchJson<ArticleBody[]>(
      "/data/articles-long.json",
      "长文数据",
      isArticleBodyList,
    ),
    fetchJson<ArticleBody[]>(
      "/data/articles-water.json",
      "水文数据",
      isArticleBodyList,
    ),
  ])
    .then(([index, short, medium, long, water]) => {
      const bodies = [...short, ...medium, ...long, ...water];
      const texts = new Map(bodies.map((row) => [row.id, row.text]));
      if (
        texts.size !== bodies.length ||
        index.some((metadata) => !texts.has(metadata.id)) ||
        bodies.some((body) => !index.some((metadata) => metadata.id === body.id))
      ) {
        throw new Error("文章索引与正文数据不一致");
      }
      return index.map((metadata) => ({
        ...metadata,
        text: texts.get(metadata.id) as string,
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
    isWubiEntryList,
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
    isCommonCharacterData,
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
    isWubiEntryList,
  ).catch((error) => {
    wubiChallengePromise = null;
    throw error;
  });
  return wubiChallengePromise;
}
