"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadArticles, loadWubiChallenge } from "../content-loader";
import { buildPhraseTrainingPool } from "../phrase-training";
import { defaultDailyGoal } from "../practice-schema";
import { calculateDailyProgress, calculateStreak } from "../practice-statistics";
import {
  getErrors,
  getPhraseOpportunities,
  getSessions,
  localDateKey,
  readHesitationQueue,
  readSpacedReviewState,
  readTrainingPlan,
  syncSpacedReviewState,
} from "../practice-transactions";
import { readDailyGoal } from "../settings-store";
import { type SpacedReviewItem, type SpacedReviewState } from "../spaced-review";
import { STORAGE, writeLocal } from "../storage";
import { ROOT_ZONES } from "../training-plan";
import { buildReviewPool, buildRootPool } from "../training-pools";
import type {
  DailyGoal,
  DailyTrainingPlan,
  ErrorStat,
  HesitationPracticeQueue,
  HesitationPracticeTarget,
  PhraseOpportunityStat,
  PracticeArticle,
  SessionResult,
  WubiEntry,
} from "../types";
import { DailyGoalCard } from "./training/DailyGoalCard";
import { DailyTrainingPlanCard } from "./training/DailyTrainingPlanCard";
import { DueReviewQueue } from "./training/DueReviewQueue";
import { HesitationQueueCard } from "./training/HesitationQueueCard";
import { PhrasePractice } from "./training/PhrasePractice";
import { ReviewPractice } from "./training/ReviewPractice";
import { RootPractice } from "./training/RootPractice";
import { TrainingBrief } from "./TrainingBrief";
import { ErrorState } from "./Ui";
import { useInProgressLeaveGuard, usePendingSaveGuard } from "./hooks/useLeaveGuards";
import { useLocalDataSync } from "./hooks/useLocalDataSync";
import { useLocalDateKey } from "./hooks/useLocalDateKey";

import { useDueReviews } from "./training/useDueReviews";
import { useTrainingPlan } from "./training/useTrainingPlan";

const TRAINING_TABS = [
  ["plan", "今日计划"],
  ["review", "错题复练"],
  ["phrase", "词组专项"],
  ["roots", "五码根专项"],
] as const;
type TrainingTab = (typeof TRAINING_TABS)[number][0];
const trainingSyncKeys = [
  STORAGE.sessions,
  STORAGE.errors,
  STORAGE.phraseOpportunities,
  STORAGE.dailyGoal,
  STORAGE.hesitationQueue,
  STORAGE.reviewState,
  STORAGE.trainingPlan,
];

export function TrainingCenter({
  playKeySound,
  hesitationQueue,
  hesitationSaveRevision,
  onPracticeHesitation,
  phraseSuggestions = [],
}: {
  playKeySound: () => void;
  hesitationQueue: HesitationPracticeQueue | null;
  hesitationSaveRevision: number;
  onPracticeHesitation: (
    itemId: string,
    target: HesitationPracticeTarget,
  ) => void;
  /** 可由结算页传入的码长诊断推荐；未传时会从弱项统计稳定推导。 */
  phraseSuggestions?: WubiEntry[];
}) {
  const [tab, setTab] = useState<TrainingTab>("plan");
  const [entries, setEntries] = useState<WubiEntry[]>([]);
  const [articles, setArticles] = useState<PracticeArticle[]>([]);
  const [errors, setErrors] = useState<ErrorStat[]>([]);
  const [phraseOpportunities, setPhraseOpportunities] = useState<
    PhraseOpportunityStat[]
  >([]);
  const [sessions, setSessions] = useState<SessionResult[]>([]);
  const [reviewState, setReviewState] = useState<SpacedReviewState | null>(null);
  const [activeDueReview, setActiveDueReview] =
    useState<SpacedReviewItem | null>(null);
  const [reviewMessage, setReviewMessage] = useState("");
  const [plan, setPlan] = useState<DailyTrainingPlan | null>(null);
  const [planMessage, setPlanMessage] = useState("");
  const [goal, setGoal] = useState<DailyGoal>(defaultDailyGoal);
  const [zone, setZone] = useState<(typeof ROOT_ZONES)[number]>(ROOT_ZONES[2]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [pendingDrillSave, setPendingDrillSave] = useState(false);
  const [drillInProgress, setDrillInProgress] = useState(false);
  const [drillResetRevision, setDrillResetRevision] = useState(0);
  const [currentHesitationQueue, setCurrentHesitationQueue] =
    useState<HesitationPracticeQueue | null>(hesitationQueue);
  const activeLocalDate = useRef(localDateKey(new Date()));
  const drillInProgressRef = useRef(false);
  const pendingDrillSaveRef = useRef(false);
  const tabTransitionLockRef = useRef(false);
  usePendingSaveGuard(pendingDrillSave);
  useInProgressLeaveGuard(
    drillInProgress && !pendingDrillSave,
    () => {
      drillInProgressRef.current = false;
      setDrillInProgress(false);
      setDrillResetRevision((value) => value + 1);
    },
  );

  const handleDrillProgressChange = useCallback((inProgress: boolean) => {
    drillInProgressRef.current = inProgress;
    setDrillInProgress(inProgress);
  }, []);

  const handlePendingSaveChange = useCallback((pending: boolean) => {
    pendingDrillSaveRef.current = pending;
    setPendingDrillSave(pending);
  }, []);

  const refreshLocal = useCallback(() => {
    if (pendingDrillSaveRef.current || drillInProgressRef.current) return;
    const nextLocalDate = localDateKey(new Date());
    if (activeLocalDate.current !== nextLocalDate) {
      activeLocalDate.current = nextLocalDate;
      setActiveDueReview(null);
    }
    setErrors(getErrors());
    setPhraseOpportunities(getPhraseOpportunities());
    setSessions(getSessions());
    setGoal(readDailyGoal());
    setCurrentHesitationQueue(readHesitationQueue());
    const syncedReviewState = syncSpacedReviewState();
    setReviewState(syncedReviewState ?? readSpacedReviewState());
    if (!syncedReviewState) {
      setReviewMessage("到期队列未能更新，已显示上次保存的状态。");
    }
    const storedPlan = readTrainingPlan();
    setPlan(
      storedPlan?.date === localDateKey(new Date()) ? storedPlan : null,
    );
  }, []);

  // 跨过午夜、保存完成或放弃练习后重新读取；refreshLocal 自身会跳过进行中或待保存的练习。
  const localDate = useLocalDateKey();
  useEffect(() => {
    if (!pendingDrillSave) refreshLocal();
  }, [hesitationSaveRevision, pendingDrillSave, drillInProgress, refreshLocal, localDate]);
  useLocalDataSync(refreshLocal, { keys: trainingSyncKeys, immediate: false });

  useEffect(() => {
    if (
      !pendingDrillSave &&
      hesitationQueue?.date === localDateKey(new Date())
    ) {
      setCurrentHesitationQueue(hesitationQueue);
    }
  }, [hesitationQueue, pendingDrillSave]);

  useEffect(() => {
    const syncTabFromLocation = () => {
      if (pendingDrillSaveRef.current || drillInProgressRef.current) return;
      const requested = new URLSearchParams(window.location.search).get("tab");
      const next = TRAINING_TABS.some(([value]) => value === requested)
        ? (requested as TrainingTab)
        : "plan";
      setTab(next);
    };
    syncTabFromLocation();
    window.addEventListener("popstate", syncTabFromLocation);
    return () => window.removeEventListener("popstate", syncTabFromLocation);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    Promise.all([loadWubiChallenge(), loadArticles()])
      .then(([rows, loadedArticles]) => {
        if (active) {
          setEntries(rows);
          setArticles(loadedArticles);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setLoadError(
            error instanceof Error ? error.message : "专项训练题库加载失败",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadAttempt]);

  const reviewPool = useMemo(
    () => buildReviewPool(errors, entries),
    [entries, errors],
  );
  const rootPool = useMemo(
    () => buildRootPool(entries, zone.keys),
    [entries, zone],
  );
  const phrasePool = useMemo(
    () =>
      buildPhraseTrainingPool(entries, {
        weakItems: errors,
        missedPhrases: phraseOpportunities,
        suggestedEntries: phraseSuggestions,
      }),
    [entries, errors, phraseOpportunities, phraseSuggestions],
  );
  const today = calculateDailyProgress(sessions);
  const streak = calculateStreak(sessions);
  const goalRates = {
    chars: Math.min(1, today.chars / goal.targetChars),
    minutes: Math.min(1, today.minutes / goal.targetMinutes),
    rounds: Math.min(1, today.rounds / goal.targetRounds),
  };
  const totalRate =
    (goalRates.chars + goalRates.minutes + goalRates.rounds) / 3;
  const updateGoal = (key: keyof DailyGoal, value: number) => {
    const limits = {
      targetChars: [100, 10000],
      targetMinutes: [5, 180],
      targetRounds: [1, 20],
    } as const;
    const [minimum, maximum] = limits[key];
    const next = {
      ...goal,
      [key]: Math.min(
        maximum,
        Math.max(minimum, Math.round(value || minimum)),
      ),
    };
    if (!writeLocal(STORAGE.dailyGoal, next)) {
      setPlanMessage("每日目标未能保存，原目标保持不变。");
      return;
    }
    setGoal(next);
    setPlanMessage("");
  };

  const onSessionSaved = () => {
    refreshLocal();
  };

  const confirmDrillDeparture = () => {
    if (pendingDrillSaveRef.current) {
      window.alert("本轮成绩尚未保存，请先重试保存。");
      return false;
    }
    if (!drillInProgressRef.current) return true;
    if (!window.confirm("本轮练习尚未完成，确定放弃并切换吗？")) return false;
    drillInProgressRef.current = false;
    setDrillInProgress(false);
    setDrillResetRevision((value) => value + 1);
    tabTransitionLockRef.current = true;
    window.requestAnimationFrame(() => {
      tabTransitionLockRef.current = false;
    });
    return true;
  };

  const selectTrainingTab = (next: TrainingTab, force = false) => {
    if (next === tab) return false;
    if (!force && tabTransitionLockRef.current) return false;
    if (!force && !confirmDrillDeparture()) return false;
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "plan") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
    return true;
  };

  const selectRootZone = (nextZone: (typeof ROOT_ZONES)[number]) => {
    if (nextZone.id === zone.id) return;
    if (!confirmDrillDeparture()) return;
    setZone(nextZone);
  };

  const moveTrainingTab = (current: TrainingTab, direction: -1 | 1) => {
    const currentIndex = TRAINING_TABS.findIndex(([value]) => value === current);
    const nextIndex =
      (currentIndex + direction + TRAINING_TABS.length) % TRAINING_TABS.length;
    const next = TRAINING_TABS[nextIndex][0];
    if (!selectTrainingTab(next)) return;
    setActiveDueReview(null);
    window.requestAnimationFrame(() => {
      document.getElementById(`training-tab-${next}`)?.focus();
    });
  };

  const { dueReviewQueue, activeDuePool, startDueReview, deferDueReview } = useDueReviews({
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
  });

  const { startPlanTask, changePlanGroup, prescribedReview, prescribedRoots, planCompleted, trainingSummary, nextTrainingTask, explainedWeaknesses } = useTrainingPlan({
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
    dueReviewQueue,
    confirmDrillDeparture,
    selectTrainingTab,
    setZone,
  });

  const dailyProgressCard = (
    <DailyGoalCard
      today={today}
      goal={goal}
      updateGoal={updateGoal}
    />
  );

  return (
    <section className="subpage training-page">
      <div className="subpage-heading training-heading">
        <div>
          <span className="eyebrow">从记录里找到下一步</span>
          <h1>今日训练中心</h1>
          <p>按近期记录安排练习，先知道为什么练，再看练完后的变化。</p>
        </div>
        <div
          className="goal-seal"
          style={{ "--goal-progress": `${totalRate * 360}deg` } as React.CSSProperties}
          aria-label={`今日综合目标完成 ${Math.round(totalRate * 100)}%`}
        >
          <strong>{Math.round(totalRate * 100)}%</strong>
          <span>连续 {streak} 天</span>
        </div>
      </div>

      <div className="training-tabs phrase-tabs" role="tablist" aria-label="训练中心栏目">
        {TRAINING_TABS.map(([value, label]) => (
          <button
            key={value}
            id={`training-tab-${value}`}
            role="tab"
            aria-selected={tab === value}
            aria-controls={`training-panel-${value}`}
            tabIndex={tab === value ? 0 : -1}
            className={tab === value ? "active" : ""}
            onClick={() => {
              if (!selectTrainingTab(value)) return;
              setActiveDueReview(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") {
                event.preventDefault();
                moveTrainingTab(value, -1);
              } else if (event.key === "ArrowRight") {
                event.preventDefault();
                moveTrainingTab(value, 1);
              }
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {loadError && (
        <ErrorState
          title="专项训练暂时不可用"
          message={loadError}
          onRetry={() => setLoadAttempt((value) => value + 1)}
        />
      )}

      {tab === "plan" && (
        <div
          id="training-panel-plan"
          className="training-plan"
          role="tabpanel"
          aria-labelledby="training-tab-plan"
        >
          <TrainingBrief plan={plan} dueCount={dueReviewQueue.items.length} />
          <DueReviewQueue
            dueReviewQueue={dueReviewQueue}
            reviewMessage={reviewMessage}
            startDueReview={startDueReview}
            deferDueReview={deferDueReview}
          />

          <DailyTrainingPlanCard
            planCompleted={planCompleted}
            plan={plan}
            planMessage={planMessage}
            loading={loading}
            trainingSummary={trainingSummary}
            selectTrainingTab={selectTrainingTab}
            nextTrainingTask={nextTrainingTask}
            startPlanTask={startPlanTask}
            changePlanGroup={changePlanGroup}
            explainedWeaknesses={explainedWeaknesses}
          />

          {dailyProgressCard}

          <aside className="training-goal-bridge" aria-labelledby="training-goal-bridge-title">
            <div>
              <span className="eyebrow">从每日练习到阶段复测</span>
              <h2 id="training-goal-bridge-title">想确认进步，用同一篇文章复测</h2>
              <p>选择速度、准确率或码长等一项主目标，练 7 天或 14 天后，在同文、同条件下复测。今日三步用于日常巩固，阶段目标另有每天的核心任务。</p>
            </div>
            <Link className="button secondary" href="/advanced?tab=season">查看阶段目标</Link>
          </aside>

          <HesitationQueueCard
            currentHesitationQueue={currentHesitationQueue}
            onPracticeHesitation={onPracticeHesitation}
          />
        </div>
      )}

      {tab === "review" && (
        <ReviewPractice
          drillResetRevision={drillResetRevision}
          activeDueReview={activeDueReview}
          prescribedReview={prescribedReview}
          reviewPool={reviewPool}
          activeDuePool={activeDuePool}
          playKeySound={playKeySound}
          handlePendingSaveChange={handlePendingSaveChange}
          handleDrillProgressChange={handleDrillProgressChange}
          setActiveDueReview={setActiveDueReview}
          onSessionSaved={onSessionSaved}
          selectTrainingTab={selectTrainingTab}
        />
      )}

      {tab === "phrase" && (
        <PhrasePractice
          activeDueReview={activeDueReview}
          phraseSuggestions={phraseSuggestions}
          phraseOpportunities={phraseOpportunities}
          errors={errors}
          drillResetRevision={drillResetRevision}
          loading={loading}
          activeDuePool={activeDuePool}
          phrasePool={phrasePool}
          playKeySound={playKeySound}
          handlePendingSaveChange={handlePendingSaveChange}
          handleDrillProgressChange={handleDrillProgressChange}
          setActiveDueReview={setActiveDueReview}
          onSessionSaved={onSessionSaved}
          selectTrainingTab={selectTrainingTab}
        />
      )}

      {tab === "roots" && (
        <RootPractice
          zone={zone}
          prescribedRoots={prescribedRoots}
          pendingDrillSave={pendingDrillSave}
          selectRootZone={selectRootZone}
          drillResetRevision={drillResetRevision}
          loading={loading}
          rootPool={rootPool}
          playKeySound={playKeySound}
          handlePendingSaveChange={handlePendingSaveChange}
          handleDrillProgressChange={handleDrillProgressChange}
          onSessionSaved={onSessionSaved}
          selectTrainingTab={selectTrainingTab}
        />
      )}
    </section>
  );
}
