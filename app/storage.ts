"use client";

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
  trainingPlan: "wubi-test:training-plan:v1",
  hesitationQueue: "wubi-test:hesitation-queue:v1",
  phraseOpportunities: "wubi-test:phrase-opportunities:v1",
  advancedSeason: "wubi-test:advanced-season:v1",
  reviewState: "wubi-test:review-state:v1",
  maintenance: "wubi-test:maintenance:v1",
} as const;

export const STORAGE_KEYS = Object.values(STORAGE);

export function writeSessionValue(key: string, value: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.sessionStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function takeSessionValue(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.sessionStorage.getItem(key);
    window.sessionStorage.removeItem(key);
    return value;
  } catch {
    return null;
  }
}

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

export function writeLocal<T>(key: string, value: T): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function commitLocalWrites(writes: Map<string, unknown>): boolean {
  if (typeof window === "undefined") return false;
  let previous: Map<string, string | null>;
  try {
    previous = new Map(
      Array.from(writes.keys()).map((key) => [
        key,
        window.localStorage.getItem(key),
      ]),
    );
  } catch {
    return false;
  }
  const writtenKeys: string[] = [];
  try {
    for (const [key, value] of writes) {
      window.localStorage.setItem(key, JSON.stringify(value));
      writtenKeys.push(key);
    }
    return true;
  } catch {
    // Reverse successful writes to revisit storage states that already fit the
    // quota. Restoring in forward order can grow a key before freeing later writes.
    for (const key of writtenKeys.reverse()) {
      try {
        const oldValue = previous.get(key)!;
        if (oldValue === null) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, oldValue);
      } catch {
        // A blocked key must not prevent the remaining keys from being restored.
      }
    }
    return false;
  }
}
