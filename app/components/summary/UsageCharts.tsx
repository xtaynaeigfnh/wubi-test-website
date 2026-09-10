"use client";

import type { CSSProperties } from "react";
import { summarizeKeyUsage } from "../../key-usage";

type Summary = ReturnType<typeof summarizeKeyUsage>;
const percentage = (count: number, total: number) => total ? Math.round(count / total * 100) : 0;

function Distribution({ title, rows }: { title: string; rows: Array<{ name: string; label?: string; count: number }> }) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return (
    <section className="usage-card">
      <h3>{title}</h3>
      <ul className="distribution-list">
        {rows.map((row) => <li key={row.name}>
          <span>{row.label ?? row.name}</span>
          <span className="distribution-track" aria-hidden="true"><i style={{ "--usage-rate": `${percentage(row.count, total)}%` } as CSSProperties} /></span>
          <strong>{percentage(row.count, total)}%</strong><small>{row.count.toLocaleString("zh-CN")} 次</small>
        </li>)}
      </ul>
    </section>
  );
}

export function UsageCharts({ summary }: { summary: Summary }) {
  const left = summary.hands.find((hand) => hand.name === "left")?.count ?? 0;
  const right = summary.hands.find((hand) => hand.name === "right")?.count ?? 0;
  const total = left + right;
  const leftRate = percentage(left, total);
  const rightRate = total ? 100 - leftRate : 0;
  return (
    <section className="summary-distributions" aria-labelledby="distribution-title">
      <div className="summary-section-heading"><h2 id="distribution-title">从键位，看见输入习惯</h2><p>使用次数的分布，不代表熟练度或准确率。</p></div>
      <div className="key-analysis-layout" aria-label="按键分布分析">
        <section className="usage-card hand-balance-chart">
          <h3>双手分工</h3>
          <div className="hand-balance-values"><div><span>左手</span><strong>{leftRate}<small>%</small></strong></div><div><span>右手</span><strong>{rightRate}<small>%</small></strong></div></div>
          <div className="hand-balance-track" role="img" aria-label={`左手 ${leftRate}%，右手 ${rightRate}%`}>
            <i style={{ "--usage-rate": `${leftRate}%` } as CSSProperties} />
          </div>
          <p className="chart-note">空格单独计入拇指，不参与左右手比较。用量不同是正常的，无需刻意追求各占一半。</p>
        </section>
        <Distribution title="键盘行分布" rows={summary.rows} />
        <Distribution title="手指使用分布" rows={summary.fingers} />
      </div>
    </section>
  );
}
