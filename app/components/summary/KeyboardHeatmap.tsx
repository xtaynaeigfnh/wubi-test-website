"use client";

import { useState, type CSSProperties, type KeyboardEvent } from "react";
import { KEYBOARD_KEYS, KEYBOARD_ROWS, type KeyUsageMap } from "../../key-usage";

export function KeyboardHeatmap({ usage, total }: { usage: KeyUsageMap; total: number }) {
  const [selectedCode, setSelectedCode] = useState("KeyF");
  const selected = KEYBOARD_KEYS.find((key) => key.code === selectedCode)!;
  const count = usage[selectedCode] ?? 0;
  const maxCount = Math.max(1, ...KEYBOARD_KEYS.map((key) => usage[key.code] ?? 0));
  const navigate = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const offset = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!offset && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? KEYBOARD_KEYS.length - 1
      : (index + offset + KEYBOARD_KEYS.length) % KEYBOARD_KEYS.length;
    const code = KEYBOARD_KEYS[next].code;
    setSelectedCode(code);
    document.getElementById(`profile-${code}`)?.focus();
  };

  return (
    <section className="keyboard-heatmap-card" aria-labelledby="keyboard-heatmap-title">
      <div className="summary-card-heading">
        <div><span className="eyebrow">你的输入，留下痕迹</span><h2 id="keyboard-heatmap-title">键盘热力图</h2></div>
        <span className="heat-legend"><span>少</span><i /><i /><i /><i /><span>多</span></span>
      </div>
      <p className="keyboard-instruction">点选键位查看详情，键盘操作可用左右方向键切换。</p>
      <div className="keyboard-scroll-region" tabIndex={0} aria-label="键盘热力图，可横向滚动查看完整键盘">
        <div className="keyboard-heatmap" role="group" aria-label="练习按键次数热力图">
          {KEYBOARD_ROWS.map((row, rowIndex) => (
            <div className="keyboard-heat-row" key={rowIndex}>
              {row.map((item) => {
                const keyCount = usage[item.code] ?? 0;
                const heat = keyCount / maxCount;
                return (
                  <button
                    type="button" className="heat-key" id={`profile-${item.code}`} key={item.code}
                    data-heat={heat === 0 ? "none" : heat < 0.25 ? "low" : heat < 0.6 ? "medium" : "high"}
                    aria-pressed={selectedCode === item.code} tabIndex={selectedCode === item.code ? 0 : -1}
                    aria-label={`${item.label}，${keyCount} 次${item.zone ? `，${item.zone}` : ""}`}
                    style={{ "--key-width": item.width ?? 1 } as CSSProperties}
                    onClick={() => setSelectedCode(item.code)}
                    onKeyDown={(event) => navigate(event, KEYBOARD_KEYS.indexOf(item))}
                  ><b>{item.label}</b><small>{keyCount ? keyCount.toLocaleString("zh-CN") : "·"}</small></button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <p className="keyboard-scroll-hint">左右滑动查看完整键盘</p>
      <div className="key-inspector" aria-live="polite" aria-atomic="true">
        <span className="inspector-key" aria-hidden="true">{selected.label}</span>
        <div><strong>{selected.label} 键</strong><p>{selected.finger} · {selected.zone ?? "功能与辅助键"}</p></div>
        <dl><div><dt>按键次数</dt><dd>{count.toLocaleString("zh-CN")} <small>次</small></dd></div><div><dt>占全部按键</dt><dd>{total ? (count / total * 100).toFixed(1) : "0.0"}<small>%</small></dd></div></dl>
      </div>
    </section>
  );
}
