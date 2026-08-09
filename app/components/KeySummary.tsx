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
  title,
  note,
  rows,
}: {
  title: string;
  note: string;
  rows: Array<{ name: string; label?: string; count: number }>;
}) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return (
    <section className="usage-card">
      <div className="usage-card-heading">
        <div>
          <span className="eyebrow">{note}</span>
          <h2>{title}</h2>
        </div>
        <strong>{total.toLocaleString("zh-CN")} 次</strong>
      </div>
      <div className="usage-bars">
        {rows.map((row) => {
          const rate = percent(row.count, total);
          return (
            <div className="usage-bar" key={row.name}>
              <span>{row.label ?? row.name}</span>
              <i aria-hidden="true"><b style={{ width: `${rate}%` }} /></i>
              <strong>{rate}%</strong>
              <small>{row.count.toLocaleString("zh-CN")}</small>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function KeySummary() {
  const [usage, setUsage] = useState<KeyUsageMap>({});
  useEffect(() => setUsage(readKeyUsage()), []);
  const summary = useMemo(() => summarizeKeyUsage(usage), [usage]);
  const maxCount = Math.max(1, ...KEYBOARD_KEYS.map((item) => usage[item.code] ?? 0));
  const handTotal = summary.hands.reduce((sum, hand) => sum + hand.count, 0);

  const reset = () => {
    if (!window.confirm("确定清空全部按键使用记录吗？练习成绩和错题不会受到影响。")) return;
    clearKeyUsage();
    setUsage({});
  };

  return (
    <section className="subpage key-summary-page">
      <div className="subpage-heading with-action key-summary-heading">
        <div>
          <span className="eyebrow">从每一次落键看习惯</span>
          <h1>按键使用画像</h1>
          <p>参照练习期间记录的物理键位，查看热区、左右手均衡、键盘行与手指分工。数据只保存在当前浏览器。</p>
        </div>
        <div className="heading-actions">
          <Link className="button secondary" href="/history">返回本地成绩</Link>
          <button className="button danger" disabled={!summary.total} onClick={reset}>清空按键记录</button>
        </div>
      </div>

      <div className="key-summary-metrics" aria-label="按键统计概览">
        <div><span>累计按键</span><strong>{summary.total.toLocaleString("zh-CN")}</strong><small>训练中记录</small></div>
        <div><span>最常使用</span><strong>{summary.mostUsed?.label ?? "—"}</strong><small>{summary.mostUsed ? `${summary.mostUsed.count} 次` : "等待练习数据"}</small></div>
        <div><span>左右均衡</span><strong>{handTotal ? `${percent(Math.min(...summary.hands.map((item) => item.count)), handTotal / 2)}%` : "—"}</strong><small>两手越接近 100% 越均衡</small></div>
        <div><span>活跃键位</span><strong>{summary.activeKeys}</strong><small>共 {KEYBOARD_KEYS.length} 个可统计键位</small></div>
      </div>

      <section className="keyboard-heatmap-card" aria-labelledby="keyboard-heatmap-title">
        <div className="usage-card-heading">
          <div><span className="eyebrow">颜色越深，使用越多</span><h2 id="keyboard-heatmap-title">键盘热力图</h2></div>
          <span className="heat-legend"><i />少 <i />多</span>
        </div>
        <div className="keyboard-heatmap" role="img" aria-label="练习按键次数热力图">
          {KEYBOARD_ROWS.map((row, rowIndex) => (
            <div className="keyboard-heat-row" key={rowIndex}>
              {row.map((item) => {
                const count = usage[item.code] ?? 0;
                const heat = count / maxCount;
                return (
                  <span
                    className={item.zone ? "heat-key wubi-heat-key" : "heat-key"}
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
        {!summary.total && (
          <div className="key-summary-empty" role="status">
            <strong>还没有按键记录</strong>
            <p>从现在开始完成文章测速、字码挑战或专项训练，键盘画像会自动生成。</p>
            <Link className="button primary" href="/">开始一轮文章测速</Link>
          </div>
        )}
      </section>

      <div className="key-analysis-grid">
        <UsageBars title="左右手均衡" note="发力分配" rows={summary.hands} />
        <UsageBars title="键盘行使用率" note="位置分布" rows={summary.rows} />
        <UsageBars title="五笔五区使用率" note="字根分区" rows={summary.zones.map((item) => ({ ...item, label: item.name }))} />
        <UsageBars title="手指使用率" note="指法分工" rows={summary.fingers} />
      </div>
    </section>
  );
}
