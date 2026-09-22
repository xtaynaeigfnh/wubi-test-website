import type { AdvancedGoalMetric, SessionResult } from "./types.ts";

// Read persisted results on mount as well as after saves so reloads can recover
// a result saved before the guide itself had time to update.
export function reconcileOnboarding(progress: OnboardingProgress | null, sessions: SessionResult[]) {
  if (!progress) return { progress, open: sessions.length === 0 };
  if (progress.status !== "active") return { progress, open: false };
  let next = progress;
  if (progress.startedAt) {
    const sessionIds = sessions
      .filter((session) => session.type === "article" && Date.parse(session.date) >= Date.parse(progress.startedAt!))
      .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
      .map((session) => session.id)
      .filter((id, index, ids) => ids.indexOf(id) === index)
      .slice(0, 3);
    if (sessionIds.some((id) => !progress.sessionIds.includes(id))) {
      next = { ...next, sessionIds };
    }
  }
  if (progress.practiceStartedAt && !progress.practiceSessionId) {
    const practice = sessions.find((session) => ["review", "roots", "hesitation"].includes(session.type) && Date.parse(session.date) >= Date.parse(progress.practiceStartedAt!));
    if (practice) next = { ...next, practiceSessionId: practice.id };
  }
  return { progress: next, open: next !== progress };
}

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
