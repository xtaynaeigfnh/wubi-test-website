import type { ErrorStat, WubiEntry } from "./types";
import { preferShortestWubiCodes } from "./typing-metrics.ts";

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

export function buildReviewPool(
  errors: ErrorStat[],
  entries: WubiEntry[],
): WubiEntry[] {
  const preferred = new Map(
    preferShortestWubiCodes(entries).map((entry) => [entry[0], entry]),
  );
  const ranked = new Map<string, { entry: WubiEntry; score: number; }>();
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
