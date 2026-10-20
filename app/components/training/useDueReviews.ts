"use client";

import { useMemo } from "react";
import { deferSpacedReviewTarget, readTrainingPlan } from "../../practice-store";
import {
  buildDueReviewQueue,
  createEmptySpacedReviewState,
  type SpacedReviewItem,
  type SpacedReviewState,
} from "../../spaced-review";
import type { DailyTrainingPlan, HesitationPracticeTarget, WubiEntry } from "../../types";

import type { Dispatch, SetStateAction } from "react";

type Options = {
  reviewState: SpacedReviewState | null;
  setReviewState: Dispatch<SetStateAction<SpacedReviewState | null>>;
  activeDueReview: SpacedReviewItem | null;
  setActiveDueReview: Dispatch<SetStateAction<SpacedReviewItem | null>>;
  setReviewMessage: (message: string) => void;
  setPlan: Dispatch<SetStateAction<DailyTrainingPlan | null>>;
  confirmDrillDeparture: () => boolean;
  onPracticeHesitation: (itemId: string, target: HesitationPracticeTarget) => void;
  tab: string;
  selectTrainingTab: (tab: "phrase" | "review", force?: boolean) => boolean;
};

export function useDueReviews({
  reviewState,
  setReviewState,
  activeDueReview,
  setActiveDueReview,
  setReviewMessage,
  setPlan,
  confirmDrillDeparture,
  onPracticeHesitation,
  tab,
  selectTrainingTab,
}: Options) {
  const dueReviewQueue = useMemo(
    () => buildDueReviewQueue(
      reviewState ?? createEmptySpacedReviewState(),
    ),
    [reviewState],
  );
  const activeDuePool = useMemo<WubiEntry[]>(
    () =>
      activeDueReview?.code
        ? [[activeDueReview.text, activeDueReview.code, activeDueReview.expectedBenefit]]
        : [],
    [activeDueReview],
  );
  const startDueReview = (item: SpacedReviewItem) => {
    if (item.targetType === "hesitation" && item.hesitationTarget) {
      if (!confirmDrillDeparture()) return;
      setReviewMessage("");
      onPracticeHesitation("", item.hesitationTarget);
      return;
    }
    if (!item.code) {
      setReviewMessage("这项复习缺少可用编码，暂时无法开始。");
      return;
    }
    const nextTab = item.targetType === "phrase" ? "phrase" : "review";
    if (!confirmDrillDeparture()) return;
    if (nextTab !== tab && !selectTrainingTab(nextTab, true)) return;
    setReviewMessage("");
    setActiveDueReview(item);
    window.requestAnimationFrame(() => {
      document.getElementById(`training-tab-${nextTab}`)?.focus();
    });
  };

  const deferDueReview = (item: SpacedReviewItem) => {
    const next = deferSpacedReviewTarget(item.targetType, item.targetId);
    if (!next) {
      setReviewMessage("暂缓状态未能保存，这项复习仍保留在今天的队列中。");
      return;
    }
    setReviewState(next);
    setPlan(readTrainingPlan());
    setActiveDueReview((current) =>
      current?.targetType === item.targetType && current.targetId === item.targetId
        ? null
        : current,
    );
    setReviewMessage(`“${item.text}”已暂缓到明天，届时会重新出现。`);
    window.requestAnimationFrame(() => {
      document.getElementById("due-review-title")?.focus();
    });
  };

  return { dueReviewQueue, activeDuePool, startDueReview, deferDueReview };
}
