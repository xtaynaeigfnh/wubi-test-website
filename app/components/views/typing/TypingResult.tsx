"use client";

import { useEffect, useRef } from "react";
import type { selectInputReviewOpportunities } from "../../../input-review";
import type { UserSettings } from "../../../types";
import { InputReview } from "./InputReview";
import type { GhostMode } from "./useGhostRace";
import type { useTypingDiagnostics } from "./useTypingDiagnostics";
import type { useTypingSession } from "./useTypingSession";

type TypingResultProps = {
  session: Pick<ReturnType<typeof useTypingSession>, "typed" | "sessionSaveFailed" | "sessionSaved">;
  diagnostics: Pick<ReturnType<typeof useTypingDiagnostics>, "codeLengthAnalysis" | "minimumCodeError" | "retryCodeLengthLoad">;
  settings: UserSettings;
  recommendedPhrases: ReturnType<typeof selectInputReviewOpportunities>;
  inputHeight: number;
  activeGhostMode: GhostMode;
  retryPracticeSave: () => void;
  startRecommendedPhrasePractice: () => void;
  repeatArticle: () => void;
  randomArticle: () => void;
};

export function TypingResult({ session, diagnostics, settings, recommendedPhrases,
  inputHeight, activeGhostMode, retryPracticeSave, startRecommendedPhrasePractice,
  repeatArticle, randomArticle,
}: TypingResultProps) {
  const reviewRef = useRef<HTMLDivElement>(null);
  const { typed, sessionSaveFailed, sessionSaved } = session;
  const { codeLengthAnalysis, minimumCodeError, retryCodeLengthLoad } = diagnostics;
  useEffect(() => { reviewRef.current?.focus({ preventScroll: true }); }, []);
  return <>
    <InputReview
      ref={reviewRef}
      text={typed}
      opportunities={recommendedPhrases}
      height={inputHeight}
      loading={!codeLengthAnalysis && !minimumCodeError}
      error={minimumCodeError}
      onRetry={retryCodeLengthLoad}
    />
    <div className="typing-review-actions">
      <div className="typing-review-save" role="status">
        <strong>练习完成</strong>
        <span>{sessionSaveFailed
          ? "本次成绩尚未保存"
          : sessionSaved
            ? "本次成绩已存入本机 · 可在成绩统计查看"
            : "正在保存本次成绩…"}</span>
      </div>
      <div className="typing-review-buttons">
        {sessionSaveFailed && (
          <button className="button danger" onClick={retryPracticeSave}>
            重试保存
          </button>
        )}
        {recommendedPhrases.length > 0 && (
          <button className="button secondary" disabled={!sessionSaved} onClick={startRecommendedPhrasePractice}>
            练习这些词组
          </button>
        )}
        {settings.autoNext && activeGhostMode !== "off" && (
          <button className="button secondary" disabled={!sessionSaved} onClick={repeatArticle}>
            {activeGhostMode === "best" ? "再次挑战个人最佳" : "再次挑战最近一次"}
          </button>
        )}
        <button
          className="button primary"
          disabled={!sessionSaved}
          onClick={settings.autoNext ? randomArticle : repeatArticle}
        >
          {settings.autoNext ? "下一篇" : activeGhostMode === "best" ? "再次挑战个人最佳" : activeGhostMode === "recent" ? "再次挑战最近一次" : "再练一次"}
        </button>
      </div>
    </div>
  </>;
}
