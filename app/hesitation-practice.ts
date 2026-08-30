import type {
  HesitationPracticeAttempt,
  HesitationPracticeResult,
  HesitationPracticeTarget,
  HesitationSegment,
  SessionResult,
  TypingHeatmap,
  WeakObservation,
} from "./types";

const DEFAULT_EXCERPT_LENGTH = 12;
const MAX_EXCERPT_LENGTH = 15;
const MAX_TYPING_DELAY_MS = 10 * 60 * 1000;

type HesitationSourceSession = Pick<
  SessionResult,
  "id" | "articleId" | "title" | "date"
>;

type WeakCodeLookup = ReadonlyMap<string, string> | Record<string, string>;

function isBoundedString(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length <= maximum;
}

function isFiniteRange(value: unknown, minimum: number, maximum: number): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
  );
}

export function isValidHesitationPracticeTarget(
  value: unknown,
): value is HesitationPracticeTarget {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const target = value as Partial<HesitationPracticeTarget>;
  const textLength = typeof target.text === "string"
    ? Array.from(target.text).length
    : 0;
  return (
    target.version === 1 &&
    isBoundedString(target.id, 160) &&
    target.id.length > 0 &&
    isBoundedString(target.fingerprint, 200) &&
    target.fingerprint.length > 0 &&
    isBoundedString(target.sourceSessionId, 160) &&
    target.sourceSessionId.length > 0 &&
    (target.articleId === undefined || isBoundedString(target.articleId, 160)) &&
    isBoundedString(target.sourceTitle, 200) &&
    target.sourceTitle.length > 0 &&
    isBoundedString(target.sourceDate, 40) &&
    target.sourceDate.length > 0 &&
    Number.isFinite(Date.parse(target.sourceDate)) &&
    isBoundedString(target.text, MAX_EXCERPT_LENGTH) &&
    textLength > 0 &&
    !/[\r\n]/.test(target.text) &&
    Number.isInteger(target.sourceStart) &&
    isFiniteRange(target.sourceStart, 0, 5000) &&
    Number.isInteger(target.focusOffset) &&
    isFiniteRange(target.focusOffset, 0, textLength - 1) &&
    Number.isInteger(target.focusLength) &&
    isFiniteRange(target.focusLength, 1, textLength) &&
    (target.focusOffset ?? 0) + (target.focusLength ?? 0) <= textLength &&
    target.fingerprint ===
      `${target.text}\u0000${target.focusOffset}\u0000${target.focusLength}` &&
    isFiniteRange(target.sourceDelayMs, 0, MAX_TYPING_DELAY_MS) &&
    isFiniteRange(target.baselineMs, 0, MAX_TYPING_DELAY_MS) &&
    isFiniteRange(target.thresholdMs, 1000, MAX_TYPING_DELAY_MS)
  );
}

export interface HesitationPracticeExcerpt {
  text: string;
  sourceStart: number;
  focusOffset: number;
  focusLength: number;
}

function normalizedCharacters(text: string) {
  return Array.from(text.replace(/[\r\n]/g, ""));
}

function fnv1a(value: string) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function targetFingerprint(
  text: string,
  focusOffset: number,
  focusLength: number,
) {
  return `${text}\u0000${focusOffset}\u0000${focusLength}`;
}

function validIndexes(indexes: number[], length: number) {
  return [...new Set(indexes)]
    .filter(
      (index) =>
        Number.isInteger(index) && index >= 0 && index < length,
    )
    .sort((left, right) => left - right);
}

function codeFor(character: string, codes?: WeakCodeLookup) {
  if (!codes) return undefined;
  if (typeof (codes as ReadonlyMap<string, string>).get === "function") {
    return (codes as ReadonlyMap<string, string>).get(character);
  }
  return (codes as Record<string, string>)[character];
}

function hesitationSeverity(
  delayMs: number,
  thresholdMs: number,
): 0 | 1 | 2 | 3 {
  if (thresholdMs <= 0 || delayMs < thresholdMs) return 0;
  if (delayMs < thresholdMs * 1.5) return 1;
  if (delayMs < thresholdMs * 2.5) return 2;
  return 3;
}

export function extractHesitationPracticeExcerpt(
  text: string,
  segment: Pick<HesitationSegment, "start" | "length">,
): HesitationPracticeExcerpt {
  const characters = normalizedCharacters(text);
  if (!characters.length) {
    throw new Error("无法从空文本中截取卡顿片段");
  }

  const segmentStart = Math.trunc(segment.start);
  const segmentLength = Math.trunc(segment.length);
  if (
    !Number.isFinite(segment.start) ||
    !Number.isFinite(segment.length) ||
    segmentStart < 0 ||
    segmentLength < 1 ||
    segmentStart >= characters.length
  ) {
    throw new RangeError("卡顿位置超出了原文范围");
  }

  const availableFocusLength = Math.min(
    segmentLength,
    characters.length - segmentStart,
  );
  if (availableFocusLength > MAX_EXCERPT_LENGTH) {
    const sourceStart =
      segmentStart +
      Math.floor((availableFocusLength - MAX_EXCERPT_LENGTH) / 2);
    return {
      text: characters
        .slice(sourceStart, sourceStart + MAX_EXCERPT_LENGTH)
        .join(""),
      sourceStart,
      focusOffset: 0,
      focusLength: MAX_EXCERPT_LENGTH,
    };
  }

  const excerptLength = Math.min(
    characters.length,
    Math.max(DEFAULT_EXCERPT_LENGTH, availableFocusLength),
  );
  const surroundingLength = excerptLength - availableFocusLength;
  let sourceStart = segmentStart - Math.floor(surroundingLength / 2);
  sourceStart = Math.max(0, sourceStart);
  sourceStart = Math.min(sourceStart, characters.length - excerptLength);

  return {
    text: characters.slice(sourceStart, sourceStart + excerptLength).join(""),
    sourceStart,
    focusOffset: segmentStart - sourceStart,
    focusLength: availableFocusLength,
  };
}

export function buildHesitationPracticeTarget(
  heatmap: TypingHeatmap,
  segment: HesitationSegment,
  sourceSession: HesitationSourceSession,
): HesitationPracticeTarget {
  const excerpt = extractHesitationPracticeExcerpt(heatmap.text, segment);
  const fingerprint = targetFingerprint(
    excerpt.text,
    excerpt.focusOffset,
    excerpt.focusLength,
  );
  const hash = fnv1a(fingerprint).toString(16).padStart(8, "0");
  return {
    version: 1,
    id: `hesitation-${hash}`,
    fingerprint,
    sourceSessionId: sourceSession.id,
    articleId: sourceSession.articleId,
    sourceTitle: sourceSession.title,
    sourceDate: sourceSession.date,
    text: excerpt.text,
    sourceStart: excerpt.sourceStart,
    focusOffset: excerpt.focusOffset,
    focusLength: excerpt.focusLength,
    sourceDelayMs: Math.max(0, Math.round(segment.delayMs)),
    baselineMs: Math.max(0, Math.round(heatmap.baselineMs)),
    thresholdMs: Math.max(0, Math.round(heatmap.thresholdMs)),
  };
}

export function calculateHesitationImprovement(
  firstMs: number,
  currentMs: number,
) {
  if (!Number.isFinite(firstMs) || firstMs <= 0) return 0;
  const normalizedCurrent = Number.isFinite(currentMs)
    ? Math.max(0, currentMs)
    : firstMs;
  return Math.round(((firstMs - normalizedCurrent) / firstMs) * 100);
}

export function isHesitationPracticeMastered(
  target: HesitationPracticeTarget,
  attempts: readonly HesitationPracticeAttempt[],
) {
  if (attempts.length < 3) return false;
  const first = attempts.find((attempt) => attempt.round === 1) ?? attempts[0];
  const third = attempts.find((attempt) => attempt.round === 3) ?? attempts[2];
  const targetLength = Array.from(target.text).length;
  if (!first || !third || targetLength === 0) return false;
  if (validIndexes(third.errorIndexes, targetLength).length > 0) return false;

  const improvedByTwentyPercent =
    first.durationMs > 0 && third.durationMs <= first.durationMs * 0.8;
  const reachedSourceBaseline =
    target.baselineMs > 0 &&
    third.durationMs / targetLength <= target.baselineMs;
  return improvedByTwentyPercent || reachedSourceBaseline;
}

export function buildHesitationPracticeResult(
  target: HesitationPracticeTarget,
  attempts: readonly HesitationPracticeAttempt[],
  completedAt = new Date().toISOString(),
): HesitationPracticeResult {
  if (
    attempts.length !== 3 ||
    attempts.some((attempt, index) => attempt.round !== index + 1)
  ) {
    throw new Error("卡顿片段结果必须包含按顺序完成的三轮练习");
  }
  const normalizedAttempts = attempts.map((attempt) => ({
    ...attempt,
    errorIndexes: validIndexes(
      attempt.errorIndexes,
      Array.from(target.text).length,
    ),
    delaysMs: Array.from(
      { length: Array.from(target.text).length },
      (_, index) => Math.max(0, Math.round(attempt.delaysMs[index] ?? 0)),
    ),
  })) as HesitationPracticeResult["attempts"];
  return {
    version: 1,
    target,
    attempts: normalizedAttempts,
    outcome: isHesitationPracticeMastered(target, normalizedAttempts)
      ? "mastered"
      : "needs-review",
    completedAt,
  };
}

export function buildHesitationObservations(
  result: HesitationPracticeResult,
  codes?: WeakCodeLookup,
): WeakObservation[] {
  const characters = Array.from(result.target.text);
  const third = result.attempts[2];
  const errorIndexes = new Set(
    validIndexes(third.errorIndexes, characters.length),
  );
  const hesitationIndexes = new Map<number, 1 | 2 | 3>();
  third.delaysMs.slice(0, characters.length).forEach((delayMs, index) => {
    const severity = hesitationSeverity(delayMs, result.target.thresholdMs);
    if (severity !== 0) hesitationIndexes.set(index, severity);
  });

  const observations: WeakObservation[] = [];
  const pushObservation = (
    index: number,
    kind: WeakObservation["kind"],
    severity?: 1 | 2 | 3,
  ) => {
    const character = characters[index];
    if (!character || !/\p{Script=Han}/u.test(character)) return;
    observations.push({
      text: character,
      code: codeFor(character, codes),
      kind,
      severity,
      occurredAt: result.completedAt,
    });
  };

  errorIndexes.forEach((index) => pushObservation(index, "coding-error"));
  hesitationIndexes.forEach((severity, index) =>
    pushObservation(index, "hesitation", severity),
  );

  const correctCharacters = new Set<string>();
  const focusEnd = Math.min(
    characters.length,
    result.target.focusOffset + result.target.focusLength,
  );
  for (let index = result.target.focusOffset; index < focusEnd; index += 1) {
    const character = characters[index];
    if (
      errorIndexes.has(index) ||
      hesitationIndexes.has(index) ||
      correctCharacters.has(character)
    ) {
      continue;
    }
    if (/\p{Script=Han}/u.test(character)) {
      correctCharacters.add(character);
      pushObservation(index, "correct");
    }
  }
  return observations;
}

export function buildHesitationSession(
  result: HesitationPracticeResult,
  id?: string,
): SessionResult {
  const characters = Array.from(result.target.text);
  const targetLength = characters.length;
  const roundErrors = result.attempts.map(
    (attempt) => validIndexes(attempt.errorIndexes, targetLength).length,
  );
  const errors = roundErrors.reduce((sum, count) => sum + count, 0);
  const attemptedChars = targetLength * result.attempts.length;
  const correctChars = Math.max(0, attemptedChars - errors);
  const third = result.attempts[2];
  const thirdCorrect = Math.max(0, targetLength - roundErrors[2]);
  const durationMs = result.attempts.reduce(
    (sum, attempt) => sum + Math.max(0, attempt.durationMs),
    0,
  );
  const defaultId = `hesitation-${fnv1a(
    `${result.target.id}\u0000${result.completedAt}`,
  )
    .toString(16)
    .padStart(8, "0")}`;
  const errorIndexes = new Set(
    result.attempts.flatMap((attempt) =>
      validIndexes(attempt.errorIndexes, targetLength),
    ),
  );

  return {
    id: id ?? defaultId,
    type: "hesitation",
    articleId: result.target.articleId,
    title: `卡顿片段三连练 · ${result.target.sourceTitle}`,
    date: result.completedAt,
    durationSeconds: Math.max(0.001, durationMs / 1000),
    correctChars,
    attemptedChars,
    speed:
      third.durationMs > 0
        ? Math.round(thirdCorrect / (third.durationMs / 60_000))
        : 0,
    kps: 0,
    codeLength: 0,
    accuracy: targetLength > 0 ? (thirdCorrect / targetLength) * 100 : 100,
    errors,
    errorChars: [...errorIndexes].map((index) => characters[index]),
    hesitationPractice: result,
  };
}
