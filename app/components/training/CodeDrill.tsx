"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createLocalId,
  recordKeyUsage,
  savePracticeOutcome,
  type PhrasePracticeInput,
} from "../../lib";
import { calculateAccuracy } from "../../typing-metrics";
import type {
  SessionResult,
  TrainingTask,
  WeakObservation,
  WubiEntry,
} from "../../types";

export function CodeDrill({
  title,
  description,
  emptyText,
  pool,
  sessionType,
  playKeySound,
  planTask,
  trackPhrasePractice = false,
  onPendingSaveChange,
  onInProgressChange,
  onSessionSaved,
}: {
  title: string;
  description: string;
  emptyText: string;
  pool: WubiEntry[];
  sessionType: "review" | "roots";
  playKeySound: () => void;
  planTask?: TrainingTask;
  trackPhrasePractice?: boolean;
  onPendingSaveChange: (pending: boolean) => void;
  onInProgressChange: (inProgress: boolean) => void;
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
  const [saveError, setSaveError] = useState("");
  const [pendingSave, setPendingSave] = useState<{
    session: SessionResult;
    observations: WeakObservation[];
    phrasePractices: PhrasePracticeInput[];
  } | null>(null);
  const startedAt = useRef(0);
  const hiddenAt = useRef<number | null>(null);
  const inactiveMs = useRef(0);
  const seen = useRef(new Set<string>());
  const orderedIndex = useRef(0);
  const observations = useRef<WeakObservation[]>([]);
  const phrasePracticeAnswers = useRef<PhrasePracticeInput[]>([]);
  const advanceTimer = useRef<number | null>(null);
  const submitLock = useRef(false);
  const advanceLock = useRef(false);
  const finishedLock = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (started && feedback === "idle") inputRef.current?.focus();
  }, [started, feedback, question]);

  const nextQuestion = useCallback(() => {
    if (planTask) {
      const next = pool[orderedIndex.current];
      if (!next) return;
      orderedIndex.current += 1;
      setQuestion(next);
      setInput("");
      setFeedback("idle");
      submitLock.current = false;
      advanceLock.current = false;
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
    submitLock.current = false;
    advanceLock.current = false;
  }, [planTask, pool]);

  useEffect(
    () => () => {
      if (advanceTimer.current !== null) {
        window.clearTimeout(advanceTimer.current);
      }
      onInProgressChange(false);
    },
    [onInProgressChange],
  );

  useEffect(() => {
    if (!started) return;
    const onVisibilityChange = () => {
      const now = Date.now();
      if (document.visibilityState === "hidden") {
        if (hiddenAt.current === null) hiddenAt.current = now;
      } else if (hiddenAt.current !== null) {
        inactiveMs.current += now - hiddenAt.current;
        hiddenAt.current = null;
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [started]);

  const start = () => {
    if (advanceTimer.current !== null) {
      window.clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }
    seen.current.clear();
    orderedIndex.current = 0;
    observations.current = [];
    phrasePracticeAnswers.current = [];
    submitLock.current = false;
    advanceLock.current = false;
    finishedLock.current = false;
    startedAt.current = Date.now();
    hiddenAt.current = null;
    inactiveMs.current = 0;
    onInProgressChange(true);
    setStarted(true);
    setFinished(false);
    setAnswered(0);
    setCorrect(0);
    setMistakes([]);
    setSaveError("");
    setPendingSave(null);
    onPendingSaveChange(false);
    nextQuestion();
  };

  const finish = (finalAnswered: number, finalCorrect: number) => {
    if (finishedLock.current) return;
    finishedLock.current = true;
    onInProgressChange(false);
    if (advanceTimer.current !== null) {
      window.clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }
    const now = Date.now();
    const hiddenDuration =
      hiddenAt.current === null ? 0 : now - hiddenAt.current;
    const durationSeconds = Math.max(
      1,
      (now - startedAt.current - inactiveMs.current - hiddenDuration) / 1000,
    );
    const session: SessionResult = {
      id: createLocalId(),
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
    const savedObservations = [...observations.current];
    const savedPhrasePractices = [...phrasePracticeAnswers.current];
    const saved = savePracticeOutcome(
      session,
      savedObservations,
      [],
      savedPhrasePractices,
    );
    if (!saved) {
      setSaveError("本轮成绩尚未保存，请清理部分本机数据后重试。");
      setPendingSave({
        session,
        observations: savedObservations,
        phrasePractices: savedPhrasePractices,
      });
      onPendingSaveChange(true);
      window.alert("本次成绩未能保存，请检查浏览器存储空间后再试。");
    } else {
      setSaveError("");
      setPendingSave(null);
      onPendingSaveChange(false);
    }
    setStarted(false);
    setFinished(true);
    if (saved) onSessionSaved();
  };

  const retrySave = () => {
    if (!pendingSave) return;
    if (
      !savePracticeOutcome(
        pendingSave.session,
        pendingSave.observations,
        [],
        pendingSave.phrasePractices,
      )
    ) {
      setSaveError("仍未能保存，请清理部分本机数据后再试。");
      return;
    }
    setSaveError("");
    setPendingSave(null);
    onPendingSaveChange(false);
    onSessionSaved();
  };

  const advance = (wasCorrect: boolean) => {
    if (advanceLock.current || finishedLock.current) return;
    advanceLock.current = true;
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
    if (
      !question ||
      !input ||
      feedback !== "idle" ||
      submitLock.current ||
      finishedLock.current
    ) {
      return;
    }
    submitLock.current = true;
    const right = input.toLowerCase() === question[1].toLowerCase();
    if (trackPhrasePractice) {
      phrasePracticeAnswers.current.push({ entry: question, correct: right });
    }
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
    if (advanceTimer.current !== null) {
      window.clearTimeout(advanceTimer.current);
    }
    advanceTimer.current = window.setTimeout(() => advance(true), 420);
  };

  if (!pool.length) {
    return <div className="training-empty" role="status">{emptyText}</div>;
  }

  return (
    <div className="code-drill">
      <div className="code-drill-copy">
        <span className="eyebrow">{Math.min(limit, pool.length)} 题一轮</span>
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
            <>
              <p>
                准确率 {calculateAccuracy(correct, answered).toFixed(1)}%，
                {mistakes.length ? `还有 ${mistakes.length} 题需要巩固。` : "本轮全部答对。"}
              </p>
              {saveError && <p role="alert">{saveError}</p>}
            </>
          )}
          <button
            className="button primary"
            onClick={saveError ? retrySave : start}
          >
            {saveError ? "重试保存" : finished ? "再练一轮" : "开始专项"}
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
            ref={inputRef}
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
              if (event.nativeEvent.isComposing || event.keyCode === 229) return;
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
