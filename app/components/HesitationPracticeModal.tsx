"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  calculateHesitationImprovement,
  isHesitationPracticeMastered,
} from "../hesitation-practice";
import {
  applyTypingDelaySample,
  calculateTypingTransitionMs,
  shouldDeferInputCommit,
} from "../typing-metrics";
import type {
  HesitationPracticeAttempt,
  HesitationPracticeTarget,
} from "../types";
import { Modal, usePendingSaveGuard } from "./Ui";

type PracticeAttempts = [
  HesitationPracticeAttempt,
  HesitationPracticeAttempt,
  HesitationPracticeAttempt,
];

type SaveResponse = boolean | { ok: boolean; message?: string };

type PracticePhase =
  | "ready"
  | "running"
  | "round-result"
  | "saving"
  | "save-error"
  | "completed";

function formatDuration(durationMs: number) {
  if (durationMs < 1000) return `${Math.max(1, Math.round(durationMs))} 毫秒`;
  return `${(durationMs / 1000).toFixed(1)} 秒`;
}

function normalizeSaveResponse(response: SaveResponse) {
  return typeof response === "boolean" ? { ok: response } : response;
}

export function HesitationPracticeModal({
  target,
  onClose,
  onSave,
}: {
  target: HesitationPracticeTarget;
  onClose: () => void;
  onSave: (attempts: PracticeAttempts) => SaveResponse | Promise<SaveResponse>;
}) {
  const targetCharacters = useMemo(() => Array.from(target.text), [target.text]);
  const [phase, setPhase] = useState<PracticePhase>("ready");
  const [attempts, setAttempts] = useState<HesitationPracticeAttempt[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [committedText, setCommittedText] = useState("");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [liveErrorCount, setLiveErrorCount] = useState(0);
  const [notice, setNotice] = useState("");
  const [saveError, setSaveError] = useState("");
  usePendingSaveGuard(phase === "save-error");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const composingRef = useRef(false);
  const compositionCommitTimerRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const lastTimingAtRef = useRef<number | null>(null);
  const hiddenAtRef = useRef<number | null>(null);
  const inactiveMsRef = useRef(0);
  const delaysRef = useRef<number[]>([]);
  const errorsRef = useRef(new Set<number>());
  const committedRef = useRef("");
  const completingRef = useRef(false);

  const currentRound = Math.min(3, attempts.length + 1) as 1 | 2 | 3;
  const typedCharacters = Array.from(committedText);
  const latestAttempt = attempts.at(-1);
  const completeAttempts = attempts.length === 3
    ? (attempts as PracticeAttempts)
    : null;
  const mastered = completeAttempts
    ? isHesitationPracticeMastered(target, completeAttempts)
    : false;
  const outcomeSaved = phase === "completed";

  useEffect(
    () => () => {
      if (compositionCommitTimerRef.current !== null) {
        window.clearTimeout(compositionCommitTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (phase !== "running") return;
    const update = () => {
      if (startedAtRef.current === null) {
        setElapsedMs(0);
        return;
      }
      const now = performance.now();
      const hiddenMs =
        hiddenAtRef.current === null ? 0 : now - hiddenAtRef.current;
      setElapsedMs(
        Math.max(
          0,
          now -
            (startedAtRef.current ?? now) -
            inactiveMsRef.current -
            hiddenMs,
        ),
      );
    };
    update();
    const timer = window.setInterval(update, 100);
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== "running") return;
    const onVisibilityChange = () => {
      const now = performance.now();
      if (document.visibilityState === "hidden") {
        if (startedAtRef.current !== null && hiddenAtRef.current === null) {
          hiddenAtRef.current = now;
        }
        return;
      }
      if (hiddenAtRef.current !== null) {
        inactiveMsRef.current += now - hiddenAtRef.current;
        hiddenAtRef.current = null;
        lastTimingAtRef.current = now;
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [phase]);

  const resetRound = () => {
    setInputValue("");
    setCommittedText("");
    setElapsedMs(0);
    setLiveErrorCount(0);
    setNotice("");
    committedRef.current = "";
    startedAtRef.current = null;
    lastTimingAtRef.current = null;
    hiddenAtRef.current = null;
    inactiveMsRef.current = 0;
    delaysRef.current = [];
    errorsRef.current = new Set();
    completingRef.current = false;
    composingRef.current = false;
  };

  const startRound = () => {
    resetRound();
    setPhase("running");
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  const startTimer = () => {
    if (startedAtRef.current !== null) return;
    const now = performance.now();
    startedAtRef.current = now;
    lastTimingAtRef.current = now;
    if (document.visibilityState === "hidden") hiddenAtRef.current = now;
  };

  const persistAttempts = async (rows: PracticeAttempts) => {
    setPhase("saving");
    setSaveError("");
    try {
      const response = normalizeSaveResponse(await onSave(rows));
      if (!response.ok) {
        setSaveError(response.message || "保存失败，三轮结果已为你保留。");
        setPhase("save-error");
        return;
      }
      setPhase("completed");
    } catch (error: unknown) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "保存失败，三轮结果已为你保留。",
      );
      setPhase("save-error");
    }
  };

  const finishRound = (completedAtMs: number) => {
    if (completingRef.current) return;
    completingRef.current = true;
    const round = (attempts.length + 1) as 1 | 2 | 3;
    const attempt: HesitationPracticeAttempt = {
      round,
      durationMs: Math.max(
        1,
        completedAtMs -
          (startedAtRef.current ?? completedAtMs) -
          inactiveMsRef.current -
          (hiddenAtRef.current === null
            ? 0
            : completedAtMs - hiddenAtRef.current),
      ),
      errorIndexes: [...errorsRef.current].sort((left, right) => left - right),
      delaysMs: Array.from(
        { length: targetCharacters.length },
        (_, index) => Math.round(delaysRef.current[index] ?? 0),
      ),
      completedAt: new Date().toISOString(),
    };
    const nextAttempts = [...attempts, attempt];
    setAttempts(nextAttempts);
    setElapsedMs(attempt.durationMs);
    if (nextAttempts.length === 3) {
      void persistAttempts(nextAttempts as PracticeAttempts);
    } else {
      setPhase("round-result");
    }
  };

  const commitValue = (nextValue: string) => {
    const committed = Array.from(nextValue.replace(/[\r\n]/g, ""))
      .slice(0, targetCharacters.length)
      .join("");
    const previous = committedRef.current;
    if (committed === previous) {
      setInputValue(committed);
      return;
    }
    if (committed) startTimer();
    const now = performance.now();
    const transitionMs = calculateTypingTransitionMs({
      lastActiveAt: lastTimingAtRef.current,
      now,
      pendingMs: 0,
    });
    delaysRef.current = applyTypingDelaySample({
      previous,
      next: committed,
      target: target.text,
      delayMs: transitionMs,
      delays: delaysRef.current,
    });
    lastTimingAtRef.current = now;
    committedRef.current = committed;
    const nextCharacters = Array.from(committed);
    nextCharacters.forEach((character, index) => {
      if (character !== targetCharacters[index]) errorsRef.current.add(index);
    });
    setLiveErrorCount(errorsRef.current.size);
    setInputValue(committed);
    setCommittedText(committed);
    if (nextCharacters.length >= targetCharacters.length) finishRound(now);
  };

  const requestClose = () => {
    const hasProgress = attempts.length > 0 || committedRef.current.length > 0;
    if (
      phase !== "completed" &&
      hasProgress &&
      !window.confirm("关闭后未完成的三连练不会保存，确定放弃吗？")
    ) {
      return;
    }
    onClose();
  };

  const improvementFor = (attempt: HesitationPracticeAttempt) =>
    calculateHesitationImprovement(
      attempts[0]?.durationMs ?? attempt.durationMs,
      attempt.durationMs,
    );

  return (
    <Modal title="卡顿片段三连练" onClose={requestClose}>
      <div className="hesitation-practice-modal">
        <div className="hesitation-practice-meta">
          <div>
            <span className="eyebrow">练习来源</span>
            <strong>{target.sourceTitle}</strong>
          </div>
          <span>第 {currentRound} / 3 轮 · {targetCharacters.length} 字</span>
        </div>

        <div className="hesitation-practice-target" aria-label={`练习文本：${target.text}`}>
          {targetCharacters.map((character, index) => {
            const inFocus =
              index >= target.focusOffset &&
              index < target.focusOffset + target.focusLength;
            const state =
              index >= typedCharacters.length
                ? index === typedCharacters.length && phase === "running"
                  ? "current"
                  : "pending"
                : typedCharacters[index] === character
                  ? "correct"
                  : "wrong";
            return (
              <span
                className={`${state}${inFocus ? " focus-fragment" : ""}`}
                key={`${index}-${character}`}
              >
                {character}
              </span>
            );
          })}
        </div>

        <p className="hesitation-practice-goal">
          达标：第 3 轮零错误，且比第 1 轮快 20%，或回到本文基准节奏。
        </p>

        {phase === "ready" ? (
          <div className="hesitation-practice-ready">
            <p>切换到五笔输入法，开始后第一个有效输入才计时。</p>
            <button
              className="button primary"
              data-modal-autofocus
              onClick={startRound}
            >
              开始第 1 轮
            </button>
          </div>
        ) : null}

        {phase === "running" ? (
          <div className="hesitation-practice-input-block">
            <textarea
              ref={inputRef}
              className="hesitation-practice-input"
              value={inputValue}
              onChange={(event) => {
                const next = event.target.value;
                const nativeEvent = event.nativeEvent as InputEvent;
                if (next) startTimer();
                if (
                  shouldDeferInputCommit(
                    composingRef.current,
                    nativeEvent.isComposing,
                  )
                ) {
                  setInputValue(next);
                  return;
                }
                commitValue(next);
              }}
              onCompositionStart={() => {
                composingRef.current = true;
                startTimer();
              }}
              onCompositionEnd={(event) => {
                composingRef.current = false;
                const endedValue = event.currentTarget.value;
                if (compositionCommitTimerRef.current !== null) {
                  window.clearTimeout(compositionCommitTimerRef.current);
                }
                compositionCommitTimerRef.current = window.setTimeout(() => {
                  compositionCommitTimerRef.current = null;
                  commitValue(inputRef.current?.value ?? endedValue);
                }, 0);
              }}
              onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
                if (
                  event.key.length === 1 ||
                  event.key === "Process" ||
                  event.key === "Unidentified" ||
                  event.nativeEvent.isComposing
                ) {
                  startTimer();
                }
              }}
              onPaste={(event) => {
                event.preventDefault();
                setNotice("为了公平统计，三连练不支持粘贴。");
              }}
              onDrop={(event) => {
                event.preventDefault();
                setNotice("为了公平统计，三连练不支持拖入文字。");
              }}
              onBeforeInput={(event) => {
                const inputType = (event.nativeEvent as InputEvent).inputType;
                if (inputType === "insertFromPaste" || inputType === "insertFromDrop") {
                  event.preventDefault();
                }
              }}
              aria-label={`第 ${currentRound} 轮跟打输入区`}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
            />
            <div className="hesitation-practice-live" aria-live="polite">
              <span>
                {typedCharacters.length} / {targetCharacters.length} 字
              </span>
              <span>{formatDuration(elapsedMs)}</span>
              <span>{liveErrorCount} 处错误</span>
            </div>
            {notice ? <p className="hesitation-practice-notice">{notice}</p> : null}
          </div>
        ) : null}

        {phase === "round-result" && latestAttempt ? (
          <div className="hesitation-round-result" role="status">
            <span>第 {latestAttempt.round} 轮完成</span>
            <strong>{formatDuration(latestAttempt.durationMs)}</strong>
            <span>{latestAttempt.errorIndexes.length} 处错误</span>
            <span>
              {latestAttempt.round === 1
                ? "已建立首轮基线"
                : `相比首轮 ${improvementFor(latestAttempt) >= 0 ? "+" : ""}${improvementFor(latestAttempt)}%`}
            </span>
            <button
              className="button primary"
              data-modal-autofocus
              onClick={startRound}
            >
              开始第 {attempts.length + 1} 轮
            </button>
          </div>
        ) : null}

        {completeAttempts ? (
          <div className="hesitation-practice-summary">
            <div
              className={`hesitation-practice-outcome ${outcomeSaved ? (mastered ? "mastered" : "needs-review") : "pending-save"}`}
              role="status"
            >
              <span aria-hidden="true">
                {outcomeSaved ? (mastered ? "✓" : "↻") : "…"}
              </span>
              <div>
                <strong>
                  {outcomeSaved
                    ? mastered
                      ? "已暂时掌握"
                      : "仍需复练"
                    : "三轮已完成，等待保存"}
                </strong>
                <p>
                  {!outcomeSaved
                    ? "只有保存成功后，结果才会回流弱项并更新今日加练。"
                    : mastered
                      ? "第 3 轮已达到本次片段的节奏和准确度目标。"
                      : "本组已完成，结果已回流弱项，之后可再练一组。"}
                </p>
              </div>
            </div>
            <div className="hesitation-attempt-table" role="table" aria-label="三轮练习结果对比">
              <div role="row" className="hesitation-attempt-head">
                <span role="columnheader">轮次</span>
                <span role="columnheader">耗时</span>
                <span role="columnheader">错误</span>
                <span role="columnheader">提速</span>
              </div>
              {completeAttempts.map((attempt) => {
                const improvement = improvementFor(attempt);
                return (
                  <div role="row" key={attempt.round}>
                    <strong role="cell">第 {attempt.round} 轮</strong>
                    <span role="cell">{formatDuration(attempt.durationMs)}</span>
                    <span role="cell">{attempt.errorIndexes.length} 处</span>
                    <span role="cell">
                      {attempt.round === 1
                        ? "基线"
                        : `${improvement >= 0 ? "+" : ""}${improvement}%`}
                    </span>
                  </div>
                );
              })}
            </div>
            {phase === "saving" ? (
              <p className="hesitation-saving" role="status">正在保存三轮结果…</p>
            ) : null}
            {phase === "save-error" ? (
              <div className="hesitation-save-error" role="alert">
                <p>{saveError}</p>
                <button
                  className="button primary"
                  data-modal-autofocus
                  onClick={() => void persistAttempts(completeAttempts)}
                >
                  重试保存
                </button>
              </div>
            ) : null}
            {phase === "completed" ? (
              <div className="hesitation-practice-done">
                <span role="status">结果已保存并回流弱项。</span>
                <button className="button primary" onClick={onClose}>
                  完成
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
