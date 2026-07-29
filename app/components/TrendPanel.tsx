"use client";

import { useMemo, useState } from "react";
import { buildTrendSeries } from "../lib";
import type { SessionResult } from "../types";

export function TrendPanel({ sessions }: { sessions: SessionResult[] }) {
  const [range, setRange] = useState<7 | 30 | "all">(7);
  const points = useMemo(
    () => buildTrendSeries(sessions, range),
    [range, sessions],
  );
  const maxSpeed = Math.max(1, ...points.map((point) => point.speed));
  const width = 700;
  const height = 220;
  const horizontalPadding = 30;
  const verticalPadding = 24;
  const chartWidth = width - horizontalPadding * 2;
  const chartHeight = height - verticalPadding * 2;
  const coordinates = (field: "speed" | "accuracy") =>
    points
      .map((point, index) => {
        const x =
          horizontalPadding +
          (index / Math.max(1, points.length - 1)) * chartWidth;
        const normalized =
          field === "speed" ? point.speed / maxSpeed : point.accuracy / 100;
        const y = verticalPadding + chartHeight * (1 - normalized);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  const activeDays = points.filter((point) => point.sessions > 0);
  const averageSpeed = activeDays.length
    ? Math.round(
        activeDays.reduce((sum, point) => sum + point.speed, 0) /
          activeDays.length,
      )
    : 0;
  const averageAccuracy = activeDays.length
    ? activeDays.reduce((sum, point) => sum + point.accuracy, 0) /
      activeDays.length
    : 0;

  return (
    <section className="trend-panel" aria-labelledby="trend-title">
      <div className="panel-title">
        <div>
          <span className="eyebrow">练习趋势</span>
          <h2 id="trend-title">速度与准确率</h2>
        </div>
        <div className="trend-range" aria-label="趋势时间范围">
          {([
            [7, "7 天"],
            [30, "30 天"],
            ["all", "全部"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              className={range === value ? "active" : ""}
              aria-pressed={range === value}
              onClick={() => setRange(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="trend-summary">
        <span>
          <i className="speed-dot" /> 平均速度 <strong>{averageSpeed}</strong> 字/分
        </span>
        <span>
          <i className="accuracy-dot" /> 平均准确率{" "}
          <strong>{averageAccuracy.toFixed(1)}</strong>%
        </span>
        <span>活跃 {activeDays.length} 天</span>
      </div>
      <div className="trend-chart">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`${range === "all" ? "全部" : `${range} 天`}练习速度与准确率折线图`}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
            <line
              key={ratio}
              x1={horizontalPadding}
              x2={width - horizontalPadding}
              y1={verticalPadding + chartHeight * ratio}
              y2={verticalPadding + chartHeight * ratio}
              className="chart-grid"
            />
          ))}
          <polyline
            points={coordinates("speed")}
            className="speed-line"
            fill="none"
          />
          <polyline
            points={coordinates("accuracy")}
            className="accuracy-line"
            fill="none"
          />
        </svg>
        <div className="trend-labels" aria-hidden="true">
          <span>{points[0]?.label}</span>
          <span>{points[Math.floor(points.length / 2)]?.label}</span>
          <span>{points.at(-1)?.label}</span>
        </div>
      </div>
      {!activeDays.length && (
        <div className="trend-empty">完成文章测速后，这里会画出你的进步曲线。</div>
      )}
    </section>
  );
}
