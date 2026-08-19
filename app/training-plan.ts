import type {
  ArticleProgress,
  DailyTrainingPlan,
  ErrorStat,
  PracticeArticle,
  SessionResult,
  TrainingSummary,
  TrainingTask,
  UserSettings,
  WeakObservation,
  WubiEntry,
} from "./types";

export const WEAKNESS_RESOLVED_SCORE = 120;

export const ROOT_ZONES = [
  { id: "pie", keys: "QWERT", label: "撇区", note: "从撇起笔的字根" },
  { id: "dian", keys: "YUIOP", label: "捺区", note: "点与捺起笔字根" },
  { id: "heng", keys: "ASDFG", label: "横区", note: "横起笔字根" },
  { id: "shu", keys: "HJKLM", label: "竖区", note: "竖起笔字根" },
  { id: "zhe", keys: "XCVBN", label: "折区", note: "折起笔字根" },
] as const;

export interface WeakScore {
  score: number;
  issue: "coding-error" | "hesitation" | "correction";
  reason: string;
}

export interface TrainingPlanInput {
  date: string;
  now?: Date;
  revision?: number;
  articles: PracticeArticle[];
  progress: ArticleProgress[];
  sessions: SessionResult[];
  weakItems: ErrorStat[];
  entries: WubiEntry[];
  preferredLength: UserSettings["preferredLength"];
  excludeArticleIds?: string[];
  excludeItems?: string[];
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizedStat(item: ErrorStat) {
  return {
    codingErrors: item.codingErrors ?? item.count,
    hesitationPoints: item.hesitationPoints ?? 0,
    correctionCount: item.correctionCount ?? 0,
    seenCount: item.seenCount ?? 0,
    correctStreak: item.correctStreak ?? 0,
    mastery: item.mastery ?? 0,
  };
}

export function scoreWeakItem(
  item: ErrorStat,
  now = new Date(),
): WeakScore {
  const stat = normalizedStat(item);
  const coding = Math.min(stat.codingErrors / 5, 1) * 0.5;
  const hesitation = Math.min(stat.hesitationPoints / 6, 1) * 0.3;
  const correction =
    Math.min(Math.max(stat.correctionCount - 1, 0) / 3, 1) * 0.2;
  const ageDays = Math.max(
    0,
    (now.getTime() - new Date(item.lastSeen).getTime()) / 86_400_000,
  );
  const recency = Math.max(0.35, 2 ** (-ageDays / 30));
  const mastery = Math.max(
    0.15,
    ((6 - clamp(stat.mastery, 0, 5)) / 6) *
      0.85 ** clamp(stat.correctStreak, 0, 20),
  );
  const score = Math.round(
    1000 * (coding + hesitation + correction) * recency * mastery,
  );
  const issue =
    coding >= hesitation && coding >= correction
      ? "coding-error"
      : hesitation >= correction
        ? "hesitation"
        : "correction";
  return {
    score,
    issue,
    reason:
      issue === "coding-error"
        ? "近期编码错误较多"
        : issue === "hesitation"
          ? "存在明显卡顿"
          : "多次回改后才完成",
  };
}

function compareWeakItems(
  left: ErrorStat,
  right: ErrorStat,
  now: Date,
) {
  const scoreDifference =
    scoreWeakItem(right, now).score - scoreWeakItem(left, now).score;
  if (scoreDifference) return scoreDifference;
  const recencyDifference = right.lastSeen.localeCompare(left.lastSeen);
  if (recencyDifference) return recencyDifference;
  return left.text.localeCompare(right.text, "zh-Hans-CN-u-co-unihan");
}

function shortestEntries(entries: WubiEntry[]) {
  const preferred = new Map<string, WubiEntry>();
  for (const entry of entries) {
    const existing = preferred.get(entry[0]);
    if (
      !existing ||
      entry[1].length < existing[1].length ||
      (entry[1].length === existing[1].length && entry[2] > existing[2])
    ) {
      preferred.set(entry[0], entry);
    }
  }
  return preferred;
}

function hashSeed(value: string) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededOrder<T>(rows: T[], seed: string, identify: (row: T) => string) {
  return [...rows].sort(
    (left, right) =>
      hashSeed(`${seed}:${identify(left)}`) -
        hashSeed(`${seed}:${identify(right)}`) ||
      identify(left).localeCompare(identify(right)),
  );
}

function selectWeakEntries(
  ranked: ErrorStat[],
  entries: WubiEntry[],
  seed: string,
  excluded: Set<string>,
) {
  const preferred = shortestEntries(entries);
  const candidates = ranked
    .map((item) => {
      const code = item.code?.trim().toLowerCase();
      return (
        preferred.get(item.text) ??
        (code && /^[a-y]{1,4}$/.test(code)
          ? ([item.text, code, 0] as WubiEntry)
          : null)
      );
    })
    .filter((entry): entry is WubiEntry => Boolean(entry));
  const available = candidates.filter(([text]) => !excluded.has(text));
  const source = available.length >= Math.min(10, candidates.length)
    ? available
    : candidates;
  const fixed = source.slice(0, 5);
  const rotating = seededOrder(
    source.slice(5, 30),
    seed,
    ([text]) => text,
  );
  return [...fixed, ...rotating].slice(0, 20);
}

function rootPool(entries: WubiEntry[], keys: string) {
  const keySet = new Set(keys.toLowerCase());
  return Array.from(shortestEntries(entries).values())
    .filter(
      ([text, code, weight]) =>
        Array.from(text).length === 1 &&
        code.length <= 4 &&
        keySet.has(code[0]) &&
        weight >= 100000,
    )
    .sort((left, right) => right[2] - left[2] || left[0].localeCompare(right[0]));
}

function median(values: number[]) {
  if (!values.length) return 50;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function selectArticle(
  input: TrainingPlanInput,
  activeWeak: ErrorStat[],
  seed: string,
) {
  const noHistory = !input.sessions.length && !activeWeak.length;
  let candidates = input.articles.filter(
    (article) => article.kind !== "custom" && article.kind !== "common",
  );
  if (noHistory) {
    candidates = candidates.filter((article) => article.length === "short");
  } else if (input.preferredLength !== "all") {
    const preferred = candidates.filter(
      (article) => article.length === input.preferredLength,
    );
    if (preferred.length) candidates = preferred;
  }
  const excluded = new Set(input.excludeArticleIds ?? []);
  const recent = new Set(
    input.sessions
      .filter((session) => session.type === "article" && session.articleId)
      .slice(0, 10)
      .map((session) => session.articleId as string),
  );
  const fresh = candidates.filter(
    (article) => !recent.has(article.id) && !excluded.has(article.id),
  );
  if (fresh.length) candidates = fresh;
  const progress = new Map(input.progress.map((item) => [item.articleId, item]));
  const ranked = candidates.map((article) => {
    const weakness = activeWeak.slice(0, 20).reduce(
      (sum, item) =>
        sum + (article.text.includes(item.text) ? scoreWeakItem(item, input.now).score : 0),
      0,
    );
    const previous = progress.get(article.id);
    return {
      article,
      score: weakness + (previous ? previous.errors * 10 : 80),
      order: hashSeed(`${seed}:${article.id}`),
    };
  });
  return ranked.sort(
    (left, right) =>
      right.score - left.score ||
      left.order - right.order ||
      left.article.id.localeCompare(right.article.id),
  )[0]?.article ?? null;
}

export function generateDailyTrainingPlan(
  input: TrainingPlanInput,
): DailyTrainingPlan {
  const now = input.now ?? new Date();
  const revision = input.revision ?? 0;
  const seed = `${input.date}:${revision}`;
  const ranked = [...input.weakItems].sort((left, right) =>
    compareWeakItems(left, right, now),
  );
  const activeWeak = ranked.filter(
    (item) => scoreWeakItem(item, now).score >= WEAKNESS_RESOLVED_SCORE,
  );
  const preferredEntries = shortestEntries(input.entries);
  const excludedItems = new Set(input.excludeItems ?? []);
  let reviewItems = selectWeakEntries(
    activeWeak,
    input.entries,
    `${seed}:review`,
    excludedItems,
  );
  const isBaseline = reviewItems.length === 0;
  if (isBaseline) {
    reviewItems = seededOrder(
      Array.from(shortestEntries(input.entries).values())
        .filter(([text, code, weight]) =>
          Array.from(text).length === 1 && code.length <= 4 && weight >= 100000,
        )
        .sort(
          (left, right) =>
            right[2] - left[2] || left[0].localeCompare(right[0]),
        )
        .slice(0, 80),
      `${seed}:baseline`,
      ([text]) => text,
    ).slice(0, 10);
  }

  const zoneScores = ROOT_ZONES.map((zone) => ({
    zone,
    score: activeWeak.reduce((sum, item) => {
      const code = (
        item.code ?? preferredEntries.get(item.text)?.[1]
      )?.toLowerCase();
      return code && zone.keys.toLowerCase().includes(code[0])
        ? sum + scoreWeakItem(item, now).score
        : sum;
    }, 0),
  }));
  const practicedDays = new Set(input.sessions.map((session) => session.date.slice(0, 10))).size;
  const selectedZone = zoneScores.some(({ score }) => score > 0)
    ? zoneScores.sort(
        (left, right) =>
          right.score - left.score || left.zone.id.localeCompare(right.zone.id),
      )[0].zone
    : ROOT_ZONES[(2 + practicedDays) % ROOT_ZONES.length];
  const rootLimit = activeWeak.length ? 20 : 10;
  const rootItems = seededOrder(
    rootPool(input.entries, selectedZone.keys).slice(0, 100),
    `${seed}:roots`,
    ([text]) => text,
  ).slice(0, rootLimit);
  const article = selectArticle(input, activeWeak, `${seed}:article`);
  const articleTargetsWeakness = Boolean(
    article && activeWeak.slice(0, 20).some((item) => article.text.includes(item.text)),
  );
  const recentSpeeds = input.sessions
    .filter((session) => session.type === "article" && session.speed > 0)
    .slice(0, 10)
    .map((session) => session.speed);
  const baselineSpeed = clamp(median(recentSpeeds), 25, 180);
  const articleMinutes = Math.max(
    1,
    Math.ceil((article?.wordCount ?? 100) / baselineSpeed),
  );
  const reviewMinutes = Math.max(1, Math.ceil((reviewItems.length * 6) / 60));
  const rootsMinutes = Math.max(1, Math.ceil((rootItems.length * 5) / 60));
  const tasks: TrainingTask[] = [
    {
      id: `${seed}:article`,
      type: "article",
      status: "pending",
      title: "文章热身",
      reason: articleTargetsWeakness
        ? `文中包含今日优先弱项，先在完整上下文中热手。`
        : activeWeak.length
          ? "先用一篇陌生文章热手，再进入定向弱项复练。"
          : "先完成一篇短文，建立今日的速度与节奏基线。",
      estimatedMinutes: articleMinutes,
      items: [],
      articleId: article?.id,
      articleTitle: article?.title,
      articleWordCount: article?.wordCount,
    },
    {
      id: `${seed}:review`,
      type: "review",
      status: "pending",
      title: isBaseline ? "基础编码复习" : "弱项复练",
      reason: isBaseline
        ? "暂无弱项记录，用高频字建立初始基线。"
        : `${reviewItems.length} 个字词按错误、卡顿和回改综合排序。`,
      estimatedMinutes: reviewMinutes,
      items: reviewItems,
    },
    {
      id: `${seed}:roots`,
      type: "roots",
      status: "pending",
      title: `${selectedZone.label}收尾`,
      reason: activeWeak.length
        ? `${selectedZone.keys} 键区当前弱项总分最高，收尾巩固起笔判断。`
        : `按训练日轮换到 ${selectedZone.keys} 键区，补齐基础覆盖。`,
      estimatedMinutes: rootsMinutes,
      items: rootItems,
      zoneId: selectedZone.id,
      zoneKeys: selectedZone.keys,
    },
  ];
  return {
    version: 1,
    date: input.date,
    revision,
    generatedAt: now.toISOString(),
    estimatedMinutes: tasks.reduce(
      (sum, task) => sum + task.estimatedMinutes,
      0,
    ),
    tasks,
    weakSnapshot: Object.fromEntries(
      ranked.slice(0, 50).map((item) => [item.text, scoreWeakItem(item, now).score]),
    ),
  };
}

export function regenerateIncompleteTasks(
  plan: DailyTrainingPlan,
  input: Omit<TrainingPlanInput, "revision" | "excludeArticleIds" | "excludeItems">,
): DailyTrainingPlan {
  const regenerated = generateDailyTrainingPlan({
    ...input,
    revision: plan.revision + 1,
    excludeArticleIds: plan.tasks
      .map((task) => task.articleId)
      .filter((id): id is string => Boolean(id)),
    excludeItems: plan.tasks.flatMap((task) => task.items.map(([text]) => text)),
  });
  const tasks = regenerated.tasks.map((task) => {
    const completed = plan.tasks.find(
      (current) => current.type === task.type && current.status === "completed",
    );
    return completed ?? task;
  });
  return {
    ...regenerated,
    estimatedMinutes: tasks.reduce((sum, task) => sum + task.estimatedMinutes, 0),
    tasks,
    weakSnapshot: { ...plan.weakSnapshot, ...regenerated.weakSnapshot },
  };
}

export function applyWeakObservations(
  current: ErrorStat[],
  observations: WeakObservation[],
  now = new Date(),
) {
  const byText = new Map<string, WeakObservation[]>();
  for (const observation of observations) {
    if (!observation.text || Array.from(observation.text).length > 20) continue;
    const rows = byText.get(observation.text) ?? [];
    rows.push(observation);
    byText.set(observation.text, rows);
  }
  const items = new Map(current.map((item) => [item.text, { ...item }]));
  for (const [text, rows] of byText) {
    const negative = rows.some((row) => row.kind !== "correct");
    let item = items.get(text);
    if (!item && !negative) continue;
    item ??= {
      text,
      count: 0,
      lastSeen: now.toISOString(),
      mastery: 0,
    };
    const stat = normalizedStat(item);
    const codingErrors = rows.filter((row) => row.kind === "coding-error").length;
    const hesitationPoints = rows
      .filter((row) => row.kind === "hesitation")
      .reduce((sum, row) => sum + clamp(row.severity ?? 1, 1, 3), 0);
    const correctionCount = rows.filter((row) => row.kind === "correction").length;
    item.code = rows.find((row) => row.code)?.code ?? item.code;
    item.codingErrors = stat.codingErrors + codingErrors;
    item.count = item.codingErrors;
    item.hesitationPoints = stat.hesitationPoints + hesitationPoints;
    item.correctionCount = stat.correctionCount + correctionCount;
    item.seenCount = stat.seenCount + 1;
    if (negative) {
      item.mastery = Math.max(0, stat.mastery - 1);
      item.correctStreak = 0;
      item.lastSeen = rows.find((row) => row.occurredAt)?.occurredAt ?? now.toISOString();
    } else {
      item.mastery = Math.min(5, stat.mastery + 1);
      item.correctStreak = stat.correctStreak + 1;
      item.lastCorrect = rows.find((row) => row.occurredAt)?.occurredAt ?? now.toISOString();
    }
    items.set(text, item);
  }
  return Array.from(items.values())
    .sort((left, right) => compareWeakItems(left, right, now))
    .slice(0, 300);
}

export function buildTrainingSummary(
  plan: DailyTrainingPlan,
  weakItems: ErrorStat[],
  sessions: SessionResult[],
  now = new Date(),
): TrainingSummary {
  const currentScores = new Map(
    weakItems.map((item) => [item.text, scoreWeakItem(item, now)]),
  );
  const resolved = Object.entries(plan.weakSnapshot)
    .filter(
      ([text, baseline]) =>
        baseline >= WEAKNESS_RESOLVED_SCORE &&
        (currentScores.get(text)?.score ?? 0) < WEAKNESS_RESOLVED_SCORE,
    )
    .map(([text]) => text);
  const relevantSessions = sessions.filter((session) =>
    plan.tasks.some((task) => task.sessionId === session.id),
  );
  return {
    durationSeconds: relevantSessions.reduce(
      (sum, session) => sum + session.durationSeconds,
      0,
    ),
    rounds: relevantSessions.length,
    resolved,
    remaining: Object.keys(plan.weakSnapshot)
      .map((text) => ({ text, result: currentScores.get(text) }))
      .filter(
        (row): row is { text: string; result: WeakScore } =>
          Boolean(row.result && row.result.score >= WEAKNESS_RESOLVED_SCORE),
      )
      .sort(
        (left, right) =>
          right.result.score - left.result.score ||
          left.text.localeCompare(right.text),
      )
      .slice(0, 5)
      .map(({ text, result }) => ({
        text,
        score: result.score,
        reason: result.reason,
      })),
  };
}
