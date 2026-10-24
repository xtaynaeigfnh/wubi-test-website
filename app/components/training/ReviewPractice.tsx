"use client";

import { type SpacedReviewItem } from "../../spaced-review";
import type { TrainingTask, WubiEntry } from "../../types";
import { CodeDrill } from "./CodeDrill";

type ReviewPracticeProps = {
  drillResetRevision: number;
  activeDueReview: SpacedReviewItem | null;
  prescribedReview: TrainingTask | undefined;
  reviewPool: WubiEntry[];
  activeDuePool: WubiEntry[];
  playKeySound: () => void;
  handlePendingSaveChange: (pending: boolean) => void;
  handleDrillProgressChange: (inProgress: boolean) => void;
  setActiveDueReview: (item: SpacedReviewItem | null) => void;
  onSessionSaved: () => void;
  selectTrainingTab: (next: "plan", force?: boolean) => boolean;
};

export function ReviewPractice({
  drillResetRevision,
  activeDueReview,
  prescribedReview,
  reviewPool,
  activeDuePool,
  playKeySound,
  handlePendingSaveChange,
  handleDrillProgressChange,
  setActiveDueReview,
  onSessionSaved,
  selectTrainingTab,
}: ReviewPracticeProps) {
  return (
    <div
      id="training-panel-review"
      role="tabpanel"
      aria-labelledby="training-tab-review"
    >
      <CodeDrill
        key={`${drillResetRevision}:${activeDueReview?.targetType === "character"
          ? `due-${activeDueReview.targetId}`
          : prescribedReview?.id ?? "review-training"}`}
        title={activeDueReview?.targetType === "character"
          ? `到期单字 · ${activeDueReview.text}`
          : prescribedReview?.title ?? "高频错题复练"}
        description={activeDueReview?.targetType === "character"
          ? "完成这一题后，会按本次结果安排下次复习；失败会缩短间隔。"
          : prescribedReview?.reason ?? "错误越多、掌握度越低的字会排得越靠前。连续答对会逐步提高掌握度。"}
        emptyText="还没有可复练的错字。先完成一篇文章或一轮字码挑战。"
        pool={activeDueReview?.targetType === "character"
          ? activeDuePool
          : prescribedReview?.items ?? reviewPool}
        sessionType="review"
        playKeySound={playKeySound}
        planTask={activeDueReview?.targetType === "character"
          ? undefined
          : prescribedReview}
        onPendingSaveChange={handlePendingSaveChange}
        onInProgressChange={handleDrillProgressChange}
        onSessionSaved={() => {
          setActiveDueReview(null);
          onSessionSaved();
          if (activeDueReview?.targetType === "character" || prescribedReview) {
            selectTrainingTab("plan", true);
          }
        }}
      />
    </div>
  );
}
