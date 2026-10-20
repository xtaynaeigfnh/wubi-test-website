import { localDateKey } from "./practice-store.ts";
import type { DailyProgress, SessionResult, TrendPoint } from "./types";

export function calculateDailyProgress(
  sessions: SessionResult[],
  now = new Date(),
): DailyProgress {
  const date = localDateKey(now);
  const today = sessions.filter((session) => localDateKey(session.date) === date);
  return {
    date,
    chars: today
      .filter((session) => session.type === "article")
      .reduce((sum, session) => sum + session.correctChars, 0),
    minutes: today.reduce(
      (sum, session) => sum + session.durationSeconds / 60,
      0,
    ),
    rounds: today.length,
    articleSessions: today.filter((session) => session.type === "article").length,
    trainingSessions: today.filter((session) => session.type !== "article").length,
  };
}

export function calculateStreak(
  sessions: SessionResult[],
  now = new Date(),
): number {
  const dates = new Set(sessions.map((session) => localDateKey(session.date)));
  const cursor = new Date(now);
  cursor.setHours(12, 0, 0, 0);
  if (!dates.has(localDateKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
  }
  let streak = 0;
  while (dates.has(localDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function buildTrendSeries(
  sessions: SessionResult[],
  range: 7 | 30 | "all",
  now = new Date(),
): TrendPoint[] {
  const articleSessions = sessions.filter(
    (session) => session.type === "article",
  );
  const oldest = articleSessions.reduce<Date | null>((result, session) => {
    const date = new Date(session.date);
    return !result || date < result ? date : result;
  }, null);
  const rawDayCount =
    range === "all"
      ? Math.max(
        1,
        oldest
          ? Math.floor(
            (new Date(localDateKey(now)).getTime() -
              new Date(localDateKey(oldest)).getTime()) /
            86400000,
          ) + 1
          : 1,
      )
      : range;
  const maximumContinuousDays = 3660;
  const safeDayCount =
    Number.isFinite(rawDayCount) && rawDayCount > 0
      ? rawDayCount
      : maximumContinuousDays + 1;
  const useActiveDays = range === "all" && safeDayCount > maximumContinuousDays;
  const dayCount = Math.min(safeDayCount, maximumContinuousDays);
  const dateKeys = useActiveDays
    ? Array.from(
      new Set(articleSessions.map((session) => localDateKey(session.date))),
    ).sort()
    : Array.from({ length: dayCount }, (_, offset) => {
      const date = new Date(now);
      date.setHours(12, 0, 0, 0);
      date.setDate(date.getDate() - (dayCount - offset - 1));
      return localDateKey(date);
    });
  const sessionsByDate = new Map<string, SessionResult[]>();
  for (const session of articleSessions) {
    const key = localDateKey(session.date);
    const rows = sessionsByDate.get(key) ?? [];
    rows.push(session);
    sessionsByDate.set(key, rows);
  }
  return dateKeys.map((key) => {
    const date = new Date(`${key}T12:00:00`);
    const rows = sessionsByDate.get(key) ?? [];
    const weightedChars = rows.reduce(
      (sum, session) => sum + session.correctChars,
      0,
    );
    const weightedMinutes = rows.reduce(
      (sum, session) => sum + session.durationSeconds / 60,
      0,
    );
    const attemptedChars = rows.reduce(
      (sum, session) => sum + session.attemptedChars,
      0,
    );
    return {
      date: key,
      label: `${date.getMonth() + 1}/${date.getDate()}`,
      sessions: rows.length,
      chars: weightedChars,
      minutes: weightedMinutes,
      speed: weightedMinutes > 0 ? Math.round(weightedChars / weightedMinutes) : 0,
      accuracy: attemptedChars > 0
        ? rows.reduce(
          (sum, session) => sum + session.accuracy * session.attemptedChars,
          0,
        ) / attemptedChars
        : 0,
    };
  });
}
