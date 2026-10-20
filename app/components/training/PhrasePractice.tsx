"use client";

import { type SpacedReviewItem } from "../../spaced-review";
import type { ErrorStat, PhraseOpportunityStat, WubiEntry } from "../../types";
import { CodeDrill } from "./CodeDrill";

type PhrasePracticeProps = {
  activeDueReview: SpacedReviewItem | null;
  phraseSuggestions: WubiEntry[];
  phraseOpportunities: PhraseOpportunityStat[];
  errors: ErrorStat[];
  drillResetRevision: number;
  loading: boolean;
  activeDuePool: WubiEntry[];
  phrasePool: WubiEntry[];
  playKeySound: () => void;
  handlePendingSaveChange: (pending: boolean) => void;
  handleDrillProgressChange: (inProgress: boolean) => void;
  setActiveDueReview: (item: SpacedReviewItem | null) => void;
  onSessionSaved: () => void;
  selectTrainingTab: (next: "plan", force?: boolean) => boolean;
};

export function PhrasePractice({
  activeDueReview,
  phraseSuggestions,
  phraseOpportunities,
  errors,
  drillResetRevision,
  loading,
  activeDuePool,
  phrasePool,
  playKeySound,
  handlePendingSaveChange,
  handleDrillProgressChange,
  setActiveDueReview,
  onSessionSaved,
  selectTrainingTab,
}: PhrasePracticeProps) {
  return (
    <div
      id="training-panel-phrase"
      className="phrase-training"
      role="tabpanel"
      aria-labelledby="training-tab-phrase"
    >
      <aside className="phrase-training-note" aria-label="词组专项选题说明">
        <span className="eyebrow">码长教练</span>
        <strong>把单字弱项，放回常用词组里练</strong>
        <p>
          {activeDueReview?.targetType === "phrase"
            ? "这项词组已经到期；完成后会按本次结果安排下次复习，不会覆盖今日处方。"
            : phraseSuggestions.length
              ? "本轮优先使用结算页的词组推荐，再补充包含近期弱项字的高频词。"
              : phraseOpportunities.length
                ? "本轮优先复练码长诊断里经常出现、尚未练熟的词组机会。"
                : errors.length
                  ? "旧记录尚无法判断实际分段；本轮展示包含近期弱项字的推荐机会。"
                  : "还没有错题或码长诊断记录，先从高频常用词组开始。"}
        </p>
        <small>每轮最多 20 题，同一词组不重复出现。</small>
      </aside>
      <CodeDrill
        key={`${drillResetRevision}:${activeDueReview?.targetType === "phrase"
          ? `due-${activeDueReview.targetId}`
          : "phrase-training"}`}
        title={activeDueReview?.targetType === "phrase"
          ? `到期词组 · ${activeDueReview.text}`
          : "词组码长专项"}
        description={activeDueReview?.targetType === "phrase"
          ? "完成这一题后，会按本次结果安排下次复习；失败会缩短间隔。"
          : "直接输入整个词组的五笔编码，建立二字、三字和四字词的连续输入记忆。"}
        emptyText={loading ? "正在整理词组题库…" : "暂时没有可用词组，请先完成一轮文章或稍后重试。"}
        pool={activeDueReview?.targetType === "phrase" ? activeDuePool : phrasePool}
        sessionType="review"
        playKeySound={playKeySound}
        trackPhrasePractice
        onPendingSaveChange={handlePendingSaveChange}
        onInProgressChange={handleDrillProgressChange}
        onSessionSaved={() => {
          setActiveDueReview(null);
          onSessionSaved();
          if (activeDueReview?.targetType === "phrase") {
            selectTrainingTab("plan", true);
          }
        }}
      />
    </div>
  );
}
