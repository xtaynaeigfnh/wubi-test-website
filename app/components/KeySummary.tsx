"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { clearKeyUsage, readKeyUsage } from "../lib";
import {
  KEYBOARD_KEYS,
  KEYBOARD_ROWS,
  summarizeKeyUsage,
  type KeyUsageMap,
} from "../key-usage";

const percent = (value: number, total: number) =>
  total > 0 ? Math.round((value / total) * 100) : 0;

const chartStyle = (index: number, rate: number) => ({
  "--chart-index": index,
  "--usage-rate": `${rate}%`,
} as CSSProperties);

function ChartHeading({
  id,
  title,
  total,
}: {
  id: string;
  title: string;
  total: number;
}) {
  return (
    <div className="reference-chart-heading">
      <h2 id={id}>{title}</h2>
      <span>{total.toLocaleString("zh-CN")} 次</span>
    </div>
  );
}

function HandBalanceChart({
  rows,
}: {
  rows: Array<{ name: string; label: string; count: number }>;
}) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const left = rows.find((row) => row.name === "left")?.count ?? 0;
  const leftRate = percent(left, total);
  const rightRate = total ? 100 - leftRate : 0;

  return (
    <section className="usage-card hand-balance-chart" aria-labelledby="hand-balance-title">
      <ChartHeading id="hand-balance-title" title="左右手均衡情况" total={total} />
      <div
        className="hand-pie"
        role="img"
        aria-label={`左右手按键使用热力分布，左手 ${leftRate}%，右手 ${rightRate}%`}
        style={{ "--left-rate": `${total ? leftRate : 50}%` } as CSSProperties}
      >
        <span className="hand-pie-label hand-pie-left">左手: {leftRate}%</span>
        <span className="hand-pie-label hand-pie-right">右手: {rightRate}%</span>
      </div>
      <div className="hand-pie-legend" aria-hidden="true">
        <span><i />左手</span>
        <span><i />右手</span>
      </div>
    </section>
  );
}

function HorizontalBarChart({
  id,
  title,
  rows,
}: {
  id: string;
  title: string;
  rows: Array<{ name: string; label?: string; count: number }>;
}) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);

  return (
    <section className="usage-card horizontal-chart" aria-labelledby={id}>
      <ChartHeading id={id} title={title} total={total} />
      <div className="axis-chart axis-chart-horizontal">
        <div className="axis-grid" aria-hidden="true" />
        <div className="axis-bars" role="list">
          {rows.map((row, index) => {
            const rate = percent(row.count, total);
            return (
              <div
                className="axis-bar-row"
                role="listitem"
                key={row.name}
                aria-label={`${row.label ?? row.name}，${rate}%，${row.count} 次`}
                style={chartStyle(index, rate)}
              >
                <span>{row.label ?? row.name}</span>
                <i aria-hidden="true"><b /></i>
                <strong>{rate}%</strong>
              </div>
            );
          })}
        </div>
        <div className="axis-ticks" aria-hidden="true"><span>0</span><span>25</span><span>50</span><span>75</span><span>100%</span></div>
      </div>
    </section>
  );
}

function FingerComparisonChart({
  fingers,
}: {
  fingers: Array<{ name: string; count: number }>;
}) {
  const count = (name: string) => fingers.find((item) => item.name === name)?.count ?? 0;
  const rows = [
    { label: "食指", left: count("左食指"), right: count("右食指") },
    { label: "中指", left: count("左中指"), right: count("右中指") },
    { label: "无名指", left: count("左无名指"), right: count("右无名指") },
    { label: "小指", left: count("左小指"), right: count("右小指") },
    { label: "拇指", left: count("左拇指"), right: count("拇指") + count("右拇指") },
  ];
  const total = rows.reduce((sum, row) => sum + row.left + row.right, 0);

  return (
    <section className="usage-card finger-compare-chart" aria-labelledby="finger-compare-title">
      <ChartHeading id="finger-compare-title" title="手指使用率" total={total} />
      <div className="axis-chart axis-chart-horizontal">
        <div className="axis-grid" aria-hidden="true" />
        <div className="axis-bars" role="list">
          {rows.map((row, index) => {
            const rowTotal = row.left + row.right;
            const width = percent(rowTotal, total);
            const leftShare = percent(row.left, rowTotal);
            return (
              <div
                className="axis-bar-row stacked-bar-row"
                role="listitem"
                key={row.label}
                style={{
                  "--chart-index": index,
                  "--usage-rate": `${width}%`,
                  "--left-share": leftShare / 100,
                } as CSSProperties}
                aria-label={`${row.label}，左手 ${row.left} 次，右手 ${row.right} 次`}
              >
                <span>{row.label}</span>
                <i aria-hidden="true"><b /><em /></i>
                <strong>{percent(rowTotal, total)}%</strong>
              </div>
            );
          })}
        </div>
        <div className="axis-ticks" aria-hidden="true"><span>0</span><span>25</span><span>50</span><span>75</span><span>100%</span></div>
      </div>
      <div className="finger-legend" aria-hidden="true"><span><i />左手</span><span><i />右手</span></div>
    </section>
  );
}

function FingerDistributionChart({
  fingers,
}: {
  fingers: Array<{ name: string; count: number }>;
}) {
  const count = (name: string) => fingers.find((item) => item.name === name)?.count ?? 0;
  const rows = [
    { label: "小指(左)", count: count("左小指") },
    { label: "无名指", count: count("左无名指") },
    { label: "中指", count: count("左中指") },
    { label: "食指", count: count("左食指") },
    { label: "拇指", count: count("左拇指") + count("拇指") + count("右拇指") },
    { label: "食指", count: count("右食指") },
    { label: "中指", count: count("右中指") },
    { label: "无名指", count: count("右无名指") },
    { label: "小指(右)", count: count("右小指") },
  ];
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const max = Math.max(1, ...rows.map((row) => row.count));

  return (
    <section className="usage-card usage-card-wide finger-distribution-chart" aria-labelledby="finger-usage-title">
      <ChartHeading id="finger-usage-title" title="手指使用率（分区）" total={total} />
      <div className="vertical-chart" role="list" aria-label="九个手指分区的按键使用次数柱状图">
        <div className="vertical-grid" aria-hidden="true" />
        <div className="vertical-bars">
          {rows.map((row, index) => {
            const rate = percent(row.count, max);
            return (
              <div
                className="vertical-bar"
                role="listitem"
                key={`${row.label}-${index}`}
                style={chartStyle(index, rate)}
                aria-label={`${row.label}，${row.count} 次`}
              >
                <strong>{row.count.toLocaleString("zh-CN")}</strong>
                <i aria-hidden="true"><b /></i>
                <span>{row.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function KeySummary() {
  const [usage, setUsage] = useState<KeyUsageMap>({});
  useEffect(() => setUsage(readKeyUsage()), []);
  const summary = useMemo(() => summarizeKeyUsage(usage), [usage]);
  const maxCount = Math.max(1, ...KEYBOARD_KEYS.map((item) => usage[item.code] ?? 0));

  const reset = () => {
    if (!window.confirm("确定清空全部按键使用记录吗？练习成绩和错题不会受到影响。")) return;
    clearKeyUsage();
    setUsage({});
  };

  return (
    <section className="subpage key-summary-page">
      <header className="key-summary-toolbar">
        <div className="key-summary-intro">
          <span className="eyebrow">KEYBOARD STATISTICS</span>
          <h1>按键使用画像</h1>
          <p>参照练习期间记录的物理键位，查看热区、左右手均衡、键盘行与手指分工。数据只保存在当前浏览器。</p>
        </div>
        <div className="key-summary-actions">
          <button className="button danger" type="button" disabled={!summary.total} onClick={reset}>清空按键记录</button>
        </div>
      </header>

      <section className="keyboard-heatmap-card" aria-labelledby="keyboard-heatmap-title">
        <div className="summary-card-heading keyboard-card-heading">
          <div>
            <span className="eyebrow">PHYSICAL KEY HEATMAP</span>
            <h2 id="keyboard-heatmap-title">键盘热力图</h2>
          </div>
          <span className="heat-legend" aria-label="颜色越深，使用越多"><i />少 <i />多</span>
        </div>

        <div className="keyboard-scroll-region" tabIndex={0} aria-label="键盘热力图，可横向滚动查看完整键盘">
          <div className="keyboard-heatmap" role="list" aria-label="练习按键次数热力图">
            {KEYBOARD_ROWS.map((row, rowIndex) => (
              <div className="keyboard-heat-row" role="presentation" key={rowIndex}>
                {row.map((item, keyIndex) => {
                  const count = usage[item.code] ?? 0;
                  const heat = count / maxCount;
                  return (
                    <span
                      className={item.zone ? "heat-key wubi-heat-key" : "heat-key"}
                      role="listitem"
                      key={item.code}
                      style={{
                        "--key-width": item.width ?? 1,
                        "--heat": heat,
                        "--key-index": rowIndex * 16 + keyIndex,
                      } as CSSProperties}
                      title={`${item.label}：${count} 次${item.zone ? ` · ${item.zone}` : ""}`}
                      aria-label={`${item.label}，${count} 次${item.zone ? `，${item.zone}` : ""}`}
                    >
                      <b>{item.label}</b><small>{count || "·"}</small>
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <p className="keyboard-scroll-hint">窄屏可左右滑动查看完整键盘</p>

        {!summary.total && (
          <div className="key-summary-empty" role="status">
            <strong>还没有按键记录</strong>
            <p>完成文章测速、字码挑战或专项训练后，图表会从键盘上生长出来。</p>
            <Link className="button primary" href="/">开始一轮文章测速</Link>
          </div>
        )}
      </section>

      <div className="key-analysis-grid" aria-label="按键分布分析">
        <HandBalanceChart rows={summary.hands} />
        <HorizontalBarChart id="keyboard-row-title" title="不同位置按键使用率" rows={summary.rows} />
        <FingerComparisonChart fingers={summary.fingers} />
      </div>

      <FingerDistributionChart fingers={summary.fingers} />
    </section>
  );
}
