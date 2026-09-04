import type {
  ErrorStat,
  PhraseOpportunityStat,
  SessionResult,
} from "./types.ts";
import {
  MAX_GHOST_TIMELINE_STORAGE_BYTES,
  MAX_GHOST_TIMELINES,
} from "./ghost-race.ts";
import {
  MAX_RHYTHM_CURVE_BYTES,
  MAX_RHYTHM_CURVE_SESSIONS,
  rhythmCurveByteLength,
  withoutRhythmCurve,
} from "./rhythm-lab.ts";
import {
  MAX_SPACED_REVIEW_ITEMS,
  type SpacedReviewState,
} from "./spaced-review.ts";

export const MAX_SESSION_RESULTS = 500;
export const MAX_HEATMAPS = 50;
export const MAX_PHRASE_OPPORTUNITIES = 120;
export const MAX_MAINTENANCE_EVENTS = 80;
export const MAX_MAINTENANCE_LOG_BYTES = 32 * 1024;

export type MaintenanceEventKind = "migration" | "eviction" | "cleanup";

export interface MaintenanceEvent {
  id: string;
  date: string;
  kind: MaintenanceEventKind;
  summary: string;
}

export interface MaintenanceLog {
  version: 1;
  events: MaintenanceEvent[];
}

export type CleanupTarget =
  | "heatmaps"
  | "ghosts"
  | "rhythm"
  | "phrases"
  | "reviews";

export const CLEANUP_TARGETS: CleanupTarget[] = [
  "heatmaps",
  "ghosts",
  "rhythm",
  "phrases",
  "reviews",
];

export interface StorageUsageItem {
  id: "sessions" | CleanupTarget;
  label: string;
  count: number;
  bytes: number;
  countLimit?: number;
  byteLimit?: number;
  cleanupTarget?: CleanupTarget;
  retention: string;
}

export interface StorageUsageReport {
  totalBytes: number;
  items: StorageUsageItem[];
  warning: string | null;
}

export interface StorageDataSnapshot {
  sessions: SessionResult[];
  phraseOpportunities: PhraseOpportunityStat[];
  reviewState: SpacedReviewState;
  allValues: unknown[];
}

export interface CleanupPreview {
  target: CleanupTarget;
  label: string;
  count: number;
  bytes: number;
  consequence: string;
}

export interface AllCleanupPreview {
  count: number;
  bytes: number;
  labels: string[];
  consequence: string;
}

export interface LightweightStatisticsSummary {
  format: "wubi-test-statistics-summary";
  version: 1;
  exportedAt: string;
  privacy: "不含练习正文、热力图、时间线和逐键事件";
  range: { firstPractice: string | null; lastPractice: string | null };
  totals: {
    sessions: number;
    articleSessions: number;
    characters: number;
    minutes: number;
    errors: number;
    weakItems: number;
    phraseOpportunities: number;
    reviewItems: number;
  };
  byType: Record<string, number>;
}

export function byteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function fieldUsage(
  sessions: SessionResult[],
  field: "heatmap" | "ghostTimeline" | "rhythmSummary",
) {
  const values = sessions.flatMap((session) =>
    session[field] === undefined ? [] : [session[field]],
  );
  return { count: values.length, bytes: byteLength(values) };
}

function rhythmUsage(sessions: SessionResult[]) {
  const summaries = sessions.flatMap((session) => {
    const summary = session.rhythmSummary;
    return summary && (summary.curve.length || summary.weakSegments.length)
      ? [summary]
      : [];
  });
  return {
    count: summaries.length,
    bytes: summaries.reduce(
      (sum, summary) => sum + rhythmCurveByteLength(summary),
      0,
    ),
  };
}

function ratio(item: StorageUsageItem): number {
  return Math.max(
    item.countLimit ? item.count / item.countLimit : 0,
    item.byteLimit ? item.bytes / item.byteLimit : 0,
  );
}

export function buildStorageUsageReport(
  snapshot: StorageDataSnapshot,
): StorageUsageReport {
  const heatmaps = fieldUsage(snapshot.sessions, "heatmap");
  const ghosts = fieldUsage(snapshot.sessions, "ghostTimeline");
  const rhythm = rhythmUsage(snapshot.sessions);
  const items: StorageUsageItem[] = [
    {
      id: "sessions",
      label: "成绩摘要",
      count: snapshot.sessions.length,
      bytes: byteLength(snapshot.sessions),
      countLimit: MAX_SESSION_RESULTS,
      retention: "最多 500 条；超过后先淘汰最早成绩。",
    },
    {
      id: "heatmaps",
      label: "卡顿热力图",
      ...heatmaps,
      countLimit: MAX_HEATMAPS,
      cleanupTarget: "heatmaps",
      retention: "只保留最近 50 份；自动移除旧热力图，成绩摘要保留。",
    },
    {
      id: "ghosts",
      label: "幽灵时间线",
      ...ghosts,
      countLimit: MAX_GHOST_TIMELINES,
      byteLimit: MAX_GHOST_TIMELINE_STORAGE_BYTES,
      cleanupTarget: "ghosts",
      retention: "先按单篇保留个人最佳与最近记录，再按全局数量和体积淘汰旧时间线。",
    },
    {
      id: "rhythm",
      label: "节奏曲线",
      ...rhythm,
      countLimit: MAX_RHYTHM_CURVE_SESSIONS,
      byteLimit: MAX_RHYTHM_CURVE_BYTES,
      cleanupTarget: "rhythm",
      retention: "达到数量或体积上限后移除旧曲线，节奏汇总指标保留。",
    },
    {
      id: "phrases",
      label: "词组机会",
      count: snapshot.phraseOpportunities.length,
      bytes: byteLength(snapshot.phraseOpportunities),
      countLimit: MAX_PHRASE_OPPORTUNITIES,
      cleanupTarget: "phrases",
      retention: "最多 120 条；优先保留未解决、可节省按键多且最近出现的词组。",
    },
    {
      id: "reviews",
      label: "复习队列",
      count: snapshot.reviewState.items.length,
      bytes: byteLength(snapshot.reviewState),
      countLimit: MAX_SPACED_REVIEW_ITEMS,
      byteLimit: 256 * 1024,
      cleanupTarget: "reviews",
      retention: "最多 360 项；优先保留逾期更久、问题更重、预计收益更高的项目。",
    },
  ];
  const nearLimit = items.filter((item) => ratio(item) >= 0.8);
  return {
    totalBytes: snapshot.allValues.reduce<number>(
      (sum, value) => sum + byteLength(value),
      0,
    ),
    items,
    warning: nearLimit.length
      ? `${nearLimit.map((item) => item.label).join("、")}已使用至少 80% 的保留额度；系统会按下方规则自动淘汰旧数据。`
      : null,
  };
}

export function previewCleanup(
  target: CleanupTarget,
  snapshot: StorageDataSnapshot,
): CleanupPreview {
  const item = buildStorageUsageReport(snapshot).items.find(
    (entry) => entry.cleanupTarget === target,
  );
  const consequences: Record<CleanupTarget, string> = {
    heatmaps: "历史成绩、趋势、周报和累计指标保留；旧成绩将不再显示卡顿位置。",
    ghosts: "历史成绩、趋势和个人最佳摘要保留；需要重新完成同篇练习才能再次幽灵挑战。",
    rhythm: "节奏汇总指标保留；旧成绩将不再显示曲线点和弱节奏片段。",
    phrases: "成绩与周报保留；词组专项会从后续练习重新积累推荐机会。",
    reviews: "成绩与弱项统计保留；到期日期和复习阶段会在下次同步时从现有弱项重新建立。",
  };
  return {
    target,
    label: item?.label ?? target,
    count: item?.count ?? 0,
    bytes: item?.bytes ?? 0,
    consequence: consequences[target],
  };
}

export function previewAllCleanup(
  snapshot: StorageDataSnapshot,
): AllCleanupPreview {
  const previews = CLEANUP_TARGETS.map((target) =>
    previewCleanup(target, snapshot),
  ).filter((preview) => preview.count > 0);
  return {
    count: previews.reduce((sum, preview) => sum + preview.count, 0),
    bytes: previews.reduce((sum, preview) => sum + preview.bytes, 0),
    labels: previews.map((preview) => preview.label),
    consequence:
      "成绩摘要、趋势、周报和累计指标保留；热力图、幽灵时间线、节奏曲线、词组机会与复习队列会被清除。",
  };
}

export function stripSessionLargeObjects(
  sessions: SessionResult[],
  target: Extract<CleanupTarget, "heatmaps" | "ghosts" | "rhythm">,
): SessionResult[] {
  return sessions.map((session) => {
    if (target === "heatmaps" && session.heatmap) {
      const next = { ...session };
      delete next.heatmap;
      return next;
    }
    if (target === "ghosts" && session.ghostTimeline) {
      const next = { ...session };
      delete next.ghostTimeline;
      return next;
    }
    if (
      target === "rhythm" &&
      session.rhythmSummary &&
      (session.rhythmSummary.curve.length ||
        session.rhythmSummary.weakSegments.length)
    ) {
      return {
        ...session,
        rhythmSummary: withoutRhythmCurve(session.rhythmSummary),
      };
    }
    return session;
  });
}

export function isMaintenanceLog(value: unknown): value is MaintenanceLog {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const log = value as Partial<MaintenanceLog>;
  if (log.version !== 1 || !Array.isArray(log.events)) return false;
  if (log.events.length > MAX_MAINTENANCE_EVENTS) return false;
  const valid = log.events.every(
    (event) =>
      event &&
      typeof event === "object" &&
      typeof event.id === "string" &&
      event.id.length > 0 &&
      event.id.length <= 160 &&
      typeof event.date === "string" &&
      Number.isFinite(Date.parse(event.date)) &&
      ["migration", "eviction", "cleanup"].includes(event.kind) &&
      typeof event.summary === "string" &&
      event.summary.length > 0 &&
      Array.from(event.summary).length <= 160,
  );
  return valid && byteLength(value) <= MAX_MAINTENANCE_LOG_BYTES;
}

export function appendMaintenanceEvent(
  log: MaintenanceLog | null,
  event: MaintenanceEvent,
): MaintenanceLog {
  const events = [event, ...(log?.events ?? [])].slice(0, MAX_MAINTENANCE_EVENTS);
  while (events.length && byteLength({ version: 1, events }) > MAX_MAINTENANCE_LOG_BYTES) {
    events.pop();
  }
  return { version: 1, events };
}

export function createLightweightStatisticsSummary(
  sessions: SessionResult[],
  errors: ErrorStat[],
  phraseOpportunities: PhraseOpportunityStat[],
  reviewState: SpacedReviewState,
  now = new Date(),
): LightweightStatisticsSummary {
  const dates = sessions.map((session) => session.date).sort();
  const byType: Record<string, number> = {};
  for (const session of sessions) {
    byType[session.type] = (byType[session.type] ?? 0) + 1;
  }
  return {
    format: "wubi-test-statistics-summary",
    version: 1,
    exportedAt: now.toISOString(),
    privacy: "不含练习正文、热力图、时间线和逐键事件",
    range: {
      firstPractice: dates[0] ?? null,
      lastPractice: dates.at(-1) ?? null,
    },
    totals: {
      sessions: sessions.length,
      articleSessions: sessions.filter((session) => session.type === "article").length,
      characters: sessions.reduce((sum, session) => sum + session.correctChars, 0),
      minutes: Math.round(
        sessions.reduce((sum, session) => sum + session.durationSeconds, 0) / 60,
      ),
      errors: sessions.reduce((sum, session) => sum + session.errors, 0),
      weakItems: errors.length,
      phraseOpportunities: phraseOpportunities.length,
      reviewItems: reviewState.items.length,
    },
    byType,
  };
}
