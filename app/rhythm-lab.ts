import type {
  RhythmCurvePoint,
  RhythmSummary,
  RhythmWeakSegment,
} from "./types.ts";

export interface PhysicalRhythmSample {
  elapsedMs: number;
  hand: "left" | "right";
}

const MAX_CURVE_POINTS = 32;
const MAX_INTERVAL_MS = 10 * 60 * 1000;
export const MAX_PHYSICAL_RHYTHM_SAMPLES = 10_000;
export const MAX_RHYTHM_CURVE_SESSIONS = 120;
export const MAX_RHYTHM_CURVE_BYTES = 384 * 1024;

function bounded(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.max(0, Math.min(MAX_INTERVAL_MS, value)));
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function percentile(values: number[], ratio: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1);
  return sorted[Math.max(0, index)];
}

function compressCurve(delays: number[]): RhythmCurvePoint[] {
  if (!delays.length) return [];
  const bucketSize = Math.max(1, Math.ceil(delays.length / MAX_CURVE_POINTS));
  const points: RhythmCurvePoint[] = [];
  for (let start = 0; start < delays.length; start += bucketSize) {
    const bucket = delays.slice(start, start + bucketSize).filter((value) => value > 0);
    const value = median(bucket);
    if (value === null) continue;
    points.push({
      characterCount: Math.min(delays.length, start + bucketSize),
      intervalMs: bounded(value),
    });
  }
  return points.slice(0, MAX_CURVE_POINTS);
}

function weakSegments(text: string, delays: number[]): RhythmWeakSegment[] {
  const characters = Array.from(text.replace(/[\r\n]/g, ""));
  if (characters.length < 8) return [];
  const candidates = delays
    .map((delayMs, start) => ({ start, delayMs: bounded(delayMs) }))
    .filter((item) => item.delayMs > 0)
    .sort((left, right) => right.delayMs - left.delayMs || left.start - right.start);
  const selected: RhythmWeakSegment[] = [];
  for (const candidate of candidates) {
    const contextStart = Math.max(0, Math.min(candidate.start - 4, characters.length - 8));
    const length = Math.min(15, Math.max(8, characters.length - contextStart));
    if (selected.some((item) => Math.abs(item.start - contextStart) < 6)) continue;
    selected.push({
      start: contextStart,
      text: characters.slice(contextStart, contextStart + length).join(""),
      delayMs: candidate.delayMs,
    });
    if (selected.length === 3) break;
  }
  return selected;
}

function fastestTen(delays: number[]): number | null {
  if (delays.length < 10) return null;
  let fastest = Number.POSITIVE_INFINITY;
  for (let index = 0; index <= delays.length - 10; index += 1) {
    const window = delays.slice(index, index + 10);
    if (window.some((value) => value <= 0)) continue;
    const duration = window.reduce((sum, value) => sum + value, 0);
    if (duration > 0) fastest = Math.min(fastest, duration);
  }
  return Number.isFinite(fastest) ? Math.round(600_000 / fastest) : null;
}

function recovery(delays: number[], baseline: number | null, p90: number | null): number | null {
  if (baseline === null || p90 === null || delays.length < 4) return null;
  const recoveries: number[] = [];
  delays.forEach((delay, index) => {
    if (delay < p90 || delay <= baseline * 1.5) return;
    let total = 0;
    for (let cursor = index + 1; cursor < delays.length; cursor += 1) {
      total += delays[cursor];
      const window = delays.slice(cursor, cursor + 3);
      if (
        window.length === 3 &&
        window.every((value) => value > 0 && value <= baseline * 1.35)
      ) {
        recoveries.push(total);
        break;
      }
    }
  });
  const value = median(recoveries);
  return value === null ? null : bounded(value);
}

function physicalMedians(samples: PhysicalRhythmSample[]) {
  const same: number[] = [];
  const cross: number[] = [];
  for (let index = 1; index < samples.length; index += 1) {
    const interval = samples[index].elapsedMs - samples[index - 1].elapsedMs;
    if (interval <= 0 || interval > MAX_INTERVAL_MS) continue;
    (samples[index].hand === samples[index - 1].hand ? same : cross).push(interval);
  }
  return {
    sameHandMedianMs: median(same),
    crossHandMedianMs: median(cross),
  };
}

export function buildRhythmSummary({
  text,
  delays,
  physicalSamples = [],
}: {
  text: string;
  delays: number[];
  physicalSamples?: PhysicalRhythmSample[];
}): RhythmSummary {
  const characterCount = Array.from(text.replace(/[\r\n]/g, "")).length;
  const normalized = Array.from({ length: characterCount }, (_, index) => bounded(delays[index] ?? 0));
  const positive = normalized.filter((value) => value > 0);
  const baseline = median(positive);
  const p90 = percentile(positive, 0.9);
  const absoluteDeviations = baseline === null
    ? []
    : positive.map((value) => Math.abs(value - baseline));
  const deviation = median(absoluteDeviations);
  const middle = Math.ceil(normalized.length / 2);
  const physical = physicalMedians(physicalSamples);
  return {
    version: 1,
    characterCount,
    startupMs: positive[0] === undefined ? null : positive[0],
    medianIntervalMs: baseline === null ? null : bounded(baseline),
    p90IntervalMs: p90 === null ? null : bounded(p90),
    fastestTenCpm: fastestTen(normalized),
    variationPercent:
      baseline === null || baseline === 0 || deviation === null
        ? null
        : Math.round((deviation / baseline) * 1000) / 10,
    recoveryMs: recovery(normalized, baseline, p90),
    firstHalfMedianMs: median(normalized.slice(0, middle).filter((value) => value > 0)),
    secondHalfMedianMs: median(normalized.slice(middle).filter((value) => value > 0)),
    sameHandMedianMs: physical.sameHandMedianMs === null ? null : bounded(physical.sameHandMedianMs),
    crossHandMedianMs: physical.crossHandMedianMs === null ? null : bounded(physical.crossHandMedianMs),
    curve: compressCurve(normalized),
    weakSegments: weakSegments(text, normalized),
  };
}

export function rhythmCurveByteLength(summary: RhythmSummary): number {
  return new TextEncoder().encode(JSON.stringify({
    curve: summary.curve,
    weakSegments: summary.weakSegments,
  })).byteLength;
}

export function withoutRhythmCurve(summary: RhythmSummary): RhythmSummary {
  return { ...summary, curve: [], weakSegments: [] };
}

function finiteOrNull(value: unknown, maximum = MAX_INTERVAL_MS): boolean {
  return value === null ||
    (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= maximum);
}

export function isRhythmSummary(value: unknown): value is RhythmSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const summary = value as RhythmSummary;
  return (
    summary.version === 1 &&
    Number.isInteger(summary.characterCount) && summary.characterCount >= 1 && summary.characterCount <= 5000 &&
    finiteOrNull(summary.startupMs) &&
    finiteOrNull(summary.medianIntervalMs) &&
    finiteOrNull(summary.p90IntervalMs) &&
    finiteOrNull(summary.fastestTenCpm, 100_000) &&
    finiteOrNull(summary.variationPercent, 10_000) &&
    finiteOrNull(summary.recoveryMs) &&
    finiteOrNull(summary.firstHalfMedianMs) &&
    finiteOrNull(summary.secondHalfMedianMs) &&
    finiteOrNull(summary.sameHandMedianMs) &&
    finiteOrNull(summary.crossHandMedianMs) &&
    Array.isArray(summary.curve) && summary.curve.length <= MAX_CURVE_POINTS &&
    summary.curve.every((point, index) =>
      Number.isInteger(point.characterCount) && point.characterCount >= 1 && point.characterCount <= summary.characterCount &&
      (index === 0 || point.characterCount > summary.curve[index - 1].characterCount) &&
      Number.isInteger(point.intervalMs) && point.intervalMs >= 0 && point.intervalMs <= MAX_INTERVAL_MS,
    ) &&
    Array.isArray(summary.weakSegments) && summary.weakSegments.length <= 3 &&
    summary.weakSegments.every((segment) =>
      Number.isInteger(segment.start) && segment.start >= 0 && segment.start < summary.characterCount &&
      typeof segment.text === "string" && Array.from(segment.text).length >= 8 && Array.from(segment.text).length <= 15 &&
      segment.start + Array.from(segment.text).length <= summary.characterCount &&
      Number.isInteger(segment.delayMs) && segment.delayMs >= 0 && segment.delayMs <= MAX_INTERVAL_MS,
    )
  );
}

export function pruneRhythmCurves<T extends { date: string; rhythmSummary?: RhythmSummary }>(sessions: T[]): T[] {
  let retained = 0;
  let bytes = 0;
  return sessions.map((session) => {
    const summary = session.rhythmSummary;
    if (!summary || (!summary.curve.length && !summary.weakSegments.length)) return session;
    const size = rhythmCurveByteLength(summary);
    if (retained < MAX_RHYTHM_CURVE_SESSIONS && bytes + size <= MAX_RHYTHM_CURVE_BYTES) {
      retained += 1;
      bytes += size;
      return session;
    }
    return { ...session, rhythmSummary: withoutRhythmCurve(summary) };
  });
}
