import {
  MAX_CUSTOM_TEXT_LENGTH,
  MAX_TYPING_DELAY_MS,
} from "./practice-constraints.ts";
import type {
  HesitationSegment,
  TypingHeatmap,
  WubiEntry,
} from "./types.ts";

interface MinimumCodeCandidate {
  characters: string[];
  codeLength: number;
}

export type MinimumCodeLengthIndex = Map<string, MinimumCodeCandidate[]>;

const hanCharacterPattern = /^\p{Script=Han}$/u;

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

  let commonSuffix = 0;
  while (
    commonSuffix < previousCharacters.length - commonPrefix &&
    commonSuffix < nextCharacters.length - commonPrefix &&
    previousCharacters[previousCharacters.length - 1 - commonSuffix] ===
      nextCharacters[nextCharacters.length - 1 - commonSuffix]
  ) {
    commonSuffix += 1;
  }

  let correct = 0;
  const changedEnd = nextCharacters.length - commonSuffix;
  for (let index = commonPrefix; index < changedEnd; index += 1) {
    if (nextCharacters[index] === targetCharacters[index]) correct += 1;
  }
  return {
    attempts: Math.max(0, changedEnd - commonPrefix),
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
  let correctHanChars = 0;
  let correctDirectLetterKeys = 0;
  for (let index = 0; index < typedCharacters.length; index += 1) {
    if (typedCharacters[index] !== targetCharacters[index]) continue;
    correctChars += 1;
    if (hanCharacterPattern.test(targetCharacters[index])) {
      correctHanChars += 1;
    } else if (/^[a-y]$/i.test(targetCharacters[index])) {
      correctDirectLetterKeys += 1;
    }
  }
  const wubiLetterKeys = Math.max(0, letterKeys - correctDirectLetterKeys);
  return {
    correctChars,
    correctHanChars,
    attemptedChars: Math.max(targetCharacters.length, attemptCount),
    speed:
      durationSeconds > 0
        ? Math.round(correctChars / (durationSeconds / 60))
        : 0,
    kps: durationSeconds > 0 ? keyCount / durationSeconds : 0,
    codeLength: correctHanChars > 0 ? wubiLetterKeys / correctHanChars : 0,
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
  return Math.max(
    0,
    Math.min(100, ((keyCount - correctionCost) / keyCount) * 100),
  );
}

export function calculatePhraseRate(
  phraseChars: number,
  correctChars: number,
): number {
  if (correctChars <= 0) return 0;
  return Math.max(0, Math.min(100, (phraseChars / correctChars) * 100));
}

export function calculateTypingTransitionMs({
  lastActiveAt,
  now,
  pendingMs,
}: {
  lastActiveAt: number | null;
  now: number;
  pendingMs: number;
}): number {
  const currentInterval =
    lastActiveAt === null ? 0 : Math.max(0, now - lastActiveAt);
  return Math.min(
    MAX_TYPING_DELAY_MS,
    Math.max(0, pendingMs) + currentInterval,
  );
}

export function applyTypingDelaySample({
  previous,
  next,
  target,
  delayMs,
  delays,
}: {
  previous: string;
  next: string;
  target: string;
  delayMs: number;
  delays: number[];
}): number[] {
  const previousCharacters = Array.from(previous);
  const nextCharacters = Array.from(next);
  const targetLength = Array.from(target).length;
  const result = Array.from(
    { length: targetLength },
    (_, index) => delays[index] ?? 0,
  );
  let commonPrefix = 0;
  while (
    commonPrefix < previousCharacters.length &&
    commonPrefix < nextCharacters.length &&
    previousCharacters[commonPrefix] === nextCharacters[commonPrefix]
  ) {
    commonPrefix += 1;
  }

  let commonSuffix = 0;
  while (
    commonSuffix < previousCharacters.length - commonPrefix &&
    commonSuffix < nextCharacters.length - commonPrefix &&
    previousCharacters[previousCharacters.length - 1 - commonSuffix] ===
      nextCharacters[nextCharacters.length - 1 - commonSuffix]
  ) {
    commonSuffix += 1;
  }

  const boundedDelay = Math.min(MAX_TYPING_DELAY_MS, Math.max(0, delayMs));
  const inserted = Math.max(
    0,
    nextCharacters.length - commonPrefix - commonSuffix,
  );
  if (inserted > 0) {
    const perCharacter = boundedDelay / inserted;
    const end = Math.min(targetLength, commonPrefix + inserted);
    for (let index = commonPrefix; index < end; index += 1) {
      result[index] += perCharacter;
    }
  } else if (previousCharacters.length > nextCharacters.length) {
    const affectedIndex = Math.min(commonPrefix, targetLength - 1);
    if (affectedIndex >= 0) result[affectedIndex] += boundedDelay;
  }
  return result;
}

export function getHesitationLevel(
  delayMs: number,
  thresholdMs: number,
): 0 | 1 | 2 | 3 {
  if (delayMs < thresholdMs) return 0;
  if (delayMs < thresholdMs * 1.5) return 1;
  if (delayMs < thresholdMs * 2.5) return 2;
  return 3;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export function buildTypingHeatmap(
  text: string,
  delays: number[],
): TypingHeatmap {
  const storedText = Array.from(text).slice(0, MAX_CUSTOM_TEXT_LENGTH).join("");
  const targetLength = Array.from(storedText.replace(/[\r\n]/g, "")).length;
  const normalizedDelays = Array.from(
    { length: targetLength },
    (_, index) =>
      Math.min(MAX_TYPING_DELAY_MS, Math.max(0, delays[index] ?? 0)),
  );
  const baselineMs = Math.round(
    median(normalizedDelays.filter((delay) => delay > 0)),
  );
  const thresholdMs = Math.round(
    Math.min(MAX_TYPING_DELAY_MS, Math.max(1000, baselineMs * 1.8)),
  );
  const grouped: Array<HesitationSegment & { level: 1 | 2 | 3 }> = [];

  normalizedDelays.forEach((delayMs, index) => {
    const level = getHesitationLevel(delayMs, thresholdMs);
    if (level === 0) return;
    const previous = grouped.at(-1);
    if (
      previous &&
      previous.start + previous.length === index &&
      previous.level === level
    ) {
      previous.length += 1;
      previous.delayMs = Math.max(previous.delayMs, Math.round(delayMs));
      return;
    }
    grouped.push({
      start: index,
      length: 1,
      delayMs: Math.round(delayMs),
      level,
    });
  });

  const segments = grouped
    .sort((a, b) => b.delayMs - a.delayMs || a.start - b.start)
    .slice(0, 32)
    .sort((a, b) => a.start - b.start)
    .map(({ start, length, delayMs }) => ({ start, length, delayMs }));

  return {
    version: 1,
    text: storedText,
    baselineMs,
    thresholdMs,
    segments,
  };
}

export function getCommittedEditRange(previous: string, next: string) {
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
  let commonSuffix = 0;
  while (
    commonSuffix < previousCharacters.length - commonPrefix &&
    commonSuffix < nextCharacters.length - commonPrefix &&
    previousCharacters[previousCharacters.length - 1 - commonSuffix] ===
      nextCharacters[nextCharacters.length - 1 - commonSuffix]
  ) {
    commonSuffix += 1;
  }
  const inserted = Math.max(
    0,
    nextCharacters.length - commonPrefix - commonSuffix,
  );
  return {
    start: commonPrefix,
    removed: Math.max(
      0,
      previousCharacters.length - commonPrefix - commonSuffix,
    ),
    inserted,
  };
}

export function countCommittedEdit(previous: string, next: string) {
  const { removed, inserted } = getCommittedEditRange(previous, next);
  return {
    removed,
    phraseChars: inserted > 1 ? inserted : 0,
    inserted,
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
  inactiveDurationMs = 0,
  inactiveAt = null,
}: {
  startedAt: number | null;
  now: number;
  pausedDurationMs: number;
  pausedAt: number | null;
  inactiveDurationMs?: number;
  inactiveAt?: number | null;
}): number {
  if (startedAt === null) return 0;
  const currentPause = pausedAt === null ? 0 : Math.max(0, now - pausedAt);
  const currentInactive =
    inactiveAt === null ? 0 : Math.max(0, now - inactiveAt);
  return Math.max(
    0,
    (now -
      startedAt -
      pausedDurationMs -
      currentPause -
      inactiveDurationMs -
      currentInactive) /
      1000,
  );
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
