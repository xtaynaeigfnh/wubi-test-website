"use client";

import { withStorageWriteLock } from "../../storage-lock";
import { useEffect, useMemo } from "react";
import {
  getProgress,
  getErrors,
  getSessions,
  readTrainingPlan,
  readSpacedReviewState,
  localDateKey,
  startTrainingTask,
  writeTrainingPlan,
} from "../../practice-transactions";
import { readSettings } from "../../settings-store";
import { buildDueReviewQueue, type SpacedReviewState } from "../../spaced-review";
import {
  buildTrainingSummary,
  generateDailyTrainingPlan,
  getNextTrainingTask,
  regenerateIncompleteTasks,
  ROOT_ZONES,
  scoreWeakItem,
} from "../../training-plan";
import type {
  DailyTrainingPlan,
  ErrorStat,
  PracticeArticle,
  SessionResult,
  TrainingTask,
  WubiEntry,
} from "../../types";

import type { Dispatch, SetStateAction } from "react";

type Options = {
  plan: DailyTrainingPlan | null;
  setPlan: Dispatch<SetStateAction<DailyTrainingPlan | null>>;
  setPlanMessage: (message: string) => void;
  articles: PracticeArticle[];
  entries: WubiEntry[];
  errors: ErrorStat[];
  sessions: SessionResult[];
  reviewState: SpacedReviewState | null;
  loading: boolean;
  loadError: string;
  dueReviewQueue: ReturnType<typeof buildDueReviewQueue>;
  confirmDrillDeparture: () => boolean;
  selectTrainingTab: (tab: "review" | "roots", force?: boolean) => boolean;
  setZone: (zone: (typeof ROOT_ZONES)[number]) => void;
};

export function useTrainingPlan({
  plan,
  setPlan,
  setPlanMessage,
  articles,
  entries,
  errors,
  sessions,
  reviewState,
  loading,
  loadError,
  confirmDrillDeparture,
  selectTrainingTab,
  setZone,
}: Options) {
  useEffect(() => {
    if (
      loading ||
      loadError ||
      plan ||
      !reviewState ||
      !entries.length ||
      !articles.length
    ) {
      return;
    }
    let active = true;
    void withStorageWriteLock(() => {
      if (!active) return;
      const latest = readTrainingPlan();
      if (latest?.date === localDateKey(new Date())) { setPlan(latest); return; }
      const next = generateDailyTrainingPlan({
        date: localDateKey(new Date()),
        articles,
        progress: getProgress(),
        sessions: getSessions(),
        weakItems: getErrors(),
        entries,
        dueReviewItems: buildDueReviewQueue(readSpacedReviewState()).items
          .filter((item) => item.targetType !== "hesitation" && item.code)
          .map((item): WubiEntry => [
            item.text,
            item.code as string,
            item.expectedBenefit,
          ]),
        preferredLength: readSettings().preferredLength,
      });
      if (writeTrainingPlan(next)) {
        setPlan(next);
        setPlanMessage("");
      } else {
        setPlanMessage("今日计划未能保存，请检查浏览器存储空间。");
      }
    }).catch(() => { if (active) setPlanMessage("今日计划暂时无法安全保存，请重试。"); });
    return () => { active = false; };
  }, [articles, entries, errors, loadError, loading, plan, reviewState, sessions, setPlan, setPlanMessage]);

  const explainedWeaknesses = useMemo(
    () => errors
      .map((item) => ({ item, result: scoreWeakItem(item) }))
      .sort((left, right) =>
        right.result.score - left.result.score ||
        left.item.text.localeCompare(right.item.text),
      )
      .slice(0, 5),
    [errors],
  );
  const startPlanTask = async (task: TrainingTask) => {
    if (!confirmDrillDeparture()) return false;
    const next = await startTrainingTask(task.id);
    if (!next) {
      setPlanMessage("任务状态未能保存，本次练习不会计入今日处方。");
      return false;
    }
    setPlan(next);
    setPlanMessage("");
    if (task.type === "review") {
      selectTrainingTab("review", true);
    } else if (task.type === "roots") {
      const nextZone = ROOT_ZONES.find((item) => item.id === task.zoneId);
      if (nextZone) setZone(nextZone);
      selectTrainingTab("roots", true);
    }
    return true;
  };

  const changePlanGroup = async () => withStorageWriteLock(() => {
    const plan = readTrainingPlan();
    if (!plan) return;
    const next = regenerateIncompleteTasks(plan, {
      date: plan.date,
      articles,
      progress: getProgress(),
      sessions: getSessions(),
      weakItems: getErrors(),
      entries,
      dueReviewItems: buildDueReviewQueue(readSpacedReviewState()).items
        .filter((item) => item.targetType !== "hesitation" && item.code)
        .map((item): WubiEntry => [
          item.text,
          item.code as string,
          item.expectedBenefit,
        ]),
      preferredLength: readSettings().preferredLength,
    });
    const before = plan.tasks
      .filter((task) => task.status !== "completed")
      .map((task) => `${task.articleId ?? ""}:${task.items.map(([text]) => text).join("")}`)
      .join("|");
    const after = next.tasks
      .filter((task) => task.status !== "completed")
      .map((task) => `${task.articleId ?? ""}:${task.items.map(([text]) => text).join("")}`)
      .join("|");
    if (before === after) {
      setPlanMessage("当前没有足够的替代题目，已保留这组处方。");
      return;
    }
    if (writeTrainingPlan(next)) {
      setPlan(next);
      setPlanMessage(
        plan.tasks.some((task) => task.status === "completed")
          ? "已更换未完成任务，已完成项保持不变。"
          : "已换一组，今日计划已保存。",
      );
    } else {
      setPlanMessage("新分组未能保存，原计划保持不变。");
    }
  }).catch(() => setPlanMessage("新分组暂时无法安全保存，请重试。"));

  const prescribedReview = plan?.tasks.find(
    (task) => task.type === "review" && task.status === "in-progress",
  );
  const prescribedRoots = plan?.tasks.find(
    (task) => task.type === "roots" && task.status === "in-progress",
  );
  const planCompleted = Boolean(
    plan?.tasks.every((task) => task.status === "completed"),
  );
  const trainingSummary = planCompleted && plan
    ? buildTrainingSummary(plan, errors, sessions)
    : null;
  const nextTrainingTask = plan ? getNextTrainingTask(plan.tasks) : null;

  return { startPlanTask, changePlanGroup, prescribedReview, prescribedRoots, planCompleted, trainingSummary, nextTrainingTask, explainedWeaknesses };
}
