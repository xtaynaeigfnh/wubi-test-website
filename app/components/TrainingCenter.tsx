"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildReviewPool,
  buildRootPool,
  calculateAccuracy,
  calculateDailyProgress,
  calculateStreak,
  defaultDailyGoal,
  getErrors,
  getProgress,
  getSessions,
  loadArticles,
  loadWubiChallenge,
  localDateKey,
  readDailyGoal,
  readSettings,
  readTrainingPlan,
  recordKeyUsage,
  savePracticeOutcome,
  startTrainingTask,
  STORAGE,
  writeLocal,
  writeTrainingPlan,
} from "../lib";
import type {
  DailyTrainingPlan,
  DailyGoal,
  ErrorStat,
  HesitationPracticeQueue,
  HesitationPracticeTarget,
  PracticeArticle,
  SessionResult,
  TrainingTask,
  WeakObservation,
  WubiEntry,
} from "../types";
import {
  buildTrainingSummary,
  generateDailyTrainingPlan,
  regenerateIncompleteTasks,
  ROOT_ZONES,
} from "../training-plan";
import { ErrorState } from "./Ui";

type TrainingTab = "plan" | "review" | "roots";

export function TrainingCenter({
  playKeySound,
  hesitationQueue,
  hesitationSaveRevision,
  onPracticeHesitation,
}: {
  playKeySound: () => void;
  hesitationQueue: HesitationPracticeQueue | null;
  hesitationSaveRevision: number;
  onPracticeHesitation: (
    itemId: string,
    target: HesitationPracticeTarget,
  ) => void;
}) {
  const [tab, setTab] = useState<TrainingTab>("plan");
  const [entries, setEntries] = useState<WubiEntry[]>([]);
  const [articles, setArticles] = useState<PracticeArticle[]>([]);
  const [errors, setErrors] = useState<ErrorStat[]>([]);
  const [sessions, setSessions] = useState<SessionResult[]>([]);
  const [plan, setPlan] = useState<DailyTrainingPlan | null>(null);
  const [planMessage, setPlanMessage] = useState("");
  const [goal, setGoal] = useState<DailyGoal>(defaultDailyGoal);
  const [zone, setZone] = useState<(typeof ROOT_ZONES)[number]>(ROOT_ZONES[2]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);

  const refreshLocal = useCallback(() => {
    setErrors(getErrors());
    setSessions(getSessions());
    setGoal(readDailyGoal());
    const storedPlan = readTrainingPlan();
    setPlan(
      storedPlan?.date === localDateKey(new Date()) ? storedPlan : null,
    );
  }, []);

  useEffect(refreshLocal, [hesitationSaveRevision, refreshLocal]);

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

  useEffect(() => {
    if (loading || loadError || plan || !entries.length || !articles.length) {
      return;
    }
    const next = generateDailyTrainingPlan({
      date: localDateKey(new Date()),
      articles,
      progress: getProgress(),
      sessions,
      weakItems: errors,
      entries,
      preferredLength: readSettings().preferredLength,
    });
    if (writeTrainingPlan(next)) {
      setPlan(next);
      setPlanMessage("");
    } else {
      setPlanMessage("今日计划未能保存，请检查浏览器存储空间。");
    }
  }, [articles, entries, errors, loadError, loading, plan, sessions]);

  const reviewPool = useMemo(
    () => buildReviewPool(errors, entries),
    [entries, errors],
  );
  const rootPool = useMemo(
    () => buildRootPool(entries, zone.keys),
    [entries, zone],
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
    setGoal(next);
    writeLocal(STORAGE.dailyGoal, next);
  };

  const onSessionSaved = () => {
    refreshLocal();
  };

  const startPlanTask = (task: TrainingTask) => {
    const next = startTrainingTask(task.id);
    if (!next) {
      setPlanMessage("任务状态未能保存，本次练习不会计入今日处方。");
      return false;
    }
    setPlan(next);
    setPlanMessage("");
    if (task.type === "article" && task.articleId) {
      writeLocal(STORAGE.current, task.articleId);
      writeLocal(STORAGE.currentGenerated, null);
    } else if (task.type === "review") {
      setTab("review");
    } else if (task.type === "roots") {
      const nextZone = ROOT_ZONES.find((item) => item.id === task.zoneId);
      if (nextZone) setZone(nextZone);
      setTab("roots");
    }
    return true;
  };

  const changePlanGroup = () => {
    if (!plan) return;
    const next = regenerateIncompleteTasks(plan, {
      date: plan.date,
      articles,
      progress: getProgress(),
      sessions,
      weakItems: errors,
      entries,
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
  };

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

  return (
    <section className="subpage training-page">
      <div className="subpage-heading training-heading">
        <div>
          <span className="eyebrow">从记录里找到下一步</span>
          <h1>今日训练中心</h1>
          <p>把文章、错字和五码根区排成一条能完成的训练路线。</p>
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

      <div className="training-tabs" role="tablist" aria-label="训练中心栏目">
        {([
          ["plan", "今日计划"],
          ["review", "错题复练"],
          ["roots", "五码根专项"],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            className={tab === value ? "active" : ""}
            onClick={() => setTab(value)}
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
        <div className="training-plan">
          <div className="daily-progress-card">
            <header className="panel-title training-card-header">
              <div className="training-card-heading">
                <span className="eyebrow">今日进度</span>
                <h2>三件事，练完就收手</h2>
              </div>
              <div
                className="training-card-stat"
                aria-label={`今日已完成 ${today.rounds} 轮`}
              >
                <strong>{today.rounds}</strong>
                <span>轮</span>
              </div>
            </header>
            <GoalRow
              label="文章字数"
              value={today.chars}
              target={goal.targetChars}
              unit="字"
            />
            <GoalRow
              label="有效时长"
              value={Math.round(today.minutes)}
              target={goal.targetMinutes}
              unit="分钟"
            />
            <GoalRow
              label="练习轮数"
              value={today.rounds}
              target={goal.targetRounds}
              unit="轮"
            />
            <div className="goal-editor">
              <label>
                每日字数
                <input
                  type="number"
                  min={100}
                  max={10000}
                  step={100}
                  value={goal.targetChars}
                  onChange={(event) =>
                    updateGoal("targetChars", Number(event.target.value))
                  }
                />
              </label>
              <label>
                每日分钟
                <input
                  type="number"
                  min={5}
                  max={180}
                  step={5}
                  value={goal.targetMinutes}
                  onChange={(event) =>
                    updateGoal("targetMinutes", Number(event.target.value))
                  }
                />
              </label>
              <label>
                每日轮数
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={goal.targetRounds}
                  onChange={(event) =>
                    updateGoal("targetRounds", Number(event.target.value))
                  }
                />
              </label>
            </div>
          </div>

          <div className="smart-plan-card adaptive-plan-card">
            <header className="panel-title training-card-header">
              <div className="training-card-heading">
                <span className="eyebrow">自适应训练处方</span>
                <h2>{planCompleted ? "今日处方已完成" : "三步练完，验证弱项是否下降"}</h2>
              </div>
              <div
                className="training-card-stat"
                aria-label={plan ? `今日处方预计 ${plan.estimatedMinutes} 分钟` : "正在生成今日处方"}
              >
                <strong>{plan?.estimatedMinutes ?? "—"}</strong>
                <span>分钟</span>
              </div>
            </header>
            {planMessage && <p className="plan-message" role="status">{planMessage}</p>}
            {!plan ? (
              <div className="training-empty" role="status" aria-busy={loading}>
                {loading ? "正在按近期记录整理今日处方…" : "今日处方暂时不可用。"}
              </div>
            ) : trainingSummary ? (
              <div className="training-completion-summary" role="status">
                <div className="summary-ledger">
                  <span><b>{trainingSummary.rounds}</b>轮完成</span>
                  <span><b>{Math.max(1, Math.round(trainingSummary.durationSeconds / 60))}</b>分钟实练</span>
                  <span><b>{trainingSummary.resolved.length}</b>个弱项已下降</span>
                </div>
                {trainingSummary.remaining.length ? (
                  <div className="remaining-weaknesses">
                    <h3>仍需复练</h3>
                    <ul>
                      {trainingSummary.remaining.map((item) => (
                        <li key={item.text}>
                          <strong>{item.text}</strong>
                          <span>{item.reason}</span>
                          <b>{item.score}</b>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p>计划中的弱项已降到复练线以下。</p>
                )}
                <p>明日会根据今天的正确连击和新问题重新排序。</p>
              </div>
            ) : (
              <>
                <ol className="plan-steps adaptive-plan-steps">
                  {plan.tasks.map((task, index) => {
                    const statusLabel = task.status === "completed"
                      ? "已完成"
                      : task.status === "in-progress"
                        ? "进行中"
                        : "待开始";
                    const actionLabel = task.status === "in-progress"
                      ? "继续练习"
                      : task.type === "article"
                        ? "开始文章"
                        : task.type === "review"
                          ? "开始复练"
                          : "练这一组";
                    return (
                      <li key={task.id} data-status={task.status}>
                        <span aria-hidden="true">{["壹", "贰", "叁"][index]}</span>
                        <div className="plan-task-copy">
                          <div className="plan-task-title">
                            <strong>{task.title}</strong>
                            <small>{statusLabel} · 约 {task.estimatedMinutes} 分钟</small>
                          </div>
                          <p>{task.reason}</p>
                          <em>
                            {task.type === "article"
                              ? `${task.articleTitle ?? "推荐文章"} · ${task.articleWordCount ?? 0} 字`
                              : task.type === "review"
                                ? `${task.items.length} 题 · ${task.items.slice(0, 6).map(([text]) => text).join("、")}`
                                : `${task.zoneKeys} · ${task.items.length} 题`}
                          </em>
                        </div>
                        {task.status === "completed" ? (
                          <span className="plan-task-done" aria-label={`${task.title}已完成`}>✓ 已完成</span>
                        ) : task.type === "article" ? (
                          <Link
                            href="/"
                            onClick={(event) => {
                              if (!startPlanTask(task)) event.preventDefault();
                            }}
                          >
                            {actionLabel}
                          </Link>
                        ) : (
                          <button onClick={() => startPlanTask(task)}>{actionLabel}</button>
                        )}
                      </li>
                    );
                  })}
                </ol>
                <div className="plan-actions">
                  <button className="button secondary" onClick={changePlanGroup}>
                    换一组
                  </button>
                  <span>只替换未完成任务，已完成记录会保留。</span>
                </div>
              </>
            )}
          </div>

          <section className="hesitation-queue-card" aria-labelledby="hesitation-queue-title">
            <header className="panel-title training-card-header">
              <div className="training-card-heading">
                <span className="eyebrow">卡顿片段加练</span>
                <h2 id="hesitation-queue-title">当天加入，当天练完</h2>
              </div>
              <div
                className="training-card-stat"
                aria-label={`卡顿加练已完成 ${hesitationQueue?.items.filter((item) => item.status === "completed").length ?? 0} 项，共 ${hesitationQueue?.items.length ?? 0} 项`}
              >
                <strong>
                  {hesitationQueue?.items.filter((item) => item.status === "completed").length ?? 0}
                  <small> / {hesitationQueue?.items.length ?? 0}</small>
                </strong>
                <span>片段</span>
              </div>
            </header>
            {hesitationQueue?.items.length ? (
              <ol className="hesitation-queue-list">
                {hesitationQueue.items.map((item) => {
                  const statusLabel = item.status === "completed"
                    ? item.outcome === "mastered"
                      ? "已完成 · 暂时掌握"
                      : "已完成 · 仍需复练"
                    : item.status === "in-progress"
                      ? "进行中"
                      : "待开始";
                  return (
                    <li key={item.id} data-status={item.status}>
                      <div className="hesitation-queue-copy">
                        <span>{item.target.sourceTitle}</span>
                        <strong>“{item.target.text}”</strong>
                        <small>
                          {Array.from(item.target.text).length} 字 · 约 {item.estimatedMinutes} 分钟 · {statusLabel}
                        </small>
                        {item.completedAt && (
                          <time dateTime={item.completedAt}>
                            {new Date(item.completedAt).toLocaleTimeString("zh-CN", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })} 完成
                          </time>
                        )}
                      </div>
                      <button
                        className="button secondary"
                        onClick={() => onPracticeHesitation(item.id, item.target)}
                      >
                        {item.status === "completed"
                          ? "再练一组"
                          : item.status === "in-progress"
                            ? "继续三连练"
                            : "开始三连练"}
                      </button>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <div className="hesitation-queue-empty" role="status">
                <strong>今天还没有加练片段</strong>
                <span>完成文章后，在卡顿热力图中选择值得复练的位置。</span>
              </div>
            )}
            <p className="hesitation-queue-note">
              加练独立于上方三项处方，不影响三项完成总结；每天最多 5 个片段。
            </p>
          </section>
        </div>
      )}

      {tab === "review" && (
        <CodeDrill
          key={prescribedReview?.id ?? `review-${reviewPool.map((entry) => entry[0]).join("")}`}
          title={prescribedReview?.title ?? "高频错题复练"}
          description={prescribedReview?.reason ?? "错误越多、掌握度越低的字会排得越靠前。连续答对会逐步提高掌握度。"}
          emptyText="还没有可复练的错字。先完成一篇文章或一轮字码挑战。"
          pool={prescribedReview?.items ?? reviewPool}
          sessionType="review"
          playKeySound={playKeySound}
          planTask={prescribedReview}
          onSessionSaved={() => {
            onSessionSaved();
            if (prescribedReview) setTab("plan");
          }}
        />
      )}

      {tab === "roots" && (
        <div className="root-training">
          <div className="root-zone-rail" role="tablist" aria-label="五码根区">
            {ROOT_ZONES.map((item) => (
              <button
                key={item.id}
                role="tab"
                aria-selected={zone.id === item.id}
                className={zone.id === item.id ? "active" : ""}
                disabled={Boolean(prescribedRoots)}
                onClick={() => setZone(item)}
              >
                <b>{item.keys}</b>
                <strong>{item.label}</strong>
                <small>{item.note}</small>
              </button>
            ))}
          </div>
          <CodeDrill
            key={prescribedRoots?.id ?? zone.id}
            title={prescribedRoots?.title ?? `${zone.label}专项`}
            description={prescribedRoots?.reason ?? `${zone.keys} 为首码的常用单字，集中训练起笔判断与键位记忆。`}
            emptyText={loading ? "正在整理题库…" : "这一分区暂时没有可用题目。"}
            pool={prescribedRoots?.items ?? rootPool}
            sessionType="roots"
            playKeySound={playKeySound}
            planTask={prescribedRoots}
            onSessionSaved={() => {
              onSessionSaved();
              if (prescribedRoots) setTab("plan");
            }}
          />
        </div>
      )}
    </section>
  );
}

function GoalRow({
  label,
  value,
  target,
  unit,
}: {
  label: string;
  value: number;
  target: number;
  unit: string;
}) {
  const rate = Math.min(1, value / Math.max(1, target));
  return (
    <div className="goal-row">
      <span>{label}</span>
      <i aria-hidden="true">
        <b style={{ width: `${rate * 100}%` }} />
      </i>
      <strong>
        {value} / {target} {unit}
      </strong>
    </div>
  );
}

function CodeDrill({
  title,
  description,
  emptyText,
  pool,
  sessionType,
  playKeySound,
  planTask,
  onSessionSaved,
}: {
  title: string;
  description: string;
  emptyText: string;
  pool: WubiEntry[];
  sessionType: "review" | "roots";
  playKeySound: () => void;
  planTask?: TrainingTask;
  onSessionSaved: () => void;
}) {
  const limit = planTask ? pool.length : 20;
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [question, setQuestion] = useState<WubiEntry | null>(null);
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState<"idle" | "right" | "wrong">("idle");
  const [answered, setAnswered] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [mistakes, setMistakes] = useState<WubiEntry[]>([]);
  const startedAt = useRef(0);
  const seen = useRef(new Set<string>());
  const orderedIndex = useRef(0);
  const observations = useRef<WeakObservation[]>([]);
  const advanceTimer = useRef<number | null>(null);

  const nextQuestion = useCallback(() => {
    if (planTask) {
      const next = pool[orderedIndex.current];
      if (!next) return;
      orderedIndex.current += 1;
      setQuestion(next);
      setInput("");
      setFeedback("idle");
      return;
    }
    let candidates = pool.filter(([text]) => !seen.current.has(text));
    if (!candidates.length) {
      seen.current.clear();
      candidates = pool;
    }
    if (!candidates.length) return;
    const topWindow = candidates.slice(0, Math.min(30, candidates.length));
    const next = topWindow[Math.floor(Math.random() * topWindow.length)];
    seen.current.add(next[0]);
    setQuestion(next);
    setInput("");
    setFeedback("idle");
  }, [planTask, pool]);

  useEffect(
    () => () => {
      if (advanceTimer.current !== null) {
        window.clearTimeout(advanceTimer.current);
      }
    },
    [],
  );

  const start = () => {
    seen.current.clear();
    orderedIndex.current = 0;
    observations.current = [];
    startedAt.current = Date.now();
    setStarted(true);
    setFinished(false);
    setAnswered(0);
    setCorrect(0);
    setMistakes([]);
    nextQuestion();
  };

  const finish = (finalAnswered: number, finalCorrect: number) => {
    const durationSeconds = Math.max(1, (Date.now() - startedAt.current) / 1000);
    const session: SessionResult = {
      id: crypto.randomUUID(),
      type: sessionType,
      title,
      date: new Date().toISOString(),
      durationSeconds,
      correctChars: finalCorrect,
      attemptedChars: finalAnswered,
      speed: Math.round(finalCorrect / (durationSeconds / 60)),
      kps: 0,
      codeLength: 0,
      accuracy: calculateAccuracy(finalCorrect, finalAnswered),
      errors: finalAnswered - finalCorrect,
      errorChars: observations.current
        .filter((item) => item.kind === "coding-error")
        .map((item) => item.text),
      trainingTaskId: planTask?.id,
    };
    const saved = savePracticeOutcome(session, observations.current);
    if (!saved) {
      window.alert("本次成绩未能保存，请检查浏览器存储空间后再试。");
    }
    setStarted(false);
    setFinished(true);
    onSessionSaved();
  };

  const advance = (wasCorrect: boolean) => {
    const nextAnswered = answered + 1;
    const nextCorrect = correct + (wasCorrect ? 1 : 0);
    setAnswered(nextAnswered);
    if (wasCorrect) setCorrect(nextCorrect);
    if (nextAnswered >= Math.min(limit, Math.max(1, pool.length))) {
      finish(nextAnswered, nextCorrect);
      return;
    }
    nextQuestion();
  };

  const submit = () => {
    if (!question || !input || feedback !== "idle") return;
    const right = input.toLowerCase() === question[1].toLowerCase();
    setFeedback(right ? "right" : "wrong");
    observations.current.push({
      text: question[0],
      code: question[1],
      kind: right ? "correct" : "coding-error",
    });
    if (!right) {
      setMistakes((rows) => [...rows, question]);
      return;
    }
    advanceTimer.current = window.setTimeout(() => advance(true), 420);
  };

  if (!pool.length) {
    return <div className="training-empty" role="status">{emptyText}</div>;
  }

  return (
    <div className="code-drill">
      <div className="code-drill-copy">
        <span className="eyebrow">20 题一轮</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {!started ? (
        <div className="drill-start">
          <div>
            <strong>{finished ? `${correct} / ${answered}` : pool.length}</strong>
            <span>{finished ? "本轮答对" : "题库可用题目"}</span>
          </div>
          {finished && (
            <p>
              准确率 {calculateAccuracy(correct, answered).toFixed(1)}%，
              {mistakes.length ? `还有 ${mistakes.length} 题需要巩固。` : "本轮全部答对。"}
            </p>
          )}
          <button className="button primary" onClick={start}>
            {finished ? "再练一轮" : "开始专项"}
          </button>
        </div>
      ) : (
        <div className={`drill-running ${feedback}`}>
          <div className="drill-progress">
            <span>第 {answered + 1} / {Math.min(limit, pool.length)} 题</span>
            <strong>答对 {correct}</strong>
          </div>
          <div className="drill-question" key={question?.[0]}>
            {question?.[0]}
          </div>
          <div className="code-slots" aria-hidden="true">
            {Array.from({ length: question?.[1].length ?? 4 }, (_, index) => (
              <span key={index} className={input[index] ? "filled" : ""}>
                {input[index]?.toUpperCase() || "·"}
              </span>
            ))}
          </div>
          <input
            autoFocus
            className={`code-input ${feedback}`}
            aria-label={`${question?.[0]}的五笔编码`}
            aria-invalid={feedback === "wrong"}
            value={input}
            readOnly={feedback !== "idle"}
            maxLength={question?.[1].length ?? 4}
            onChange={(event) =>
              setInput(
                event.target.value.replace(/[^a-y]/gi, "").toLowerCase(),
              )
            }
            onKeyDown={(event) => {
              if (!["Shift", "Control", "Alt", "Meta", "CapsLock"].includes(event.key)) {
                recordKeyUsage(event.code);
                playKeySound();
              }
              if (event.key === "Enter" && feedback === "idle") submit();
              if (event.key === "Enter" && feedback === "wrong") advance(false);
            }}
            placeholder="输入编码后回车"
          />
          <div className="feedback-region" aria-live="assertive">
            {feedback === "right" && <p className="feedback right">正确，继续下一题</p>}
            {feedback === "wrong" && (
              <div className="wrong-answer" role="alert">
                <span>这题再记一次</span>
                <p>
                  你的输入 <del>{input.toUpperCase()}</del>
                  <i aria-hidden="true">→</i>
                  正确编码 <strong>{question?.[1].toUpperCase()}</strong>
                </p>
                <button className="button danger" onClick={() => advance(false)}>
                  记住了，下一题（回车）
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
