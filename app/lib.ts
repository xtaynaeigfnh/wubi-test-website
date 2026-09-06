"use client";

import {
  MAX_ARTICLE_PROGRESS_ITEMS,
  MAX_ARTICLE_PROGRESS_VALUE,
  normalizeCustomTheme,
  defaultSettings,
  normalizeDailyGoalValue,
  isBoundedSpacedReviewState,
  MAX_SPACED_REVIEW_STATE_BYTES,
  utf8ByteLength,
  isBoundedString,
  isDateString,
  isPracticeArticle,
  isHesitationPracticeQueue,
  isCustomPracticeArticle,
  isSessionResult,
  isErrorStat,
  isPhraseOpportunityStat,
  isDailyTrainingPlan,
  normalizeArticleProgress,
  isValidArticleProgressCollection,
  validateArray,
  isSettings,
  normalizeBackupSettings,
  isDailyGoal,
  normalizeBackupDailyGoal,
  isMusicPreferences,
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
  writeLocal,
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
  ArticleProgress,
  AdvancedSeasonArchive,
  BackupPayload,
  CommonCharacterData,
  CommonCharacterPreset,
  CommonPracticeArticle,
  DailyTrainingPlan,
  DailyGoal,
  DailyProgress,
  ErrorStat,
  HesitationPracticeQueue,
  HesitationPracticeTarget,
  PracticeArticle,
  PhraseOpportunityStat,
  SessionResult,
  TrendPoint,
  UserSettings,
  WeakObservation,
  WubiEntry,
} from "./types";
import { MAX_CUSTOM_ARTICLES } from "./practice-constraints.ts";
import { preferShortestWubiCodes } from "./typing-metrics.ts";
import {
  appendMaintenanceEvent,
  createLightweightStatisticsSummary,
  isMaintenanceLog,
  previewAllCleanup,
  previewCleanup,
  stripSessionLargeObjects,
  type CleanupPreview,
  type AllCleanupPreview,
  type CleanupTarget,
  type MaintenanceEventKind,
  type MaintenanceLog,
  type StorageDataSnapshot,
} from "./data-maintenance.ts";
import { pruneGhostTimelines } from "./ghost-race.ts";
import { applyWeakObservations } from "./training-plan.ts";
import { isAdvancedSeasonArchive } from "./advanced-training.ts";
import {
  isValidHesitationPracticeTarget as isHesitationPracticeTarget,
} from "./hesitation-practice.ts";
import { pruneRhythmCurves } from "./rhythm-lab.ts";
import {
  applyReviewOutcome,
  buildDueReviewQueue,
  createEmptySpacedReviewState,
  deferReviewItem,
  isSpacedReviewState,
  MAX_SPACED_REVIEW_ITEMS,
  migrateLegacyReviewState,
  upsertReviewTargets,
  type ReviewTargetInput,
  type ReviewTargetType,
  type SpacedReviewState,
} from "./spaced-review.ts";
import {
  incrementKeyUsage,
  isValidKeyUsage,
  normalizeKeyUsage,
  type KeyUsageMap,
} from "./key-usage.ts";

export {
  MAX_CUSTOM_ARTICLES,
  MAX_CUSTOM_TEXT_LENGTH,
} from "./practice-constraints.ts";
export * from "./typing-metrics.ts";
export * from "./content-loader.ts";

let localIdCounter = 0;

export function createLocalId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  localIdCounter = (localIdCounter + 1) % Number.MAX_SAFE_INTEGER;
  let random = "";
  try {
    if (
      typeof crypto !== "undefined" &&
      typeof crypto.getRandomValues === "function"
    ) {
      random = Array.from(crypto.getRandomValues(new Uint32Array(2)))
        .map((value) => value.toString(36))
        .join("");
    }
  } catch {
    // Restricted WebViews can expose crypto while rejecting random access.
  }
  if (!random) random = Math.random().toString(36).slice(2, 12);
  return `${Date.now().toString(36)}-${localIdCounter.toString(36)}-${random || "local"}`;
}

export function truncateUnicode(value: string, maximumCharacters: number): string {
  return Array.from(value).slice(0, Math.max(0, maximumCharacters)).join("");
}

export function readLocalForBackup(key: string): unknown | null {
  if (typeof window === "undefined") {
    throw new Error("只能在浏览器中导出备份");
  }
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    throw new Error("浏览器拒绝读取本机数据，备份未导出");
  }
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (key === STORAGE.keyUsage) return normalizeKeyUsage(parsed);
    if (key === STORAGE.dailyGoal) return normalizeDailyGoalValue(parsed);
    return parsed;
  } catch {
    throw new Error(`本机数据已损坏，备份未导出：${key}`);
  }
}

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

function fitSpacedReviewStateWithinLimit(
  value: SpacedReviewState,
): SpacedReviewState {
  if (!isSpacedReviewState(value)) return createEmptySpacedReviewState();
  const items = value.items.slice(0, MAX_SPACED_REVIEW_ITEMS);
  while (
    items.length &&
    utf8ByteLength(JSON.stringify({ version: 1, items })) >
      MAX_SPACED_REVIEW_STATE_BYTES
  ) {
    items.pop();
  }
  return { version: 1, items };
}

function buildSpacedReviewStateCandidate(now = new Date()): SpacedReviewState {
  const stored = readLocal<unknown>(STORAGE.reviewState, null);
  if (isBoundedSpacedReviewState(stored)) return stored;
  const hesitationValue = readLocal<unknown>(STORAGE.hesitationQueue, null);
  return fitSpacedReviewStateWithinLimit(
    migrateLegacyReviewState({
      errors: getErrors(),
      phraseOpportunities: getPhraseOpportunities(),
      hesitationQueue: isHesitationPracticeQueue(hesitationValue)
        ? hesitationValue
        : null,
      now,
    }),
  );
}

export function syncSpacedReviewState(
  now = new Date(),
): SpacedReviewState | null {
  const stored = readLocal<unknown>(STORAGE.reviewState, null);
  if (isBoundedSpacedReviewState(stored)) return stored;
  const state = buildSpacedReviewStateCandidate(now);
  if (!writeLocal(STORAGE.reviewState, state)) return null;
  recordMaintenanceEvent(
    "migration",
    `已从旧弱项数据建立 ${state.items.length} 项间隔复习记录。`,
    now,
  );
  return state;
}

export function readSpacedReviewState(): SpacedReviewState {
  return syncSpacedReviewState() ?? buildSpacedReviewStateCandidate();
}

export function deferSpacedReviewTarget(
  targetType: ReviewTargetType,
  targetId: string,
  now = new Date(),
): SpacedReviewState | null {
  const current = buildSpacedReviewStateCandidate(now);
  const next = deferReviewItem(current, targetType, targetId, now);
  if (next === current) return current;
  if (!isBoundedSpacedReviewState(next)) return null;
  const currentItem = current.items.find(
    (item) => item.targetType === targetType && item.targetId === targetId,
  );
  const currentPlan = readTrainingPlan();
  const trainingPlan = withReconciledPendingReviewTask(
    currentPlan,
    next,
    new Set(currentItem ? [currentItem.text] : []),
    now,
  );
  const writes = new Map<string, unknown>([[STORAGE.reviewState, next]]);
  if (trainingPlan !== currentPlan) {
    writes.set(STORAGE.trainingPlan, trainingPlan);
  }
  return commitLocalWrites(writes) ? next : null;
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

export function clearKeyUsage(): boolean {
  if (typeof window === "undefined") return false;
  if (keyUsageTimer !== null) window.clearTimeout(keyUsageTimer);
  keyUsageTimer = null;
  if (!writeLocal(STORAGE.keyUsage, {})) return false;
  pendingKeyUsage = null;
  return true;
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

function pruneHeatmaps(sessions: SessionResult[]): SessionResult[] {
  let retained = 0;
  return sessions.map((session) => {
    if (!session.heatmap) return session;
    retained += 1;
    if (retained <= 50) return session;
    const summary = { ...session };
    delete summary.heatmap;
    return summary;
  });
}

export function getSessions() {
  const stored = readValidatedLocalArray(STORAGE.sessions, 500, isSessionResult);
  const ids = new Set<string>();
  const unique = stored.filter((session) => {
    if (ids.has(session.id)) return false;
    ids.add(session.id);
    return true;
  });
  const pruned = pruneHeatmaps(pruneRhythmCurves(pruneGhostTimelines(unique)));
  if (JSON.stringify(pruned) !== JSON.stringify(stored)) {
    if (writeLocal(STORAGE.sessions, pruned)) {
      recordMaintenanceEvent(
        "eviction",
        "已按保留上限移除旧热力图、幽灵时间线或节奏曲线，成绩摘要保持不变。",
      );
    }
  }
  return pruned;
}

export function getCustomArticles(): PracticeArticle[] {
  const stored = readValidatedLocalArray(
    STORAGE.customTexts,
    MAX_CUSTOM_ARTICLES,
    isCustomPracticeArticle,
  );
  const ids = new Set<string>();
  const unique = stored.filter((article) => {
    if (ids.has(article.id)) return false;
    ids.add(article.id);
    return true;
  });
  if (unique.length !== stored.length) {
    writeLocal(STORAGE.customTexts, unique);
  }
  return unique;
}

export function getProgress(): ArticleProgress[] {
  const stored = readLocal<unknown>(STORAGE.progress, []);
  const normalized = normalizeArticleProgress(stored);
  if (JSON.stringify(normalized) !== JSON.stringify(stored)) {
    writeLocal(STORAGE.progress, normalized);
  }
  return normalized;
}

export function readTrainingPlan(): DailyTrainingPlan | null {
  const value = readLocal<unknown>(STORAGE.trainingPlan, null);
  if (value === null) return null;
  if (isDailyTrainingPlan(value)) return value;
  writeLocal(STORAGE.trainingPlan, null);
  return null;
}

export function writeTrainingPlan(plan: DailyTrainingPlan): boolean {
  return isDailyTrainingPlan(plan) && writeLocal(STORAGE.trainingPlan, plan);
}

export function startTrainingTask(
  taskId: string,
  now = new Date(),
): DailyTrainingPlan | null {
  const plan = readTrainingPlan();
  if (!plan) return null;
  const task = plan.tasks.find((item) => item.id === taskId);
  if (!task) return null;
  if (task.status === "pending") {
    task.status = "in-progress";
    task.startedAt = now.toISOString();
  }
  return writeTrainingPlan(plan) ? plan : null;
}

function emptyHesitationQueue(now: Date): HesitationPracticeQueue {
  return {
    version: 1,
    date: localDateKey(now),
    items: [],
  };
}

export function readHesitationQueue(
  now = new Date(),
  options: { resetOnDateMismatch?: boolean } = {},
): HesitationPracticeQueue {
  const resetOnDateMismatch = options.resetOnDateMismatch !== false;
  const empty = emptyHesitationQueue(now);
  const value = readLocal<unknown>(STORAGE.hesitationQueue, null);
  if (isHesitationPracticeQueue(value)) {
    if (value.date === empty.date || !resetOnDateMismatch) {
      return value;
    }
  } else if (!resetOnDateMismatch) {
    return empty;
  }
  writeLocal(STORAGE.hesitationQueue, empty);
  return empty;
}

export function addHesitationQueueItem(
  target: HesitationPracticeTarget,
  now = new Date(),
): {
  result: "added" | "duplicate" | "full" | "invalid" | "storage-error";
  queue: HesitationPracticeQueue;
} {
  const queue = readHesitationQueue(now);
  if (!isHesitationPracticeTarget(target)) {
    return { result: "invalid", queue };
  }
  if (queue.items.some((item) => item.target.fingerprint === target.fingerprint)) {
    return { result: "duplicate", queue };
  }
  if (queue.items.length >= 5) return { result: "full", queue };
  if (typeof window === "undefined") return { result: "storage-error", queue };

  let id = target.id;
  let suffix = 2;
  while (queue.items.some((item) => item.id === id)) {
    id = `${target.id}-${suffix}`;
    suffix += 1;
  }
  const next: HesitationPracticeQueue = {
    ...queue,
    items: [
      ...queue.items,
      {
        id,
        target,
        status: "pending",
        estimatedMinutes: 1,
        addedAt: now.toISOString(),
      },
    ],
  };
  return writeLocal(STORAGE.hesitationQueue, next)
    ? { result: "added", queue: next }
    : { result: "storage-error", queue };
}

export function startHesitationQueueItem(
  id: string,
  now = new Date(),
): HesitationPracticeQueue | null {
  const queue = readHesitationQueue(now);
  const index = queue.items.findIndex((item) => item.id === id);
  if (index < 0) return null;
  const current = queue.items[index];
  if (current.status === "in-progress") return queue;

  const item = {
    ...current,
    status: "in-progress" as const,
    startedAt: now.toISOString(),
  };
  delete item.completedAt;
  delete item.sessionId;
  delete item.outcome;
  const next = {
    ...queue,
    items: queue.items.map((candidate, itemIndex) =>
      itemIndex === index ? item : candidate,
    ),
  };
  return writeLocal(STORAGE.hesitationQueue, next) ? next : null;
}

function withCompletedTrainingTask(
  plan: DailyTrainingPlan | null,
  session: SessionResult,
): DailyTrainingPlan | null {
  if (!plan || !session.trainingTaskId) return plan;
  const task = plan.tasks.find((item) => item.id === session.trainingTaskId);
  if (!task || task.status === "completed" || task.type !== session.type) {
    return plan;
  }
  if (task.type === "article" && task.articleId !== session.articleId) {
    return plan;
  }
  task.status = "completed";
  task.startedAt ??= session.date;
  task.completedAt = session.date;
  task.sessionId = session.id;
  return plan;
}

function withReconciledPendingReviewTask(
  plan: DailyTrainingPlan | null,
  reviewState: SpacedReviewState,
  handledTexts: ReadonlySet<string>,
  now: Date,
): DailyTrainingPlan | null {
  if (!plan || !handledTexts.size) return plan;
  const taskIndex = plan.tasks.findIndex(
    (task) => task.type === "review" && task.status === "pending",
  );
  if (taskIndex < 0) return plan;
  const currentTask = plan.tasks[taskIndex];
  if (!currentTask.items.some(([text]) => handledTexts.has(text))) {
    return plan;
  }

  const dueEntries = buildDueReviewQueue(reviewState, { now }).items
    .filter((item) => item.targetType !== "hesitation" && item.code)
    .map((item): WubiEntry => [
      item.text,
      item.code as string,
      item.expectedBenefit,
    ]);
  const dueTexts = new Set(dueEntries.map(([text]) => text));
  const ordinaryEntries = currentTask.items.filter(
    ([text]) => !handledTexts.has(text) && !dueTexts.has(text),
  );
  const items = [...dueEntries, ...ordinaryEntries].slice(
    0,
    currentTask.items.length,
  );
  if (!items.length) {
    // Do not fabricate a completed task without a real practice session.
    // Clearing the plan lets TrainingCenter regenerate a valid baseline task.
    return null;
  }
  const task = {
    ...currentTask,
    items,
    reason: dueEntries.length
      ? `${dueEntries.length} 个到期字词优先，其余按错误、卡顿和回改排序。`
      : `${items.length} 个字词按错误、卡顿和回改综合排序。`,
    estimatedMinutes: Math.max(1, Math.ceil((items.length * 6) / 60)),
  };
  const tasks = plan.tasks.map((candidate, index) =>
    index === taskIndex ? task : candidate,
  );
  return {
    ...plan,
    estimatedMinutes: tasks.reduce(
      (sum, candidate) => sum + candidate.estimatedMinutes,
      0,
    ),
    tasks,
  };
}

function reviewTargetTypeForText(text: string): ReviewTargetType | null {
  const length = Array.from(text.trim()).length;
  if (length === 1) return "character";
  if (length >= 2 && length <= 4) return "phrase";
  return null;
}

function withPracticeReviewUpdates(
  current: SpacedReviewState,
  session: SessionResult,
  observations: WeakObservation[],
  phraseOpportunities: PhraseOpportunityInput[],
  phrasePractices: PhrasePracticeInput[],
): SpacedReviewState {
  const reviewedAt = new Date(session.date);
  const targets: ReviewTargetInput[] = phraseOpportunities.map((item) => ({
    targetType: "phrase",
    text: item.text,
    code: item.code,
    severity: 1,
    expectedBenefit: Math.min(100, Math.max(1, item.savedKeys)),
  }));
  const outcomes = new Map<
    string,
    { targetType: ReviewTargetType; targetId: string; outcome: "correct" | "incorrect" }
  >();
  const existingTargetKeys = new Set(
    current.items.map((item) => `${item.targetType}\u0000${item.targetId}`),
  );

  for (const observation of observations) {
    const text = observation.text.trim();
    const targetType = reviewTargetTypeForText(text);
    if (!targetType) continue;
    const key = `${targetType}\u0000${text}`;
    const outcome = observation.kind === "correct" ? "correct" : "incorrect";
    const shouldTrack =
      outcome === "incorrect" ||
      existingTargetKeys.has(key) ||
      outcomes.has(key);
    if (!shouldTrack) continue;
    targets.push({
      targetType,
      text,
      code: observation.code,
      severity:
        observation.kind === "correct"
          ? 1
          : Math.min(5, Math.max(2, observation.severity ?? 2)),
      expectedBenefit: Math.min(100, Math.max(1, observation.code?.length ?? 1)),
    });
    const previous = outcomes.get(key);
    outcomes.set(key, {
      targetType,
      targetId: text,
      outcome:
        previous?.outcome === "incorrect" || outcome === "incorrect"
          ? "incorrect"
          : "correct",
    });
  }

  for (const practice of phrasePractices) {
    const [text, code] = practice.entry;
    if (reviewTargetTypeForText(text) !== "phrase") continue;
    targets.push({
      targetType: "phrase",
      text,
      code,
      severity: practice.correct ? 1 : 3,
      expectedBenefit: Math.min(100, Math.max(1, code.length)),
    });
    outcomes.set(`phrase\u0000${text.trim()}`, {
      targetType: "phrase",
      targetId: text.trim(),
      outcome: practice.correct ? "correct" : "incorrect",
    });
  }

  const hesitation = session.hesitationPractice;
  if (hesitation) {
    const target = hesitation.target;
    const ratio = target.thresholdMs
      ? target.sourceDelayMs / target.thresholdMs
      : 1;
    targets.push({
      targetType: "hesitation",
      targetId: target.fingerprint,
      text: target.text,
      hesitationTarget: target,
      severity: Math.min(5, Math.max(1, Math.ceil(ratio))),
      expectedBenefit: Math.min(100, Math.max(1, Math.round(ratio * 10))),
    });
    outcomes.set(`hesitation\u0000${target.fingerprint}`, {
      targetType: "hesitation",
      targetId: target.fingerprint,
      outcome: hesitation.outcome === "mastered" ? "correct" : "incorrect",
    });
  }

  let next = upsertReviewTargets(current, targets, reviewedAt);
  for (const outcome of outcomes.values()) {
    next = applyReviewOutcome(next, { ...outcome, reviewedAt });
  }
  return fitSpacedReviewStateWithinLimit(next);
}

export function savePracticeOutcome(
  session: SessionResult,
  observations: WeakObservation[] = [],
  phraseOpportunities: PhraseOpportunityInput[] = [],
  phrasePractices: PhrasePracticeInput[] = [],
): boolean {
  const extraWrites = new Map<string, unknown>();
  if (phraseOpportunities.length || phrasePractices.length) {
    const withOpportunities = mergePhraseOpportunities(
      getPhraseOpportunities(),
      phraseOpportunities,
      session.date,
    );
    extraWrites.set(
      STORAGE.phraseOpportunities,
      mergePhrasePractices(
        withOpportunities,
        phrasePractices,
        session.date,
      ),
    );
  }
  return persistPracticeOutcome(
    session,
    observations,
    extraWrites,
    phraseOpportunities,
    phrasePractices,
  );
}

export function saveAdvancedPracticeOutcome(
  session: SessionResult,
  archive: AdvancedSeasonArchive,
): boolean {
  if (!isAdvancedSeasonArchive(archive)) return false;
  return persistPracticeOutcome(
    session,
    [],
    new Map([[STORAGE.advancedSeason, archive]]),
  );
}

export function saveHesitationPracticeOutcome(
  session: SessionResult,
  observations: WeakObservation[] = [],
  queueItemId?: string,
): boolean {
  if (
    session.type !== "hesitation" ||
    !session.hesitationPractice ||
    !isSessionResult(session)
  ) {
    return false;
  }
  if (getSessions().some((item) => item.id === session.id)) return true;
  if (!queueItemId) return persistPracticeOutcome(session, observations);

  // 队列条目可能已被按日重置；成绩本身仍要落库，不能因为找不到条目而整轮丢弃。
  const queue = readHesitationQueue(new Date(session.date), {
    resetOnDateMismatch: false,
  });
  const index = queue.items.findIndex((item) => item.id === queueItemId);
  if (index < 0) return persistPracticeOutcome(session, observations);
  const current = queue.items[index];
  const result = session.hesitationPractice;
  if (
    current.target.id !== result.target.id ||
    current.target.fingerprint !== result.target.fingerprint
  ) {
    return false;
  }
  const completedItem = {
    ...current,
    status: "completed" as const,
    startedAt: current.startedAt ?? session.date,
    completedAt: result.completedAt,
    sessionId: session.id,
    outcome: result.outcome,
  };
  const nextQueue = {
    ...queue,
    items: queue.items.map((item, itemIndex) =>
      itemIndex === index ? completedItem : item,
    ),
  };
  return persistPracticeOutcome(
    session,
    observations,
    new Map([[STORAGE.hesitationQueue, nextQueue]]),
  );
}

function persistPracticeOutcome(
  session: SessionResult,
  observations: WeakObservation[],
  extraWrites = new Map<string, unknown>(),
  phraseOpportunities: PhraseOpportunityInput[] = [],
  phrasePractices: PhrasePracticeInput[] = [],
): boolean {
  if (typeof window === "undefined") return false;
  const currentSessions = getSessions();
  if (currentSessions.some((item) => item.id === session.id)) {
    return extraWrites.size ? commitLocalWrites(extraWrites) : true;
  }
  const sessions = pruneHeatmaps(pruneRhythmCurves(pruneGhostTimelines(
    [session, ...currentSessions].slice(0, 500),
  )));
  const progress = getProgress();
  if (session.type === "article" && session.articleId) {
    const existing = progress.find((row) => row.articleId === session.articleId);
    if (existing) {
      existing.attempts = Math.min(
        MAX_ARTICLE_PROGRESS_VALUE,
        existing.attempts + 1,
      );
      existing.bestSpeed = Math.min(
        MAX_ARTICLE_PROGRESS_VALUE,
        Math.max(existing.bestSpeed, session.speed),
      );
      existing.completed = true;
      existing.lastPracticed = session.date;
      existing.errors = Math.min(
        MAX_ARTICLE_PROGRESS_VALUE,
        existing.errors + session.errors,
      );
    } else {
      progress.push({
        articleId: session.articleId,
        attempts: 1,
        bestSpeed: Math.min(MAX_ARTICLE_PROGRESS_VALUE, session.speed),
        completed: true,
        lastPracticed: session.date,
        errors: Math.min(MAX_ARTICLE_PROGRESS_VALUE, session.errors),
      });
      if (progress.length > MAX_ARTICLE_PROGRESS_ITEMS) {
        const oldest = progress.reduce(
          (oldestIndex, item, index) =>
            Date.parse(item.lastPracticed) <
            Date.parse(progress[oldestIndex].lastPracticed)
              ? index
              : oldestIndex,
          0,
        );
        progress.splice(oldest, 1);
      }
    }
  }
  const errors = observations.length
    ? applyWeakObservations(getErrors(), observations, new Date(session.date))
    : null;
  const currentPlan = readTrainingPlan();
  let trainingPlan = withCompletedTrainingTask(currentPlan, session);
  const writes = new Map<string, unknown>([[STORAGE.sessions, sessions]]);
  if (session.type === "article" && session.articleId) {
    writes.set(STORAGE.progress, progress);
  }
  if (errors) writes.set(STORAGE.errors, errors);
  const reviewState = withPracticeReviewUpdates(
    buildSpacedReviewStateCandidate(new Date(session.date)),
    session,
    observations,
    phraseOpportunities,
    phrasePractices,
  );
  if (!isBoundedSpacedReviewState(reviewState)) return false;
  if (!session.trainingTaskId) {
    const handledTexts = new Set(
      [
        ...observations.map((item) => item.text.trim()),
        ...phrasePractices.map((item) => item.entry[0].trim()),
      ].filter((text) => reviewTargetTypeForText(text) !== null),
    );
    trainingPlan = withReconciledPendingReviewTask(
      trainingPlan,
      reviewState,
      handledTexts,
      new Date(session.date),
    );
  }
  if (session.trainingTaskId || trainingPlan !== currentPlan) {
    writes.set(STORAGE.trainingPlan, trainingPlan);
  }
  writes.set(STORAGE.reviewState, reviewState);
  for (const [key, value] of extraWrites) writes.set(key, value);
  const persisted = commitLocalWrites(writes);
  if (persisted) {
    const byId = new Map(sessions.map((item) => [item.id, item]));
    const evictedLargeObject = currentSessions.some((item) => {
      const retained = byId.get(item.id);
      return Boolean(
        !retained ||
        (item.heatmap && !retained.heatmap) ||
        (item.ghostTimeline && !retained.ghostTimeline) ||
        (item.rhythmSummary?.curve.length && !retained.rhythmSummary?.curve.length),
      );
    });
    if (evictedLargeObject) {
      recordMaintenanceEvent(
        "eviction",
        "保存新成绩时已按上限淘汰旧大对象，成绩摘要与长期趋势保持不变。",
        new Date(session.date),
      );
    }
  }
  return persisted;
}

export function readMaintenanceLog(): MaintenanceLog {
  const value = readLocal<unknown>(STORAGE.maintenance, null);
  return isMaintenanceLog(value) ? value : { version: 1, events: [] };
}

function nextMaintenanceLog(
  kind: MaintenanceEventKind,
  summary: string,
  now = new Date(),
): MaintenanceLog {
  return appendMaintenanceEvent(readMaintenanceLog(), {
    id: createLocalId(),
    date: now.toISOString(),
    kind,
    summary: truncateUnicode(summary, 160),
  });
}

export function recordMaintenanceEvent(
  kind: MaintenanceEventKind,
  summary: string,
  now = new Date(),
): boolean {
  return writeLocal(STORAGE.maintenance, nextMaintenanceLog(kind, summary, now));
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

export function clearPracticeHistory(): boolean {
  return commitLocalWrites(
    new Map<string, unknown>([
      [STORAGE.sessions, []],
      [STORAGE.progress, []],
      [STORAGE.errors, []],
      [STORAGE.phraseOpportunities, []],
      [STORAGE.trainingPlan, null],
      [STORAGE.hesitationQueue, null],
      [STORAGE.advancedSeason, null],
      [STORAGE.reviewState, null],
      [STORAGE.maintenance, null],
    ]),
  );
}

export function saveSession(session: SessionResult): boolean {
  return savePracticeOutcome(session);
}

export function getErrors(): ErrorStat[] {
  const stored = readValidatedLocalArray(STORAGE.errors, 300, isErrorStat);
  const merged = mergeErrorStatsByText(stored).map(normalizeErrorStat);
  if (JSON.stringify(merged) !== JSON.stringify(stored)) {
    writeLocal(STORAGE.errors, merged);
  }
  return merged;
}

export function addError(text: string, code?: string) {
  writeLocal(
    STORAGE.errors,
    applyWeakObservations(getErrors(), [
      { text, code, kind: "coding-error" },
    ]),
  );
}

export function getPhraseOpportunities(): PhraseOpportunityStat[] {
  const stored = readValidatedLocalArray(
    STORAGE.phraseOpportunities,
    120,
    isPhraseOpportunityStat,
  );
  const merged = mergePhraseOpportunityStats(stored);
  if (JSON.stringify(stored) !== JSON.stringify(merged)) {
    writeLocal(STORAGE.phraseOpportunities, merged);
  }
  return merged;
}

export interface PhraseOpportunityInput {
  text: string;
  code: string;
  characterCount: number;
  savedKeys: number;
}

export interface PhrasePracticeInput {
  entry: WubiEntry;
  correct: boolean;
}

function phraseOpportunityPriority(item: PhraseOpportunityStat): number {
  const mistakes = Math.max(0, item.practiceCount - item.correctCount);
  const unresolvedOpportunities = Math.max(
    0,
    item.opportunityCount - item.correctCount,
  );
  return (
    unresolvedOpportunities * item.savedKeys +
    mistakes * 5 +
    (item.opportunityCount > 0 && item.practiceCount === 0 ? 1 : 0)
  );
}

function sortPhraseOpportunities(items: PhraseOpportunityStat[]) {
  return items.sort(
    (left, right) =>
      phraseOpportunityPriority(right) - phraseOpportunityPriority(left) ||
      right.lastSeen.localeCompare(left.lastSeen) ||
      left.text.localeCompare(right.text, "zh-Hans-CN-u-co-unihan"),
  );
}

function mergePhraseOpportunityStats(
  items: PhraseOpportunityStat[],
): PhraseOpportunityStat[] {
  const merged = new Map<string, PhraseOpportunityStat>();
  for (const item of items) {
    const previous = merged.get(item.text);
    if (!previous) {
      merged.set(item.text, { ...item });
      continue;
    }
    const practiceCount = Math.min(
      1_000_000,
      previous.practiceCount + item.practiceCount,
    );
    merged.set(item.text, {
      ...previous,
      code:
        item.code.length < previous.code.length ||
        (item.code.length === previous.code.length &&
          item.code.localeCompare(previous.code) < 0)
          ? item.code
          : previous.code,
      savedKeys: Math.max(previous.savedKeys, item.savedKeys),
      opportunityCount: Math.min(
        1_000_000,
        previous.opportunityCount + item.opportunityCount,
      ),
      practiceCount,
      correctCount: Math.min(
        practiceCount,
        previous.correctCount + item.correctCount,
      ),
      lastSeen:
        item.lastSeen > previous.lastSeen ? item.lastSeen : previous.lastSeen,
    });
  }
  return sortPhraseOpportunities(Array.from(merged.values())).slice(0, 120);
}

function mergePhraseOpportunities(
  currentItems: PhraseOpportunityStat[],
  opportunities: PhraseOpportunityInput[],
  occurredAt: string,
): PhraseOpportunityStat[] {
  const current = new Map(currentItems.map((item) => [item.text, item]));
  for (const opportunity of opportunities) {
    const characterCount = Array.from(opportunity.text).length;
    if (
      characterCount < 2 ||
      characterCount > 4 ||
      !/^\p{Script=Han}{2,4}$/u.test(opportunity.text) ||
      !/^[a-y]{1,4}$/i.test(opportunity.code) ||
      !Number.isInteger(opportunity.savedKeys) ||
      opportunity.savedKeys <= 0
    ) {
      continue;
    }
    const previous = current.get(opportunity.text);
    current.set(opportunity.text, {
      text: opportunity.text,
      code: opportunity.code.toLowerCase(),
      characterCount: characterCount as 2 | 3 | 4,
      savedKeys: Math.min(16, opportunity.savedKeys),
      opportunityCount: Math.min(
        1_000_000,
        (previous?.opportunityCount ?? 0) + 1,
      ),
      practiceCount: previous?.practiceCount ?? 0,
      correctCount: previous?.correctCount ?? 0,
      lastSeen: occurredAt,
    });
  }
  return sortPhraseOpportunities(Array.from(current.values())).slice(0, 120);
}

export function recordPhraseOpportunities(
  opportunities: PhraseOpportunityInput[],
  occurredAt = new Date().toISOString(),
): boolean {
  const next = mergePhraseOpportunities(
    getPhraseOpportunities(),
    opportunities,
    occurredAt,
  );
  return writeLocal(STORAGE.phraseOpportunities, next);
}

export function recordPhrasePractice(
  phrase: string | WubiEntry,
  correct: boolean,
  occurredAt = new Date().toISOString(),
): boolean {
  const current = getPhraseOpportunities();
  const entry =
    typeof phrase === "string"
      ? current
          .filter((item) => item.text === phrase)
          .map((item): WubiEntry => [item.text, item.code, 0])[0]
      : phrase;
  if (!entry) return false;
  return writeLocal(
    STORAGE.phraseOpportunities,
    mergePhrasePractices(current, [{ entry, correct }], occurredAt),
  );
}

function mergePhrasePractices(
  currentItems: PhraseOpportunityStat[],
  practices: PhrasePracticeInput[],
  occurredAt: string,
): PhraseOpportunityStat[] {
  const current = [...currentItems];
  for (const { entry, correct } of practices) {
    const text = entry[0];
    const index = current.findIndex((item) => item.text === text);
    if (index < 0) {
      const characterCount = Array.from(text).length;
      if (
        characterCount < 2 ||
        characterCount > 4 ||
        !/^\p{Script=Han}{2,4}$/u.test(text) ||
        !/^[a-y]{1,4}$/i.test(entry[1])
      ) {
        continue;
      }
      current.push({
        text,
        code: entry[1].toLowerCase(),
        characterCount: characterCount as 2 | 3 | 4,
        savedKeys: 1,
        opportunityCount: 0,
        practiceCount: 1,
        correctCount: correct ? 1 : 0,
        lastSeen: occurredAt,
      });
      continue;
    }
    const practiceCount = Math.min(
      1_000_000,
      current[index].practiceCount + 1,
    );
    current[index] = {
      ...current[index],
      practiceCount,
      correctCount: Math.min(
        practiceCount,
        current[index].correctCount + (correct ? 1 : 0),
      ),
      lastSeen: occurredAt,
    };
  }
  return sortPhraseOpportunities(current).slice(0, 120);
}

export function updateErrorMastery(
  text: string,
  code: string,
  correct: boolean,
): ErrorStat[] {
  const next = applyWeakObservations(getErrors(), [
    { text, code, kind: correct ? "correct" : "coding-error" },
  ]);
  writeLocal(STORAGE.errors, next);
  return next;
}

function normalizeErrorStat(error: ErrorStat): ErrorStat {
  return {
    ...error,
    codingErrors: error.codingErrors ?? error.count,
    hesitationPoints: error.hesitationPoints ?? 0,
    correctionCount: error.correctionCount ?? 0,
    seenCount: error.seenCount ?? 0,
    correctStreak: error.correctStreak ?? 0,
    mastery: error.mastery ?? 0,
  };
}

function mergeErrorStatsByText(errors: ErrorStat[]): ErrorStat[] {
  const merged = new Map<string, ErrorStat>();
  for (const error of errors) {
    const existing = merged.get(error.text);
    if (!existing) {
      merged.set(error.text, { ...error });
      continue;
    }
    const existingCodingErrors = existing.codingErrors ?? existing.count;
    existing.count += error.count;
    existing.codingErrors =
      existingCodingErrors +
      (error.codingErrors ?? error.count);
    existing.hesitationPoints =
      (existing.hesitationPoints ?? 0) + (error.hesitationPoints ?? 0);
    existing.correctionCount =
      (existing.correctionCount ?? 0) + (error.correctionCount ?? 0);
    existing.seenCount =
      (existing.seenCount ?? 0) + (error.seenCount ?? 0);
    existing.correctStreak = Math.max(
      existing.correctStreak ?? 0,
      error.correctStreak ?? 0,
    );
    existing.code = existing.code ?? error.code;
    existing.mastery = Math.max(existing.mastery ?? 0, error.mastery ?? 0);
    if (error.lastSeen > existing.lastSeen) {
      existing.lastSeen = error.lastSeen;
    }
    if (
      error.firstSeen &&
      (!existing.firstSeen || error.firstSeen < existing.firstSeen)
    ) {
      existing.firstSeen = error.firstSeen;
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

export const MAX_BACKUP_BYTES = 2 * 1024 * 1024;

function readValidatedLocalArray<T>(
  key: string,
  maximum: number,
  validator: (item: unknown) => item is T,
): T[] {
  const raw = readLocal<unknown>(key, []);
  if (!Array.isArray(raw)) {
    writeLocal(key, []);
    return [];
  }
  const validated = raw.slice(0, maximum).filter(validator);
  if (validated.length !== raw.length) writeLocal(key, validated);
  return validated;
}

function isValidBackupValue(key: string, value: unknown): boolean {
  if (value === null) return true;
  switch (key) {
    case STORAGE.settings:
      return isSettings(value);
    case STORAGE.sessions:
      return isValidSessionCollection(value);
    case STORAGE.errors:
      return validateArray(value, 300, isErrorStat);
    case STORAGE.progress:
      return isValidArticleProgressCollection(value);
    case STORAGE.customTexts:
      return (
        validateArray(value, MAX_CUSTOM_ARTICLES, isCustomPracticeArticle) &&
        new Set((value as PracticeArticle[]).map((article) => article.id)).size ===
          (value as PracticeArticle[]).length
      );
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
    case STORAGE.trainingPlan:
      return isDailyTrainingPlan(value);
    case STORAGE.hesitationQueue:
      return isHesitationPracticeQueue(value);
    case STORAGE.phraseOpportunities:
      return (
        validateArray(value, 120, isPhraseOpportunityStat) &&
        new Set((value as PhraseOpportunityStat[]).map((item) => item.text))
          .size === (value as PhraseOpportunityStat[]).length
      );
    case STORAGE.advancedSeason:
      return isAdvancedSeasonArchive(value as AdvancedSeasonArchive);
    case STORAGE.reviewState:
      return isBoundedSpacedReviewState(value);
    case STORAGE.maintenance:
      return isMaintenanceLog(value);
    default:
      return false;
  }
}

function isValidSessionCollection(value: unknown): value is SessionResult[] {
  if (!validateArray(value, 500, isSessionResult)) return false;
  const sessions = value as SessionResult[];
  if (new Set(sessions.map((session) => session.id)).size !== sessions.length) {
    return false;
  }
  return JSON.stringify(
    pruneHeatmaps(pruneRhythmCurves(pruneGhostTimelines(sessions))),
  ) === JSON.stringify(sessions);
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
  if (utf8ByteLength(JSON.stringify({ ...payload, data: normalizedData })) > MAX_BACKUP_BYTES) {
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
      } else {
        window.localStorage.removeItem(key);
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
