"use client";

import { useId, useState } from "react";
import type { AbilityDimension, WeeklyReport } from "../types";
import { downloadWeeklyReportCard } from "../weekly-report-card";

export interface WeeklyReportPanelProps {
  report: WeeklyReport;
}

function deltaLabel(value: number, suffix = ""): string {
  if (value === 0) return "持平";
  return `${value > 0 ? "+" : ""}${value}${suffix}`;
}

function deltaTone(value: number): string {
  return value > 0 ? "is-up" : value < 0 ? "is-down" : "is-flat";
}

function radarPoint(index: number, value: number, radius = 92): string {
  const angle = -Math.PI / 2 + (index * Math.PI * 2) / 6;
  return `${(120 + Math.cos(angle) * radius * value).toFixed(1)},${(
    120 + Math.sin(angle) * radius * value
  ).toFixed(1)}`;
}

function RadarChart({
  abilities,
  comparison,
}: {
  abilities: AbilityDimension[];
  comparison: WeeklyReport["comparison"]["abilities"];
}) {
  const titleId = useId();
  const descriptionId = useId();
  const polygon = abilities
    .map((ability, index) => radarPoint(index, (ability.score ?? 0) / 100))
    .join(" ");
  const description = abilities
    .map((ability) => `${ability.label}${ability.score === null ? "暂无数据" : `${ability.score}分`}`)
    .join("，");
  const missingCount = abilities.filter((ability) => ability.score === null).length;

  return (
    <div className="weekly-radar-wrap">
      <div className="weekly-radar-figure">
        <svg
          className="weekly-radar"
          viewBox="0 0 240 240"
          role="img"
          aria-labelledby={`${titleId} ${descriptionId}`}
        >
          <title id={titleId}>本周六维能力雷达图</title>
          <desc id={descriptionId}>{description}</desc>
          {[0.25, 0.5, 0.75, 1].map((ratio) => (
            <polygon
              key={ratio}
              className="weekly-radar-grid"
              points={abilities.map((_, index) => radarPoint(index, ratio)).join(" ")}
            />
          ))}
          {abilities.map((ability, index) => (
            <line
              key={ability.id}
              className="weekly-radar-axis"
              x1="120"
              y1="120"
              x2={radarPoint(index, 1).split(",")[0]}
              y2={radarPoint(index, 1).split(",")[1]}
            />
          ))}
          {!missingCount && <polygon className="weekly-radar-area" points={polygon} />}
          {abilities.map((ability, index) => {
            const [x, y] = radarPoint(index, (ability.score ?? 0) / 100).split(",");
            return ability.score === null ? null : (
              <circle key={ability.id} className="weekly-radar-dot" cx={x} cy={y} r="3" />
            );
          })}
        </svg>
        {missingCount > 0 && (
          <p className="weekly-radar-note">缺少 {missingCount} 项数据，暂不连接雷达轮廓。</p>
        )}
      </div>
      <div className="weekly-ability-list">
        {abilities.map((ability) => {
          const delta = comparison[ability.id];
          return (
            <div className="weekly-ability" key={ability.id}>
              <div>
                <strong>{ability.label}</strong>
                <span>{ability.rawLabel}</span>
              </div>
              <span className="weekly-score">
                {ability.score === null ? "—" : ability.score}
                <small> / 100</small>
              </span>
              <span className={`weekly-delta ${delta === undefined ? "is-missing" : deltaTone(delta)}`}>
                {delta === undefined ? "无上周基线" : `较上周同期 ${deltaLabel(delta)} 分`}
              </span>
              <span className="weekly-normalization">{ability.normalization}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ItemList({ items, empty }: { items: string[]; empty: string }) {
  return items.length ? (
    <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>
  ) : (
    <p className="weekly-missing">{empty}</p>
  );
}

export function WeeklyReportPanel({ report }: WeeklyReportPanelProps) {
  const [exportState, setExportState] = useState<"idle" | "working" | "done" | "error">("idle");

  async function handleDownload() {
    setExportState("working");
    try {
      await downloadWeeklyReportCard(report);
      setExportState("done");
    } catch {
      setExportState("error");
    }
  }

  return (
    <section className="weekly-report" aria-labelledby="weekly-report-title">
      <style>{weeklyReportStyles}</style>
      <header className="weekly-report-header">
        <div>
          <span className="eyebrow">能力周报 · V0.6</span>
          <h2 id="weekly-report-title">{report.weekStart} 至 {report.weekEnd}</h2>
          <p>六项能力按固定区间换算为 0–100 分，缺少的数据不会被当作 0 分。</p>
        </div>
        <div className="weekly-download-wrap">
          <button
            className="weekly-download"
            type="button"
            onClick={handleDownload}
            disabled={exportState === "working"}
          >
            {exportState === "working" ? "正在生成…" : "下载本地周报图片"}
          </button>
          <span role="status" aria-live="polite">
            {exportState === "done" ? "PNG 已下载" : exportState === "error" ? "导出失败，请重试" : "图片不会上传"}
          </span>
        </div>
      </header>

      <dl className="weekly-volume" aria-label="本周练习量">
        <div>
          <dt>练习次数</dt><dd>{report.sessions}<small>次</small></dd>
          <dd className={`weekly-volume-change ${deltaTone(report.comparison.sessions)}`}>较上周同期 {deltaLabel(report.comparison.sessions)}</dd>
        </div>
        <div>
          <dt>完成字数</dt><dd>{report.characters}<small>字</small></dd>
          <dd className={`weekly-volume-change ${deltaTone(report.comparison.characters)}`}>较上周同期 {deltaLabel(report.comparison.characters, " 字")}</dd>
        </div>
        <div>
          <dt>练习时长</dt><dd>{report.minutes}<small>分钟</small></dd>
          <dd className={`weekly-volume-change ${deltaTone(report.comparison.minutes)}`}>较上周同期 {deltaLabel(report.comparison.minutes, " 分钟")}</dd>
        </div>
        <div>
          <dt>活跃 / 最长连续</dt><dd>{report.activeDays}<small> / {report.streakDays} 天</small></dd>
          <dd className="weekly-volume-change">本周练习节奏</dd>
        </div>
      </dl>

      <div className="weekly-section-heading">
        <div><span>01</span><h3>六维能力</h3></div>
        <p>图形展示归一化得分；右侧保留原始值与换算区间。</p>
      </div>
      <RadarChart abilities={report.abilities} comparison={report.comparison.abilities} />

      <div className="weekly-section-heading">
        <div><span>02</span><h3>本周观察</h3></div>
      </div>
      <div className="weekly-observations">
        <article>
          <h4>已掌握弱项 <b>{report.masteredWeaknesses.length}</b></h4>
          <ItemList items={report.masteredWeaknesses} empty="本周尚无达到掌握标准的弱项。" />
        </article>
        <article>
          <h4>新增弱项 <b>{report.newWeaknesses.length}</b></h4>
          <ItemList items={report.newWeaknesses} empty="本周没有记录到新增弱项。" />
        </article>
        <article className="weekly-weakest">
          <h4>最需留意</h4>
          <dl>
            <div><dt>弱项关联键位</dt><dd>{report.weakestKey ?? "暂无数据"}</dd></div>
            <div><dt>关联字根区</dt><dd>{report.weakestZone ?? "暂无数据"}</dd></div>
            <div><dt>关联词组类型</dt><dd>{report.weakestPhraseType ?? "暂无数据"}</dd></div>
          </dl>
        </article>
      </div>

      <div className="weekly-goals">
        <div className="weekly-section-heading">
          <div><span>03</span><h3>下周推荐目标</h3></div>
        </div>
        {report.recommendations.length ? (
          <ol>{report.recommendations.map((item) => <li key={item}>{item}</li>)}</ol>
        ) : (
          <p className="weekly-missing">暂无推荐；完成至少 2 次文章测速后再来看。</p>
        )}
      </div>
    </section>
  );
}

const weeklyReportStyles = `
  .weekly-report { padding: 24px; border: 1px solid var(--border-default); border-radius: var(--radius-large); background: var(--bg-paper); box-shadow: var(--shadow-panel); }
  .weekly-report-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 28px; padding-bottom: 22px; border-bottom: 1px solid var(--border-default); }
  .weekly-report-header h2 { margin: 8px 0 6px; font: 600 25px/1.2 var(--font-display); }
  .weekly-report-header p { max-width: 620px; margin: 0; color: var(--text-secondary); font-size: 12px; line-height: 1.7; }
  .weekly-download-wrap { display: grid; justify-items: end; gap: 7px; }
  .weekly-download-wrap > span { min-height: 14px; color: var(--text-secondary); font-size: 9px; }
  .weekly-download { min-height: 42px; padding: 0 15px; color: var(--text-on-accent); border: 1px solid var(--accent-bamboo); border-radius: var(--radius-small); background: var(--accent-bamboo-fill); cursor: pointer; font-size: 11px; font-weight: 750; }
  .weekly-download:hover:not(:disabled) { filter: brightness(1.08); }
  .weekly-download:disabled { cursor: wait; opacity: .6; }
  .weekly-volume { margin: 20px 0 30px; display: grid; grid-template-columns: repeat(4, 1fr); border: 1px solid var(--border-default); border-radius: var(--radius-medium); background: var(--bg-raised); }
  .weekly-volume > div { min-width: 0; padding: 15px 18px; border-right: 1px solid var(--border-default); }
  .weekly-volume > div:last-child { border-right: 0; }
  .weekly-volume dt { color: var(--text-secondary); font-size: 10px; }
  .weekly-volume dd { margin: 9px 0 6px; font: 700 24px/1 var(--font-data); letter-spacing: -.06em; }
  .weekly-volume dd small { margin-left: 5px; color: var(--text-secondary); font: 500 9px/1 var(--font-body); letter-spacing: 0; }
  .weekly-volume-change, .weekly-delta { color: var(--text-secondary); font-size: 10px; }
  .weekly-volume .weekly-volume-change { margin: 0; font: 500 10px/1.3 var(--font-body); letter-spacing: 0; }
  .weekly-report .is-up { color: var(--state-success); }
  .weekly-report .is-down { color: var(--state-error); }
  .weekly-section-heading { margin: 24px 0 15px; display: flex; align-items: end; justify-content: space-between; gap: 18px; }
  .weekly-section-heading > div { display: flex; align-items: center; gap: 9px; }
  .weekly-section-heading span { color: var(--accent-vermilion); font: 700 10px/1 var(--font-data); }
  .weekly-section-heading h3 { margin: 0; font: 600 18px/1.2 var(--font-display); }
  .weekly-section-heading p { margin: 0; color: var(--text-secondary); font-size: 10px; }
  .weekly-radar-wrap { display: grid; grid-template-columns: minmax(260px, .8fr) minmax(420px, 1.2fr); align-items: center; gap: 36px; padding: 18px 24px; border: 1px solid var(--border-subtle); border-radius: var(--radius-medium); }
  .weekly-radar-figure { text-align: center; }
  .weekly-radar { width: min(100%, 360px); margin: auto; overflow: visible; }
  .weekly-radar-note { margin: -10px 0 8px; color: var(--text-secondary); font-size: 9px; }
  .weekly-radar-grid, .weekly-radar-axis { fill: none; stroke: var(--border-default); stroke-width: .8; vector-effect: non-scaling-stroke; }
  .weekly-radar-grid:not(:last-of-type) { stroke: var(--border-subtle); }
  .weekly-radar-area { fill: color-mix(in srgb, var(--accent-bamboo) 20%, transparent); stroke: var(--accent-bamboo); stroke-width: 2; stroke-linejoin: round; vector-effect: non-scaling-stroke; }
  .weekly-radar-dot { fill: var(--bg-paper); stroke: var(--accent-bamboo); stroke-width: 2; vector-effect: non-scaling-stroke; }
  .weekly-ability-list { display: grid; }
  .weekly-ability { min-height: 61px; display: grid; grid-template-columns: minmax(110px, 1fr) 80px 94px; align-items: center; gap: 12px; border-bottom: 1px solid var(--border-subtle); }
  .weekly-ability:last-child { border-bottom: 0; }
  .weekly-ability > div strong, .weekly-ability > div span { display: block; }
  .weekly-ability > div strong { font-size: 12px; }
  .weekly-ability > div span, .weekly-normalization { margin-top: 4px; color: var(--text-secondary); font-size: 9px; }
  .weekly-score { text-align: right; font: 700 17px/1 var(--font-data); }
  .weekly-score small { color: var(--text-secondary); font-size: 8px; }
  .weekly-delta { text-align: right; }
  .weekly-normalization { grid-column: 1 / -1; margin: -10px 0 8px; }
  .weekly-observations { display: grid; grid-template-columns: 1fr 1fr 1.2fr; gap: 12px; }
  .weekly-observations article { min-height: 150px; padding: 17px; border: 1px solid var(--border-subtle); border-radius: var(--radius-medium); background: var(--bg-raised); }
  .weekly-observations h4 { margin: 0 0 13px; font-size: 11px; }
  .weekly-observations h4 b { margin-left: 5px; color: var(--accent-vermilion); font: 700 11px/1 var(--font-data); }
  .weekly-observations ul { margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; list-style: none; }
  .weekly-observations li { padding: 5px 8px; border: 1px solid var(--border-default); border-radius: 999px; background: var(--bg-paper); font-size: 11px; }
  .weekly-missing { margin: 0; color: var(--text-secondary); font-size: 10px; line-height: 1.7; }
  .weekly-weakest dl { margin: 0; display: grid; grid-template-columns: repeat(3, 1fr); }
  .weekly-weakest dl > div { min-width: 0; padding: 4px 10px; border-right: 1px solid var(--border-default); }
  .weekly-weakest dl > div:first-child { padding-left: 0; }
  .weekly-weakest dl > div:last-child { padding-right: 0; border-right: 0; }
  .weekly-weakest dt { color: var(--text-secondary); font-size: 9px; }
  .weekly-weakest dd { margin: 11px 0 0; overflow-wrap: anywhere; font: 600 15px/1.35 var(--font-data); }
  .weekly-goals { margin-top: 28px; padding: 4px 20px 18px; border-left: 3px solid var(--accent-bamboo); border-radius: 0 var(--radius-medium) var(--radius-medium) 0; background: color-mix(in srgb, var(--accent-bamboo) 7%, var(--bg-raised)); }
  .weekly-goals .weekly-section-heading { margin-top: 16px; }
  .weekly-goals ol { margin: 0; padding: 0 0 0 30px; counter-reset: goal; list-style: none; }
  .weekly-goals li { min-height: 32px; position: relative; font-size: 11px; line-height: 1.65; }
  .weekly-goals li::before { content: counter(goal); counter-increment: goal; width: 18px; height: 18px; position: absolute; left: -28px; top: 0; display: grid; place-items: center; color: var(--text-on-accent); border-radius: 50%; background: var(--accent-bamboo-fill); font: 700 9px/1 var(--font-data); }
  @media (max-width: 780px) { .weekly-report { padding: 18px; } .weekly-report-header { display: grid; } .weekly-download-wrap { justify-items: start; } .weekly-volume { grid-template-columns: repeat(2, 1fr); } .weekly-volume > div:nth-child(2) { border-right: 0; } .weekly-volume > div:nth-child(-n + 2) { border-bottom: 1px solid var(--border-default); } .weekly-radar-wrap { grid-template-columns: 1fr; } .weekly-observations { grid-template-columns: 1fr; } }
  @media (max-width: 440px) { .weekly-report { padding: 14px; } .weekly-section-heading { align-items: flex-start; flex-direction: column; } .weekly-radar-wrap { padding: 10px; } .weekly-ability { grid-template-columns: 1fr 64px; } .weekly-delta { grid-column: 1 / -1; text-align: left; } .weekly-weakest dl { grid-template-columns: 1fr; } .weekly-weakest dl > div { padding: 10px 0; border-right: 0; border-bottom: 1px solid var(--border-default); } .weekly-weakest dl > div:last-child { border-bottom: 0; } }
  @media (prefers-reduced-motion: reduce) { .weekly-report * { scroll-behavior: auto !important; transition: none !important; animation: none !important; } }
`;
