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
  const errors = readLocalArray<ErrorStat>(STORAGE.errors);
  const existing = errors.find((row) => row.text === text);
  if (!existing) return errors;
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

export function buildReviewPool(
  errors: ErrorStat[],
  entries: WubiEntry[],
): WubiEntry[] {
  const preferred = new Map(
    preferShortestWubiCodes(entries).map((entry) => [entry[0], entry]),
  );
  return errors
    .map((error) => {
      const entry = preferred.get(error.text);
      if (entry) return entry;
      if (error.code) return [error.text, error.code.toLowerCase(), 0] as WubiEntry;
      return null;
    })
    .filter((entry): entry is WubiEntry => Boolean(entry))
    .sort((a, b) => {
      const aError = errors.find((row) => row.text === a[0]);
      const bError = errors.find((row) => row.text === b[0]);
      return (
        (bError?.count ?? 0) -
        (bError?.mastery ?? 0) -
        ((aError?.count ?? 0) - (aError?.mastery ?? 0))
      );
    });
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
      ? Math.min(
          365,
          Math.max(
            1,
            oldest
              ? Math.floor(
                  (new Date(localDateKey(now)).getTime() -
                    new Date(localDateKey(oldest)).getTime()) /
                    86400000,
                ) + 1
              : 1,
          ),
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
  return payload as BackupPayload;
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
