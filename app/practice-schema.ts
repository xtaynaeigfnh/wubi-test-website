// Pure shared rules: local reads normalize recoverable values; backups validate strictly.
import type {
  ArticleProgress,
  CustomTheme,
  DailyGoal,
  DailyTrainingPlan,
  GhostTimeline,
  HesitationPracticeQueue,
  HesitationQueueItem,
  PracticeArticle,
  ErrorStat,
  PhraseOpportunityStat,
  SessionResult,
  TypingHeatmap,
  UserSettings,
  WubiEntry,
} from "./types";
import { MAX_CUSTOM_TEXT_LENGTH, MAX_TYPING_DELAY_MS } from "./practice-constraints.ts";
import {
  ghostTimelineByteLength,
  getGhostSampleStep,
  MAX_GHOST_SAMPLES,
  MAX_GHOST_TIMELINE_BYTES,
} from "./ghost-race.ts";
import { isAdvancedAssessmentIdentity } from "./advanced-training.ts";
import { isValidHesitationPracticeTarget as isHesitationPracticeTarget } from "./hesitation-practice.ts";
import { isRhythmSummary } from "./rhythm-lab.ts";
import {
  isSpacedReviewState,
  MAX_SPACED_REVIEW_ITEMS,
  type SpacedReviewState,
} from "./spaced-review.ts";

export const MAX_ARTICLE_PROGRESS_ITEMS = 500;

export const MAX_ARTICLE_PROGRESS_VALUE = 1_000_000;

export const defaultCustomTheme: CustomTheme = {
  accent: "#B3432B",
  canvas: "#F2EBDD",
};

export function isValidHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

export function normalizeCustomTheme(value: unknown): CustomTheme {
  const customTheme =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Partial<CustomTheme>)
      : {};
  return {
    accent: isValidHexColor(customTheme.accent)
      ? customTheme.accent
      : defaultCustomTheme.accent,
    canvas: isValidHexColor(customTheme.canvas)
      ? customTheme.canvas
      : defaultCustomTheme.canvas,
  };
}

export const defaultSettings: UserSettings = {
  fontSize: 30,
  preferredLength: "all",
  showCodeHints: false,
  showGhostGap: true,
  sound: false,
  theme: "system",
  customTheme: defaultCustomTheme,
  autoNext: false,
};

export const defaultDailyGoal: DailyGoal = {
  targetChars: 500,
  targetMinutes: 15,
  targetRounds: 2,
};

export function normalizeDailyGoalValue(value: unknown): DailyGoal {
  const partial =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Partial<DailyGoal>)
      : {};
  const integerInRange = (
    candidate: unknown,
    minimum: number,
    maximum: number,
    fallback: number,
  ) =>
    typeof candidate === "number" &&
    Number.isFinite(candidate) &&
    candidate >= minimum &&
    candidate <= maximum
      ? Math.round(candidate)
      : fallback;
  return {
    targetChars: integerInRange(
      partial.targetChars,
      100,
      10000,
      defaultDailyGoal.targetChars,
    ),
    targetMinutes: integerInRange(
      partial.targetMinutes,
      5,
      180,
      defaultDailyGoal.targetMinutes,
    ),
    targetRounds: integerInRange(
      partial.targetRounds,
      1,
      20,
      defaultDailyGoal.targetRounds,
    ),
  };
}

export function isBoundedSpacedReviewState(
  value: unknown,
): value is SpacedReviewState {
  return (
    isSpacedReviewState(value) &&
    value.items.length <= MAX_SPACED_REVIEW_ITEMS &&
    utf8ByteLength(JSON.stringify(value)) <= MAX_SPACED_REVIEW_STATE_BYTES
  );
}

export function normalizeCustomText(value: string): string {
  const normalized = value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .trim();
  return Array.from(normalized).slice(0, MAX_CUSTOM_TEXT_LENGTH).join("");
}

export function buildCustomArticle(
  id: string,
  title: string,
  text: string,
  version = 1,
): PracticeArticle | null {
  const sanitizedText = text
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .trim();
  const characterCount = Array.from(sanitizedText).length;
  if (characterCount < 10 || characterCount > MAX_CUSTOM_TEXT_LENGTH) {
    return null;
  }
  const clean = sanitizedText;
  const cleanTitle = Array.from(
    normalizeCustomText(title).replace(/\s+/g, " "),
  )
    .slice(0, 80)
    .join("");
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

export const MAX_SPACED_REVIEW_STATE_BYTES = 256 * 1024;

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isBoundedString(value: unknown, maxLength: number): value is string {
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

export function isDateString(value: unknown): value is string {
  return (
    isBoundedString(value, 40) &&
    value.length > 0 &&
    Number.isFinite(Date.parse(value))
  );
}

export function isPracticeArticle(value: unknown): value is PracticeArticle {
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

function isHesitationPracticeAttempt(
  value: unknown,
  targetLength: number,
  round: 1 | 2 | 3,
): boolean {
  if (!isRecord(value)) return false;
  const errorIndexes = value.errorIndexes;
  const delaysMs = value.delaysMs;
  return (
    value.round === round &&
    isFiniteRange(value.durationMs, 0, 1_000_000_000) &&
    Array.isArray(errorIndexes) &&
    errorIndexes.length <= targetLength &&
    errorIndexes.every(
      (index) =>
        Number.isInteger(index) && isFiniteRange(index, 0, targetLength - 1),
    ) &&
    new Set(errorIndexes).size === errorIndexes.length &&
    Array.isArray(delaysMs) &&
    delaysMs.length <= targetLength &&
    delaysMs.every((delay) => isFiniteRange(delay, 0, 1_000_000_000)) &&
    isDateString(value.completedAt)
  );
}

function isHesitationPracticeResult(value: unknown): boolean {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !isHesitationPracticeTarget(value.target) ||
    !Array.isArray(value.attempts) ||
    value.attempts.length !== 3 ||
    !["mastered", "needs-review"].includes(String(value.outcome)) ||
    !isDateString(value.completedAt)
  ) {
    return false;
  }
  const targetLength = Array.from(value.target.text).length;
  return value.attempts.every((attempt, index) =>
    isHesitationPracticeAttempt(
      attempt,
      targetLength,
      (index + 1) as 1 | 2 | 3,
    ),
  );
}

function isHesitationQueueItem(value: unknown): value is HesitationQueueItem {
  if (
    !isRecord(value) ||
    !isBoundedString(value.id, 200) ||
    value.id.length === 0 ||
    !isHesitationPracticeTarget(value.target) ||
    !["pending", "in-progress", "completed"].includes(String(value.status)) ||
    value.estimatedMinutes !== 1 ||
    !isDateString(value.addedAt) ||
    (value.startedAt !== undefined && !isDateString(value.startedAt)) ||
    (value.completedAt !== undefined && !isDateString(value.completedAt)) ||
    (value.sessionId !== undefined && !isBoundedString(value.sessionId, 160)) ||
    (value.outcome !== undefined &&
      !["mastered", "needs-review"].includes(String(value.outcome)))
  ) {
    return false;
  }
  if (value.status === "pending") {
    return (
      value.startedAt === undefined &&
      value.completedAt === undefined &&
      value.sessionId === undefined &&
      value.outcome === undefined
    );
  }
  if (value.status === "in-progress") {
    return (
      value.startedAt !== undefined &&
      value.completedAt === undefined &&
      value.sessionId === undefined &&
      value.outcome === undefined
    );
  }
  return (
    value.startedAt !== undefined &&
    value.completedAt !== undefined &&
    value.sessionId !== undefined &&
    value.sessionId.length > 0 &&
    value.outcome !== undefined
  );
}

export function isHesitationPracticeQueue(
  value: unknown,
): value is HesitationPracticeQueue {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(String(value.date)) ||
    !Array.isArray(value.items) ||
    value.items.length > 5 ||
    !value.items.every(isHesitationQueueItem)
  ) {
    return false;
  }
  const ids = value.items.map((item) => item.id);
  const fingerprints = value.items.map((item) => item.target.fingerprint);
  return (
    new Set(ids).size === ids.length &&
    new Set(fingerprints).size === fingerprints.length
  );
}

export function isCustomPracticeArticle(value: unknown): value is PracticeArticle {
  if (!isPracticeArticle(value) || value.kind !== "custom") return false;
  const normalized = buildCustomArticle(
    value.id,
    value.title,
    value.text,
    value.version,
  );
  return (
    normalized !== null &&
    normalized.title === value.title &&
    normalized.length === value.length &&
    normalized.topic === value.topic &&
    normalized.wordCount === value.wordCount &&
    normalized.text === value.text
  );
}

export function isSessionResult(value: unknown): value is SessionResult {
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
    "correctHanChars",
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
    ["article", "challenge", "review", "roots", "hesitation", "rhythm", "scenario"].includes(
      String(value.type),
    ) &&
    (value.articleId === undefined || isBoundedString(value.articleId, 160)) &&
    (value.trainingTaskId === undefined ||
      isBoundedString(value.trainingTaskId, 200)) &&
    (value.scenarioId === undefined || isBoundedString(value.scenarioId, 160)) &&
    (value.seasonId === undefined || isBoundedString(value.seasonId, 160)) &&
    (value.seasonDay === undefined ||
      (Number.isInteger(value.seasonDay) && isFiniteRange(value.seasonDay, 1, 14))) &&
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
        value.errorChars.every((item) => isBoundedString(item, 8)))) &&
    (value.heatmap === undefined || isTypingHeatmap(value.heatmap)) &&
    (value.rhythmSummary === undefined || isRhythmSummary(value.rhythmSummary)) &&
    (value.assessmentIdentity === undefined ||
      isAdvancedAssessmentIdentity(value.assessmentIdentity)) &&
    (value.ghostTimeline === undefined ||
      (value.type === "article" &&
        isGhostTimelineForSession(value.ghostTimeline, value.durationSeconds))) &&
    (value.hesitationPractice === undefined ||
      isHesitationPracticeResult(value.hesitationPractice)) &&
    (value.type === "hesitation"
      ? value.hesitationPractice !== undefined
      : value.hesitationPractice === undefined) &&
    (value.type === "scenario" ? value.scenarioId !== undefined : value.scenarioId === undefined) &&
    (value.assessmentIdentity === undefined || value.seasonId !== undefined) &&
    ((value.seasonId === undefined && value.seasonDay === undefined) ||
      (value.seasonId !== undefined && value.seasonDay !== undefined))
  );
}

function isGhostTimeline(value: unknown): value is GhostTimeline {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !isBoundedString(value.articleKey, 240) ||
    value.articleKey.length === 0 ||
    !/^(?:builtin|custom):.{1,160}$/.test(value.articleKey) ||
    !Number.isInteger(value.articleVersion) ||
    !isFiniteRange(value.articleVersion, 1, 1_000_000) ||
    !isBoundedString(value.contentFingerprint, 100) ||
    !/^\d{1,4}-[0-9a-z]+$/.test(value.contentFingerprint) ||
    !Number.isInteger(value.characterCount) ||
    !isFiniteRange(value.characterCount, 1, 5000) ||
    !Number.isInteger(value.step) ||
    !isFiniteRange(value.step, 1, 5000) ||
    value.step !== getGhostSampleStep(Number(value.characterCount)) ||
    !Array.isArray(value.samples) ||
    value.samples.length === 0 ||
    value.samples.length > MAX_GHOST_SAMPLES
  ) {
    return false;
  }
  let previousCharacters = 0;
  let previousElapsedMs = 0;
  for (const sample of value.samples) {
    if (
      !Array.isArray(sample) ||
      sample.length !== 2 ||
      !Number.isInteger(sample[0]) ||
      !isFiniteRange(sample[0], 1, value.characterCount) ||
      !Number.isInteger(sample[1]) ||
      !isFiniteRange(sample[1], 0, 86_400_000) ||
      sample[0] <= previousCharacters ||
      sample[1] < previousElapsedMs
    ) {
      return false;
    }
    previousCharacters = sample[0];
    previousElapsedMs = sample[1];
  }
  const last = value.samples.at(-1);
  return (
    last?.[0] === value.characterCount &&
    ghostTimelineByteLength(value as unknown as GhostTimeline) <=
      MAX_GHOST_TIMELINE_BYTES
  );
}

function isGhostTimelineForSession(
  value: unknown,
  durationSeconds: unknown,
): value is GhostTimeline {
  if (!isGhostTimeline(value) || typeof durationSeconds !== "number") {
    return false;
  }
  const finalElapsedMs = value.samples.at(-1)?.[1] ?? 0;
  return Math.abs(finalElapsedMs - durationSeconds * 1000) <= 1000;
}

function isTypingHeatmap(value: unknown): value is TypingHeatmap {
  if (!isRecord(value)) return false;
  if (
    value.version !== 1 ||
    !isBoundedString(value.text, 5000) ||
    value.text.length === 0 ||
    !isFiniteRange(value.baselineMs, 0, MAX_TYPING_DELAY_MS) ||
    !isFiniteRange(value.thresholdMs, 1000, MAX_TYPING_DELAY_MS) ||
    !Array.isArray(value.segments) ||
    value.segments.length > 32
  ) {
    return false;
  }
  const targetLength = Array.from(value.text.replace(/[\r\n]/g, "")).length;
  return value.segments.every(
    (segment) =>
      isRecord(segment) &&
      Number.isInteger(segment.start) &&
      isFiniteRange(segment.start, 0, Math.max(0, targetLength - 1)) &&
      Number.isInteger(segment.length) &&
      isFiniteRange(segment.length, 1, Math.max(1, targetLength)) &&
      segment.start + segment.length <= targetLength &&
      isFiniteRange(segment.delayMs, 0, MAX_TYPING_DELAY_MS),
  );
}

export function isErrorStat(value: unknown): value is ErrorStat {
  const optionalIntegerFields = [
    "codingErrors",
    "hesitationPoints",
    "correctionCount",
    "seenCount",
    "correctStreak",
  ];
  return (
    isRecord(value) &&
    isBoundedString(value.text, 20) &&
    value.text.length > 0 &&
    (value.code === undefined ||
      (isBoundedString(value.code, 4) && /^[a-y]{1,4}$/i.test(value.code))) &&
    isFiniteRange(value.count, 0, 1_000_000) &&
    Number.isInteger(value.count) &&
    isDateString(value.lastSeen) &&
    (value.firstSeen === undefined || isDateString(value.firstSeen)) &&
    (value.mastery === undefined ||
      (isFiniteRange(value.mastery, 0, 5) && Number.isInteger(value.mastery))) &&
    (value.lastCorrect === undefined || isDateString(value.lastCorrect)) &&
    optionalIntegerFields.every(
      (field) =>
        value[field] === undefined ||
        (isFiniteRange(value[field], 0, 1_000_000) &&
          Number.isInteger(value[field])),
    )
  );
}

export function isPhraseOpportunityStat(
  value: unknown,
): value is PhraseOpportunityStat {
  if (!isRecord(value)) return false;
  const characterCount = Array.from(String(value.text ?? "")).length;
  return (
    isBoundedString(value.text, 16) &&
    characterCount >= 2 &&
    characterCount <= 4 &&
    isBoundedString(value.code, 4) &&
    /^[a-y]{1,4}$/i.test(value.code) &&
    value.characterCount === characterCount &&
    isFiniteRange(value.savedKeys, 1, 16) &&
    Number.isInteger(value.savedKeys) &&
    isFiniteRange(value.opportunityCount, 0, 1_000_000) &&
    Number.isInteger(value.opportunityCount) &&
    isFiniteRange(value.practiceCount, 0, 1_000_000) &&
    Number.isInteger(value.practiceCount) &&
    isFiniteRange(value.correctCount, 0, value.practiceCount) &&
    Number.isInteger(value.correctCount) &&
    isDateString(value.lastSeen)
  );
}

function isWubiEntry(value: unknown): value is WubiEntry {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    isBoundedString(value[0], 20) &&
    value[0].length > 0 &&
    isBoundedString(value[1], 4) &&
    /^[a-y]{1,4}$/i.test(value[1]) &&
    isFiniteRange(value[2], 0, 10_000_000_000)
  );
}

function isTrainingTask(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (!(
    isBoundedString(value.id, 200) &&
    value.id.length > 0 &&
    ["article", "review", "roots"].includes(String(value.type)) &&
    ["pending", "in-progress", "completed"].includes(String(value.status)) &&
    isBoundedString(value.title, 80) &&
    value.title.length > 0 &&
    isBoundedString(value.reason, 300) &&
    isFiniteRange(value.estimatedMinutes, 1, 180) &&
    Number.isInteger(value.estimatedMinutes) &&
    Array.isArray(value.items) &&
    value.items.length <= 20 &&
    value.items.every(isWubiEntry) &&
    (value.articleId === undefined || isBoundedString(value.articleId, 160)) &&
    (value.articleTitle === undefined || isBoundedString(value.articleTitle, 80)) &&
    (value.articleWordCount === undefined ||
      (isFiniteRange(value.articleWordCount, 0, 5000) &&
        Number.isInteger(value.articleWordCount))) &&
    (value.zoneId === undefined || isBoundedString(value.zoneId, 20)) &&
    (value.zoneKeys === undefined ||
      (isBoundedString(value.zoneKeys, 5) && /^[a-y]{1,5}$/i.test(value.zoneKeys))) &&
    (value.startedAt === undefined || isDateString(value.startedAt)) &&
    (value.completedAt === undefined || isDateString(value.completedAt)) &&
    (value.sessionId === undefined || isBoundedString(value.sessionId, 160))
  )) {
    return false;
  }

  const status = String(value.status);
  const hasStartedAt = value.startedAt !== undefined;
  const hasCompletedAt = value.completedAt !== undefined;
  const hasSessionId =
    isBoundedString(value.sessionId, 160) && value.sessionId.length > 0;
  if (
    (status === "pending" && (hasStartedAt || hasCompletedAt || hasSessionId)) ||
    (status === "in-progress" &&
      (!hasStartedAt || hasCompletedAt || hasSessionId)) ||
    (status === "completed" && (!hasStartedAt || !hasCompletedAt || !hasSessionId))
  ) {
    return false;
  }
  if (
    status === "completed" &&
    new Date(String(value.completedAt)).getTime() <
      new Date(String(value.startedAt)).getTime()
  ) {
    return false;
  }

  const type = String(value.type);
  const hasArticleId =
    isBoundedString(value.articleId, 160) && value.articleId.length > 0;
  const hasArticleTitle =
    isBoundedString(value.articleTitle, 80) && value.articleTitle.length > 0;
  const hasArticleWordCount =
    isFiniteRange(value.articleWordCount, 1, 5000) &&
    Number.isInteger(value.articleWordCount);
  const rootZones: Record<string, string> = {
    pie: "QWERT",
    dian: "YUIOP",
    heng: "ASDFG",
    shu: "HJKLM",
    zhe: "XCVBN",
  };
  const zoneId = typeof value.zoneId === "string" ? value.zoneId : "";
  const hasRootZone =
    rootZones[zoneId] !== undefined &&
    typeof value.zoneKeys === "string" &&
    value.zoneKeys.toUpperCase() === rootZones[zoneId];
  const hasArticleFields =
    value.articleId !== undefined ||
    value.articleTitle !== undefined ||
    value.articleWordCount !== undefined;
  const hasRootFields = value.zoneId !== undefined || value.zoneKeys !== undefined;

  if (type === "article") {
    return (
      value.items.length === 0 &&
      hasArticleId &&
      hasArticleTitle &&
      hasArticleWordCount &&
      !hasRootFields
    );
  }
  if (type === "review") {
    return value.items.length > 0 && !hasArticleFields && !hasRootFields;
  }
  return value.items.length > 0 && !hasArticleFields && hasRootZone;
}

export function isDailyTrainingPlan(value: unknown): value is DailyTrainingPlan {
  if (!isRecord(value)) return false;
  if (
    value.version !== 1 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(String(value.date)) ||
    !isFiniteRange(value.revision, 0, 10_000) ||
    !Number.isInteger(value.revision) ||
    !isDateString(value.generatedAt) ||
    !isFiniteRange(value.estimatedMinutes, 3, 540) ||
    !Number.isInteger(value.estimatedMinutes) ||
    !Array.isArray(value.tasks) ||
    value.tasks.length !== 3 ||
    !value.tasks.every(isTrainingTask) ||
    !isRecord(value.weakSnapshot)
  ) {
    return false;
  }
  const types = value.tasks.map((task) => task.type);
  return (
    new Set(types).size === 3 &&
    ["article", "review", "roots"].every((type) => types.includes(type)) &&
    Object.keys(value.weakSnapshot).length <= 50 &&
    Object.entries(value.weakSnapshot).every(
      ([text, score]) =>
        Array.from(text).length <= 20 &&
        text.length > 0 &&
        isFiniteRange(score, 0, 1000) &&
        Number.isInteger(score),
    )
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

export function normalizeArticleProgress(value: unknown): ArticleProgress[] {
  if (!Array.isArray(value)) return [];
  const merged = new Map<string, ArticleProgress>();
  for (const item of value) {
    if (!isArticleProgress(item)) continue;
    const existing = merged.get(item.articleId);
    if (!existing) {
      merged.set(item.articleId, { ...item });
      continue;
    }
    existing.attempts = Math.min(
      MAX_ARTICLE_PROGRESS_VALUE,
      existing.attempts + item.attempts,
    );
    existing.bestSpeed = Math.max(existing.bestSpeed, item.bestSpeed);
    existing.errors = Math.min(
      MAX_ARTICLE_PROGRESS_VALUE,
      existing.errors + item.errors,
    );
    existing.completed ||= item.completed;
    if (Date.parse(item.lastPracticed) > Date.parse(existing.lastPracticed)) {
      existing.lastPracticed = item.lastPracticed;
    }
  }
  return Array.from(merged.values()).slice(0, MAX_ARTICLE_PROGRESS_ITEMS);
}

export function isValidArticleProgressCollection(
  value: unknown,
): value is ArticleProgress[] {
  return (
    validateArray(value, MAX_ARTICLE_PROGRESS_ITEMS, isArticleProgress) &&
    new Set((value as ArticleProgress[]).map((item) => item.articleId)).size ===
      (value as ArticleProgress[]).length
  );
}

export function validateArray(
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

export function isSettings(value: unknown): value is UserSettings {
  return (
    isRecord(value) &&
    isFiniteRange(value.fontSize, 22, 42) &&
    ["all", "short", "medium", "long", "water"].includes(
      String(value.preferredLength),
    ) &&
    typeof value.showCodeHints === "boolean" &&
    typeof value.showGhostGap === "boolean" &&
    typeof value.sound === "boolean" &&
    ["light", "dark", "system", "bamboo", "qingdai", "custom"].includes(
      String(value.theme),
    ) &&
    (!Object.hasOwn(value, "customTheme") ||
      (isRecord(value.customTheme) &&
        isValidHexColor(value.customTheme.accent) &&
        isValidHexColor(value.customTheme.canvas))) &&
    typeof value.autoNext === "boolean"
  );
}

export function normalizeBackupSettings(value: unknown): UserSettings | null {
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
    (keys.has("showGhostGap") && typeof value.showGhostGap !== "boolean") ||
    (keys.has("sound") && typeof value.sound !== "boolean") ||
    (keys.has("autoNext") && typeof value.autoNext !== "boolean")
  ) {
    return null;
  }
  const theme = [
    "light",
    "dark",
    "system",
    "bamboo",
    "qingdai",
    "custom",
  ].includes(String(value.theme))
    ? (value.theme as UserSettings["theme"])
    : defaultSettings.theme;
  return {
    ...defaultSettings,
    ...value,
    theme,
    customTheme: normalizeCustomTheme(value.customTheme),
  } as UserSettings;
}

export function isDailyGoal(value: unknown): value is DailyGoal {
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

export function normalizeBackupDailyGoal(value: unknown): DailyGoal | null {
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

export function isMusicPreferences(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.trackId === null || isBoundedString(value.trackId, 160)) &&
    isFiniteRange(value.volume, 0, 1) &&
    typeof value.muted === "boolean"
  );
}
