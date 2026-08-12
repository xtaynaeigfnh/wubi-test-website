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

function UsageBars({
  id,
  title,
  note,
  rows,
  wide = false,
}: {
  id: string;
  title: string;
  note: string;
  rows: Array<{ name: string; label?: string; count: number }>;
  wide?: boolean;
}) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return (
    <section className={wide ? "usage-card usage-card-wide" : "usage-card"} aria-labelledby={id}>
      <div className="summary-card-heading">
        <div>
          <span className="eyebrow">{note}</span>
          <h2 id={id}>{title}</h2>
        </div>
        <strong>{total.toLocaleString("zh-CN")} 次</strong>
      </div>
      <div className="usage-bars">
        {rows.length ? rows.map((row) => {
          const rate = percent(row.count, total);
          return (
            <div
              className="usage-bar"
              key={row.name}
              aria-label={`${row.label ?? row.name}，${rate}%，${row.count} 次`}
            >
              <span>{row.label ?? row.name}</span>
              <i
                aria-hidden="true"
                style={{ "--usage-rate": `${rate}%` } as CSSProperties}
              ><b /></i>
              <strong>{rate}%</strong>
              <small>{row.count.toLocaleString("zh-CN")}</small>
            </div>
          );
        }) : <p className="usage-card-empty">完成一轮练习后，这里会显示手指分工。</p>}
      </div>
    </section>
  );
}

function HandBalanceHeatmap({
  rows,
}: {
  rows: Array<{ name: string; label: string; count: number }>;
}) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const maxCount = Math.max(1, ...rows.map((row) => row.count));

  return (
    <section className="usage-card hand-heatmap-card" aria-labelledby="hand-balance-title">
      <div className="summary-card-heading">
        <div>
          <span className="eyebrow">发力分配</span>
          <h2 id="hand-balance-title">左右手均衡</h2>
        </div>
        <strong>{total.toLocaleString("zh-CN")} 次</strong>
      </div>
      <div className="hand-heatmap" role="img" aria-label="左右手按键使用热力分布">
        {rows.map((row) => {
          const rate = percent(row.count, total);
          const heat = row.count / maxCount;
          return (
            <div
              className={`hand-heat hand-heat-${row.name}`}
              key={row.name}
              style={{ "--hand-heat": heat } as CSSProperties}
              aria-label={`${row.label}，${rate}%，${row.count} 次`}
            >
              <div className="hand-heat-circle" aria-hidden="true">
                <span>{rate}%</span>
              </div>
              <strong>{row.label}</strong>
              <small>{row.count.toLocaleString("zh-CN")} 次</small>
            </div>
          );
        })}
      </div>
      <p className="hand-heatmap-note">颜色越深，表示该侧按键使用越集中</p>
    </section>
  );
}

export function KeySummary() {
  const [usage, setUsage] = useState<KeyUsageMap>({});
  useEffect(() => setUsage(readKeyUsage()), []);
  const summary = useMemo(() => summarizeKeyUsage(usage), [usage]);
  const maxCount = Math.max(1, ...KEYBOARD_KEYS.map((item) => usage[item.code] ?? 0));
  const handTotal = summary.hands.reduce((sum, hand) => sum + hand.count, 0);
  const handBalance = handTotal
    ? `${percent(Math.min(...summary.hands.map((item) => item.count)), handTotal / 2)}%`
    : "—";

  const reset = () => {
    if (!window.confirm("确定清空全部按键使用记录吗？练习成绩和错题不会受到影响。")) return;
    clearKeyUsage();
    setUsage({});
  };

  return (
    <section className="subpage key-summary-page">
      <header className="key-summary-toolbar">
        <div className="key-summary-intro">
          <span className="eyebrow">从每一次落键看习惯</span>
          <h1>按键使用画像</h1>
          <p>参照练习期间记录的物理键位，查看热区、左右手均衡、键盘行与手指分工。数据只保存在当前浏览器。</p>
        </div>
        <div className="key-summary-actions">
          <Link className="button secondary" href="/history">返回本地成绩</Link>
          <button className="button danger" type="button" disabled={!summary.total} onClick={reset}>清空按键记录</button>
        </div>
      </header>

      <section className="keyboard-heatmap-card" aria-labelledby="keyboard-heatmap-title">
        <div className="summary-card-heading keyboard-card-heading">
          <div>
            <span className="eyebrow">物理键位使用分布</span>
            <h2 id="keyboard-heatmap-title">键盘热力图</h2>
          </div>
          <span className="heat-legend" aria-label="颜色越深，使用越多"><i />少 <i />多</span>
        </div>

        <dl className="key-summary-metrics" aria-label="按键统计概览">
          <div><dt>累计按键</dt><dd>{summary.total.toLocaleString("zh-CN")}</dd><small>训练中记录</small></div>
          <div><dt>最常使用</dt><dd>{summary.mostUsed?.label ?? "—"}</dd><small>{summary.mostUsed ? `${summary.mostUsed.count} 次` : "等待练习数据"}</small></div>
          <div><dt>左右均衡</dt><dd>{handBalance}</dd><small>越接近 100% 越均衡</small></div>
          <div><dt>活跃键位</dt><dd>{summary.activeKeys}</dd><small>共 {KEYBOARD_KEYS.length} 个键位</small></div>
        </dl>

        <div className="keyboard-scroll-region" tabIndex={0} aria-label="键盘热力图，可横向滚动查看完整键盘">
          <div className="keyboard-heatmap" role="list" aria-label="练习按键次数热力图">
            {KEYBOARD_ROWS.map((row, rowIndex) => (
              <div className="keyboard-heat-row" role="presentation" key={rowIndex}>
                {row.map((item) => {
                  const count = usage[item.code] ?? 0;
                  const heat = count / maxCount;
                  return (
                    <span
                      className={item.zone ? "heat-key wubi-heat-key" : "heat-key"}
                      role="listitem"
                      key={item.code}
                      style={{ "--key-width": item.width ?? 1, "--heat": heat } as CSSProperties}
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
            <p>从现在开始完成文章测速、字码挑战或专项训练，键盘画像会自动生成。</p>
            <Link className="button primary" href="/">开始一轮文章测速</Link>
          </div>
        )}
      </section>

      <div className="key-analysis-grid" aria-label="按键分布分析">
        <HandBalanceHeatmap rows={summary.hands} />
        <UsageBars id="keyboard-row-title" title="键盘行使用率" note="位置分布" rows={summary.rows} />
        <UsageBars id="wubi-zone-title" title="五笔五区使用率" note="字根分区" rows={summary.zones.map((item) => ({ ...item, label: item.name }))} />
      </div>

      <UsageBars id="finger-usage-title" title="手指使用率" note="指法分工" rows={summary.fingers} wide />
    </section>
  );
}
