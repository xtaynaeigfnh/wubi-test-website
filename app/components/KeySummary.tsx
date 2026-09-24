"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { clearKeyUsage, readKeyUsage } from "../lib";
import { KEYBOARD_KEYS, summarizeKeyUsage, type KeyUsageMap } from "../key-usage";
import { KeyboardHeatmap } from "./summary/KeyboardHeatmap";
import { UsageCharts } from "./summary/UsageCharts";

export function KeySummary() {
  const [usage, setUsage] = useState<KeyUsageMap>({});
  const [ready, setReady] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { setUsage(readKeyUsage()); setReady(true); }, []);
  const summary = useMemo(() => summarizeKeyUsage(usage), [usage]);
  const dominantRow = [...summary.rows].sort((a, b) => b.count - a.count)[0];
  const reset = () => {
    if (!window.confirm("确定清空全部按键使用记录吗？练习成绩和错题不会受到影响。")) return;
    if (!clearKeyUsage()) {
      setResetError("按键记录未能清空，请检查浏览器存储空间后重试。");
      return;
    }
    setResetError("");
    setUsage({});
    setResetMessage("按键记录已清空，练习成绩和错题已保留。");
    headingRef.current?.focus();
  };

  return (
    <section className="subpage key-summary-page" aria-busy={!ready}>
      <header className="key-summary-toolbar">
        <div className="key-summary-intro">
          <span className="eyebrow">练习档案 / 按键统计</span>
          <h1 ref={headingRef} tabIndex={-1}>按键使用画像<span>每一次敲击，都有迹可循。</span></h1>
          <p>从键盘热区到双手分工，看看你的五笔输入习惯。</p>
        </div>
        <Link className="button primary summary-practice-link" href="/">继续文章测速 <span aria-hidden="true">↗</span></Link>
      </header>
      <dl className="key-summary-metrics" aria-label="按键使用概览">
        <div><dt>累计按键</dt><dd>{ready ? summary.total.toLocaleString("zh-CN") : "—"}<small>次</small></dd><dd className="metric-description">练习期间的物理键触发</dd></div>
        <div><dt>活跃键位</dt><dd>{ready ? summary.activeKeys : "—"}<small>/ {KEYBOARD_KEYS.length}</small></dd><dd className="metric-description">有过使用记录的键位</dd></div>
        <div><dt>最高频键</dt><dd>{summary.mostUsed?.label ?? "—"}</dd><dd className="metric-description">{summary.mostUsed ? `${summary.mostUsed.count.toLocaleString("zh-CN")} 次敲击` : "等待首次练习"}</dd></div>
        <div><dt>最常用行</dt><dd className="metric-text">{summary.total ? dominantRow?.label : "—"}</dd><dd className="metric-description">{summary.total ? `${dominantRow?.count.toLocaleString("zh-CN")} 次敲击` : "记录后显示分布"}</dd></div>
      </dl>
      <KeyboardHeatmap usage={usage} total={summary.total} />
      {ready && !summary.total && (
        <div className="key-summary-empty" role="status">
          <div className="empty-key-motif" aria-hidden="true"><kbd>五</kbd><kbd>笔</kbd></div>
          <div><h2>你的第一份画像，从一次练习开始</h2><p>文章测速、字码挑战和专项训练都会累计按键次数。练习后回来，看看哪些键留下了最多痕迹。</p></div>
          <Link className="summary-text-link" href="/training">前往训练中心 <span aria-hidden="true">→</span></Link>
        </div>
      )}
      {Boolean(summary.total) && <UsageCharts summary={summary} />}
      <footer className="summary-data-footer">
        <div><strong>这份画像，只属于这台设备</strong><p>只记录次数 · 不记录输入内容 · 不上传</p></div>
        <button className="summary-reset" type="button" disabled={!summary.total} onClick={reset}>清空按键记录</button>
      </footer>
      {resetError && <p className="plan-message" role="alert">{resetError}</p>}
      <p className="summary-reset-message" role="status">{resetMessage}</p>
    </section>
  );
}
