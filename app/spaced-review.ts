import type {
  ErrorStat,
  HesitationPracticeQueue,
  HesitationPracticeTarget,
  PhraseOpportunityStat,
} from "./types";
import { isValidHesitationPracticeTarget } from "./hesitation-practice.ts";

export const SPACED_REVIEW_STATE_VERSION = 1 as const;
export const MAX_SPACED_REVIEW_ITEMS = 360;
export const DEFAULT_DAILY_REVIEW_LIMIT = 12;

const DAY_MS = 86_400_000;
const LEVEL_INTERVAL_DAYS = [1, 2, 4, 7, 14, 30, 60, 120, 180, 365] as const;

export type ReviewTargetType = "character" | "phrase" | "hesitation";
export type ReviewOutcome = "correct" | "incorrect";

export interface SpacedReviewItem {
  targetType: ReviewTargetType;
  targetId: string;
  text: string;
  code?: string;
  hesitationTarget?: HesitationPracticeTarget;
  dueAt: string;
  intervalDays: number;
  level: number;
  lastOutcome: ReviewOutcome | null;
  lastReviewedAt?: string;
  severity: number;
  expectedBenefit: number;
  correctStreak: number;
  deferredAt?: string;
  createdAt: string;
}

export interface SpacedReviewState {
  version: typeof SPACED_REVIEW_STATE_VERSION;
  items: SpacedReviewItem[];
}

export interface ReviewTargetInput {
  targetType: ReviewTargetType;
  targetId?: string;
  text: string;
  code?: string;
  hesitationTarget?: HesitationPracticeTarget;
  severity?: number;
  expectedBenefit?: number;
}

export interface ReviewOutcomeInput {
  targetType: ReviewTargetType;
  targetId: string;
  outcome: ReviewOutcome;
  reviewedAt?: Date;
}

export interface DueReviewQueue {
  items: SpacedReviewItem[];
  totalDue: number;
  deferredToday: number;
  limit: number;
}

export interface LegacyReviewMigrationInput {
  state?: SpacedReviewState | null;
  errors?: readonly ErrorStat[];
  phraseOpportunities?: readonly PhraseOpportunityStat[];
  hesitationQueue?: HesitationPracticeQueue | null;
  now?: Date;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function validDate(value: string | undefined): value is string {
  return typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value));
}

function safeDate(value: Date | undefined, fallback = new Date(0)) {
  return value && Number.isFinite(value.getTime()) ? new Date(value) : new Date(fallback);
}

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localDayIndex(date: Date) {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS);
}

function addLocalDays(date: Date, days: number) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() + Math.max(0, Math.trunc(days)));
  return next;
}

function laterDate(...values: Array<string | undefined>) {
  const valid = values.filter(validDate);
  return valid.sort((left, right) => Date.parse(right) - Date.parse(left))[0];
}

function targetKey(targetType: ReviewTargetType, targetId: string) {
  return `${targetType}\u0000${targetId}`;
}

function canonicalTargetId(input: ReviewTargetInput) {
  if (input.targetType === "hesitation") {
    return input.hesitationTarget?.fingerprint.trim() || input.targetId?.trim() || "";
  }
  return input.text.trim();
}

function normalizeTarget(input: ReviewTargetInput, now: Date): SpacedReviewItem | null {
  const text = input.text.trim();
  const textLength = Array.from(text).length;
  const targetId = canonicalTargetId(input);
  if (!text || !targetId || targetId.length > 500) return null;
  if (input.targetType === "character" && textLength !== 1) return null;
  if (input.targetType === "phrase" && (textLength < 2 || textLength > 4)) return null;
  if (
    input.targetType === "hesitation" &&
    !isValidHesitationPracticeTarget(input.hesitationTarget)
  ) return null;
  const code = input.code?.trim().toLowerCase();
  if (code && !/^[a-y]{1,4}$/.test(code)) return null;
  if (input.targetType !== "hesitation" && !code) return null;
  if (input.targetType === "hesitation" && code) return null;
  return {
    targetType: input.targetType,
    targetId,
    text,
    ...(code ? { code } : {}),
    ...(input.targetType === "hesitation" ? { hesitationTarget: input.hesitationTarget } : {}),
    dueAt: now.toISOString(),
    intervalDays: 1,
    level: 0,
    lastOutcome: null,
    severity: clamp(Math.round(input.severity ?? 1), 1, 5),
    expectedBenefit: clamp(Math.round(input.expectedBenefit ?? 1), 0, 100),
    correctStreak: 0,
    createdAt: now.toISOString(),
  };
}

function comparePriority(left: SpacedReviewItem, right: SpacedReviewItem, now: Date) {
  const leftOverdue = Math.max(0, localDayIndex(now) - localDayIndex(new Date(left.dueAt)));
  const rightOverdue = Math.max(0, localDayIndex(now) - localDayIndex(new Date(right.dueAt)));
  const leftScore = leftOverdue * 100 + left.severity * 10 + left.expectedBenefit;
  const rightScore = rightOverdue * 100 + right.severity * 10 + right.expectedBenefit;
  return (
    rightScore - leftScore ||
    Date.parse(left.dueAt) - Date.parse(right.dueAt) ||
    left.targetType.localeCompare(right.targetType) ||
    left.targetId.localeCompare(right.targetId, "zh-Hans-CN-u-co-unihan")
  );
}

function capItems(items: SpacedReviewItem[], now: Date) {
  if (items.length <= MAX_SPACED_REVIEW_ITEMS) return items;
  return [...items].sort((left, right) => comparePriority(left, right, now)).slice(0, MAX_SPACED_REVIEW_ITEMS);
}

export function createEmptySpacedReviewState(): SpacedReviewState {
  return { version: SPACED_REVIEW_STATE_VERSION, items: [] };
}

export function isSpacedReviewState(value: unknown): value is SpacedReviewState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<SpacedReviewState>;
  if (state.version !== 1 || !Array.isArray(state.items) || state.items.length > MAX_SPACED_REVIEW_ITEMS) return false;
  const identities = new Set<string>();
  for (const item of state.items as SpacedReviewItem[]) {
    if (!item || typeof item !== "object") return false;
    const textLength = Array.from(item.text ?? "").length;
    const validIdentity =
      ["character", "phrase", "hesitation"].includes(item.targetType) &&
      typeof item.targetId === "string" && item.targetId.length > 0 && item.targetId.length <= 500 &&
      typeof item.text === "string" && textLength > 0 && textLength <= 15 &&
      (item.targetType !== "character" || textLength === 1) &&
      (item.targetType !== "phrase" || (textLength >= 2 && textLength <= 4)) &&
      (item.targetType !== "hesitation" || isValidHesitationPracticeTarget(item.hesitationTarget)) &&
      (item.targetType === "hesitation" || item.hesitationTarget === undefined) &&
      (item.targetType === "hesitation"
        ? item.targetId === item.hesitationTarget?.fingerprint
        : item.targetId === item.text.trim()) &&
      (item.targetType === "hesitation"
        ? item.code === undefined
        : typeof item.code === "string" && /^[a-y]{1,4}$/.test(item.code));
    if (!validIdentity || !validDate(item.dueAt) || !validDate(item.createdAt)) return false;
    if (item.lastReviewedAt !== undefined && !validDate(item.lastReviewedAt)) return false;
    if (item.deferredAt !== undefined && !validDate(item.deferredAt)) return false;
    if (!Number.isInteger(item.intervalDays) || item.intervalDays < 1 || item.intervalDays > 365) return false;
    if (!Number.isInteger(item.level) || item.level < 0 || item.level >= LEVEL_INTERVAL_DAYS.length) return false;
    if (item.lastOutcome !== null && !["correct", "incorrect"].includes(item.lastOutcome)) return false;
    if (!Number.isInteger(item.severity) || item.severity < 1 || item.severity > 5) return false;
    if (!Number.isInteger(item.expectedBenefit) || item.expectedBenefit < 0 || item.expectedBenefit > 100) return false;
    if (!Number.isInteger(item.correctStreak) || item.correctStreak < 0 || item.correctStreak > 1_000_000) return false;
    const identity = targetKey(item.targetType, item.targetId);
    if (identities.has(identity)) return false;
    identities.add(identity);
  }
  return true;
}

export function upsertReviewTargets(
  state: SpacedReviewState,
  targets: readonly ReviewTargetInput[],
  now = new Date(),
): SpacedReviewState {
  const safeNow = safeDate(now);
  const current = new Map(state.items.map((item) => [targetKey(item.targetType, item.targetId), item]));
  for (const target of targets) {
    const normalized = normalizeTarget(target, safeNow);
    if (!normalized) continue;
    const key = targetKey(normalized.targetType, normalized.targetId);
    const previous = current.get(key);
    current.set(key, previous ? {
      ...previous,
      text: normalized.text,
      ...(normalized.code ? { code: normalized.code } : {}),
      ...(normalized.hesitationTarget ? { hesitationTarget: normalized.hesitationTarget } : {}),
      severity: Math.max(previous.severity, normalized.severity),
      expectedBenefit: Math.max(previous.expectedBenefit, normalized.expectedBenefit),
    } : normalized);
  }
  return { version: 1, items: capItems(Array.from(current.values()), safeNow) };
}

export function buildDueReviewQueue(
  state: SpacedReviewState,
  options: { now?: Date; limit?: number } = {},
): DueReviewQueue {
  const now = options.now === undefined
    ? new Date()
    : safeDate(options.now);
  const limit = clamp(Math.trunc(options.limit ?? DEFAULT_DAILY_REVIEW_LIMIT), 1, DEFAULT_DAILY_REVIEW_LIMIT);
  const due = state.items
    .filter((item) => Date.parse(item.dueAt) <= now.getTime())
    .sort((left, right) => comparePriority(left, right, now));
  return {
    items: due.slice(0, limit),
    totalDue: due.length,
    deferredToday: state.items.filter((item) => item.deferredAt && localDateKey(new Date(item.deferredAt)) === localDateKey(now)).length,
    limit,
  };
}

export function applyReviewOutcome(
  state: SpacedReviewState,
  input: ReviewOutcomeInput,
): SpacedReviewState {
  const index = state.items.findIndex(
    (item) => item.targetType === input.targetType && item.targetId === input.targetId,
  );
  if (index < 0) return state;
  const current = state.items[index];
  let reviewedAt = input.reviewedAt === undefined
    ? new Date()
    : safeDate(input.reviewedAt);
  if (current.lastReviewedAt) {
    const previousReview = new Date(current.lastReviewedAt);
    if (
      reviewedAt.getTime() < previousReview.getTime() &&
      localDateKey(reviewedAt) === localDateKey(previousReview)
    ) {
      reviewedAt = previousReview;
    }
  }
  if (current.lastReviewedAt && localDateKey(new Date(current.lastReviewedAt)) === localDateKey(reviewedAt)) {
    if (input.outcome === "correct") {
      const repeated = { ...current, lastOutcome: input.outcome };
      return { ...state, items: state.items.map((item, itemIndex) => itemIndex === index ? repeated : item) };
    }
    const level = Math.max(0, current.level - 2);
    const intervalDays = Math.max(
      1,
      Math.min(current.intervalDays, LEVEL_INTERVAL_DAYS[level]),
    );
    const shortenedDueAt = addLocalDays(reviewedAt, intervalDays).toISOString();
    const repeated = {
      ...current,
      dueAt:
        Date.parse(current.dueAt) <= Date.parse(shortenedDueAt)
          ? current.dueAt
          : shortenedDueAt,
      intervalDays,
      level,
      lastOutcome: input.outcome,
      severity: Math.min(5, current.severity + 1),
      correctStreak: 0,
    };
    return { ...state, items: state.items.map((item, itemIndex) => itemIndex === index ? repeated : item) };
  }

  const correct = input.outcome === "correct";
  const level = correct
    ? Math.min(LEVEL_INTERVAL_DAYS.length - 1, current.level + 1)
    : Math.max(0, current.level - 2);
  const intervalDays = correct
    ? LEVEL_INTERVAL_DAYS[level]
    : Math.max(1, Math.min(current.intervalDays, LEVEL_INTERVAL_DAYS[level]));
  const updated: SpacedReviewItem = {
    ...current,
    dueAt: addLocalDays(reviewedAt, intervalDays).toISOString(),
    intervalDays,
    level,
    lastOutcome: input.outcome,
    lastReviewedAt: reviewedAt.toISOString(),
    severity: correct ? Math.max(1, current.severity - 1) : Math.min(5, current.severity + 1),
    correctStreak: correct ? Math.min(1_000_000, current.correctStreak + 1) : 0,
  };
  delete updated.deferredAt;
  return { ...state, items: state.items.map((item, itemIndex) => itemIndex === index ? updated : item) };
}

export function deferReviewItem(
  state: SpacedReviewState,
  targetType: ReviewTargetType,
  targetId: string,
  now = new Date(),
): SpacedReviewState {
  const safeNow = safeDate(now);
  const index = state.items.findIndex((item) => item.targetType === targetType && item.targetId === targetId);
  if (index < 0) return state;
  const current = state.items[index];
  if (current.deferredAt && localDateKey(new Date(current.deferredAt)) === localDateKey(safeNow)) return state;
  if (Date.parse(current.dueAt) > safeNow.getTime()) return state;
  const updated = {
    ...current,
    dueAt: addLocalDays(safeNow, 1).toISOString(),
    deferredAt: safeNow.toISOString(),
  };
  return { ...state, items: state.items.map((item, itemIndex) => itemIndex === index ? updated : item) };
}

function legacyReviewItem(
  target: ReviewTargetInput,
  now: Date,
  reviewedAt: string | undefined,
  level: number,
  lastOutcome: ReviewOutcome | null,
  correctStreak: number,
): SpacedReviewItem | null {
  const item = normalizeTarget(target, now);
  if (!item) return null;
  const safeLevel = clamp(Math.trunc(level), 0, LEVEL_INTERVAL_DAYS.length - 1);
  const intervalDays = LEVEL_INTERVAL_DAYS[safeLevel];
  const reviewed = validDate(reviewedAt) ? new Date(reviewedAt) : null;
  return {
    ...item,
    dueAt: lastOutcome === "correct" && reviewed
      ? addLocalDays(reviewed, intervalDays).toISOString()
      : now.toISOString(),
    intervalDays,
    level: safeLevel,
    lastOutcome,
    ...(reviewed ? { lastReviewedAt: reviewed.toISOString() } : {}),
    correctStreak: clamp(Math.trunc(correctStreak), 0, 1_000_000),
    createdAt: (reviewed ?? now).toISOString(),
  };
}

export function migrateLegacyReviewState(input: LegacyReviewMigrationInput): SpacedReviewState {
  const now = safeDate(input.now, new Date());
  const migrated: SpacedReviewItem[] = [];
  for (const error of input.errors ?? []) {
    if (Array.from(error.text.trim()).length !== 1) continue;
    const streak = clamp(error.correctStreak ?? 0, 0, 20);
    const level = clamp(Math.max(error.mastery ?? 0, Math.floor(streak / 2)), 0, 9);
    const severity = clamp(Math.ceil(((error.codingErrors ?? error.count) + (error.hesitationPoints ?? 0) + (error.correctionCount ?? 0)) / 3), 1, 5);
    const item = legacyReviewItem(
      { targetType: "character", text: error.text, code: error.code, severity, expectedBenefit: error.code?.length ?? 1 },
      now,
      laterDate(error.lastCorrect, error.lastSeen),
      level,
      streak > 0 ? "correct" : "incorrect",
      streak,
    );
    if (item) migrated.push(item);
  }
  for (const phrase of input.phraseOpportunities ?? []) {
    const mistakes = Math.max(0, phrase.practiceCount - phrase.correctCount);
    const unresolved = Math.max(0, phrase.opportunityCount - phrase.correctCount);
    const streak = phrase.practiceCount > 0 && mistakes === 0 ? phrase.correctCount : 0;
    const item = legacyReviewItem(
      {
        targetType: "phrase",
        text: phrase.text,
        code: phrase.code,
        severity: clamp(mistakes + unresolved, 1, 5),
        expectedBenefit: clamp(phrase.savedKeys * Math.max(1, unresolved), 1, 100),
      },
      now,
      phrase.lastSeen,
      streak > 0 ? Math.min(4, streak) : 0,
      streak > 0 ? "correct" : "incorrect",
      streak,
    );
    if (item) migrated.push(item);
  }
  for (const queued of input.hesitationQueue?.items ?? []) {
    const target = queued.target;
    const mastered = queued.outcome === "mastered";
    const ratio = target.thresholdMs > 0 ? target.sourceDelayMs / target.thresholdMs : 1;
    const item = legacyReviewItem(
      {
        targetType: "hesitation",
        targetId: target.fingerprint,
        text: target.text,
        hesitationTarget: target,
        severity: clamp(Math.ceil(ratio), 1, 5),
        expectedBenefit: clamp(Math.round(ratio * 10), 1, 100),
      },
      now,
      queued.outcome
        ? laterDate(queued.completedAt, queued.startedAt)
        : undefined,
      mastered ? 1 : 0,
      queued.outcome ? (mastered ? "correct" : "incorrect") : null,
      mastered ? 1 : 0,
    );
    if (item) migrated.push(item);
  }
  const base = input.state && isSpacedReviewState(input.state)
    ? input.state
    : createEmptySpacedReviewState();
  const merged = new Map(
    base.items.map((item) => [targetKey(item.targetType, item.targetId), item]),
  );
  for (const item of migrated) {
    const key = targetKey(item.targetType, item.targetId);
    const previous = merged.get(key);
    if (!previous) {
      merged.set(key, item);
      continue;
    }
    merged.set(key, {
      ...item,
      ...previous,
      severity: Math.max(item.severity, previous.severity),
      expectedBenefit: Math.max(item.expectedBenefit, previous.expectedBenefit),
      ...(previous.code ?? item.code ? { code: previous.code ?? item.code } : {}),
      ...(previous.hesitationTarget ?? item.hesitationTarget
        ? { hesitationTarget: previous.hesitationTarget ?? item.hesitationTarget }
        : {}),
    });
  }
  return {
    version: 1,
    items: capItems(Array.from(merged.values()), now),
  };
}
