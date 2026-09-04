"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildChallengePool,
  createLocalId,
  recordKeyUsage,
  savePracticeOutcome,
} from "../../lib";
import { loadWubiChallenge } from "../../content-loader";
import {
  calculateAccuracy,
  calculateRemainingSeconds,
} from "../../typing-metrics";
import type { SessionResult, WeakObservation, WubiEntry } from "../../types";
import { downloadShareCard } from "../../share-card";
import {
  ErrorState,
  useInProgressLeaveGuard,
  usePendingSaveGuard,
} from "../Ui";

type KeySoundPlayer = (options?: { force?: boolean }) => void;

export function ChallengeView({
  playKeySound,
}: {
  playKeySound: KeySoundPlayer;
}) {
  const [rows, setRows] = useState<WubiEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [mode, setMode] = useState<"char" | "phrase">("char");
  const [limit, setLimit] = useState<20 | 50>(20);
  const [timed, setTimed] = useState(false);
  const [started, setStarted] = useState(false);
  const [question, setQuestion] = useState<WubiEntry | null>(null);
  const [input, setInput] = useState("");
  const [index, setIndex] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [feedback, setFeedback] = useState<"idle" | "right" | "wrong">("idle");
  const [remaining, setRemaining] = useState(60);
  const [mistakes, setMistakes] = useState<Array<{ text: string; code: string; input: string }>>([]);
  const [finishedReason, setFinishedReason] = useState<"complete" | "timeout" | "">("");
  const [lastSession, setLastSession] = useState<SessionResult | null>(null);
  const [challengeSaveFailed, setChallengeSaveFailed] = useState(false);
  const startedAtRef = useRef(0);
  const startedRef = useRef(false);
  const challengeHiddenAtRef = useRef<number | null>(null);
  const challengeInactiveMsRef = useRef(0);
  const recordedRef = useRef(false);
  const nextTimerRef = useRef<number | null>(null);
  const deadlineRef = useRef(0);
  const seenQuestionsRef = useRef(new Set<string>());
  const submitLockRef = useRef(false);
  const advanceLockRef = useRef(false);
  const challengeObservationsRef = useRef<WeakObservation[]>([]);
  const pendingChallengeSaveRef = useRef<{
    session: SessionResult;
    observations: WeakObservation[];
  } | null>(null);

  const discardChallenge = useCallback(() => {
    startedRef.current = false;
    recordedRef.current = true;
    if (nextTimerRef.current !== null) {
      window.clearTimeout(nextTimerRef.current);
      nextTimerRef.current = null;
    }
    challengeHiddenAtRef.current = null;
    challengeInactiveMsRef.current = 0;
    seenQuestionsRef.current.clear();
    challengeObservationsRef.current = [];
    submitLockRef.current = false;
    advanceLockRef.current = false;
    setStarted(false);
    setQuestion(null);
    setInput("");
    setIndex(0);
    setCorrect(0);
    setFeedback("idle");
    setRemaining(60);
    setMistakes([]);
    setFinishedReason("");
    setLastSession(null);
  }, []);

  usePendingSaveGuard(challengeSaveFailed);
  useInProgressLeaveGuard(
    started && !challengeSaveFailed,
    discardChallenge,
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    loadWubiChallenge()
      .then((nextRows) => {
        if (active) setRows(nextRows);
      })
      .catch((error: unknown) => {
        if (active) {
          setLoadError(
            error instanceof Error ? error.message : "五笔码表加载失败",
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

  const pool = useMemo(() => {
    return buildChallengePool(rows, mode);
  }, [mode, rows]);

  const nextQuestion = useCallback(() => {
    if (!pool.length) return;
    let candidates = pool.filter(
      ([text]) => !seenQuestionsRef.current.has(text),
    );
    if (!candidates.length) {
      seenQuestionsRef.current.clear();
      candidates = pool;
    }
    const next = candidates[Math.floor(Math.random() * candidates.length)];
    seenQuestionsRef.current.add(next[0]);
    setQuestion(next);
    setInput("");
    setFeedback("idle");
    submitLockRef.current = false;
    advanceLockRef.current = false;
  }, [pool]);

  const finishChallenge = useCallback(
    (
      answered: number,
      correctAnswers: number,
      reason: "complete" | "timeout",
    ) => {
      if (recordedRef.current) return;
      recordedRef.current = true;
      startedRef.current = false;
      const now = Date.now();
      const elapsedSeconds = Math.max(
        0,
        (now -
          startedAtRef.current -
          (timed ? 0 : challengeInactiveMsRef.current) -
          (timed || challengeHiddenAtRef.current === null
            ? 0
            : now - challengeHiddenAtRef.current)) /
          1000,
      );
      const durationSeconds = timed
        ? Math.min(60, elapsedSeconds)
        : elapsedSeconds;
      if (answered > 0) {
        const session: SessionResult = {
          id: createLocalId(),
          type: "challenge",
          title: `${mode === "char" ? "单字" : "词组"}挑战${timed ? " · 60 秒" : ""}`,
          date: new Date().toISOString(),
          durationSeconds,
          correctChars: correctAnswers,
          attemptedChars: answered,
          speed:
            durationSeconds > 0
              ? Math.round(correctAnswers / (durationSeconds / 60))
              : 0,
          kps: 0,
          codeLength: 0,
          accuracy: calculateAccuracy(correctAnswers, answered),
          errors: answered - correctAnswers,
        };
        const pending = {
          session,
          observations: [...challengeObservationsRef.current],
        };
        pendingChallengeSaveRef.current = pending;
        if (!savePracticeOutcome(session, pending.observations)) {
          setChallengeSaveFailed(true);
          window.alert("本次成绩未能保存，请检查浏览器存储空间后再试。");
        } else {
          pendingChallengeSaveRef.current = null;
          setChallengeSaveFailed(false);
        }
        setLastSession(session);
      }
      if (nextTimerRef.current) {
        window.clearTimeout(nextTimerRef.current);
        nextTimerRef.current = null;
      }
      setFinishedReason(reason);
      setStarted(false);
    },
    [mode, timed],
  );

  useEffect(() => {
    if (!started || !timed) return;
    const updateRemaining = () => {
      setRemaining(calculateRemainingSeconds(deadlineRef.current));
    };
    updateRemaining();
    const timer = window.setInterval(updateRemaining, 250);
    return () => window.clearInterval(timer);
  }, [started, timed]);

  useEffect(() => {
    if (!started || timed) return;
    const onVisibilityChange = () => {
      const now = Date.now();
      if (document.visibilityState === "hidden") {
        if (challengeHiddenAtRef.current === null) {
          challengeHiddenAtRef.current = now;
        }
      } else if (challengeHiddenAtRef.current !== null) {
        challengeInactiveMsRef.current += now - challengeHiddenAtRef.current;
        challengeHiddenAtRef.current = null;
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [started, timed]);

  useEffect(() => {
    if (started && timed && remaining <= 0) {
      const answered = index + (feedback === "idle" ? 0 : 1);
      finishChallenge(answered, correct, "timeout");
    }
  }, [correct, feedback, finishChallenge, index, remaining, started, timed]);

  useEffect(
    () => () => {
      startedRef.current = false;
      if (nextTimerRef.current) window.clearTimeout(nextTimerRef.current);
    },
    [],
  );

  const start = () => {
    if (!pool.length || challengeSaveFailed) return;
    if (nextTimerRef.current) window.clearTimeout(nextTimerRef.current);
    recordedRef.current = false;
    advanceLockRef.current = false;
    challengeObservationsRef.current = [];
    seenQuestionsRef.current.clear();
    startedAtRef.current = Date.now();
    challengeHiddenAtRef.current = null;
    challengeInactiveMsRef.current = 0;
    deadlineRef.current = startedAtRef.current + 60_000;
    startedRef.current = true;
    setStarted(true);
    setIndex(0);
    setCorrect(0);
    setRemaining(60);
    setMistakes([]);
    setFinishedReason("");
    setLastSession(null);
    nextQuestion();
  };

  const retryChallengeSave = () => {
    const pending = pendingChallengeSaveRef.current;
    if (!pending) return;
    if (!savePracticeOutcome(pending.session, pending.observations)) {
      window.alert("仍未能保存，请清理部分本机数据后再试。");
      return;
    }
    pendingChallengeSaveRef.current = null;
    setChallengeSaveFailed(false);
  };

  const advanceQuestion = useCallback(
    (correctAnswers = correct) => {
      if (advanceLockRef.current || recordedRef.current) return;
      advanceLockRef.current = true;
      const nextIndex = index + 1;
      setIndex(nextIndex);
      if (nextIndex >= limit) {
        finishChallenge(nextIndex, correctAnswers, "complete");
        return;
      }
      nextQuestion();
    },
    [correct, finishChallenge, index, limit, nextQuestion],
  );

  const submit = () => {
    if (!question || !input || feedback !== "idle" || submitLockRef.current) return;
    submitLockRef.current = true;
    const isRight = input.toLowerCase() === question[1];
    setFeedback(isRight ? "right" : "wrong");
    const nextCorrect = correct + (isRight ? 1 : 0);
    challengeObservationsRef.current.push({
      text: question[0],
      code: question[1],
      kind: isRight ? "correct" : "coding-error",
    });
    if (isRight) {
      setCorrect(nextCorrect);
      nextTimerRef.current = window.setTimeout(
        () => advanceQuestion(nextCorrect),
        520,
      );
    } else {
      setMistakes((value) => [...value, { text: question[0], code: question[1], input }]);
    }
  };

  return (
    <section className="subpage">
      <div className="subpage-heading">
        <span className="eyebrow">A–Y 原码输入</span>
        <h1>字码挑战</h1>
        <p>绕过系统输入法，直接检验你对 86 版五笔编码的熟练度。</p>
      </div>
      {loadError ? (
        <ErrorState
          title="字码挑战暂时不可用"
          message={loadError}
          onRetry={() => setLoadAttempt((value) => value + 1)}
        />
      ) : (
      <div className="challenge-layout">
        <div className={`challenge-card${started && feedback === "wrong" ? " has-error" : ""}`}>
          {!started ? (
            <div className="challenge-start">
              <h2>
                {index
                  ? finishedReason === "timeout"
                    ? "时间到，本轮结束"
                    : "本轮挑战完成"
                  : "准备好了吗？"}
              </h2>
              {index > 0 && (
                <div className="result-score">
                  <strong>{correct}</strong><span>/ {index} 正确</span>
                </div>
              )}
              <p>看到汉字后输入最短可用五笔编码，按回车提交。答错后会停留显示正确编码。</p>
              {lastSession && (
                <button
                  className="button secondary"
                  onClick={() => downloadShareCard(lastSession)}
                >
                  下载本轮成绩卡
                </button>
              )}
              {challengeSaveFailed && (
                <p role="alert">本轮成绩尚未保存，请先重试保存。</p>
              )}
              {challengeSaveFailed && (
                <button className="button danger" onClick={retryChallengeSave}>
                  重试保存
                </button>
              )}
              <button
                className="button primary"
                disabled={loading || !pool.length || challengeSaveFailed}
                onClick={start}
              >
                {loading ? "正在加载离线码表…" : index ? "再来一轮" : "开始挑战"}
              </button>
            </div>
          ) : (
            <div className={`challenge-running${feedback === "wrong" ? " is-wrong" : ""}`}>
              <div className="challenge-status">
                <span>第 {index + 1} / {limit} 题</span>
                <span>正确 {correct}</span>
                {timed && <span>剩余 {remaining}s</span>}
              </div>
              <div
                key={question?.[0]}
                className="question-character question-swap"
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                {question?.[0]}
              </div>
              <div className="code-slots" aria-hidden="true">
                {Array.from({ length: question?.[1].length ?? 0 }, (_, slot) => (
                  <span key={slot} className={input[slot] ? "filled" : ""}>
                    {input[slot]?.toUpperCase() || "·"}
                  </span>
                ))}
              </div>
              <input
                autoFocus
                className={`code-input ${feedback}`}
                value={input}
                maxLength={question?.[1].length ?? 4}
                onChange={(event) =>
                  setInput(
                    event.target.value.replace(/[^a-y]/gi, "").toLowerCase(),
                  )
                }
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing || event.keyCode === 229) {
                    return;
                  }
                  if (
                    !["Shift", "Control", "Alt", "Meta", "CapsLock"].includes(
                      event.key,
                    )
                  ) {
                    recordKeyUsage(event.code);
                    playKeySound();
                  }
                  if (event.key === "Enter" && feedback === "idle") submit();
                  if (event.key === "Enter" && feedback === "wrong") advanceQuestion();
                }}
                placeholder="输入编码后回车"
                aria-label={`请输入“${question?.[0] ?? "当前题目"}”的五码编码`}
                aria-invalid={feedback === "wrong"}
                readOnly={feedback !== "idle"}
              />
              <div className="feedback-region" aria-live="assertive">
                {feedback === "right" && <p className="feedback right">编码正确，继续下一题</p>}
                {feedback === "wrong" && (
                  <div className="wrong-answer" role="alert">
                    <span>本题答错</span>
                    <p>
                      你的输入 <del>{input.toUpperCase()}</del>
                      <i aria-hidden="true">→</i>
                      正确编码 <strong>{question?.[1].toUpperCase()}</strong>
                    </p>
                    <button className="button danger" onClick={() => advanceQuestion()}>
                      {index + 1 >= limit ? "查看本轮结果" : "下一题（回车）"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        <aside className="side-panel settings-mini">
          <h3>挑战设置</h3>
          <div className="segmented">
            <button disabled={started} aria-pressed={mode === "char"} className={mode === "char" ? "active" : ""} onClick={() => setMode("char")}>单字</button>
            <button disabled={started} aria-pressed={mode === "phrase"} className={mode === "phrase" ? "active" : ""} onClick={() => setMode("phrase")}>词组</button>
          </div>
          <label>题量
            <select disabled={started} value={limit} onChange={(event) => setLimit(Number(event.target.value) as 20 | 50)}>
              <option value={20}>20 题</option>
              <option value={50}>50 题</option>
            </select>
          </label>
          <label className="switch-row">
            <span><strong>60 秒限时</strong><small>时间结束自动停止</small></span>
            <input type="checkbox" disabled={started} checked={timed} onChange={(event) => setTimed(event.target.checked)} />
          </label>
          <div className="mistake-summary">
            <span>本轮错题</span>
            <strong>{mistakes.length}</strong>
          </div>
          {mistakes.slice(-4).map((item) => (
            <div className="mistake-row" key={`${item.text}-${item.input}`}>
              <b>{item.text}</b><span>{item.input || "空"} → {item.code}</span>
            </div>
          ))}
        </aside>
      </div>
      )}
    </section>
  );
}
