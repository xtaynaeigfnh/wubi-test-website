import { getHesitationLevel } from "../lib";
import type { HesitationSegment, TypingHeatmap } from "../types";

const levelLabels = ["顺畅", "轻微", "明显", "严重"] as const;

function formatDelay(delayMs: number) {
  return delayMs >= 1000
    ? `${(delayMs / 1000).toFixed(1)} 秒`
    : `${Math.round(delayMs)} 毫秒`;
}

function segmentContext(text: string, segment: HesitationSegment) {
  const characters = Array.from(text.replace(/[\r\n]/g, ""));
  const start = Math.max(0, segment.start - 4);
  const end = Math.min(
    characters.length,
    segment.start + segment.length + 4,
  );
  const prefix = start > 0 ? "…" : "";
  const suffix = end < characters.length ? "…" : "";
  return `${prefix}${characters.slice(start, end).join("")}${suffix}`;
}

export function HesitationHeatmap({
  heatmap,
  compact = false,
}: {
  heatmap: TypingHeatmap;
  compact?: boolean;
}) {
  const segmentByIndex = new Map<
    number,
    { delayMs: number; level: 1 | 2 | 3 }
  >();
  heatmap.segments.forEach((segment) => {
    const level = getHesitationLevel(segment.delayMs, heatmap.thresholdMs);
    if (level === 0) return;
    for (
      let index = segment.start;
      index < segment.start + segment.length;
      index += 1
    ) {
      segmentByIndex.set(index, { delayMs: segment.delayMs, level });
    }
  });

  const hotspots = [...heatmap.segments]
    .sort((a, b) => b.delayMs - a.delayMs || a.start - b.start)
    .slice(0, 5);
  let targetIndex = 0;
  const normalizedText = heatmap.text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const heatmapLabel = heatmap.segments.length
    ? `文章卡顿位置热力图，共 ${heatmap.segments.length} 处明显卡顿`
    : "文章卡顿位置热力图，本轮没有明显卡顿";

  return (
    <section
      className={`hesitation-heatmap${compact ? " compact" : ""}`}
      aria-labelledby={`heatmap-title-${compact ? "history" : "completion"}-${heatmap.thresholdMs}`}
    >
      <div className="hesitation-heading">
        <div>
          <span className="eyebrow">逐字节奏复盘</span>
          <h3 id={`heatmap-title-${compact ? "history" : "completion"}-${heatmap.thresholdMs}`}>
            卡顿位置热力图
          </h3>
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
          <div className="heatmap-passage" role="img" aria-label={heatmapLabel}>
            {Array.from(normalizedText).map((character, visibleIndex) => {
              if (character === "\n") {
                return <br key={`${visibleIndex}-break`} />;
              }
              const index = targetIndex;
              targetIndex += 1;
              const hotspot = segmentByIndex.get(index);
              const level = hotspot?.level ?? 0;
              return (
                <mark
                  className={`heat-level-${level}`}
                  title={
                    hotspot
                      ? `第 ${index + 1} 字，${levelLabels[level]}卡顿，${formatDelay(hotspot.delayMs)}`
                      : `第 ${index + 1} 字，顺畅`
                  }
                  key={`${visibleIndex}-${character}`}
                >
                  {character}
                </mark>
              );
            })}
          </div>
          <ol className="hesitation-ranking" aria-label="最明显的五处卡顿">
            {hotspots.map((segment) => {
              const level = getHesitationLevel(
                segment.delayMs,
                heatmap.thresholdMs,
              );
              return (
                <li key={`${segment.start}-${segment.length}`}>
                  <b>第 {segment.start + 1} 字 · {levelLabels[level]}</b>
                  <span>“{segmentContext(heatmap.text, segment)}”</span>
                  <strong>{formatDelay(segment.delayMs)}</strong>
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
