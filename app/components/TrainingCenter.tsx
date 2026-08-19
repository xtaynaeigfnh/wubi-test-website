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
  getSessions,
  loadWubiChallenge,
  readDailyGoal,
  recordKeyUsage,
  saveSession,
  STORAGE,
  updateErrorMastery,
  writeLocal,
} from "../lib";
import type {
  DailyGoal,
  ErrorStat,
  SessionResult,
  WubiEntry,
} from "../types";
import { ErrorState } from "./Ui";

const ROOT_ZONES = [
  { id: "pie", keys: "QWERT", label: "撇区", note: "从撇起笔的字根" },
  { id: "dian", keys: "YUIOP", label: "捺区", note: "点与捺起笔字根" },
  { id: "heng", keys: "ASDFG", label: "横区", note: "横起笔字根" },
  { id: "shu", keys: "HJKLM", label: "竖区", note: "竖起笔字根" },
  { id: "zhe", keys: "XCVBN", label: "折区", note: "折起笔字根" },
] as const;

type TrainingTab = "plan" | "review" | "roots";

export function TrainingCenter({
  playKeySound,
}: {
  playKeySound: () => void;
}) {
  const [tab, setTab] = useState<TrainingTab>("plan");
  const [entries, setEntries] = useState<WubiEntry[]>([]);
  const [errors, setErrors] = useState<ErrorStat[]>([]);
  const [sessions, setSessions] = useState<SessionResult[]>([]);
  const [goal, setGoal] = useState<DailyGoal>(defaultDailyGoal);
  const [zone, setZone] = useState<(typeof ROOT_ZONES)[number]>(ROOT_ZONES[2]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);

  const refreshLocal = useCallback(() => {
    setErrors(getErrors());
    setSessions(getSessions());
    setGoal(readDailyGoal());
  }, []);

  useEffect(refreshLocal, [refreshLocal]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    loadWubiChallenge()
      .then((rows) => {
        if (active) setEntries(rows);
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
  const today = calculateDailyProgress(sessions);
  const streak = calculateStreak(sessions);
  const goalRates = {
    chars: Math.min(1, today.chars / goal.targetChars),
    minutes: Math.min(1, today.minutes / goal.targetMinutes),
    rounds: Math.min(1, today.rounds / goal.targetRounds),
  };
  const totalRate =
    (goalRates.chars + goalRates.minutes + goalRates.rounds) / 3;
  const weakestZone = useMemo(() => {
    const scores = ROOT_ZONES.map((item) => ({
      item,
      score: errors.reduce((sum, error) => {
        const code = reviewPool.find(([text]) => text === error.text)?.[1];
        return code && item.keys.toLowerCase().includes(code[0])
          ? sum + Math.max(1, error.count - (error.mastery ?? 0))
          : sum;
      }, 0),
    }));
    return scores.sort((a, b) => b.score - a.score)[0]?.item ?? ROOT_ZONES[2];
  }, [errors, reviewPool]);

  const updateGoal = (key: keyof DailyGoal, value: number) => {
    const limits = {
      targetChars: [100, 10000],
      targetMinutes: [5, 180],
      targetRounds: [1, 20],
    } as const;
    const [minimum, maximum] = limits[key];
    const next = {
      ...goal,
      [key]: Math.min(maximum, Math.max(minimum, value || minimum)),
    };
    setGoal(next);
    writeLocal(STORAGE.dailyGoal, next);
  };

  const onReviewAnswer = (entry: WubiEntry, correct: boolean) => {
    setErrors(updateErrorMastery(entry[0], entry[1], correct));
  };

  const onSessionSaved = () => {
    setSessions(getSessions());
  };

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

          <div className="smart-plan-card">
            <header className="panel-title training-card-header">
              <div className="training-card-heading">
                <span className="eyebrow">智能推荐</span>
                <h2>今天从这里开始</h2>
              </div>
              <div
                className="training-card-stat"
                aria-label={errors.length ? `${errors.length} 个弱项` : "暂无错题"}
              >
                <strong>{errors.length}</strong>
                <span>{errors.length ? "个弱项" : "暂无错题"}</span>
              </div>
            </header>
            <ol className="plan-steps">
              <li>
                <span>壹</span>
                <div>
                  <strong>先完成一篇文章</strong>
                  <p>用完整上下文热手，并积累今天的速度基线。</p>
                </div>
                <Link href="/">开始文章</Link>
              </li>
              <li>
                <span>贰</span>
                <div>
                  <strong>再复练高频错字</strong>
                  <p>
                    {reviewPool.length
                      ? `已整理 ${reviewPool.length} 个可复练字词。`
                      : "完成文章或字码挑战后会自动积累错题。"}
                  </p>
                </div>
                <button
                  disabled={!reviewPool.length}
                  onClick={() => setTab("review")}
                >
                  开始复练
                </button>
              </li>
              <li>
                <span>叁</span>
                <div>
                  <strong>收尾练 {weakestZone.label}</strong>
                  <p>{weakestZone.keys} · 根据近期错字的首码分布推荐。</p>
                </div>
                <button
                  onClick={() => {
                    setZone(weakestZone);
                    setTab("roots");
                  }}
                >
                  练这一组
                </button>
              </li>
            </ol>
          </div>
        </div>
      )}

      {tab === "review" && (
        <CodeDrill
          key={`review-${reviewPool.map((entry) => entry[0]).join("")}`}
          title="高频错题复练"
          description="错误越多、掌握度越低的字会排得越靠前。连续答对会逐步提高掌握度。"
          emptyText="还没有可复练的错字。先完成一篇文章或一轮字码挑战。"
          pool={reviewPool}
          sessionType="review"
          playKeySound={playKeySound}
          onAnswer={onReviewAnswer}
          onSessionSaved={onSessionSaved}
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
                onClick={() => setZone(item)}
              >
                <b>{item.keys}</b>
                <strong>{item.label}</strong>
                <small>{item.note}</small>
              </button>
            ))}
          </div>
          <CodeDrill
            key={zone.id}
            title={`${zone.label}专项`}
            description={`${zone.keys} 为首码的常用单字，集中训练起笔判断与键位记忆。`}
            emptyText={loading ? "正在整理题库…" : "这一分区暂时没有可用题目。"}
            pool={rootPool}
            sessionType="roots"
            playKeySound={playKeySound}
            onSessionSaved={onSessionSaved}
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
  onAnswer,
  onSessionSaved,
}: {
  title: string;
  description: string;
  emptyText: string;
  pool: WubiEntry[];
  sessionType: "review" | "roots";
  playKeySound: () => void;
  onAnswer?: (entry: WubiEntry, correct: boolean) => void;
  onSessionSaved: () => void;
}) {
  const limit = 20;
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
  const advanceTimer = useRef<number | null>(null);

  const nextQuestion = useCallback(() => {
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
  }, [pool]);

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
    const saved = saveSession({
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
      errorChars: mistakes.map(([text]) => text),
    });
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
    onAnswer?.(question, right);
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
