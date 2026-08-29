import { KEYBOARD_KEYS } from "./key-usage.ts";
import type {
  AbilityDimension,
  AbilityDimensionId,
  ErrorStat,
  PhraseOpportunityStat,
  SessionResult,
  WeeklyRecommendation,
  WeeklyReport,
} from "./types.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

const ABILITY_LABELS: Record<AbilityDimensionId, string> = {
  speed: "速度",
  characterAccuracy: "字准",
  keyAccuracy: "键准",
  codeLength: "码长",
  phrase: "打词",
  stability: "稳定性",
};

const clampScore = (value: number) =>
  Math.round(Math.max(0, Math.min(100, value)));

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getWeekRange(now = new Date(), offset = 0) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const dayFromMonday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - dayFromMonday + offset * 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start, end };
}

function inRange(date: string | undefined, start: Date, end: Date): boolean {
  if (!date) return false;
  const timestamp = new Date(date).getTime();
  return Number.isFinite(timestamp) && timestamp >= start.getTime() && timestamp < end.getTime();
}

function average(values: number[]): number | null {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

function ability(
  id: AbilityDimensionId,
  score: number | null,
  rawLabel: string,
  normalization: string,
): AbilityDimension {
  return {
    id,
    label: ABILITY_LABELS[id],
    score: score === null ? null : clampScore(score),
    rawLabel,
    normalization,
  };
}

export function calculateAbilityDimensions(
  sessions: SessionResult[],
): AbilityDimension[] {
  const articles = sessions.filter((session) => session.type === "article");
  const totalDurationMinutes = articles.reduce(
    (sum, session) => sum + session.durationSeconds / 60,
    0,
  );
  const totalCharacters = articles.reduce(
    (sum, session) => sum + session.correctChars,
    0,
  );
  const totalAttempts = articles.reduce(
    (sum, session) => sum + session.attemptedChars,
    0,
  );
  const speed = totalDurationMinutes > 0
    ? totalCharacters / totalDurationMinutes
    : null;
  const characterAccuracy = totalAttempts > 0
    ? articles.reduce(
        (sum, session) => sum + session.accuracy * session.attemptedChars,
        0,
      ) / totalAttempts
    : null;
  const keyAccuracyRows = articles.filter(
    (session) => session.keyAccuracy !== undefined,
  );
  const keyAccuracyWeight = keyAccuracyRows.reduce(
    (sum, session) => sum + (session.keyCount ?? 1),
    0,
  );
  const keyAccuracy = keyAccuracyWeight > 0
    ? keyAccuracyRows.reduce(
        (sum, session) =>
          sum + (session.keyAccuracy ?? 0) * (session.keyCount ?? 1),
        0,
      ) / keyAccuracyWeight
    : null;
  const codeRows = articles.filter(
    (session) =>
      session.theoreticalCodeLength !== undefined &&
      session.theoreticalCodeLength !== null &&
      session.theoreticalCodeLength > 0 &&
      session.codeLength > 0 &&
      (session.correctHanChars ?? session.correctChars) > 0,
  );
  const theoreticalKeys = codeRows.reduce(
    (sum, session) =>
      sum +
      (session.theoreticalCodeLength ?? 0) *
        (session.correctHanChars ?? session.correctChars),
    0,
  );
  const actualKeys = codeRows.reduce(
    (sum, session) =>
      sum +
      session.codeLength *
        (session.correctHanChars ?? session.correctChars),
    0,
  );
  const codeEfficiency = actualKeys > 0
    ? Math.min(1, theoreticalKeys / actualKeys)
    : null;
  const phraseRows = articles.filter((session) => session.phraseRate !== undefined);
  const phraseWeight = phraseRows.reduce(
    (sum, session) => sum + Math.max(1, session.correctChars),
    0,
  );
  const phraseRate = phraseWeight > 0
    ? phraseRows.reduce(
        (sum, session) =>
          sum + (session.phraseRate ?? 0) * Math.max(1, session.correctChars),
        0,
      ) / phraseWeight
    : null;
  const articleSpeeds = articles.map((session) => session.speed);
  const meanSpeed = average(articleSpeeds);
  const speedDeviation =
    meanSpeed !== null && meanSpeed > 0 && articleSpeeds.length >= 2
      ? Math.sqrt(
          articleSpeeds.reduce(
            (sum, value) => sum + (value - meanSpeed) ** 2,
            0,
          ) / articleSpeeds.length,
        ) / meanSpeed
      : null;

  return [
    ability(
      "speed",
      speed === null ? null : (speed / 120) * 100,
      speed === null ? "暂无数据" : `${Math.round(speed)} 字/分`,
      "0–120 字/分",
    ),
    ability(
      "characterAccuracy",
      characterAccuracy === null ? null : ((characterAccuracy - 80) / 20) * 100,
      characterAccuracy === null ? "暂无数据" : `${characterAccuracy.toFixed(1)}%`,
      "80%–100%",
    ),
    ability(
      "keyAccuracy",
      keyAccuracy === null ? null : ((keyAccuracy - 80) / 20) * 100,
      keyAccuracy === null ? "暂无数据" : `${keyAccuracy.toFixed(1)}%`,
      "80%–100%",
    ),
    ability(
      "codeLength",
      codeEfficiency === null ? null : ((codeEfficiency - 0.65) / 0.35) * 100,
      codeEfficiency === null
        ? "暂无数据"
        : `${(codeEfficiency * 100).toFixed(1)}% 理论效率`,
      "理论效率 65%–100%",
    ),
    ability(
      "phrase",
      phraseRate === null ? null : (phraseRate / 60) * 100,
      phraseRate === null ? "暂无数据" : `${phraseRate.toFixed(1)}%`,
      "打词率 0%–60%",
    ),
    ability(
      "stability",
      speedDeviation === null ? null : (1 - speedDeviation / 0.45) * 100,
      speedDeviation === null
        ? "至少需要 2 次文章测速"
        : `速度波动 ${(speedDeviation * 100).toFixed(1)}%`,
      "速度变异系数 45%–0%",
    ),
  ];
}

function activeDayKeys(sessions: SessionResult[]): string[] {
  return [...new Set(sessions.map((session) => localDateKey(new Date(session.date))))]
    .sort();
}

function longestStreak(keys: string[]): number {
  let longest = 0;
  let current = 0;
  let previous = Number.NaN;
  for (const key of keys) {
    const [year, month, date] = key.split("-").map(Number);
    const day = Date.UTC(year, month - 1, date);
    current = day - previous === DAY_MS ? current + 1 : 1;
    longest = Math.max(longest, current);
    previous = day;
  }
  return longest;
}

function weakAreas(errors: ErrorStat[], start: Date, end: Date) {
  const relevant = errors.filter((item) => inRange(item.lastSeen, start, end));
  const letterScores = new Map<string, number>();
  const zoneScores = new Map<string, number>();
  for (const item of relevant) {
    const weight = Math.max(1, item.codingErrors ?? item.count);
    for (const letter of new Set((item.code ?? "").toUpperCase())) {
      const definition = KEYBOARD_KEYS.find((key) => key.code === `Key${letter}`);
      if (!definition?.zone) continue;
      letterScores.set(letter, (letterScores.get(letter) ?? 0) + weight);
      zoneScores.set(definition.zone, (zoneScores.get(definition.zone) ?? 0) + weight);
    }
  }
  const top = (scores: Map<string, number>) =>
    [...scores].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? null;
  return { weakestKey: top(letterScores), weakestZone: top(zoneScores) };
}

function weakestPhraseType(
  opportunities: PhraseOpportunityStat[],
  start: Date,
  end: Date,
): string | null {
  const scores = new Map<number, number>();
  for (const item of opportunities.filter((row) => inRange(row.lastSeen, start, end))) {
    const unresolved = Math.max(0, item.opportunityCount - item.correctCount);
    const practiceMistakes = Math.max(0, item.practiceCount - item.correctCount);
    const score =
      unresolved * Math.max(1, item.savedKeys) + practiceMistakes * 5;
    if (score <= 0) continue;
    scores.set(
      item.characterCount,
      (scores.get(item.characterCount) ?? 0) + score,
    );
  }
  const length = [...scores].sort((left, right) => right[1] - left[1] || left[0] - right[0])[0]?.[0];
  return length ? `${length} 字词组` : null;
}

function recommendations(
  abilities: AbilityDimension[],
  weakestKey: string | null,
  weakestZone: string | null,
  weakestPhrase: string | null,
): WeeklyRecommendation[] {
  const copy: Record<AbilityDimensionId, WeeklyRecommendation> = {
    speed: {
      text: "下周先保持准确率，完成 3 次匀速文章测速。",
      target: "typing",
    },
    characterAccuracy: {
      text: "下周把字准维持在 95% 以上，再逐步提速。",
      target: "review",
    },
    keyAccuracy: {
      text: weakestKey
        ? `下周重点复练 ${weakestKey} 键，减少回改后再提速。`
        : "下周优先减少退格和重复回改。",
      target: "review",
    },
    codeLength: {
      text: "下周完成 2 轮词组专项，优先采用推荐分段。",
      target: "phrase",
    },
    phrase: {
      text: weakestPhrase
        ? `下周安排 ${weakestPhrase} 专项，巩固高收益词组。`
        : "下周从二字词组开始，提高连续打词比例。",
      target: "phrase",
    },
    stability: {
      text: "下周使用固定节奏完成 3 次同长度文章测速。",
      target: "rhythm",
    },
  };
  const ranked = abilities
    .filter((item): item is AbilityDimension & { score: number } => item.score !== null)
    .sort((left, right) => left.score - right.score);
  const result = ranked.slice(0, 2).map((item) => copy[item.id]);
  if (!result.length) {
    result.push({
      text: "先完成 2 次文章测速，建立可比较的周报基线。",
      target: "typing",
    });
  }
  if (weakestZone && !result.some((item) => item.text.includes(weakestZone))) {
    result.push({
      text: `穿插一轮${weakestZone}字根练习，控制在 5 分钟内。`,
      target: "roots",
    });
  }
  return result.slice(0, 3);
}

interface WeeklyReportInput {
  sessions: SessionResult[];
  errors: ErrorStat[];
  phraseOpportunities: PhraseOpportunityStat[];
  now?: Date;
}

export function buildWeeklyReport({
  sessions,
  errors,
  phraseOpportunities,
  now = new Date(),
}: WeeklyReportInput): WeeklyReport {
  const current = getWeekRange(now);
  const previous = getWeekRange(now, -1);
  const currentComparableEnd = new Date(
    Math.min(current.end.getTime(), Math.max(current.start.getTime(), now.getTime())),
  );
  const previousComparableEnd = new Date(currentComparableEnd);
  previousComparableEnd.setDate(previousComparableEnd.getDate() - 7);
  const currentSessions = sessions.filter((item) =>
    inRange(item.date, current.start, currentComparableEnd),
  );
  const previousSessions = sessions.filter((item) =>
    inRange(item.date, previous.start, previousComparableEnd),
  );
  const abilities = calculateAbilityDimensions(currentSessions);
  const previousAbilities = calculateAbilityDimensions(previousSessions);
  const currentMinutes = currentSessions.reduce((sum, item) => sum + item.durationSeconds / 60, 0);
  const previousMinutes = previousSessions.reduce((sum, item) => sum + item.durationSeconds / 60, 0);
  const roundedCurrentMinutes = Math.round(currentMinutes);
  const roundedPreviousMinutes = Math.round(previousMinutes);
  const currentCharacters = currentSessions.reduce((sum, item) => sum + item.correctChars, 0);
  const previousCharacters = previousSessions.reduce((sum, item) => sum + item.correctChars, 0);
  const { weakestKey, weakestZone } = weakAreas(
    errors,
    current.start,
    currentComparableEnd,
  );
  const phraseType = weakestPhraseType(
    phraseOpportunities,
    current.start,
    currentComparableEnd,
  );
  const newWeaknesses = errors
    .filter((item) => inRange(item.firstSeen, current.start, currentComparableEnd))
    .sort((left, right) => right.count - left.count)
    .slice(0, 8)
    .map((item) => item.text);
  const masteredWeaknesses = errors
    .filter(
      (item) =>
        inRange(item.lastCorrect, current.start, currentComparableEnd) &&
        ((item.mastery ?? 0) >= 4 || (item.correctStreak ?? 0) >= 3),
    )
    .slice(0, 8)
    .map((item) => item.text);
  const previousScores = new Map(previousAbilities.map((item) => [item.id, item.score]));
  const abilityChanges = Object.fromEntries(
    abilities.flatMap((item) => {
      const oldScore = previousScores.get(item.id);
      return item.score === null || oldScore === null || oldScore === undefined
        ? []
        : [[item.id, item.score - oldScore]];
    }),
  );

  const inclusiveWeekEnd = new Date(current.end);
  inclusiveWeekEnd.setDate(inclusiveWeekEnd.getDate() - 1);

  return {
    version: 1,
    weekStart: localDateKey(current.start),
    weekEnd: localDateKey(inclusiveWeekEnd),
    sessions: currentSessions.length,
    characters: currentCharacters,
    minutes: roundedCurrentMinutes,
    activeDays: activeDayKeys(currentSessions).length,
    streakDays: longestStreak(activeDayKeys(currentSessions)),
    masteredWeaknesses,
    newWeaknesses,
    weakestKey,
    weakestZone,
    weakestPhraseType: phraseType,
    abilities,
    comparison: {
      sessions: currentSessions.length - previousSessions.length,
      characters: currentCharacters - previousCharacters,
      minutes: roundedCurrentMinutes - roundedPreviousMinutes,
      abilities: abilityChanges,
    },
    recommendations: recommendations(abilities, weakestKey, weakestZone, phraseType),
  };
}
