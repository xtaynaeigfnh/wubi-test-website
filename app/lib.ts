"use client";

import {
  normalizeCustomTheme,
  defaultSettings,
  normalizeDailyGoalValue,
} from "./practice-schema.ts";

export {
  defaultCustomTheme,
  isValidHexColor,
  normalizeCustomTheme,
  defaultSettings,
  defaultDailyGoal,
  normalizeCustomText,
  buildCustomArticle,
  MAX_SPACED_REVIEW_STATE_BYTES,
  utf8ByteLength,
} from "./practice-schema.ts";

import {
  STORAGE,
  STORAGE_KEYS,
  readLocal,
  commitLocalWrites,
} from "./storage.ts";

export {
  STORAGE,
  STORAGE_KEYS,
  readLocal,
  readLocalArray,
  writeLocal,
  writeSessionValue,
  takeSessionValue,
} from "./storage.ts";

import type {
  ArticleLength,
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
import { MAX_CUSTOM_ARTICLES } from "./practice-constraints.ts";
import { preferShortestWubiCodes } from "./typing-metrics.ts";
import {
  createLightweightStatisticsSummary,
  previewAllCleanup,
  previewCleanup,
  stripSessionLargeObjects,
  type CleanupPreview,
  type AllCleanupPreview,
  type CleanupTarget,
  type StorageDataSnapshot,
} from "./data-maintenance.ts";
import { createEmptySpacedReviewState } from "./spaced-review.ts";
import {
  getErrors,
  getPhraseOpportunities,
  getSessions,
  localDateKey,
  nextMaintenanceLog,
  readSpacedReviewState,
} from "./practice-store.ts";
import { readLocalForBackup } from "./backup.ts";

export {
  MAX_CUSTOM_ARTICLES,
  MAX_CUSTOM_TEXT_LENGTH,
} from "./practice-constraints.ts";
export * from "./typing-metrics.ts";
export * from "./content-loader.ts";
export * from "./practice-store.ts";
export * from "./backup.ts";



export function addCustomArticlesWithinLimit(
  existing: PracticeArticle[],
  incoming: PracticeArticle[],
): {
  articles: PracticeArticle[];
  added: PracticeArticle[];
  rejected: PracticeArticle[];
} {
  const available = Math.max(0, MAX_CUSTOM_ARTICLES - existing.length);
  const knownIds = new Set(existing.map((article) => article.id));
  const added: PracticeArticle[] = [];
  const rejected: PracticeArticle[] = [];
  for (const article of incoming) {
    if (knownIds.has(article.id) || added.length >= available) {
      rejected.push(article);
      continue;
    }
    knownIds.add(article.id);
    added.push(article);
  }
  return {
    articles: [...added, ...existing],
    added,
    rejected,
  };
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
    showGhostGap:
      typeof partial.showGhostGap === "boolean"
        ? partial.showGhostGap
        : defaultSettings.showGhostGap,
    sound:
      typeof partial.sound === "boolean"
        ? partial.sound
        : defaultSettings.sound,
    theme:
      partial.theme &&
      ["light", "dark", "system", "bamboo", "qingdai", "custom"].includes(
        partial.theme,
      )
        ? partial.theme
        : defaultSettings.theme,
    customTheme: normalizeCustomTheme(partial.customTheme),
    autoNext:
      typeof partial.autoNext === "boolean"
        ? partial.autoNext
        : defaultSettings.autoNext,
  };
}

export function readDailyGoal(): DailyGoal {
  return normalizeDailyGoalValue(readLocal<unknown>(STORAGE.dailyGoal, {}));
}

export function selectInitialArticle(
  availableArticles: PracticeArticle[],
  builtInArticles: PracticeArticle[],
  currentId: string | null,
  preferredLength: ArticleLength | "all",
  prioritizeCurrent = false,
): PracticeArticle | null {
  const matchesPreference = (article: PracticeArticle) =>
    preferredLength === "all" || article.length === preferredLength;
  const current = availableArticles.find(
    (article) =>
      article.id === currentId &&
      (prioritizeCurrent || matchesPreference(article)),
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
    const sample = random();
    const boundedSample = Number.isFinite(sample)
      ? Math.min(1 - Number.EPSILON, Math.max(0, sample))
      : 0;
    const swapIndex = Math.floor(boundedSample * (index + 1));
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


function maintenanceSnapshot(): StorageDataSnapshot {
  const sessions = getSessions();
  return {
    sessions,
    phraseOpportunities: getPhraseOpportunities(),
    reviewState: readSpacedReviewState(),
    allValues: STORAGE_KEYS.map((key) => readLocalForBackup(key)),
  };
}

export function inspectCleanup(target: CleanupTarget): CleanupPreview {
  return previewCleanup(target, maintenanceSnapshot());
}

export function inspectAllCleanup(): AllCleanupPreview {
  return previewAllCleanup(maintenanceSnapshot());
}

export function clearAllMaintenanceData(now = new Date()): boolean {
  const snapshot = maintenanceSnapshot();
  const preview = previewAllCleanup(snapshot);
  let sessions = stripSessionLargeObjects(snapshot.sessions, "heatmaps");
  sessions = stripSessionLargeObjects(sessions, "ghosts");
  sessions = stripSessionLargeObjects(sessions, "rhythm");
  return commitLocalWrites(
    new Map<string, unknown>([
      [STORAGE.sessions, sessions],
      [STORAGE.phraseOpportunities, []],
      [STORAGE.reviewState, createEmptySpacedReviewState()],
      [STORAGE.trainingPlan, null],
      [
        STORAGE.maintenance,
        nextMaintenanceLog(
          "cleanup",
          `已全部清理 ${preview.count} 项附加数据，约释放 ${preview.bytes} 字节。`,
          now,
        ),
      ],
    ]),
  );
}

export function clearMaintenanceTarget(
  target: CleanupTarget,
  now = new Date(),
): boolean {
  const snapshot = maintenanceSnapshot();
  const preview = previewCleanup(target, snapshot);
  const writes = new Map<string, unknown>();
  if (target === "phrases") {
    writes.set(STORAGE.phraseOpportunities, []);
  } else if (target === "reviews") {
    writes.set(STORAGE.reviewState, createEmptySpacedReviewState());
    writes.set(STORAGE.trainingPlan, null);
  } else {
    writes.set(STORAGE.sessions, stripSessionLargeObjects(snapshot.sessions, target));
  }
  writes.set(
    STORAGE.maintenance,
    nextMaintenanceLog(
      "cleanup",
      `已清理 ${preview.count} 项${preview.label}，约释放 ${preview.bytes} 字节。`,
      now,
    ),
  );
  return commitLocalWrites(writes);
}

export function buildLightweightStatisticsSummary(now = new Date()) {
  return createLightweightStatisticsSummary(
    getSessions(),
    getErrors(),
    getPhraseOpportunities(),
    readSpacedReviewState(),
    now,
  );
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
  const rawDayCount =
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
  const maximumContinuousDays = 3660;
  const safeDayCount =
    Number.isFinite(rawDayCount) && rawDayCount > 0
      ? rawDayCount
      : maximumContinuousDays + 1;
  const useActiveDays = range === "all" && safeDayCount > maximumContinuousDays;
  const dayCount = Math.min(safeDayCount, maximumContinuousDays);
  const dateKeys = useActiveDays
    ? Array.from(
        new Set(articleSessions.map((session) => localDateKey(session.date))),
      ).sort()
    : Array.from({ length: dayCount }, (_, offset) => {
        const date = new Date(now);
        date.setHours(12, 0, 0, 0);
        date.setDate(date.getDate() - (dayCount - offset - 1));
        return localDateKey(date);
      });
  const sessionsByDate = new Map<string, SessionResult[]>();
  for (const session of articleSessions) {
    const key = localDateKey(session.date);
    const rows = sessionsByDate.get(key) ?? [];
    rows.push(session);
    sessionsByDate.set(key, rows);
  }
  return dateKeys.map((key) => {
    const date = new Date(`${key}T12:00:00`);
    const rows = sessionsByDate.get(key) ?? [];
    const weightedChars = rows.reduce(
      (sum, session) => sum + session.correctChars,
      0,
    );
    const weightedMinutes = rows.reduce(
      (sum, session) => sum + session.durationSeconds / 60,
      0,
    );
    const attemptedChars = rows.reduce(
      (sum, session) => sum + session.attemptedChars,
      0,
    );
    return {
      date: key,
      label: `${date.getMonth() + 1}/${date.getDate()}`,
      sessions: rows.length,
      chars: weightedChars,
      minutes: weightedMinutes,
      speed: weightedMinutes > 0 ? Math.round(weightedChars / weightedMinutes) : 0,
      accuracy: attemptedChars > 0
        ? rows.reduce(
            (sum, session) => sum + session.accuracy * session.attemptedChars,
            0,
          ) / attemptedChars
        : 0,
    };
  });
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
