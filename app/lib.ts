"use client";

import type {
  ArticleLength,
  ArticleMetadata,
  ArticleProgress,
  BackupPayload,
  CommonCharacterData,
  CommonCharacterPreset,
  CommonPracticeArticle,
  DailyGoal,
  DailyProgress,
  ErrorStat,
  PracticeArticle,
  SessionResult,
  TrendPoint,
  UserSettings,
  WubiEntry,
} from "./types";
import {
  incrementKeyUsage,
  isValidKeyUsage,
  normalizeKeyUsage,
  type KeyUsageMap,
} from "./key-usage.ts";

export const STORAGE = {
  settings: "wubi-test:settings:v1",
  sessions: "wubi-test:sessions:v1",
  errors: "wubi-test:errors:v1",
  progress: "wubi-test:article-progress:v1",
  customTexts: "wubi-test:custom-texts:v1",
  recent: "wubi-test:recent-articles:v1",
  current: "wubi-test:current-article:v1",
  dailyGoal: "wubi-test:daily-goal:v1",
  currentGenerated: "wubi-test:current-generated-practice:v1",
  music: "wubi-test:music:v1",
  keyUsage: "wubi-test:key-usage:v1",
} as const;

export const STORAGE_KEYS = Object.values(STORAGE);

export const defaultSettings: UserSettings = {
  fontSize: 30,
  preferredLength: "all",
  showCodeHints: false,
  sound: false,
  theme: "system",
  autoNext: false,
};

export const defaultDailyGoal: DailyGoal = {
  targetChars: 500,
  targetMinutes: 15,
  targetRounds: 2,
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

export function readDailyGoal(): DailyGoal {
  const value = readLocal<Partial<DailyGoal>>(STORAGE.dailyGoal, {});
  return {
    targetChars:
      typeof value.targetChars === "number" &&
      value.targetChars >= 100 &&
      value.targetChars <= 10000
        ? value.targetChars
        : defaultDailyGoal.targetChars,
    targetMinutes:
      typeof value.targetMinutes === "number" &&
      value.targetMinutes >= 5 &&
      value.targetMinutes <= 180
        ? value.targetMinutes
        : defaultDailyGoal.targetMinutes,
    targetRounds:
      typeof value.targetRounds === "number" &&
      value.targetRounds >= 1 &&
      value.targetRounds <= 20
        ? value.targetRounds
        : defaultDailyGoal.targetRounds,
  };
}

export function selectInitialArticle(
  availableArticles: PracticeArticle[],
  builtInArticles: PracticeArticle[],
  currentId: string | null,
  preferredLength: ArticleLength | "all",
): PracticeArticle | null {
  const matchesPreference = (article: PracticeArticle) =>
    preferredLength === "all" || article.length === preferredLength;
  const current = availableArticles.find(
    (article) => article.id === currentId && matchesPreference(article),
  );
  if (current) return current;

  const fallbackLength =
    preferredLength === "all" ? "short" : preferredLength;
  return (
    builtInArticles.find((article) => article.length === fallbackLength) ||
    availableArticles.find(matchesPreference) ||
    availableArticles[0] ||
    null
  );
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

let pendingKeyUsage: KeyUsageMap | null = null;
let keyUsageTimer: number | null = null;

function flushPendingKeyUsage(): void {
  if (typeof window === "undefined") return;
  if (keyUsageTimer !== null) window.clearTimeout(keyUsageTimer);
  const usage = pendingKeyUsage;
  pendingKeyUsage = null;
  keyUsageTimer = null;
  if (usage) writeLocal(STORAGE.keyUsage, usage);
}

export function readKeyUsage(): KeyUsageMap {
  return normalizeKeyUsage(
    pendingKeyUsage ?? readLocal<unknown>(STORAGE.keyUsage, {}),
  );
}

export function recordKeyUsage(code: string): void {
  if (typeof window === "undefined") return;
  const current = readKeyUsage();
  const next = incrementKeyUsage(current, code);
  if (next === current) return;
  pendingKeyUsage = next;
  if (keyUsageTimer !== null) return;
  keyUsageTimer = window.setTimeout(flushPendingKeyUsage, 180);
}

export function clearKeyUsage(): void {
  if (typeof window === "undefined") return;
  if (keyUsageTimer !== null) window.clearTimeout(keyUsageTimer);
  pendingKeyUsage = null;
  keyUsageTimer = null;
  writeLocal(STORAGE.keyUsage, {});
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
    id: "first-050",
    label: "01–050",
    description: "第 1–50 字",
    start: 0,
    end: 50,
  },
  {
    id: "051-100",
    label: "051–100",
    description: "第 51–100 字",
    start: 50,
    end: 100,
  },
  {
    id: "101-150",
    label: "101–150",
    description: "第 101–150 字",
    start: 100,
    end: 150,
  },
  {
    id: "151-200",
    label: "151–200",
    description: "第 151–200 字",
    start: 150,
    end: 200,
  },
  {
    id: "201-250",
    label: "201–250",
    description: "第 201–250 字",
    start: 200,
    end: 250,
  },
  {
    id: "251-300",
    label: "251–300",
    description: "第 251–300 字",
    start: 250,
    end: 300,
  },
  {
    id: "301-350",
    label: "301–350",
    description: "第 301–350 字",
    start: 300,
    end: 350,
  },
  {
    id: "351-400",
    label: "351–400",
    description: "第 351–400 字",
    start: 350,
    end: 400,
  },
  {
    id: "401-450",
    label: "401–450",
    description: "第 401–450 字",
    start: 400,
    end: 450,
  },
  {
    id: "451-500",
    label: "451–500",
    description: "第 451–500 字",
    start: 450,
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

interface MinimumCodeCandidate {
  characters: string[];
  codeLength: number;
}

export type MinimumCodeLengthIndex = Map<string, MinimumCodeCandidate[]>;

const hanCharacterPattern = /^\p{Script=Han}$/u;

export function buildMinimumCodeLengthIndex(
  entries: WubiEntry[],
): MinimumCodeLengthIndex {
  const index: MinimumCodeLengthIndex = new Map();
  for (const [text, code] of preferShortestWubiCodes(entries)) {
    const characters = Array.from(text);
    if (
      characters.length === 0 ||
      code.length === 0 ||
      characters.some((character) => !hanCharacterPattern.test(character))
    ) {
      continue;
    }
    const first = characters[0];
    const candidates = index.get(first) ?? [];
    candidates.push({ characters, codeLength: code.length });
    index.set(first, candidates);
  }
  return index;
}

export function calculateTheoreticalMinimumCodeLength(
  text: string,
  index: MinimumCodeLengthIndex,
): number | null {
  const characters = Array.from(text);
  const hanCharacterCount = characters.filter((character) =>
    hanCharacterPattern.test(character),
  ).length;
  if (hanCharacterCount === 0) return null;

  const minimumKeys = Array<number>(characters.length + 1).fill(
    Number.POSITIVE_INFINITY,
  );
  minimumKeys[0] = 0;

  for (let position = 0; position < characters.length; position += 1) {
    const currentKeys = minimumKeys[position];
    if (!Number.isFinite(currentKeys)) continue;

    const currentCharacter = characters[position];
    if (!hanCharacterPattern.test(currentCharacter)) {
      minimumKeys[position + 1] = Math.min(
        minimumKeys[position + 1],
        currentKeys,
      );
      continue;
    }

    for (const candidate of index.get(currentCharacter) ?? []) {
      if (
        candidate.characters.every(
          (character, offset) => characters[position + offset] === character,
        )
      ) {
        const nextPosition = position + candidate.characters.length;
        minimumKeys[nextPosition] = Math.min(
          minimumKeys[nextPosition],
          currentKeys + candidate.codeLength,
        );
      }
    }
  }

  const totalKeys = minimumKeys[characters.length];
  return Number.isFinite(totalKeys) ? totalKeys / hanCharacterCount : null;
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

export function isWubiLetterKey(key: string, code = ""): boolean {
  if (/^[a-y]$/i.test(key)) return true;
  return (
    (key === "Process" || key === "Unidentified") &&
    /^Key[A-Y]$/.test(code)
  );
}

export function countCommittedAttempts(
  previous: string,
  next: string,
  target: string,
): { attempts: number; correct: number } {
  const previousCharacters = Array.from(previous);
  const nextCharacters = Array.from(next);
  const targetCharacters = Array.from(target);
  let commonPrefix = 0;
  const sharedLength = Math.min(
    previousCharacters.length,
    nextCharacters.length,
  );
  while (
    commonPrefix < sharedLength &&
    previousCharacters[commonPrefix] === nextCharacters[commonPrefix]
  ) {
    commonPrefix += 1;
  }

  let correct = 0;
  for (let index = commonPrefix; index < nextCharacters.length; index += 1) {
    if (nextCharacters[index] === targetCharacters[index]) correct += 1;
  }
  return {
    attempts: Math.max(0, nextCharacters.length - commonPrefix),
    correct,
  };
}

export function calculateAccuracy(
  correctAttempts: number,
  attempts: number,
): number {
  return attempts > 0 ? (correctAttempts / attempts) * 100 : 100;
}

export function calculateTypingMetrics({
  typed,
  target,
  durationSeconds,
  keyCount,
  letterKeys,
  attemptCount,
  correctAttemptCount,
}: {
  typed: string;
  target: string;
  durationSeconds: number;
  keyCount: number;
  letterKeys: number;
  attemptCount: number;
  correctAttemptCount: number;
}) {
  const typedCharacters = Array.from(typed);
  const targetCharacters = Array.from(target);
  let correctChars = 0;
  for (let index = 0; index < typedCharacters.length; index += 1) {
    if (typedCharacters[index] === targetCharacters[index]) correctChars += 1;
  }
  return {
    correctChars,
    attemptedChars: Math.max(targetCharacters.length, attemptCount),
    speed:
      durationSeconds > 0
        ? Math.round(correctChars / (durationSeconds / 60))
        : 0,
    kps: durationSeconds > 0 ? keyCount / durationSeconds : 0,
    codeLength: correctChars > 0 ? letterKeys / correctChars : 0,
    accuracy: calculateAccuracy(correctAttemptCount, attemptCount),
  };
}

export function calculateKeyAccuracy({
  keyCount,
  backspaceCount,
  correctionCount,
  codeLength,
}: {
  keyCount: number;
  backspaceCount: number;
  correctionCount: number;
  codeLength: number;
}): number {
  if (keyCount <= 0) return 100;
  const correctionCost =
    backspaceCount + correctionCount * Math.max(1, codeLength);
  return Math.max(0, Math.min(100, ((keyCount - correctionCost) / keyCount) * 100));
}

export function calculatePhraseRate(
  phraseChars: number,
  correctChars: number,
): number {
  if (correctChars <= 0) return 0;
  return Math.max(0, Math.min(100, (phraseChars / correctChars) * 100));
}

export function countCommittedEdit(previous: string, next: string) {
  const previousCharacters = Array.from(previous);
  const nextCharacters = Array.from(next);
  let commonPrefix = 0;
  while (
    commonPrefix < previousCharacters.length &&
    commonPrefix < nextCharacters.length &&
    previousCharacters[commonPrefix] === nextCharacters[commonPrefix]
  ) {
    commonPrefix += 1;
  }
  const inserted = Math.max(0, nextCharacters.length - commonPrefix);
  return {
    removed: Math.max(0, previousCharacters.length - commonPrefix),
    inserted,
    phraseChars: inserted > 1 ? inserted : 0,
  };
}

export function classifyWubiHand(
  key: string,
  code = "",
): "left" | "right" | null {
  const normalized = code.startsWith("Key")
    ? code.slice(3).toLowerCase()
    : key.toLowerCase();
  if (normalized.length !== 1) return null;
  if ("qwertasdfgzxcvb".includes(normalized)) return "left";
  if ("yuiophjklnm".includes(normalized)) return "right";
  return null;
}

export function isImeSelectionKey(key: string): boolean {
  return key === " " || key === "Enter" || /^[1-9]$/.test(key);
}

export function calculateActiveDurationSeconds({
  startedAt,
  now,
  pausedDurationMs,
  pausedAt,
}: {
  startedAt: number | null;
  now: number;
  pausedDurationMs: number;
  pausedAt: number | null;
}): number {
  if (startedAt === null) return 0;
  const currentPause = pausedAt === null ? 0 : Math.max(0, now - pausedAt);
  return Math.max(0, (now - startedAt - pausedDurationMs - currentPause) / 1000);
}

export function calculateRemainingSeconds(
  deadline: number,
  now = Date.now(),
): number {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

export function canCompleteTyping(typed: string, target: string): boolean {
  const targetLength = Array.from(target).length;
  return targetLength > 0 && Array.from(typed).length >= targetLength;
}

export function normalizeCustomText(value: string): string {
  const normalized = value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .trim();
  return Array.from(normalized).slice(0, 5000).join("");
}

export function buildCustomArticle(
  id: string,
  title: string,
  text: string,
  version = 1,
): PracticeArticle | null {
  const clean = normalizeCustomText(text);
  const characterCount = Array.from(clean).length;
  const cleanTitle = Array.from(
    normalizeCustomText(title).replace(/\s+/g, " "),
  )
    .slice(0, 80)
    .join("");
  if (characterCount < 10) return null;
  return {
    id,
    title: cleanTitle || "我的自定义练习",
    length:
      characterCount < 200
        ? "short"
        : characterCount < 700
          ? "medium"
          : "long",
    topic: "自定义",
    wordCount: Array.from(clean.replace(/\s/g, "")).length,
    version,
    text: clean,
    kind: "custom",
  };
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

export function getErrors(): ErrorStat[] {
  const stored = readLocalArray<ErrorStat>(STORAGE.errors);
  const merged = mergeErrorStatsByText(stored);
  if (merged.length !== stored.length) {
    writeLocal(STORAGE.errors, merged);
  }
  return merged;
}

export function addError(text: string, code?: string) {
  const errors = getErrors();
  const existing = errors.find((row) => row.text === text);
  if (existing) {
    if (code) existing.code = code;
    existing.count += 1;
    existing.lastSeen = new Date().toISOString();
    existing.mastery = Math.max(0, (existing.mastery ?? 0) - 1);
  } else {
    errors.push({
      text,
      code,
      count: 1,
      lastSeen: new Date().toISOString(),
      mastery: 0,
    });
  }
  writeLocal(STORAGE.errors, errors.sort((a, b) => b.count - a.count).slice(0, 300));
}

export function updateErrorMastery(
  text: string,
  code: string,
  correct: boolean,
): ErrorStat[] {
  const errors = getErrors();
  const existing = errors.find((row) => row.text === text);
  if (!existing) {
    writeLocal(STORAGE.errors, errors);
    return errors;
  }
  existing.code = code;
  if (correct) {
    existing.mastery = Math.min(5, (existing.mastery ?? 0) + 1);
    existing.lastCorrect = new Date().toISOString();
  } else {
    existing.count += 1;
    existing.mastery = Math.max(0, (existing.mastery ?? 0) - 1);
    existing.lastSeen = new Date().toISOString();
  }
  const next = errors.sort(
    (a, b) =>
      b.count - (b.mastery ?? 0) - (a.count - (a.mastery ?? 0)),
  );
  writeLocal(STORAGE.errors, next);
  return next;
}

function mergeErrorStatsByText(errors: ErrorStat[]): ErrorStat[] {
  const merged = new Map<string, ErrorStat>();
  for (const error of errors) {
    const existing = merged.get(error.text);
    if (!existing) {
      merged.set(error.text, { ...error });
      continue;
    }
    existing.count += error.count;
    existing.code = existing.code ?? error.code;
    existing.mastery = Math.min(
      5,
      (existing.mastery ?? 0) + (error.mastery ?? 0),
    );
    if (error.lastSeen > existing.lastSeen) {
      existing.lastSeen = error.lastSeen;
    }
    if (
      error.lastCorrect &&
      (!existing.lastCorrect || error.lastCorrect > existing.lastCorrect)
    ) {
      existing.lastCorrect = error.lastCorrect;
    }
  }
  return Array.from(merged.values());
}

export function buildReviewPool(
  errors: ErrorStat[],
  entries: WubiEntry[],
): WubiEntry[] {
  const preferred = new Map(
    preferShortestWubiCodes(entries).map((entry) => [entry[0], entry]),
  );
  const ranked = new Map<string, { entry: WubiEntry; score: number }>();
  for (const error of errors) {
    const normalizedCode = error.code?.trim().toLowerCase();
    const textLength = Array.from(error.text).length;
    const fallbackEntry =
      normalizedCode &&
      /^[a-y]{1,4}$/.test(normalizedCode) &&
      textLength >= 1 &&
      textLength <= 4
        ? ([error.text, normalizedCode, 0] as WubiEntry)
        : null;
    const entry = preferred.get(error.text) ?? fallbackEntry;
    if (!entry) continue;
    const score = Math.max(1, error.count - (error.mastery ?? 0));
    const existing = ranked.get(error.text);
    ranked.set(error.text, {
      entry,
      score: score + (existing?.score ?? 0),
    });
  }
  return Array.from(ranked.values())
    .sort((a, b) => b.score - a.score)
    .map(({ entry }) => entry);
}

export function buildRootPool(
  entries: WubiEntry[],
  keys: string,
  limit = 500,
): WubiEntry[] {
  const keySet = new Set(keys.toLowerCase());
  return preferShortestWubiCodes(entries)
    .filter(
      ([text, code, weight]) =>
        Array.from(text).length === 1 &&
        code.length <= 4 &&
        keySet.has(code[0]) &&
        weight >= 100000,
    )
    .sort((a, b) => b[2] - a[2])
    .slice(0, limit);
}

export function localDateKey(value: string | number | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function calculateDailyProgress(
  sessions: SessionResult[],
  now = new Date(),
): DailyProgress {
  const date = localDateKey(now);
  const today = sessions.filter((session) => localDateKey(session.date) === date);
  return {
    date,
    chars: today
      .filter((session) => session.type === "article")
      .reduce((sum, session) => sum + session.correctChars, 0),
    minutes: today.reduce(
      (sum, session) => sum + session.durationSeconds / 60,
      0,
    ),
    rounds: today.length,
    articleSessions: today.filter((session) => session.type === "article").length,
    trainingSessions: today.filter((session) => session.type !== "article").length,
  };
}

export function calculateStreak(
  sessions: SessionResult[],
  now = new Date(),
): number {
  const dates = new Set(sessions.map((session) => localDateKey(session.date)));
  const cursor = new Date(now);
  cursor.setHours(12, 0, 0, 0);
  if (!dates.has(localDateKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
  }
  let streak = 0;
  while (dates.has(localDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function buildTrendSeries(
  sessions: SessionResult[],
  range: 7 | 30 | "all",
  now = new Date(),
): TrendPoint[] {
  const articleSessions = sessions.filter(
    (session) => session.type === "article",
  );
  const oldest = articleSessions.reduce<Date | null>((result, session) => {
    const date = new Date(session.date);
    return !result || date < result ? date : result;
  }, null);
  const dayCount =
    range === "all"
      ? Math.max(
          1,
          oldest
            ? Math.floor(
                (new Date(localDateKey(now)).getTime() -
                  new Date(localDateKey(oldest)).getTime()) /
                  86400000,
              ) + 1
            : 1,
        )
      : range;
  return Array.from({ length: dayCount }, (_, offset) => {
    const date = new Date(now);
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - (dayCount - offset - 1));
    const key = localDateKey(date);
    const rows = articleSessions.filter(
      (session) => localDateKey(session.date) === key,
    );
    const weightedChars = rows.reduce(
      (sum, session) => sum + session.correctChars,
      0,
    );
    const weightedMinutes = rows.reduce(
      (sum, session) => sum + session.durationSeconds / 60,
      0,
    );
    return {
      date: key,
      label: `${date.getMonth() + 1}/${date.getDate()}`,
      sessions: rows.length,
      chars: weightedChars,
      minutes: weightedMinutes,
      speed: weightedMinutes > 0 ? Math.round(weightedChars / weightedMinutes) : 0,
      accuracy: rows.length
        ? rows.reduce((sum, session) => sum + session.accuracy, 0) / rows.length
        : 0,
    };
  });
}

export function createBackupPayload(
  data: Record<string, unknown>,
  now = new Date(),
): BackupPayload {
  const selected = Object.fromEntries(
    STORAGE_KEYS.filter((key) => key in data).map((key) => [key, data[key]]),
  );
  return {
    format: "wubi-test-backup",
    version: 2,
    exportedAt: now.toISOString(),
    data: selected,
  };
}

const MAX_BACKUP_BYTES = 2 * 1024 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && Array.from(value).length <= maxLength;
}

function isFiniteRange(value: unknown, min: number, max: number): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
  );
}

function isDateString(value: unknown): value is string {
  return (
    isBoundedString(value, 40) &&
    value.length > 0 &&
    Number.isFinite(Date.parse(value))
  );
}

function isPracticeArticle(value: unknown): value is PracticeArticle {
  if (!isRecord(value)) return false;
  return (
    isBoundedString(value.id, 160) &&
    value.id.length > 0 &&
    isBoundedString(value.title, 80) &&
    value.title.length > 0 &&
    ["short", "medium", "long", "water"].includes(String(value.length)) &&
    isBoundedString(value.topic, 80) &&
    isFiniteRange(value.wordCount, 0, 5000) &&
    Number.isInteger(value.wordCount) &&
    isFiniteRange(value.version, 1, 100000) &&
    Number.isInteger(value.version) &&
    isBoundedString(value.text, 5000) &&
    (value.favorite === undefined || typeof value.favorite === "boolean") &&
    (value.kind === undefined || value.kind === "custom" || value.kind === "common")
  );
}

function isSessionResult(value: unknown): value is SessionResult {
  if (!isRecord(value)) return false;
  const numericFields = [
    "durationSeconds",
    "correctChars",
    "attemptedChars",
    "speed",
    "kps",
    "codeLength",
    "errors",
  ];
  const optionalNumericFields = [
    "keyCount",
    "backspaceCount",
    "correctionCount",
    "enterCount",
    "selectionCount",
    "leftHandKeys",
    "rightHandKeys",
    "pauseCount",
    "pauseSeconds",
    "retryCount",
  ];
  const optionalPercentageFields = ["keyAccuracy", "phraseRate"];
  return (
    isBoundedString(value.id, 160) &&
    value.id.length > 0 &&
    ["article", "challenge", "review", "roots"].includes(String(value.type)) &&
    (value.articleId === undefined || isBoundedString(value.articleId, 160)) &&
    isBoundedString(value.title, 200) &&
    isDateString(value.date) &&
    numericFields.every((field) => isFiniteRange(value[field], 0, 1_000_000_000)) &&
    isFiniteRange(value.accuracy, 0, 100) &&
    (value.theoreticalCodeLength === undefined ||
      value.theoreticalCodeLength === null ||
      isFiniteRange(value.theoreticalCodeLength, 0, 100)) &&
    optionalNumericFields.every(
      (field) =>
        value[field] === undefined ||
        isFiniteRange(value[field], 0, 1_000_000_000),
    ) &&
    optionalPercentageFields.every(
      (field) => value[field] === undefined || isFiniteRange(value[field], 0, 100),
    ) &&
    (value.errorChars === undefined ||
      (Array.isArray(value.errorChars) &&
        value.errorChars.length <= 5000 &&
        value.errorChars.every((item) => isBoundedString(item, 8))))
  );
}

function isErrorStat(value: unknown): value is ErrorStat {
  return (
    isRecord(value) &&
    isBoundedString(value.text, 20) &&
    value.text.length > 0 &&
    (value.code === undefined ||
      (isBoundedString(value.code, 4) && /^[a-y]{1,4}$/i.test(value.code))) &&
    isFiniteRange(value.count, 0, 1_000_000) &&
    Number.isInteger(value.count) &&
    isDateString(value.lastSeen) &&
    (value.mastery === undefined ||
      (isFiniteRange(value.mastery, 0, 5) && Number.isInteger(value.mastery))) &&
    (value.lastCorrect === undefined || isDateString(value.lastCorrect))
  );
}

function isArticleProgress(value: unknown): value is ArticleProgress {
  return (
    isRecord(value) &&
    isBoundedString(value.articleId, 160) &&
    value.articleId.length > 0 &&
    isFiniteRange(value.attempts, 0, 1_000_000) &&
    Number.isInteger(value.attempts) &&
    isFiniteRange(value.bestSpeed, 0, 1_000_000) &&
    typeof value.completed === "boolean" &&
    isDateString(value.lastPracticed) &&
    isFiniteRange(value.errors, 0, 1_000_000) &&
    Number.isInteger(value.errors)
  );
}

function validateArray(
  value: unknown,
  maximum: number,
  validator: (item: unknown) => boolean,
): boolean {
  return (
    Array.isArray(value) &&
    value.length <= maximum &&
    value.every(validator)
  );
}

function isSettings(value: unknown): value is UserSettings {
  return (
    isRecord(value) &&
    isFiniteRange(value.fontSize, 22, 42) &&
    ["all", "short", "medium", "long", "water"].includes(
      String(value.preferredLength),
    ) &&
    typeof value.showCodeHints === "boolean" &&
    typeof value.sound === "boolean" &&
    ["light", "dark", "system"].includes(String(value.theme)) &&
    typeof value.autoNext === "boolean"
  );
}

function normalizeBackupSettings(value: unknown): UserSettings | null {
  if (!isRecord(value)) return null;
  const keys = new Set(Object.keys(value));
  const knownKeys = new Set(Object.keys(defaultSettings));
  if ([...keys].some((key) => !knownKeys.has(key))) return null;
  if (
    (keys.has("fontSize") && !isFiniteRange(value.fontSize, 22, 42)) ||
    (keys.has("preferredLength") &&
      !["all", "short", "medium", "long", "water"].includes(
        String(value.preferredLength),
      )) ||
    (keys.has("showCodeHints") && typeof value.showCodeHints !== "boolean") ||
    (keys.has("sound") && typeof value.sound !== "boolean") ||
    (keys.has("theme") &&
      !["light", "dark", "system"].includes(String(value.theme))) ||
    (keys.has("autoNext") && typeof value.autoNext !== "boolean")
  ) {
    return null;
  }
  return { ...defaultSettings, ...value } as UserSettings;
}

function isDailyGoal(value: unknown): value is DailyGoal {
  return (
    isRecord(value) &&
    isFiniteRange(value.targetChars, 100, 10000) &&
    isFiniteRange(value.targetMinutes, 5, 180) &&
    isFiniteRange(value.targetRounds, 1, 20) &&
    Number.isInteger(value.targetChars) &&
    Number.isInteger(value.targetMinutes) &&
    Number.isInteger(value.targetRounds)
  );
}

function normalizeBackupDailyGoal(value: unknown): DailyGoal | null {
  if (!isRecord(value)) return null;
  const keys = new Set(Object.keys(value));
  const knownKeys = new Set(Object.keys(defaultDailyGoal));
  if ([...keys].some((key) => !knownKeys.has(key))) return null;
  if (
    (keys.has("targetChars") &&
      (!isFiniteRange(value.targetChars, 100, 10000) ||
        !Number.isInteger(value.targetChars))) ||
    (keys.has("targetMinutes") &&
      (!isFiniteRange(value.targetMinutes, 5, 180) ||
        !Number.isInteger(value.targetMinutes))) ||
    (keys.has("targetRounds") &&
      (!isFiniteRange(value.targetRounds, 1, 20) ||
        !Number.isInteger(value.targetRounds)))
  ) {
    return null;
  }
  return { ...defaultDailyGoal, ...value } as DailyGoal;
}

function isMusicPreferences(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.trackId === null || isBoundedString(value.trackId, 160)) &&
    isFiniteRange(value.volume, 0, 1) &&
    typeof value.muted === "boolean"
  );
}

function isValidBackupValue(key: string, value: unknown): boolean {
  if (value === null) return true;
  switch (key) {
    case STORAGE.settings:
      return isSettings(value);
    case STORAGE.sessions:
      return validateArray(value, 500, isSessionResult);
    case STORAGE.errors:
      return validateArray(value, 300, isErrorStat);
    case STORAGE.progress:
      return validateArray(value, 500, isArticleProgress);
    case STORAGE.customTexts:
      return validateArray(value, 20, isPracticeArticle);
    case STORAGE.recent:
      return validateArray(
        value,
        100,
        (item) => isBoundedString(item, 160) && item.length > 0,
      );
    case STORAGE.current:
      return isBoundedString(value, 160);
    case STORAGE.dailyGoal:
      return isDailyGoal(value);
    case STORAGE.currentGenerated:
      return isPracticeArticle(value);
    case STORAGE.music:
      return isMusicPreferences(value);
    case STORAGE.keyUsage:
      return isValidKeyUsage(value);
    default:
      return false;
  }
}

export function parseBackupPayload(value: unknown): BackupPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("备份文件格式不正确");
  }
  const payload = value as Partial<BackupPayload>;
  if (
    payload.format !== "wubi-test-backup" ||
    payload.version !== 2 ||
    !payload.data ||
    typeof payload.data !== "object" ||
    Array.isArray(payload.data)
  ) {
    throw new Error("这不是受支持的五笔测试网站备份");
  }
  const unknownKeys = Object.keys(payload.data).filter(
    (key) => !STORAGE_KEYS.includes(key as (typeof STORAGE_KEYS)[number]),
  );
  if (unknownKeys.length) {
    throw new Error("备份包含无法识别的数据项");
  }
  if (!isDateString(payload.exportedAt)) {
    throw new Error("备份导出时间无效");
  }
  const normalizedData = { ...payload.data };
  if (STORAGE.settings in normalizedData && normalizedData[STORAGE.settings] !== null) {
    const settings = normalizeBackupSettings(normalizedData[STORAGE.settings]);
    if (!settings) {
      throw new Error(`备份中的数据项格式不正确：${STORAGE.settings}`);
    }
    normalizedData[STORAGE.settings] = settings;
  }
  if (STORAGE.dailyGoal in normalizedData && normalizedData[STORAGE.dailyGoal] !== null) {
    const dailyGoal = normalizeBackupDailyGoal(normalizedData[STORAGE.dailyGoal]);
    if (!dailyGoal) {
      throw new Error(`备份中的数据项格式不正确：${STORAGE.dailyGoal}`);
    }
    normalizedData[STORAGE.dailyGoal] = dailyGoal;
  }
  if (JSON.stringify(normalizedData).length > MAX_BACKUP_BYTES) {
    throw new Error("备份文件过大，无法安全恢复");
  }
  const invalidKey = Object.entries(normalizedData).find(
    ([key, item]) => !isValidBackupValue(key, item),
  )?.[0];
  if (invalidKey) {
    throw new Error(`备份中的数据项格式不正确：${invalidKey}`);
  }
  return { ...payload, data: normalizedData } as BackupPayload;
}

export function restoreBackupPayload(payload: BackupPayload): void {
  if (typeof window === "undefined") {
    throw new Error("只能在浏览器中恢复备份");
  }
  const validated = parseBackupPayload(payload);
  flushPendingKeyUsage();
  const previous = new Map(
    STORAGE_KEYS.map((key) => [key, window.localStorage.getItem(key)]),
  );
  try {
    for (const key of STORAGE_KEYS) {
      if (key in validated.data) {
        window.localStorage.setItem(key, JSON.stringify(validated.data[key]));
      }
    }
  } catch {
    try {
      for (const key of STORAGE_KEYS) {
        window.localStorage.removeItem(key);
      }
      for (const [key, oldValue] of previous) {
        if (oldValue !== null) window.localStorage.setItem(key, oldValue);
      }
    } catch {
      throw new Error("恢复失败，且未能完整回滚；请立即刷新页面并重新导入备份");
    }
    throw new Error("本机存储空间不足，恢复未生效");
  }
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
