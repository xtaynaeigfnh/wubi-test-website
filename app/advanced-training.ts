import type {
  AdvancedAssessmentIdentity,
  AdvancedAssessmentMetrics,
  AdvancedAssessmentSnapshot,
  AdvancedGoalMetric,
  AdvancedScenario,
  AdvancedSeason,
  AdvancedSeasonArchive,
  AdvancedSeasonBaseline,
  AdvancedSeasonDay,
  PracticeArticle,
  SessionResult,
} from "./types.ts";

export const ADVANCED_SEASON_DAYS = 14;
export const ADVANCED_SEASON_WINDOW_DAYS = 21;

const ASSESSMENT_CONDITIONS = {
  version: 1,
  textNormalization: "nfc-without-whitespace",
  timingPolicy: "active-foreground-time",
  completionPolicy: "full-text",
} as const;

const FOURTEEN_DAY_SCHEDULE: Array<Pick<AdvancedSeasonDay, "focus" | "title">> = [
  { focus: "baseline", title: "建立个人节奏基线" },
  { focus: "startup", title: "缩短启动前的停顿" },
  { focus: "stability", title: "保持均匀上屏节奏" },
  { focus: "switching", title: "观察左右手切换" },
  { focus: "recovery", title: "卡顿后平稳恢复" },
  { focus: "retest", title: "第一次同条件复测" },
  { focus: "daily", title: "日常中文短句" },
  { focus: "office", title: "办公中文段落" },
  { focus: "literature", title: "文学长文耐力" },
  { focus: "adaptive", title: "回到最需要巩固的场景" },
  { focus: "restore", title: "低强度恢复日" },
  { focus: "integrated", title: "节奏与实战综合练习" },
  { focus: "prepare", title: "安静准备最终复测" },
  { focus: "final", title: "最终同条件复测" },
];

const SEVEN_DAY_SCHEDULE: Array<Pick<AdvancedSeasonDay, "focus" | "title">> = [
  { focus: "baseline", title: "建立个人节奏基线" },
  { focus: "startup", title: "缩短启动前的停顿" },
  { focus: "stability", title: "保持均匀上屏节奏" },
  { focus: "recovery", title: "卡顿后平稳恢复" },
  { focus: "integrated", title: "节奏与实战综合练习" },
  { focus: "retest", title: "第一次同条件复测" },
  { focus: "final", title: "最终同条件复测" },
];

export const ADVANCED_GOAL_LABELS: Record<AdvancedGoalMetric, string> = {
  speed: "速度",
  characterAccuracy: "字准",
  keyAccuracy: "键准",
  codeLength: "码长",
  phrase: "打词",
  stability: "稳定性",
};

function scheduleForDuration(durationDays: 7 | 14) {
  return durationDays === 7 ? SEVEN_DAY_SCHEDULE : FOURTEEN_DAY_SCHEDULE;
}

export function getAdvancedSeasonDuration(season: AdvancedSeason): 7 | 14 {
  return season.durationDays ?? 14;
}

export function normalizeScenarioText(text: string): string {
  return Array.from(text.normalize("NFC"))
    .filter((character) => /[\p{Script=Han}\s，。！？]/u.test(character))
    .join("")
    .replace(/[ \t]+/g, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export function isValidScenario(scenario: AdvancedScenario): boolean {
  const length = Array.from(scenario.text.replace(/\s/g, "")).length;
  const lengthValid = scenario.category === "daily"
    ? scenario.text.split("\n").filter(Boolean).length >= 8 && scenario.text.split("\n").filter(Boolean).length <= 12
    : scenario.category === "office"
      ? length >= 250 && length <= 400
      : length >= 600 && length <= 900;
  return (
    scenario.version === 1 &&
    /^[a-z0-9-]{1,80}$/.test(scenario.id) &&
    scenario.title.length > 0 &&
    scenario.title.length <= 40 &&
    Number.isInteger(scenario.suggestedMinutes) &&
    scenario.suggestedMinutes >= 3 &&
    scenario.suggestedMinutes <= 15 &&
    lengthValid &&
    /^[\p{Script=Han}\s，。！？]+$/u.test(scenario.text)
  );
}

function sentence(text: string): string {
  const normalized = normalizeScenarioText(text).replace(/\n/g, "");
  const match = normalized.match(/^[^。！？]{8,40}[。！？]/u);
  return match?.[0] ?? `${Array.from(normalized).slice(0, 28).join("")}。`;
}

function boundedPassage(articles: PracticeArticle[], minimum: number, maximum: number): string {
  let text = "";
  for (const article of articles) {
    text += normalizeScenarioText(article.text).replace(/\n/g, "");
    if (Array.from(text).length >= minimum) break;
  }
  const characters = Array.from(text).slice(0, maximum);
  while (characters.length > minimum && !/[。！？]/u.test(characters.at(-1) ?? "")) {
    characters.pop();
  }
  return characters.join("");
}

export function buildAdvancedScenarioLibrary(articles: PracticeArticle[]): AdvancedScenario[] {
  const short = articles.filter((item) => item.length === "short");
  const medium = articles.filter((item) => item.length === "medium");
  const long = articles.filter((item) => item.length === "long");
  const scenarios: AdvancedScenario[] = [
    {
      id: "quiet-daily-one",
      version: 1,
      category: "daily",
      title: "日常短句 · 从容启动",
      text: short.slice(0, 10).map((item) => sentence(item.text)).join("\n"),
      suggestedMinutes: 6,
    },
    {
      id: "quiet-daily-two",
      version: 1,
      category: "daily",
      title: "日常短句 · 平稳回应",
      text: short.slice(10, 20).map((item) => sentence(item.text)).join("\n"),
      suggestedMinutes: 6,
    },
    {
      id: "quiet-office-one",
      version: 1,
      category: "office",
      title: "办公段落 · 清楚交接",
      text: boundedPassage(medium.slice(0, 3), 280, 360),
      suggestedMinutes: 10,
    },
    {
      id: "quiet-office-two",
      version: 1,
      category: "office",
      title: "办公段落 · 安静推进",
      text: boundedPassage(medium.slice(3, 6), 280, 360),
      suggestedMinutes: 10,
    },
    {
      id: "quiet-literature-one",
      version: 1,
      category: "literature",
      title: "文学长文 · 林间夜读",
      text: boundedPassage(long.slice(0, 2), 680, 820),
      suggestedMinutes: 12,
    },
    {
      id: "quiet-literature-two",
      version: 1,
      category: "literature",
      title: "文学长文 · 河岸微光",
      text: boundedPassage(long.slice(2, 4), 680, 820),
      suggestedMinutes: 12,
    },
  ];
  return scenarios.filter(isValidScenario);
}

function addCalendarDays(date: Date, count: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + count);
  return next;
}

function hashText(value: string): string {
  let hash = 0x811c9dc5;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function buildAdvancedAssessmentIdentity(input: {
  id: string;
  version: number;
  text: string;
}): AdvancedAssessmentIdentity {
  const normalized = input.text.normalize("NFC").replace(/\s/g, "");
  const characterCount = Array.from(normalized).length;
  return {
    scenarioId: input.id,
    scenarioVersion: input.version,
    contentFingerprint: `${characterCount}-${hashText(normalized)}`,
    characterCount,
    conditions: ASSESSMENT_CONDITIONS,
  };
}

export function assessmentMetricsFromSession(
  session: SessionResult,
): AdvancedAssessmentMetrics {
  return {
    speed: session.speed,
    characterAccuracy: session.accuracy,
    keyAccuracy: session.keyAccuracy ?? null,
    codeLength: session.codeLength > 0 ? session.codeLength : null,
    phraseRate: session.phraseRate ?? null,
    stability: session.rhythmSummary?.variationPercent ?? null,
  };
}

export function getAdvancedGoalValue(
  metrics: AdvancedAssessmentMetrics,
  metric: AdvancedGoalMetric,
): number | null {
  if (metric === "characterAccuracy") return metrics.characterAccuracy;
  if (metric === "phrase") return metrics.phraseRate;
  return metrics[metric];
}

function rounded(value: number, digits = 2) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

export function suggestAdvancedGoalRange(
  metric: AdvancedGoalMetric,
  baselineValue: number | null,
) {
  if (baselineValue === null || !Number.isFinite(baselineValue)) return null;
  if (metric === "speed") {
    return { targetMin: rounded(baselineValue * 1.03, 1), targetMax: rounded(baselineValue * 1.08, 1) };
  }
  if (metric === "characterAccuracy" || metric === "keyAccuracy") {
    return {
      targetMin: rounded(Math.min(100, baselineValue + 0.5), 1),
      targetMax: rounded(Math.min(100, baselineValue + 2), 1),
    };
  }
  if (metric === "phrase") {
    return {
      targetMin: rounded(Math.min(100, baselineValue + 2), 1),
      targetMax: rounded(Math.min(100, baselineValue + 8), 1),
    };
  }
  if (metric === "codeLength") {
    return {
      targetMin: rounded(Math.max(0, baselineValue - 0.15)),
      targetMax: rounded(Math.max(0, baselineValue - 0.05)),
    };
  }
  return {
    targetMin: rounded(Math.max(0, baselineValue * 0.85), 1),
    targetMax: rounded(Math.max(0, baselineValue * 0.95), 1),
  };
}

export function createAdvancedSeason(
  id: string,
  now = new Date(),
  options: { durationDays?: 7 | 14; goalMetric?: AdvancedGoalMetric } = {},
): AdvancedSeason {
  const start = new Date(now);
  const durationDays = options.durationDays ?? 14;
  const expires = addCalendarDays(
    start,
    durationDays === 14 ? ADVANCED_SEASON_WINDOW_DAYS : 10,
  );
  return {
    version: 1,
    id,
    status: "active",
    startedAt: start.toISOString(),
    expiresAt: expires.toISOString(),
    currentDay: 1,
    durationDays,
    calendarDayPolicy: "one-per-local-day",
    goal: {
      version: 1,
      metric: options.goalMetric ?? "speed",
    },
    assessment: { version: 1, snapshots: [] },
    pausedDurationMs: 0,
    days: scheduleForDuration(durationDays).map((item, index) => ({
      day: index + 1,
      ...item,
    })),
  };
}

function isDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(new Date(value).getTime());
}

function isBaseline(value: unknown): value is AdvancedSeasonBaseline {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const baseline = value as AdvancedSeasonBaseline;
  return [baseline.speed, baseline.accuracy].every((item) =>
    typeof item === "number" && Number.isFinite(item) && item >= 0,
  ) && [baseline.variationPercent, baseline.startupMs, baseline.recoveryMs].every((item) =>
    item === null || (typeof item === "number" && Number.isFinite(item) && item >= 0),
  );
}

function isOptionalMetric(value: unknown, maximum = 1_000_000): boolean {
  return value === null || (
    typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= maximum
  );
}

export function isAdvancedAssessmentIdentity(value: unknown): value is AdvancedAssessmentIdentity {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const identity = value as AdvancedAssessmentIdentity;
  const conditions = identity.conditions;
  return (
    typeof identity.scenarioId === "string" && identity.scenarioId.length > 0 && identity.scenarioId.length <= 160 &&
    Number.isInteger(identity.scenarioVersion) && identity.scenarioVersion >= 1 && identity.scenarioVersion <= 1_000_000 &&
    typeof identity.contentFingerprint === "string" && /^\d{1,4}-[0-9a-z]+$/.test(identity.contentFingerprint) &&
    Number.isInteger(identity.characterCount) && identity.characterCount >= 1 && identity.characterCount <= 5000 &&
    Number(identity.contentFingerprint.split("-", 1)[0]) === identity.characterCount &&
    (conditions === undefined || (
      Boolean(conditions) && typeof conditions === "object" && !Array.isArray(conditions) &&
      conditions.version === 1 &&
      conditions.textNormalization === "nfc-without-whitespace" &&
      conditions.timingPolicy === "active-foreground-time" &&
      conditions.completionPolicy === "full-text"
    ))
  );
}

export function isCurrentAdvancedAssessmentIdentity(
  value: unknown,
): value is AdvancedAssessmentIdentity & { conditions: typeof ASSESSMENT_CONDITIONS } {
  return isAdvancedAssessmentIdentity(value) && value.conditions !== undefined;
}

function isAssessmentMetrics(value: unknown): value is AdvancedAssessmentMetrics {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const metrics = value as AdvancedAssessmentMetrics;
  return (
    isOptionalMetric(metrics.speed) && metrics.speed !== null &&
    isOptionalMetric(metrics.characterAccuracy, 100) && metrics.characterAccuracy !== null &&
    isOptionalMetric(metrics.keyAccuracy, 100) &&
    isOptionalMetric(metrics.codeLength, 100) &&
    isOptionalMetric(metrics.phraseRate, 100) &&
    isOptionalMetric(metrics.stability, 10_000)
  );
}

function isAssessmentSnapshot(value: unknown, durationDays: number): value is AdvancedAssessmentSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const snapshot = value as AdvancedAssessmentSnapshot;
  return (
    snapshot.version === 1 &&
    Number.isInteger(snapshot.day) && snapshot.day >= 1 && snapshot.day <= durationDays &&
    typeof snapshot.sessionId === "string" && snapshot.sessionId.length > 0 && snapshot.sessionId.length <= 160 &&
    isDate(snapshot.recordedAt) &&
    isAdvancedAssessmentIdentity(snapshot.identity) &&
    isAssessmentMetrics(snapshot.metrics)
  );
}

function isGoal(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const goal = value as AdvancedSeason["goal"];
  if (!goal || goal.version !== 1 || !Object.hasOwn(ADVANCED_GOAL_LABELS, goal.metric)) return false;
  const maximum = goal.metric === "speed"
    ? 10_000
    : goal.metric === "stability"
      ? 10_000
      : goal.metric === "codeLength"
        ? 100
        : 100;
  const valuesValid = [goal.baselineValue, goal.targetMin, goal.targetMax].every(
    (item) => item === undefined || (typeof item === "number" && Number.isFinite(item) && item >= 0 && item <= maximum),
  );
  const targetFields = [goal.baselineValue, goal.targetMin, goal.targetMax];
  const hasNoTarget = targetFields.every((item) => item === undefined);
  const hasCompleteTarget = targetFields.every((item) => item !== undefined);
  return valuesValid && (hasNoTarget || hasCompleteTarget) && (
    !hasCompleteTarget || (goal.targetMin as number) <= (goal.targetMax as number)
  );
}

function isAssessment(value: unknown, durationDays: number): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const assessment = value as NonNullable<AdvancedSeason["assessment"]>;
  if (
    assessment.version !== 1 ||
    !Array.isArray(assessment.snapshots) ||
    assessment.snapshots.length > durationDays ||
    !assessment.snapshots.every((snapshot) => isAssessmentSnapshot(snapshot, durationDays)) ||
    (assessment.invalidatedAt !== undefined && !isDate(assessment.invalidatedAt)) ||
    (assessment.invalidationReason !== undefined && (
      typeof assessment.invalidationReason !== "string" || assessment.invalidationReason.length > 200
    ))
  ) return false;
  return (
    new Set(assessment.snapshots.map((item) => item.day)).size === assessment.snapshots.length &&
    new Set(assessment.snapshots.map((item) => item.sessionId)).size === assessment.snapshots.length
  );
}

export function isAdvancedSeason(value: unknown): value is AdvancedSeason {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const season = value as AdvancedSeason;
  if (
    season.version !== 1 ||
    typeof season.id !== "string" || season.id.length === 0 || season.id.length > 160 ||
    !["active", "paused", "completed", "cancelled", "expired", "invalidated"].includes(season.status) ||
    (season.durationDays !== undefined && season.durationDays !== 7 && season.durationDays !== 14) ||
    (season.calendarDayPolicy !== undefined && season.calendarDayPolicy !== "one-per-local-day") ||
    !isDate(season.startedAt) || !isDate(season.expiresAt) ||
    !Array.isArray(season.days) ||
    !season.days.every((day) => Boolean(day) && typeof day === "object" && !Array.isArray(day))
  ) return false;
  const durationDays = season.durationDays ?? 14;
  const schedule = scheduleForDuration(durationDays);
  const isOpen = season.status === "active" || season.status === "paused";
  const startedAt = new Date(season.startedAt).getTime();
  const expiresAt = new Date(season.expiresAt).getTime();
  const completedAt = season.completedAt === undefined
    ? null
    : new Date(season.completedAt).getTime();
  const completedDays = Array.isArray(season.days)
    ? season.days.filter((day) => day.completedAt !== undefined)
    : [];
  const completedCount = completedDays.length;
  const completedPrefix = Array.isArray(season.days) && season.days.every(
    (day, index) => index < completedCount
      ? day.completedAt !== undefined && Boolean(day.sessionId)
      : day.completedAt === undefined && day.sessionId === undefined,
  );
  const sessionIds = completedDays.map((day) => day.sessionId);
  const sessionIdsUnique = new Set(sessionIds).size === sessionIds.length;
  const completedTimestamps = completedDays.map((day) => new Date(day.completedAt!).getTime());
  const completedDatesChronological = completedTimestamps.every(
    (timestamp, index) => index === 0 || timestamp > completedTimestamps[index - 1],
  );
  const completedCalendarDaysUnique = new Set(
    completedDays.map((day) => day.completedLocalDate ?? localCalendarDay(new Date(day.completedAt!))),
  ).size === completedDays.length;
  const completionTimelineConsistent = completedAt === null || completedTimestamps.every(
    (timestamp) => timestamp <= completedAt,
  );
  const progressConsistent = season.status === "completed"
    ? completedCount === durationDays && season.currentDay === durationDays
    : completedCount < durationDays && season.currentDay === completedCount + 1;
  const assessmentSnapshots = season.assessment && Array.isArray(season.assessment.snapshots)
    ? season.assessment.snapshots
    : [];
  const snapshotByDay = new Map(
    assessmentSnapshots.map((snapshot) => [snapshot.day, snapshot]),
  );
  const isVersionEightSeason = season.durationDays !== undefined;
  const assessmentConsistent = !isVersionEightSeason || (
    Boolean(season.goal) && Boolean(season.assessment) &&
    season.assessment!.snapshots.length === completedCount &&
    completedDays.every((day) => {
      const snapshot = snapshotByDay.get(day.day);
      return snapshot !== undefined &&
        snapshot.sessionId === day.sessionId &&
        snapshot.recordedAt === day.completedAt;
    })
  );
  return (
    isDate(season.startedAt) && isDate(season.expiresAt) && startedAt < expiresAt &&
    Number.isInteger(season.currentDay) && season.currentDay >= 1 && season.currentDay <= durationDays &&
    Array.isArray(season.days) && season.days.length === durationDays &&
    season.days.every((day, index) =>
      day.day === index + 1 &&
      day.focus === schedule[index].focus &&
      day.title === schedule[index].title &&
      (day.completedAt === undefined || (
        isDate(day.completedAt) &&
        new Date(day.completedAt).getTime() >= startedAt &&
        new Date(day.completedAt).getTime() < expiresAt
      )) &&
      (day.completedLocalDate === undefined || (
        day.completedAt !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(day.completedLocalDate)
      )) &&
      (day.sessionId === undefined || (typeof day.sessionId === "string" && day.sessionId.length > 0 && day.sessionId.length <= 160)),
    ) &&
    (season.goal === undefined || isGoal(season.goal)) &&
    (season.assessment === undefined || isAssessment(season.assessment, durationDays)) &&
    (season.pausedDurationMs === undefined || (
      typeof season.pausedDurationMs === "number" && Number.isFinite(season.pausedDurationMs) && season.pausedDurationMs >= 0
    )) &&
    (season.status === "paused" ? isDate(season.pausedAt) : season.pausedAt === undefined) &&
    (season.baseline === undefined || isBaseline(season.baseline)) &&
    (season.completedAt === undefined || (
      isDate(season.completedAt) && completedAt !== null && completedAt >= startedAt
    )) &&
    (season.status !== "expired" || (completedAt !== null && completedAt >= expiresAt)) &&
    (season.status !== "completed" || completedAt === completedTimestamps.at(-1)) &&
    (season.assessment?.invalidatedAt === undefined || season.status === "invalidated") &&
    (season.status !== "invalidated" || isLegacyAdvancedSeason(season) || season.assessment?.invalidatedAt !== undefined) &&
    (isOpen ? season.completedAt === undefined : season.completedAt !== undefined) &&
    completedPrefix && sessionIdsUnique && completedDatesChronological &&
    (season.calendarDayPolicy === undefined || completedCalendarDaysUnique) &&
    completionTimelineConsistent &&
    progressConsistent && assessmentConsistent
  );
}

export function isAdvancedSeasonArchive(value: unknown): value is AdvancedSeasonArchive {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const archive = value as AdvancedSeasonArchive;
  const seasons = [archive.active, ...(Array.isArray(archive.history) ? archive.history : [])]
    .filter((season): season is AdvancedSeason => season !== null);
  return archive.version === 1 &&
    (archive.active === null || (
      isAdvancedSeason(archive.active) && ["active", "paused"].includes(archive.active.status)
    )) &&
    Array.isArray(archive.history) && archive.history.length <= 6 &&
    archive.history.every((season) =>
      isAdvancedSeason(season) && !["active", "paused"].includes(season.status)
    ) && new Set(seasons.map((season) => season.id)).size === seasons.length;
}

export function expireAdvancedSeason(season: AdvancedSeason, now = new Date()): AdvancedSeason {
  if (season.status !== "active" || now.getTime() < new Date(season.expiresAt).getTime()) return season;
  return { ...season, status: "expired", completedAt: now.toISOString() };
}

function localCalendarDay(value: Date): string {
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${value.getFullYear()}-${month}-${day}`;
}

export function canCompleteAdvancedSeasonToday(
  season: AdvancedSeason,
  now = new Date(),
): boolean {
  if (season.status !== "active" || now.getTime() >= new Date(season.expiresAt).getTime()) {
    return false;
  }
  const lastCompleted = [...season.days].reverse().find((day) => day.completedAt);
  const lastLocalDate = lastCompleted?.completedLocalDate ?? (
    lastCompleted ? localCalendarDay(new Date(lastCompleted.completedAt!)) : null
  );
  return !lastLocalDate || lastLocalDate !== localCalendarDay(now);
}

export function isLegacyAdvancedSeason(season: AdvancedSeason): boolean {
  return season.durationDays === undefined && season.goal === undefined && season.assessment === undefined;
}

export function pauseAdvancedSeason(season: AdvancedSeason, now = new Date()): AdvancedSeason {
  const current = expireAdvancedSeason(season, now);
  if (current.status !== "active") return current;
  return { ...current, status: "paused", pausedAt: now.toISOString() };
}

export function resumeAdvancedSeason(season: AdvancedSeason, now = new Date()): AdvancedSeason {
  if (season.status !== "paused" || !season.pausedAt) return season;
  const pausedMs = Math.max(0, now.getTime() - new Date(season.pausedAt).getTime());
  return {
    ...season,
    status: "active",
    expiresAt: new Date(new Date(season.expiresAt).getTime() + pausedMs).toISOString(),
    pausedAt: undefined,
    pausedDurationMs: (season.pausedDurationMs ?? 0) + pausedMs,
  };
}

export function cancelAdvancedSeason(season: AdvancedSeason, now = new Date()): AdvancedSeason {
  const current = season.status === "active" ? expireAdvancedSeason(season, now) : season;
  if (current.status !== "active" && current.status !== "paused") return current;
  const pausedMs = current.status === "paused" && current.pausedAt
    ? Math.max(0, now.getTime() - new Date(current.pausedAt).getTime())
    : 0;
  return {
    ...current,
    status: "cancelled",
    pausedAt: undefined,
    pausedDurationMs: (current.pausedDurationMs ?? 0) + pausedMs,
    completedAt: now.toISOString(),
  };
}

function sameAssessmentIdentity(
  left: AdvancedAssessmentIdentity,
  right: AdvancedAssessmentIdentity,
) {
  if (!left.conditions || !right.conditions) return false;
  return left.scenarioId === right.scenarioId &&
    left.scenarioVersion === right.scenarioVersion &&
    left.contentFingerprint === right.contentFingerprint &&
    left.characterCount === right.characterCount &&
    left.conditions.version === right.conditions.version &&
    left.conditions.textNormalization === right.conditions.textNormalization &&
    left.conditions.timingPolicy === right.conditions.timingPolicy &&
    left.conditions.completionPolicy === right.conditions.completionPolicy;
}

export function invalidateAdvancedSeasonForContent(
  season: AdvancedSeason,
  currentIdentity: AdvancedAssessmentIdentity,
  now = new Date(),
): AdvancedSeason {
  const current = season.status === "active" ? expireAdvancedSeason(season, now) : season;
  if (current.status !== "active" && current.status !== "paused") return current;
  if (isLegacyAdvancedSeason(current)) {
    return {
      ...current,
      status: "invalidated",
      pausedAt: undefined,
      completedAt: now.toISOString(),
    };
  }
  const baseline = current.assessment?.snapshots.find((item) => item.day === 1);
  if (!baseline || sameAssessmentIdentity(baseline.identity, currentIdentity)) return current;
  return {
    ...current,
    status: "invalidated",
    pausedAt: undefined,
    completedAt: now.toISOString(),
    assessment: {
      version: 1,
      snapshots: current.assessment?.snapshots ?? [],
      invalidatedAt: now.toISOString(),
      invalidationReason: "评测正文的版本或内容已经变化，旧周期仅保留只读摘要。",
    },
  };
}

function baselineFromSession(session: SessionResult): AdvancedSeasonBaseline {
  return {
    speed: session.speed,
    accuracy: session.accuracy,
    variationPercent: session.rhythmSummary?.variationPercent ?? null,
    startupMs: session.rhythmSummary?.startupMs ?? null,
    recoveryMs: session.rhythmSummary?.recoveryMs ?? null,
  };
}

function snapshotFromSession(session: SessionResult, recordedAt = session.date): AdvancedAssessmentSnapshot | null {
  if (!session.assessmentIdentity || !session.seasonDay) return null;
  return {
    version: 1,
    day: session.seasonDay,
    sessionId: session.id,
    recordedAt,
    identity: session.assessmentIdentity,
    metrics: assessmentMetricsFromSession(session),
  };
}

export function completeAdvancedSeasonDay(
  season: AdvancedSeason,
  session: SessionResult,
  now = new Date(),
): AdvancedSeason {
  const current = expireAdvancedSeason(season, now);
  if (current.status !== "active") return current;
  if (isLegacyAdvancedSeason(current)) {
    return { ...current, status: "invalidated", completedAt: now.toISOString() };
  }
  if (session.seasonId !== current.id || session.seasonDay !== current.currentDay) return current;
  const sessionTime = new Date(session.date).getTime();
  if (
    !isCurrentAdvancedAssessmentIdentity(session.assessmentIdentity) ||
    !Number.isFinite(sessionTime) ||
    sessionTime !== now.getTime() ||
    sessionTime < new Date(current.startedAt).getTime() ||
    !canCompleteAdvancedSeasonToday(current, now)
  ) return current;
  const dayIndex = current.currentDay - 1;
  if (current.days[dayIndex]?.completedAt) return current;
  const completedAt = now.toISOString();
  const days = current.days.map((day, index) => index === dayIndex
    ? { ...day, completedAt, completedLocalDate: localCalendarDay(now), sessionId: session.id }
    : day);
  const durationDays = getAdvancedSeasonDuration(current);
  const finished = current.currentDay === durationDays;
  const snapshot = snapshotFromSession(session, completedAt);
  const snapshots = snapshot
    ? [
        ...(current.assessment?.snapshots ?? []).filter((item) => item.day !== snapshot.day),
        snapshot,
      ].sort((left, right) => left.day - right.day)
    : current.assessment?.snapshots ?? [];
  const baselineMetrics = current.currentDay === 1 && snapshot
    ? snapshot.metrics
    : null;
  const baselineValue = current.goal && baselineMetrics
    ? getAdvancedGoalValue(baselineMetrics, current.goal.metric)
    : null;
  const targetRange = current.goal && current.currentDay === 1
    ? suggestAdvancedGoalRange(current.goal.metric, baselineValue)
    : null;
  return {
    ...current,
    days,
    currentDay: finished ? durationDays : current.currentDay + 1,
    status: finished ? "completed" : "active",
    completedAt: finished ? now.toISOString() : undefined,
    assessment: { version: 1, snapshots },
    goal: current.goal && current.currentDay === 1
      ? {
          ...current.goal,
          ...(baselineValue === null ? {} : { baselineValue }),
          ...(targetRange ?? {}),
        }
      : current.goal,
    baseline: current.baseline ?? (current.currentDay === 1 ? baselineFromSession(session) : undefined),
  };
}

export function archiveFinishedSeason(
  archive: AdvancedSeasonArchive,
  season: AdvancedSeason,
): AdvancedSeasonArchive {
  if (season.status === "active" || season.status === "paused") {
    return { ...archive, active: season };
  }
  return {
    version: 1,
    active: null,
    history: [season, ...archive.history.filter((item) => item.id !== season.id)].slice(0, 6),
  };
}

export function selectWeakestScenarioCategory(
  season: AdvancedSeason,
  sessions: SessionResult[],
): "daily" | "office" | "literature" {
  const resultByDay = new Map(
    season.days
      .filter((day) => day.sessionId)
      .map((day) => [day.day, sessions.find((session) => session.id === day.sessionId)]),
  );
  const daily = resultByDay.get(7);
  const office = resultByDay.get(8);
  const literature = resultByDay.get(9);
  const dailyScore = daily
    ? ((daily.rhythmSummary?.startupMs ?? 800) / 800) +
      ((daily.rhythmSummary?.recoveryMs ?? 600) / 600)
    : Number.POSITIVE_INFINITY;
  const officeScore = office
    ? ((100 - office.accuracy) / 5) + (office.codeLength / 3)
    : Number.POSITIVE_INFINITY;
  const firstHalf = literature?.rhythmSummary?.firstHalfMedianMs;
  const secondHalf = literature?.rhythmSummary?.secondHalfMedianMs;
  const decay = firstHalf && secondHalf
    ? Math.max(0, (secondHalf - firstHalf) / firstHalf)
    : 1;
  const literatureScore = literature
    ? ((literature.rhythmSummary?.variationPercent ?? 30) / 30) + decay
    : Number.POSITIVE_INFINITY;
  const scores = [
    ["daily", dailyScore],
    ["office", officeScore],
    ["literature", literatureScore],
  ] as const;
  return scores.reduce((weakest, current) => current[1] > weakest[1] ? current : weakest)[0];
}

function average(values: Array<number | null>) {
  const available = values.filter((value): value is number => value !== null);
  return available.length
    ? available.reduce((sum, value) => sum + value, 0) / available.length
    : null;
}

export interface AdvancedSeasonEvaluation {
  status: "missing-baseline" | "in-progress" | "comparable" | "invalidated" | "legacy";
  baseline: AdvancedAssessmentSnapshot | null;
  final: AdvancedAssessmentSnapshot | null;
  stageRetest: AdvancedAssessmentSnapshot | null;
  retests: AdvancedAssessmentSnapshot[];
  processSampleCount: number;
  processAverage: number | null;
  primaryBaseline: number | null;
  primaryFinal: number | null;
  primaryDelta: number | null;
  targetReached: boolean | null;
  confidence: "insufficient" | "limited" | "moderate";
  tradeoffs: {
    characterAccuracy: "protected" | "cost" | "unavailable";
    keyAccuracy: "protected" | "cost" | "unavailable";
    codeLength: "protected" | "cost" | "unavailable";
  };
  message: string;
}

function protection(
  baseline: number | null,
  final: number | null,
  maximumLoss: number,
  lowerIsBetter = false,
): "protected" | "cost" | "unavailable" {
  if (baseline === null || final === null) return "unavailable";
  return lowerIsBetter
    ? final <= baseline + maximumLoss ? "protected" : "cost"
    : final >= baseline - maximumLoss ? "protected" : "cost";
}

export function buildAdvancedSeasonEvaluation(
  season: AdvancedSeason,
  currentIdentity?: AdvancedAssessmentIdentity,
): AdvancedSeasonEvaluation {
  const snapshots = season.assessment?.snapshots ?? [];
  const baseline = snapshots.find((item) => item.day === 1) ?? null;
  const durationDays = getAdvancedSeasonDuration(season);
  const final = snapshots.find((item) => item.day === durationDays) ?? null;
  const unavailable = {
    characterAccuracy: "unavailable" as const,
    keyAccuracy: "unavailable" as const,
    codeLength: "unavailable" as const,
  };
  if (!season.assessment && season.baseline) {
    const legacyMetric = season.goal?.metric ?? "speed";
    const legacyBaseline = legacyMetric === "speed"
      ? season.baseline.speed
      : legacyMetric === "characterAccuracy"
        ? season.baseline.accuracy
        : legacyMetric === "stability"
          ? season.baseline.variationPercent
          : null;
    return {
      status: "legacy",
      baseline: null,
      final: null,
      stageRetest: null,
      retests: [],
      processSampleCount: 0,
      processAverage: null,
      primaryBaseline: legacyBaseline,
      primaryFinal: null,
      primaryDelta: null,
      targetReached: null,
      confidence: "insufficient",
      tradeoffs: unavailable,
      message: "旧周期缺少正文身份，只保留历史摘要，不用于判断是否提升。",
    };
  }
  if (!baseline) {
    return {
      status: "missing-baseline",
      baseline: null,
      final,
      stageRetest: null,
      retests: [],
      processSampleCount: snapshots.length,
      processAverage: null,
      primaryBaseline: null,
      primaryFinal: null,
      primaryDelta: null,
      targetReached: null,
      confidence: "insufficient",
      tradeoffs: unavailable,
      message: "尚未完成首日基线，暂不判断提升。",
    };
  }
  const invalidated = Boolean(
    season.assessment?.invalidatedAt ||
    (currentIdentity && !sameAssessmentIdentity(baseline.identity, currentIdentity)) ||
    (final && !sameAssessmentIdentity(baseline.identity, final.identity)),
  );
  const metric = season.goal?.metric ?? "speed";
  const process = snapshots.filter((item) => item.day > 1 && item.day < durationDays);
  const retests = snapshots.filter((item) =>
    item.day > 1 && sameAssessmentIdentity(item.identity, baseline.identity)
  );
  const stageRetestDay = season.days.find((day) => day.focus === "retest")?.day;
  const stageRetestCandidate = stageRetestDay
    ? snapshots.find((item) => item.day === stageRetestDay) ?? null
    : null;
  const stageRetest = stageRetestCandidate &&
    sameAssessmentIdentity(stageRetestCandidate.identity, baseline.identity)
    ? stageRetestCandidate
    : null;
  const primaryBaseline = getAdvancedGoalValue(baseline.metrics, metric);
  const primaryFinal = final ? getAdvancedGoalValue(final.metrics, metric) : null;
  const tradeoffs = final ? {
    characterAccuracy: final.metrics.characterAccuracy < 95
      ? "cost" as const
      : protection(
          baseline.metrics.characterAccuracy,
          final.metrics.characterAccuracy,
          1,
        ),
    keyAccuracy: protection(baseline.metrics.keyAccuracy, final.metrics.keyAccuracy, 1),
    codeLength: protection(baseline.metrics.codeLength, final.metrics.codeLength, 0.05, true),
  } : unavailable;
  const targetReached = !final || invalidated || primaryFinal === null || !season.goal ||
    season.goal.targetMin === undefined || season.goal.targetMax === undefined
    ? null
    : primaryFinal >= season.goal.targetMin && primaryFinal <= season.goal.targetMax;
  const confidence = retests.length >= 2
    ? "moderate"
    : final ? "limited" : "insufficient";
  return {
    status: invalidated ? "invalidated" : final ? "comparable" : "in-progress",
    baseline,
    final,
    stageRetest,
    retests,
    processSampleCount: process.length,
    processAverage: average(process.map((item) => getAdvancedGoalValue(item.metrics, metric))),
    primaryBaseline,
    primaryFinal,
    primaryDelta: primaryBaseline === null || primaryFinal === null
      ? null
      : primaryFinal - primaryBaseline,
    targetReached,
    confidence,
    tradeoffs,
    message: invalidated
      ? "评测正文的版本或内容不一致，旧结果仅作为只读摘要。"
      : final
        ? confidence === "moderate"
          ? "基线、阶段复测与最终复测条件一致；结果仍只代表本周期。"
          : "只有一次可比复测，样本较少，结果仅供观察。"
        : ["cancelled", "expired"].includes(season.status)
          ? "周期未完成，已有基线和过程记录仅作为只读摘要。"
          : "周期仍在进行，只展示过程观察，不声称已经提升。",
  };
}

export function seasonComparison(
  baseline: AdvancedSeasonBaseline | undefined,
  session: SessionResult | null,
) {
  if (!baseline || !session) return null;
  const accuracyProtected = session.accuracy >= 95 && session.accuracy >= baseline.accuracy - 1;
  const rhythm = session.rhythmSummary;
  return {
    accuracyProtected,
    speedPercent: baseline.speed > 0 ? ((session.speed - baseline.speed) / baseline.speed) * 100 : null,
    accuracyPoints: session.accuracy - baseline.accuracy,
    variationPoints:
      rhythm?.variationPercent === null || rhythm?.variationPercent === undefined || baseline.variationPercent === null
        ? null
        : baseline.variationPercent - rhythm.variationPercent,
    startupMs:
      rhythm?.startupMs === null || rhythm?.startupMs === undefined || baseline.startupMs === null
        ? null
        : baseline.startupMs - rhythm.startupMs,
    recoveryMs:
      rhythm?.recoveryMs === null || rhythm?.recoveryMs === undefined || baseline.recoveryMs === null
        ? null
        : baseline.recoveryMs - rhythm.recoveryMs,
  };
}
