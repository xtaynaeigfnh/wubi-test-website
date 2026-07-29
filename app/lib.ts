"use client";

import type {
  ArticleMetadata,
  ArticleProgress,
  CommonCharacterData,
  CommonCharacterPreset,
  CommonPracticeArticle,
  ErrorStat,
  PracticeArticle,
  SessionResult,
  UserSettings,
  WubiEntry,
} from "./types";

export const STORAGE = {
  settings: "wubi-test:settings:v1",
  sessions: "wubi-test:sessions:v1",
  errors: "wubi-test:errors:v1",
  progress: "wubi-test:article-progress:v1",
  customTexts: "wubi-test:custom-texts:v1",
  recent: "wubi-test:recent-articles:v1",
  current: "wubi-test:current-article:v1",
  currentGenerated: "wubi-test:current-generated-practice:v1",
} as const;

export const defaultSettings: UserSettings = {
  fontSize: 30,
  preferredLength: "all",
  showCodeHints: false,
  sound: false,
  theme: "system",
  autoNext: false,
};

let articlesPromise: Promise<PracticeArticle[]> | null = null;
let articleMetadataPromise: Promise<ArticleMetadata[]> | null = null;
let wubiPromise: Promise<WubiEntry[]> | null = null;
let wubiChallengePromise: Promise<WubiEntry[]> | null = null;
let commonCharactersPromise: Promise<CommonCharacterData> | null = null;

export function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "");
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

export function readLocalArray<T>(key: string): T[] {
  const value = readLocal<unknown>(key, []);
  return Array.isArray(value) ? (value as T[]) : [];
}

export function readSettings(): UserSettings {
  const value = readLocal<unknown>(STORAGE.settings, {});
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return defaultSettings;
  }
  const partial = value as Partial<UserSettings>;
  return {
    fontSize:
      typeof partial.fontSize === "number" &&
      partial.fontSize >= 22 &&
      partial.fontSize <= 42
        ? partial.fontSize
        : defaultSettings.fontSize,
    preferredLength:
      partial.preferredLength &&
      ["all", "short", "medium", "long", "water"].includes(
        partial.preferredLength,
      )
        ? partial.preferredLength
        : defaultSettings.preferredLength,
    showCodeHints:
      typeof partial.showCodeHints === "boolean"
        ? partial.showCodeHints
        : defaultSettings.showCodeHints,
    sound:
      typeof partial.sound === "boolean"
        ? partial.sound
        : defaultSettings.sound,
    theme:
      partial.theme && ["light", "dark", "system"].includes(partial.theme)
        ? partial.theme
        : defaultSettings.theme,
    autoNext:
      typeof partial.autoNext === "boolean"
        ? partial.autoNext
        : defaultSettings.autoNext,
  };
}

export function writeLocal<T>(key: string, value: T): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

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

export const commonCharacterPresets: ReadonlyArray<{
  id: CommonCharacterPreset;
  label: string;
  description: string;
  start: number;
  end: number;
}> = [
  {
    id: "first-100",
    label: "前100",
    description: "第 1–100 字",
    start: 0,
    end: 100,
  },
  {
    id: "first-500",
    label: "前500",
    description: "第 1–500 字",
    start: 0,
    end: 500,
  },
  {
    id: "middle-500",
    label: "中500",
    description: "第 501–1000 字",
    start: 500,
    end: 1000,
  },
  {
    id: "last-500",
    label: "后500",
    description: "第 1001–1500 字",
    start: 1000,
    end: 1500,
  },
  {
    id: "first-1500",
    label: "前1500",
    description: "第 1–1500 字",
    start: 0,
    end: 1500,
  },
];

export function getCommonCharacterSlice(
  data: CommonCharacterData,
  preset: CommonCharacterPreset,
): string[] {
  const range = commonCharacterPresets.find((item) => item.id === preset);
  if (!range) return [];
  return Array.from(data.characters).slice(range.start, range.end);
}

export function shuffleCharacters(
  characters: readonly string[],
  random: () => number = Math.random,
): string[] {
  const shuffled = [...characters];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex],
      shuffled[index],
    ];
  }
  return shuffled;
}

export function formatCommonCharacterText(characters: readonly string[]): string {
  const lines: string[] = [];
  for (let index = 0; index < characters.length; index += 10) {
    lines.push(characters.slice(index, index + 10).join(""));
  }
  return lines
    .map((line, index) => (index > 0 && index % 5 === 0 ? `\n${line}` : line))
    .join("\n");
}

export function buildCommonPracticeArticle(
  data: CommonCharacterData,
  preset: CommonCharacterPreset,
  shuffled = false,
  random: () => number = Math.random,
): CommonPracticeArticle {
  const range = commonCharacterPresets.find((item) => item.id === preset);
  if (!range) throw new Error(`未知的常用字范围：${preset}`);
  const orderedCharacters = getCommonCharacterSlice(data, preset);
  const characters = shuffled
    ? shuffleCharacters(orderedCharacters, random)
    : orderedCharacters;
  const count = characters.length;
  return {
    id: `common-${preset}`,
    title: `常用单字${range.label}${shuffled ? " · 乱序" : ""}`,
    length: count <= 180 ? "short" : count <= 600 ? "medium" : "long",
    topic: "常用字",
    wordCount: count,
    version: data.version,
    text: formatCommonCharacterText(characters),
    kind: "common",
    preset,
    shuffled,
  };
}

export function isCommonPracticeArticle(
  value: unknown,
): value is CommonPracticeArticle {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const article = value as Partial<CommonPracticeArticle>;
  const presets = new Set(commonCharacterPresets.map((item) => item.id));
  return (
    article.kind === "common" &&
    typeof article.id === "string" &&
    article.id === `common-${article.preset}` &&
    typeof article.preset === "string" &&
    presets.has(article.preset as CommonCharacterPreset) &&
    typeof article.title === "string" &&
    typeof article.text === "string" &&
    typeof article.wordCount === "number" &&
    article.wordCount > 0 &&
    article.wordCount <= 1500 &&
    article.text.replace(/\s/g, "").length === article.wordCount &&
    typeof article.shuffled === "boolean"
  );
}

export function preferShortestWubiCodes(entries: WubiEntry[]): WubiEntry[] {
  const preferred = new Map<string, WubiEntry>();
  for (const entry of entries) {
    const [text, code, weight] = entry;
    const current = preferred.get(text);
    if (
      !current ||
      code.length < current[1].length ||
      (code.length === current[1].length && weight > current[2])
    ) {
      preferred.set(text, entry);
    }
  }
  return Array.from(preferred.values());
}

export function buildChallengePool(
  entries: WubiEntry[],
  mode: "char" | "phrase",
  limit = 5000,
): WubiEntry[] {
  const eligible = entries.filter(([text, code, weight]) => {
    if (code.length > 4 || weight < 100000) return false;
    const size = Array.from(text).length;
    return mode === "char" ? size === 1 : size >= 2 && size <= 4;
  });
  return preferShortestWubiCodes(eligible)
    .sort((a, b) => b[2] - a[2])
    .slice(0, limit);
}

export function shouldDeferInputCommit(
  compositionSessionActive: boolean,
  nativeEventIsComposing: boolean,
): boolean {
  return compositionSessionActive || nativeEventIsComposing;
}

export function countCommittedAttempts(
  previous: string,
  next: string,
  target: string,
): { attempts: number; correct: number } {
  let commonPrefix = 0;
  const sharedLength = Math.min(previous.length, next.length);
  while (
    commonPrefix < sharedLength &&
    previous[commonPrefix] === next[commonPrefix]
  ) {
    commonPrefix += 1;
  }

  let correct = 0;
  for (let index = commonPrefix; index < next.length; index += 1) {
    if (next[index] === target[index]) correct += 1;
  }
  return {
    attempts: Math.max(0, next.length - commonPrefix),
    correct,
  };
}

export function calculateAccuracy(
  correctAttempts: number,
  attempts: number,
): number {
  return attempts > 0 ? (correctAttempts / attempts) * 100 : 100;
}

export function canCompleteTyping(typed: string, target: string): boolean {
  return target.length > 0 && typed.length >= target.length;
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

export function getSessions() {
  return readLocalArray<SessionResult>(STORAGE.sessions);
}

export function getProgress() {
  return readLocalArray<ArticleProgress>(STORAGE.progress);
}

export function saveSession(session: SessionResult) {
  const sessions = [session, ...getSessions()].slice(0, 500);
  writeLocal(STORAGE.sessions, sessions);
  if (!session.articleId) return;
  const progress = getProgress();
  const existing = progress.find((row) => row.articleId === session.articleId);
  if (existing) {
    existing.attempts += 1;
    existing.bestSpeed = Math.max(existing.bestSpeed, session.speed);
    existing.completed = true;
    existing.lastPracticed = session.date;
    existing.errors += session.errors;
  } else {
    progress.push({
      articleId: session.articleId,
      attempts: 1,
      bestSpeed: session.speed,
      completed: true,
      lastPracticed: session.date,
      errors: session.errors,
    });
  }
  writeLocal(STORAGE.progress, progress);
}

export function addError(text: string, code?: string) {
  const errors = readLocalArray<ErrorStat>(STORAGE.errors);
  const existing = errors.find((row) => row.text === text && row.code === code);
  if (existing) {
    existing.count += 1;
    existing.lastSeen = new Date().toISOString();
  } else {
    errors.push({ text, code, count: 1, lastSeen: new Date().toISOString() });
  }
  writeLocal(STORAGE.errors, errors.sort((a, b) => b.count - a.count).slice(0, 300));
}

export function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export const lengthLabels = {
  all: "全部长度",
  short: "短文",
  medium: "中篇",
  long: "长文",
  water: "水文",
} as const;
