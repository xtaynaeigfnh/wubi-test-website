import type { AdvancedGoalMetric } from "./types.ts";

export interface OnboardingProgress {
  version: 1;
  status: "active" | "skipped" | "completed";
  startedAt?: string;
  sessionIds: string[];
  completedAt?: string;
  goalMetric?: AdvancedGoalMetric;
  practiceStartedAt?: string;
  practiceSessionId?: string;
}

export function isOnboardingProgress(value: unknown): value is OnboardingProgress {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as OnboardingProgress;
  const id = (s: unknown) => typeof s === "string" && s.length > 0 && s.length <= 160;
  const date = (s: unknown) => s === undefined || (typeof s === "string" && s.length <= 40 && Number.isFinite(Date.parse(s)));
  return v.version === 1 && ["active", "skipped", "completed"].includes(v.status) &&
    Array.isArray(v.sessionIds) && v.sessionIds.length <= 3 && v.sessionIds.every(id) &&
    new Set(v.sessionIds).size === v.sessionIds.length &&
    date(v.startedAt) && date(v.completedAt) && date(v.practiceStartedAt) &&
    (v.goalMetric === undefined || ["speed", "characterAccuracy", "keyAccuracy", "codeLength", "phrase", "stability"].includes(v.goalMetric)) &&
    (v.practiceSessionId === undefined || id(v.practiceSessionId));
}
