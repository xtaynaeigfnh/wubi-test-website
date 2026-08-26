import type {
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

const SEASON_SCHEDULE: Array<Pick<AdvancedSeasonDay, "focus" | "title">> = [
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

export function createAdvancedSeason(id: string, now = new Date()): AdvancedSeason {
  const start = new Date(now);
  const expires = addCalendarDays(start, ADVANCED_SEASON_WINDOW_DAYS);
  return {
    version: 1,
    id,
    status: "active",
    startedAt: start.toISOString(),
    expiresAt: expires.toISOString(),
    currentDay: 1,
    days: SEASON_SCHEDULE.map((item, index) => ({
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

export function isAdvancedSeason(value: unknown): value is AdvancedSeason {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const season = value as AdvancedSeason;
  return (
    season.version === 1 &&
    typeof season.id === "string" && season.id.length > 0 && season.id.length <= 160 &&
    ["active", "completed", "expired"].includes(season.status) &&
    isDate(season.startedAt) && isDate(season.expiresAt) &&
    Number.isInteger(season.currentDay) && season.currentDay >= 1 && season.currentDay <= 14 &&
    Array.isArray(season.days) && season.days.length === 14 &&
    season.days.every((day, index) =>
      day.day === index + 1 &&
      day.focus === SEASON_SCHEDULE[index].focus &&
      day.title === SEASON_SCHEDULE[index].title &&
      (day.completedAt === undefined || isDate(day.completedAt)) &&
      (day.sessionId === undefined || (typeof day.sessionId === "string" && day.sessionId.length <= 160)),
    ) &&
    (season.baseline === undefined || isBaseline(season.baseline)) &&
    (season.completedAt === undefined || isDate(season.completedAt))
  );
}

export function isAdvancedSeasonArchive(value: unknown): value is AdvancedSeasonArchive {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const archive = value as AdvancedSeasonArchive;
  return archive.version === 1 &&
    (archive.active === null || (isAdvancedSeason(archive.active) && archive.active.status === "active")) &&
    Array.isArray(archive.history) && archive.history.length <= 6 &&
    archive.history.every((season) => isAdvancedSeason(season) && season.status !== "active");
}

export function expireAdvancedSeason(season: AdvancedSeason, now = new Date()): AdvancedSeason {
  if (season.status !== "active" || now.getTime() < new Date(season.expiresAt).getTime()) return season;
  return { ...season, status: "expired", completedAt: now.toISOString() };
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

export function completeAdvancedSeasonDay(
  season: AdvancedSeason,
  session: SessionResult,
  now = new Date(),
): AdvancedSeason {
  const current = expireAdvancedSeason(season, now);
  if (current.status !== "active") return current;
  if (session.seasonId !== current.id || session.seasonDay !== current.currentDay) return current;
  const dayIndex = current.currentDay - 1;
  if (current.days[dayIndex]?.completedAt) return current;
  const days = current.days.map((day, index) => index === dayIndex
    ? { ...day, completedAt: now.toISOString(), sessionId: session.id }
    : day);
  const finished = current.currentDay === ADVANCED_SEASON_DAYS;
  return {
    ...current,
    days,
    currentDay: finished ? ADVANCED_SEASON_DAYS : current.currentDay + 1,
    status: finished ? "completed" : "active",
    completedAt: finished ? now.toISOString() : undefined,
    baseline: current.baseline ?? (current.currentDay === 1 ? baselineFromSession(session) : undefined),
  };
}

export function archiveFinishedSeason(
  archive: AdvancedSeasonArchive,
  season: AdvancedSeason,
): AdvancedSeasonArchive {
  if (season.status === "active") return { ...archive, active: season };
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
