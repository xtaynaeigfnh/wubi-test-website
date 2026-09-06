"use client";

import {
  MAX_ARTICLE_PROGRESS_ITEMS,
  MAX_ARTICLE_PROGRESS_VALUE,
  isBoundedSpacedReviewState,
  MAX_SPACED_REVIEW_STATE_BYTES,
  utf8ByteLength,
  isHesitationPracticeQueue,
  isCustomPracticeArticle,
  isSessionResult,
  isErrorStat,
  isPhraseOpportunityStat,
  isDailyTrainingPlan,
  normalizeArticleProgress,
} from "./practice-schema.ts";
import {
  STORAGE,
  readLocal,
  writeLocal,
  commitLocalWrites,
} from "./storage.ts";
import type {
  ArticleProgress,
  AdvancedSeasonArchive,
  DailyTrainingPlan,
  ErrorStat,
  HesitationPracticeQueue,
  HesitationPracticeTarget,
  PracticeArticle,
  PhraseOpportunityStat,
  SessionResult,
  WeakObservation,
  WubiEntry,
} from "./types.ts";
import { MAX_CUSTOM_ARTICLES } from "./practice-constraints.ts";
import {
  appendMaintenanceEvent,
  isMaintenanceLog,
  type MaintenanceEventKind,
  type MaintenanceLog,
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
  normalizeKeyUsage,
  type KeyUsageMap,
} from "./key-usage.ts";

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

export function flushPendingKeyUsage(): void {
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

export function isValidSessionCollection(value: unknown): value is SessionResult[] {
  if (!Array.isArray(value) || value.length > 500) return false;
  const sessions = value as unknown[];
  if (!sessions.every(isSessionResult)) return false;
  const typedSessions = sessions as SessionResult[];
  if (
    new Set(typedSessions.map((session) => session.id)).size !==
    typedSessions.length
  ) {
    return false;
  }
  return (
    JSON.stringify(
      pruneHeatmaps(
        pruneRhythmCurves(pruneGhostTimelines(typedSessions)),
      ),
    ) === JSON.stringify(typedSessions)
  );
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

export function nextMaintenanceLog(
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
      existingCodingErrors + (error.codingErrors ?? error.count);
    existing.hesitationPoints =
      (existing.hesitationPoints ?? 0) + (error.hesitationPoints ?? 0);
    existing.correctionCount =
      (existing.correctionCount ?? 0) + (error.correctionCount ?? 0);
    existing.seenCount = (existing.seenCount ?? 0) + (error.seenCount ?? 0);
    existing.correctStreak = Math.max(
      existing.correctStreak ?? 0,
      error.correctStreak ?? 0,
    );
    existing.code = existing.code ?? error.code;
    existing.mastery = Math.max(existing.mastery ?? 0, error.mastery ?? 0);
    if (error.lastSeen > existing.lastSeen) existing.lastSeen = error.lastSeen;
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
export function localDateKey(value: string | number | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
