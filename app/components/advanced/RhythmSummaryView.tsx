"use client";

import type { CSSProperties } from "react";
import type { RhythmSummary, RhythmWeakSegment } from "../../types";

function ms(value: number | null): string {
  return value === null ? "暂无" : `${Math.round(value)} 毫秒`;
}

function RhythmCurve({ summary }: { summary: RhythmSummary }) {
  const max = Math.max(1, ...summary.curve.map((point) => point.intervalMs));
  const curveLabel = summary.curve.length
    ? `压缩节奏曲线，共 ${summary.curve.length} 个采样点，中位间隔${ms(summary.medianIntervalMs)}，第九十分位间隔${ms(summary.p90IntervalMs)}`
    : "压缩节奏曲线，本次没有足够数据";
  return (
    <div className="advanced-rhythm-curve" role="img" aria-label={curveLabel}>
      {summary.curve.map((point, index) => (
        <i
          key={point.characterCount}
          style={{
            "--rhythm-index": index,
            height: `${Math.max(8, (point.intervalMs / max) * 100)}%`,
          } as CSSProperties}
          title={`第 ${point.characterCount} 字附近 ${point.intervalMs} 毫秒`}
        />
      ))}
      {!summary.curve.length && <span>本次没有足够数据绘制曲线</span>}
    </div>
  );
}

export function RhythmSummaryView({
  summary,
  onPractice,
}: {
  summary: RhythmSummary;
  onPractice?: (segment: RhythmWeakSegment) => void;
}) {
  const secondHalfChange =
    summary.firstHalfMedianMs && summary.secondHalfMedianMs
      ? ((summary.secondHalfMedianMs - summary.firstHalfMedianMs) /
          summary.firstHalfMedianMs) *
        100
      : null;
  return (
    <section className="rhythm-result" aria-labelledby="rhythm-result-title">
      <div className="panel-title">
        <div>
          <span className="eyebrow">本次节奏</span>
          <h2 id="rhythm-result-title">上屏间隔与恢复</h2>
        </div>
        <span>{summary.characterCount} 字样本</span>
      </div>
      <div className="rhythm-metric-grid">
        <div><span>启动</span><strong>{ms(summary.startupMs)}</strong></div>
        <div><span>中位间隔</span><strong>{ms(summary.medianIntervalMs)}</strong></div>
        <div><span>波动</span><strong>{summary.variationPercent === null ? "暂无" : `${summary.variationPercent}%`}</strong></div>
        <div><span>恢复</span><strong>{ms(summary.recoveryMs)}</strong></div>
        <div><span>最快十字</span><strong>{summary.fastestTenCpm === null ? "暂无" : `${summary.fastestTenCpm} 字/分`}</strong></div>
        <div><span>后半程</span><strong>{secondHalfChange === null ? "暂无" : `${secondHalfChange > 0 ? "慢 " : "快 "}${Math.abs(secondHalfChange).toFixed(1)}%`}</strong></div>
      </div>
      <RhythmCurve summary={summary} />
      <div className="rhythm-hand-note">
        <span>同手间隔 {ms(summary.sameHandMedianMs)}</span>
        <span>换手间隔 {ms(summary.crossHandMedianMs)}</span>
        <span>P90 间隔 {ms(summary.p90IntervalMs)}</span>
      </div>
      {!!summary.weakSegments.length && onPractice && (
        <div className="rhythm-weak-list">
          <h3>值得再练三次的片段</h3>
          {summary.weakSegments.map((segment) => (
            <button key={`${segment.start}-${segment.text}`} onClick={() => onPractice(segment)}>
              <span>{segment.text}</span>
              <small>最慢停顿 {segment.delayMs} 毫秒 · 三连复练</small>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
