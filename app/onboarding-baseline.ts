import type { AdvancedGoalMetric, SessionResult } from "./types.ts";
import type { OnboardingProgress } from "./onboarding.ts";

export interface BaselineSummary {
  sessions: SessionResult[];
  speed: number;
  accuracy: number;
  codeLength: number;
  metric: AdvancedGoalMetric;
}

export function isBaselineSession(session: SessionResult | undefined): session is SessionResult {
  return Boolean(session && session.type === "article" && session.durationSeconds > 0 && session.attemptedChars > 0);
}

export function buildBaseline(
  sessions: SessionResult[],
  progress: OnboardingProgress,
): BaselineSummary | null {
  const selected = Array.from(new Set(progress.sessionIds)).slice(0, 3)
    .map((id) => sessions.find((session) => session.id === id))
    .filter(isBaselineSession);
  if (selected.length < 3) return null;
  const average = (values: number[]) =>
    values.reduce((sum, value) => sum + value, 0) / values.length;
  const speed = average(selected.map((session) => session.speed));
  const accuracy = average(selected.map((session) => session.accuracy));
  const codeLength = average(selected.map((session) => session.codeLength));
  let metric: AdvancedGoalMetric = "speed";
  if (accuracy < 95) metric = "characterAccuracy";
  else if (selected.every((session) => (session.keyCount ?? 0) > 0) && codeLength > 3) metric = "codeLength";
  else if (speed < 40) metric = "speed";
  else if (selected.some((session) => (session.rhythmSummary?.variationPercent ?? 0) > 35)) {
    metric = "stability";
  }
  return { sessions: selected, speed, accuracy, codeLength, metric };
}

export function metricLabel(metric: AdvancedGoalMetric): string {
  return {
    speed: "速度",
    characterAccuracy: "字准",
    keyAccuracy: "键准",
    codeLength: "码长效率",
    phrase: "词组连贯度",
    stability: "节奏稳定性",
  }[metric];
}

function metricValue(summary: BaselineSummary): number {
  if (summary.metric === "characterAccuracy") return summary.accuracy;
  if (summary.metric === "codeLength") return summary.codeLength;
  if (summary.metric === "stability") {
    const values = summary.sessions
      .map((session) => session.rhythmSummary?.variationPercent)
      .filter((value): value is number => typeof value === "number");
    return values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : 0;
  }
  return summary.speed;
}

export function formatMetric(summary: BaselineSummary): string {
  const value = metricValue(summary);
  return summary.metric === "speed"
    ? `${value.toFixed(1)} 字/分`
    : summary.metric === "codeLength"
      ? `${value.toFixed(2)} 键/字`
      : `${value.toFixed(1)}%`;
}
