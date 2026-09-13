"use client";

import { forwardRef, useId, useState, type ReactNode } from "react";
import type { PhraseOpportunity } from "../../../code-length-coach";

interface InputReviewProps {
  text: string;
  opportunities: PhraseOpportunity[];
  height: number;
  loading: boolean;
  error: string;
  onRetry: () => void;
}

export const InputReview = forwardRef<HTMLDivElement, InputReviewProps>(
  function InputReview(
    { text, opportunities, height, loading, error, onRetry },
    ref,
  ) {
    const [selectedStart, setSelectedStart] = useState<number | null>(null);
    const hintId = useId();
    const explanationId = useId();
    const selected = opportunities.find(
      (opportunity) => opportunity.start === selectedStart,
    );
    const characters = Array.from(text);
    const content: ReactNode[] = [];
    let cursor = 0;

    for (const opportunity of opportunities) {
      content.push(characters.slice(cursor, opportunity.start).join(""));
      content.push(
        <button
          key={opportunity.start}
          type="button"
          className="input-review-phrase"
          aria-describedby={`${hintId} ${explanationId}`}
          aria-pressed={selectedStart === opportunity.start}
          onClick={() => setSelectedStart(opportunity.start)}
          onFocus={() => setSelectedStart(opportunity.start)}
        >
          {characters
            .slice(opportunity.start, opportunity.start + opportunity.length)
            .join("")}
        </button>,
      );
      cursor = opportunity.start + opportunity.length;
    }
    content.push(characters.slice(cursor).join(""));

    return (
      <div
        ref={ref}
        className="input-review"
        style={{ height }}
        tabIndex={-1}
        role="region"
        aria-label="输入内容复盘"
        aria-describedby={explanationId}
      >
        <div className="input-review-text" tabIndex={0} aria-label="已输入的文字">
          {content}
        </div>
        <div className="input-review-hint" id={hintId} role="status" tabIndex={0}>
          {error ? (
            <>
              <span>词组建议加载失败：{error}</span>
              <button type="button" onClick={onRetry}>
                重新加载
              </button>
            </>
          ) : loading ? (
            <span>正在加载词组建议…</span>
          ) : selected ? (
            <span>
              <strong>{selected.text}</strong> · <code>{selected.code}</code> ·
              相比单字输入理论可少 {selected.savedKeys} 键
            </span>
          ) : opportunities.length > 0 ? (
            <span>点按红色下划线词组，查看编码与理论省键提示。</span>
          ) : (
            <span>本篇暂无词组建议。</span>
          )}
          <span id={explanationId} className="input-review-explanation">
            红色下划线为词组推荐，不代表输入错误；建议基于码表，不判定本次实际分段。
          </span>
        </div>
      </div>
    );
  },
);
