"use client";

import { useId, type ReactNode } from "react";
import { buildHesitationPracticeTarget } from "../hesitation-practice";
import { getHesitationLevel } from "../typing-metrics";
import type {
  HesitationPracticeTarget,
  HesitationSegment,
  SessionResult,
  TypingHeatmap,
} from "../types";

const levelLabels = ["顺畅", "轻微", "明显", "严重"] as const;

function formatDelay(delayMs: number) {
  return delayMs >= 1000
    ? `${(delayMs / 1000).toFixed(1)} 秒`
    : `${Math.round(delayMs)} 毫秒`;
}

function segmentContext(text: string, segment: HesitationSegment) {
  const characters = Array.from(text.replace(/[\r\n]/g, ""));
  const start = Math.max(0, segment.start - 4);
  const end = Math.min(characters.length, segment.start + segment.length + 4);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < characters.length ? "…" : "";
  return `${prefix}${characters.slice(start, end).join("")}${suffix}`;
}

function targetState(
  target: HesitationPracticeTarget,
  source: SessionResult,
  queuedFingerprints?: ReadonlySet<string>,
  masteredAtByFingerprint?: ReadonlyMap<string, string>,
) {
  const queued = queuedFingerprints?.has(target.fingerprint) ?? false;
  const masteredAt = masteredAtByFingerprint?.get(target.fingerprint);
  const reproduced = Boolean(
    masteredAt && Date.parse(masteredAt) < Date.parse(source.date),
  );
  return {
    queued,
    label: reproduced
      ? "问题复现"
      : masteredAt
        ? "已暂时掌握"
        : queued
          ? "已加入今日加练"
          : "",
  };
}

function SegmentActions({
  target,
  source,
  queuedFingerprints,
  masteredAtByFingerprint,
  onPractice,
  onAddToQueue,
}: {
  target: HesitationPracticeTarget;
  source: SessionResult;
  queuedFingerprints?: ReadonlySet<string>;
  masteredAtByFingerprint?: ReadonlyMap<string, string>;
  onPractice?: (target: HesitationPracticeTarget) => void;
  onAddToQueue?: (target: HesitationPracticeTarget) => void;
}) {
  const state = targetState(
    target,
    source,
    queuedFingerprints,
    masteredAtByFingerprint,
  );
  if (!onPractice && !onAddToQueue && !state.label) return null;
  return (
    <div className="hesitation-segment-actions">
      {state.label ? (
        <span className="hesitation-segment-status">
          <i aria-hidden="true">{state.label === "问题复现" ? "!" : "✓"}</i>
          {state.label}
        </span>
      ) : null}
      {onPractice ? (
        <button type="button" onClick={() => onPractice(target)}>
          练这一段
        </button>
      ) : null}
      {onAddToQueue ? (
        <button
          type="button"
          disabled={state.queued}
          onClick={() => onAddToQueue(target)}
        >
          {state.queued ? "已加入" : "加入今日加练"}
        </button>
      ) : null}
    </div>
  );
}

export function HesitationHeatmap({
  heatmap,
  source,
  compact = false,
  onPractice,
  onAddToQueue,
  queuedFingerprints,
  masteredAtByFingerprint,
}: {
  heatmap: TypingHeatmap;
  source?: SessionResult;
  compact?: boolean;
  onPractice?: (target: HesitationPracticeTarget) => void;
  onAddToQueue?: (target: HesitationPracticeTarget) => void;
  queuedFingerprints?: ReadonlySet<string>;
  masteredAtByFingerprint?: ReadonlyMap<string, string>;
}) {
  const titleId = useId();
  const segments = [...heatmap.segments].sort(
    (left, right) => left.start - right.start,
  );
  const hotspots = [...segments]
    .sort((left, right) => right.delayMs - left.delayMs || left.start - right.start)
    .slice(0, 5);
  const interactive = Boolean(source && (onPractice || onAddToQueue));
  const normalizedText = heatmap.text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const heatmapLabel = heatmap.segments.length
    ? `文章卡顿位置热力图，共 ${heatmap.segments.length} 处明显卡顿`
    : "文章卡顿位置热力图，本轮没有明显卡顿";

  const passage: ReactNode[] = [];
  const visibleCharacters = Array.from(normalizedText);
  let targetIndex = 0;
  let visibleIndex = 0;
  while (visibleIndex < visibleCharacters.length) {
    const character = visibleCharacters[visibleIndex];
    if (character === "\n") {
      passage.push(<br key={`${visibleIndex}-break`} />);
      visibleIndex += 1;
      continue;
    }
    const index = targetIndex;
    const segment = segments.find(
      (row) => index >= row.start && index < row.start + row.length,
    );
    const level = segment
      ? getHesitationLevel(segment.delayMs, heatmap.thresholdMs)
      : 0;
    if (!segment || level === 0 || !interactive || !source) {
      passage.push(
        <mark
          className={`heat-level-${level}`}
          title={
            segment
              ? `第 ${index + 1} 字，${levelLabels[level]}卡顿，${formatDelay(segment.delayMs)}`
              : `第 ${index + 1} 字，顺畅`
          }
          key={`${visibleIndex}-${character}`}
        >
          {character}
        </mark>,
      );
      targetIndex += 1;
      visibleIndex += 1;
      continue;
    }
    const segmentKey = `${segment.start}-${segment.length}`;
    const chunk: string[] = [];
    const segmentEnd = segment.start + segment.length;
    const chunkStart = visibleIndex;
    while (
      visibleIndex < visibleCharacters.length &&
      visibleCharacters[visibleIndex] !== "\n" &&
      targetIndex < segmentEnd
    ) {
      chunk.push(visibleCharacters[visibleIndex]);
      visibleIndex += 1;
      targetIndex += 1;
    }
    const target = buildHesitationPracticeTarget(heatmap, segment, source);
    const preview = segmentContext(heatmap.text, segment);
    passage.push(
      <button
        type="button"
        className={`heatmap-segment-button heat-level-${level}`}
        title={`第 ${segment.start + 1} 字，${levelLabels[level]}卡顿，${formatDelay(segment.delayMs)}，点击练习`}
        aria-label={`练习第 ${segment.start + 1} 字附近的${levelLabels[level]}卡顿片段，${preview}，耗时 ${formatDelay(segment.delayMs)}`}
        key={`${segmentKey}-${chunkStart}`}
        onClick={() =>
          onPractice ? onPractice(target) : onAddToQueue?.(target)
        }
      >
        {chunk.join("")}
      </button>,
    );
  }

  return (
    <section
      className={`hesitation-heatmap${compact ? " compact" : ""}${interactive ? " interactive" : ""}`}
      aria-labelledby={titleId}
    >
      <div className="hesitation-heading">
        <div>
          <span className="eyebrow">逐字节奏复盘</span>
          <h3 id={titleId}>卡顿位置热力图</h3>
        </div>
        <span className="hesitation-threshold">
          本轮基准 {formatDelay(heatmap.baselineMs)} · 卡顿线 {formatDelay(heatmap.thresholdMs)}
        </span>
      </div>

      <div className="heatmap-legend" aria-label="热力等级图例">
        {levelLabels.map((label, level) => (
          <span key={label}>
            <i className={`heat-level-${level}`} aria-hidden="true" />
            {label}
          </span>
        ))}
      </div>

      {heatmap.segments.length ? (
        <>
          <div
            className="heatmap-passage"
            role={interactive ? undefined : "img"}
            aria-label={heatmapLabel}
          >
            {passage}
          </div>
          <ol className="hesitation-ranking" aria-label="最明显的五处卡顿">
            {hotspots.map((segment) => {
              const level = getHesitationLevel(segment.delayMs, heatmap.thresholdMs);
              const target = source
                ? buildHesitationPracticeTarget(heatmap, segment, source)
                : null;
              return (
                <li key={`${segment.start}-${segment.length}`}>
                  <b>第 {segment.start + 1} 字 · {levelLabels[level]}</b>
                  <span>“{segmentContext(heatmap.text, segment)}”</span>
                  <strong>{formatDelay(segment.delayMs)}</strong>
                  {target && source ? (
                    <SegmentActions
                      target={target}
                      source={source}
                      queuedFingerprints={queuedFingerprints}
                      masteredAtByFingerprint={masteredAtByFingerprint}
                      onPractice={onPractice}
                      onAddToQueue={onAddToQueue}
                    />
                  ) : null}
                </li>
              );
            })}
          </ol>
        </>
      ) : (
        <div className="hesitation-empty" role="status">
          <strong>这轮节奏很稳</strong>
          <span>没有位置超过本轮的自适应卡顿线。</span>
        </div>
      )}
    </section>
  );
}
