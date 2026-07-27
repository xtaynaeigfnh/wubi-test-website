"use client";

import type {
  ArticleMetadata,
  ArticleProgress,
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
} as const;

export const defaultSettings: UserSettings = {
  fontSize: 30,
  preferredLength: "all",
  showCodeHints: false,
  sound: false,
  theme: "system",
  autoNext: false,
};

export function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "");
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeLocal<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export async function loadArticles(): Promise<PracticeArticle[]> {
  const [index, short, medium, long, water] = await Promise.all([
    fetch("/data/articles-index.json").then((response) => response.json()) as Promise<ArticleMetadata[]>,
    fetch("/data/articles-short.json").then((response) => response.json()) as Promise<Array<{ id: string; text: string }>>,
    fetch("/data/articles-medium.json").then((response) => response.json()) as Promise<Array<{ id: string; text: string }>>,
    fetch("/data/articles-long.json").then((response) => response.json()) as Promise<Array<{ id: string; text: string }>>,
    fetch("/data/articles-water.json").then((response) => response.json()) as Promise<Array<{ id: string; text: string }>>,
  ]);
  const texts = new Map([...short, ...medium, ...long, ...water].map((row) => [row.id, row.text]));
  return index.map((metadata) => ({ ...metadata, text: texts.get(metadata.id) || "" }));
}

export async function loadWubi(): Promise<WubiEntry[]> {
  return fetch("/data/wubi86.json").then((response) => response.json());
}

export async function loadWubiChallenge(): Promise<WubiEntry[]> {
  return fetch("/data/wubi86-challenge.json").then((response) => response.json());
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

export function getSessions() {
  return readLocal<SessionResult[]>(STORAGE.sessions, []);
}

export function getProgress() {
  return readLocal<ArticleProgress[]>(STORAGE.progress, []);
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
  const errors = readLocal<ErrorStat[]>(STORAGE.errors, []);
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
