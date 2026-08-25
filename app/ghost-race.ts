import type {
  GhostTimeline,
  PracticeArticle,
  SessionResult,
} from "./types";

export const MAX_GHOST_SAMPLES = 220;
export const MAX_GHOST_TIMELINES = 90;
export const MAX_GHOST_TIMELINE_BYTES = 12 * 1024;
export const MAX_GHOST_TIMELINE_STORAGE_BYTES = 512 * 1024;

export interface GhostArticleIdentity {
  articleKey: string;
  articleVersion: number;
  contentFingerprint: string;
  characterCount: number;
}

export interface GhostProgressPoint {
  characterCount: number;
  elapsedMs: number;
}

export interface GhostSegmentComparison {
  start: number;
  end: number;
  changeMs: number;
  result: "recovered" | "lost" | "steady";
}

export function ghostTimelineByteLength(timeline: GhostTimeline): number {
  return new TextEncoder().encode(JSON.stringify(timeline)).byteLength;
}

function hashText(value: string): string {
  let hash = 0x811c9dc5;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function getGhostArticleIdentity(
  article: PracticeArticle,
): GhostArticleIdentity | null {
  if (article.kind === "common") return null;
  const text = article.text.replace(/[\r\n]/g, "");
  const characterCount = Array.from(text).length;
  if (!characterCount || !Number.isInteger(article.version) || article.version < 1) {
    return null;
  }
  return {
    articleKey:
      article.kind === "custom" ? `custom:${article.id}` : `builtin:${article.id}`,
    articleVersion: article.version,
    contentFingerprint: `${characterCount}-${hashText(text)}`,
    characterCount,
  };
}

export function getGhostSampleStep(characterCount: number): number {
  return Math.max(5, Math.ceil(characterCount / (MAX_GHOST_SAMPLES - 1)));
}

export function buildGhostTimeline(
  identity: GhostArticleIdentity,
  points: GhostProgressPoint[],
): GhostTimeline | null {
  const normalized = points
    .filter(
      (point) =>
        Number.isInteger(point.characterCount) &&
        point.characterCount > 0 &&
        point.characterCount <= identity.characterCount &&
        Number.isFinite(point.elapsedMs) &&
        point.elapsedMs >= 0,
    )
    .sort(
      (left, right) =>
        left.characterCount - right.characterCount ||
        left.elapsedMs - right.elapsedMs,
    );
  if (!normalized.length) return null;

  const step = getGhostSampleStep(identity.characterCount);
  const samples: GhostTimeline["samples"] = [];
  let nextCharacter = step;
  let lastElapsedMs = 0;
  for (const point of normalized) {
    const characterCount = Math.max(
      samples.at(-1)?.[0] ?? 0,
      point.characterCount,
    );
    const elapsedMs = Math.max(lastElapsedMs, Math.round(point.elapsedMs));
    const isFinal = characterCount === identity.characterCount;
    if (characterCount < nextCharacter && !isFinal) continue;
    const previous = samples.at(-1);
    if (previous?.[0] === characterCount) {
      previous[1] = elapsedMs;
    } else {
      samples.push([characterCount, elapsedMs]);
    }
    lastElapsedMs = elapsedMs;
    nextCharacter = characterCount + step;
  }
  const finalPoint = normalized.findLast(
    (point) => point.characterCount === identity.characterCount,
  );
  if (!finalPoint) return null;
  if (samples.at(-1)?.[0] !== identity.characterCount) {
    samples.push([
      identity.characterCount,
      Math.max(lastElapsedMs, Math.round(finalPoint.elapsedMs)),
    ]);
  }
  if (samples.length > MAX_GHOST_SAMPLES) return null;
  const timeline: GhostTimeline = {
    version: 1,
    ...identity,
    step,
    samples,
  };
  return ghostTimelineByteLength(timeline) <= MAX_GHOST_TIMELINE_BYTES
    ? timeline
    : null;
}

function interpolate(
  timeline: GhostTimeline,
  input: number,
  inputIndex: 0 | 1,
  outputIndex: 0 | 1,
): number {
  const points: Array<[number, number]> = [[0, 0], ...timeline.samples];
  if (input <= 0) return 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const next = points[index];
    if (input > next[inputIndex]) continue;
    if (inputIndex === 1 && input === next[inputIndex]) {
      let furthest = index;
      while (
        furthest + 1 < points.length &&
        points[furthest + 1][inputIndex] === input
      ) {
        furthest += 1;
      }
      return points[furthest][outputIndex];
    }
    const span = next[inputIndex] - previous[inputIndex];
    if (span <= 0) return next[outputIndex];
    const ratio = (input - previous[inputIndex]) / span;
    return previous[outputIndex] +
      (next[outputIndex] - previous[outputIndex]) * ratio;
  }
  return points.at(-1)?.[outputIndex] ?? 0;
}

export function getGhostPositionAtElapsed(
  timeline: GhostTimeline,
  elapsedMs: number,
): number {
  return Math.min(
    timeline.characterCount,
    interpolate(timeline, elapsedMs, 1, 0),
  );
}

export function getGhostElapsedAtProgress(
  timeline: GhostTimeline,
  characterCount: number,
): number {
  return interpolate(timeline, characterCount, 0, 1);
}

function matchesIdentity(
  timeline: GhostTimeline | undefined,
  identity: GhostArticleIdentity,
): timeline is GhostTimeline {
  return Boolean(
    timeline &&
      timeline.articleKey === identity.articleKey &&
      timeline.articleVersion === identity.articleVersion &&
      timeline.contentFingerprint === identity.contentFingerprint &&
      timeline.characterCount === identity.characterCount,
  );
}

function comparePersonalBest(left: SessionResult, right: SessionResult): number {
  return (
    right.speed - left.speed ||
    right.accuracy - left.accuracy ||
    left.durationSeconds - right.durationSeconds ||
    compareRecent(left, right) ||
    left.id.localeCompare(right.id)
  );
}

function compareRecent(left: SessionResult, right: SessionResult): number {
  return (
    Date.parse(right.date) - Date.parse(left.date) ||
    right.date.localeCompare(left.date) ||
    left.id.localeCompare(right.id)
  );
}

export function selectGhostSessions(
  sessions: SessionResult[],
  identity: GhostArticleIdentity,
): { best: SessionResult | null; recent: SessionResult | null } {
  const matches = sessions
    .filter(
      (session) =>
        session.type === "article" &&
        matchesIdentity(session.ghostTimeline, identity),
    )
    .sort(compareRecent);
  return {
    recent: matches[0] ?? null,
    best: [...matches].sort(comparePersonalBest)[0] ?? null,
  };
}

export function pruneGhostTimelines(sessions: SessionResult[]): SessionResult[] {
  const grouped = new Map<string, SessionResult[]>();
  for (const session of sessions) {
    const timeline = session.ghostTimeline;
    if (!timeline) continue;
    const current = grouped.get(timeline.articleKey) ?? [];
    current.push(session);
    grouped.set(timeline.articleKey, current);
  }

  const retainedGroups: SessionResult[][] = [];
  for (const rows of grouped.values()) {
    const newest = [...rows].sort(compareRecent)[0];
    const newestTimeline = newest.ghostTimeline;
    if (!newestTimeline) continue;
    const matching = rows.filter((row) =>
      matchesIdentity(row.ghostTimeline, newestTimeline),
    );
    const recent = [...matching]
      .sort(compareRecent)
      .slice(0, 2);
    const best = [...matching].sort(comparePersonalBest)[0];
    const group = [...new Set([...recent, best].filter(Boolean))].sort(
      compareRecent,
    );
    retainedGroups.push(group);
  }

  const globallyRetained = new Set<SessionResult>();
  let retainedBytes = 0;
  for (const group of retainedGroups.sort((left, right) =>
    compareRecent(left[0], right[0]),
  )) {
    const groupBytes = group.reduce(
      (sum, session) =>
        sum +
        (session.ghostTimeline
          ? ghostTimelineByteLength(session.ghostTimeline)
          : 0),
      0,
    );
    if (
      globallyRetained.size + group.length > MAX_GHOST_TIMELINES ||
      retainedBytes + groupBytes > MAX_GHOST_TIMELINE_STORAGE_BYTES
    ) {
      continue;
    }
    for (const session of group) globallyRetained.add(session);
    retainedBytes += groupBytes;
  }
  return sessions.map((session) => {
    if (!session.ghostTimeline || globallyRetained.has(session)) return session;
    const summary = { ...session };
    delete summary.ghostTimeline;
    return summary;
  });
}

export function compareGhostSegments(
  current: GhostTimeline,
  ghost: GhostTimeline,
  paragraphBoundaries: number[] = [],
): GhostSegmentComparison[] {
  const normalizedBoundaries = [
    ...new Set(
      paragraphBoundaries.filter(
        (value) =>
          Number.isInteger(value) && value > 0 && value <= current.characterCount,
      ),
    ),
  ]
    .sort((left, right) => left - right)
    .filter((value) => value < current.characterCount)
    .slice(0, 9);
  normalizedBoundaries.push(current.characterCount);
  const fallbackSegmentCount = Math.min(5, current.characterCount);
  const boundaries =
    normalizedBoundaries.length > 1
      ? normalizedBoundaries
      : Array.from({ length: fallbackSegmentCount }, (_, index) =>
          Math.round(
            (current.characterCount * (index + 1)) / fallbackSegmentCount,
          ),
        );
  let previousGap = 0;
  let previousEnd = 0;
  return boundaries.map((end) => {
    const start = previousEnd;
    previousEnd = end;
    const currentElapsed = getGhostElapsedAtProgress(current, end);
    const ghostElapsed = getGhostElapsedAtProgress(ghost, end);
    const gap = currentElapsed - ghostElapsed;
    const changeMs = gap - previousGap;
    previousGap = gap;
    return {
      start,
      end,
      changeMs,
      result:
        Math.abs(changeMs) < 100
          ? "steady"
          : changeMs < 0
            ? "recovered"
            : "lost",
    };
  });
}
