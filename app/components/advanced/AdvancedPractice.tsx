"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { KeySoundPlayer } from "../views/typing/useTypingSession";
import { createLocalId, recordKeyUsage } from "../../practice-transactions";
import {
  applyTypingDelaySample,
  calculateKeyAccuracy,
  calculatePhraseRate,
  calculateTypingMetrics,
  classifyWubiHand,
  countCommittedEdit,
  countCommittedAttempts,
  isImeSelectionKey,
  isWubiLetterKey,
  shouldDeferInputCommit,
} from "../../typing-metrics";
import {
  buildRhythmSummary,
  MAX_PHYSICAL_RHYTHM_SAMPLES,
  type PhysicalRhythmSample,
} from "../../rhythm-lab";
import type {
  AdvancedAssessmentIdentity,
  AdvancedSeason,
  ScenarioCategory,
  SessionResult,
} from "../../types";
import { usePendingSaveGuard } from "../Ui";

export interface PracticeTarget {
  id: string;
  title: string;
  text: string;
  type: "rhythm" | "scenario";
  category?: ScenarioCategory;
  season?: AdvancedSeason;
  seasonDay?: number;
  assessmentIdentity?: AdvancedAssessmentIdentity;
}

export function AdvancedPractice({
  target,
  playKeySound,
  roundLabel,
  onCancel,
  onSave,
  onComplete,
}: {
  target: PracticeTarget;
  playKeySound: KeySoundPlayer;
  roundLabel?: string;
  onCancel: () => void;
  onSave: (session: SessionResult) => boolean | Promise<boolean>;
  onComplete: (session: SessionResult) => void;
}) {
  const cleanTarget = useMemo(() => target.text.replace(/\s+/g, ""), [target.text]);
  const targetCharacters = useMemo(() => Array.from(cleanTarget), [cleanTarget]);
  const dailyLines = useMemo(
    () => target.category === "daily"
      ? target.text.split("\n").map((line) => Array.from(line.replace(/\s/g, ""))).filter((line) => line.length)
      : null,
    [target.category, target.text],
  );
  const [typed, setTyped] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [paused, setPaused] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  usePendingSaveGuard(
    saving || saveFailed || (hasStarted && !finished),
    saveFailed
      ? "本次成绩尚未保存，请先重试保存。"
      : "练习正在进行，退出会丢失本次输入。",
  );
  const startedAtRef = useRef<number | null>(null);
  const lastCommitAtRef = useRef<number | null>(null);
  const inactiveAtRef = useRef<number | null>(null);
  const inactiveMsRef = useRef(0);
  const pauseAtRef = useRef<number | null>(null);
  const pausedMsRef = useRef(0);
  const delaysRef = useRef<number[]>([]);
  const physicalRef = useRef<PhysicalRhythmSample[]>([]);
  const keyCountRef = useRef(0);
  const letterKeysRef = useRef(0);
  const backspaceCountRef = useRef(0);
  const correctionCountRef = useRef(0);
  const selectionCountRef = useRef(0);
  const phraseCharsRef = useRef(0);
  const pauseCountRef = useRef(0);
  const attemptCountRef = useRef(0);
  const correctAttemptCountRef = useRef(0);
  const pendingSaveRef = useRef<SessionResult | null>(null);
  const retrySaveLockRef = useRef(false);
  const finishedRef = useRef(false);
  const composingRef = useRef(false);
  const committedRef = useRef("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const compositionCommitTimerRef = useRef<number | null>(null);
  const compositionRevisionRef = useRef(0);
  const discardComposition = useCallback(() => {
    compositionRevisionRef.current += 1;
    if (compositionCommitTimerRef.current !== null) {
      window.clearTimeout(compositionCommitTimerRef.current);
      compositionCommitTimerRef.current = null;
    }
    composingRef.current = false;
    setInputValue(committedRef.current);
    if (inputRef.current) inputRef.current.value = committedRef.current;
  }, []);
  const acceptsInput = () => document.visibilityState !== "hidden" &&
    pauseAtRef.current === null && !finishedRef.current;

  const activeElapsed = useCallback((now: number) => {
    if (startedAtRef.current === null) return 0;
    const currentPause = pauseAtRef.current === null ? 0 : now - pauseAtRef.current;
    const currentInactive = inactiveAtRef.current === null ? 0 : now - inactiveAtRef.current;
    return Math.max(
      0,
      now - startedAtRef.current - pausedMsRef.current - inactiveMsRef.current - currentPause - currentInactive,
    );
  }, []);

  useEffect(() => {
    const onVisibility = () => {
      const now = performance.now();
      if (document.visibilityState === "hidden") {
        discardComposition();
        if (
          startedAtRef.current === null ||
          pauseAtRef.current !== null ||
          inactiveAtRef.current !== null
        ) return;
        inactiveAtRef.current = now;
      } else if (inactiveAtRef.current !== null) {
        inactiveMsRef.current += Math.max(0, now - inactiveAtRef.current);
        inactiveAtRef.current = null;
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [activeElapsed, discardComposition]);

  useEffect(
    () => () => {
      if (compositionCommitTimerRef.current !== null) {
        window.clearTimeout(compositionCommitTimerRef.current);
      }
    },
    [],
  );

  const startTimer = () => {
    if (!acceptsInput()) return;
    if (startedAtRef.current !== null) return;
    startedAtRef.current = performance.now();
    setHasStarted(true);
  };

  const finish = async (committed: string) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setFinished(true);
    const now = performance.now();
    const durationSeconds = Math.max(0.1, activeElapsed(now) / 1000);
    const metrics = calculateTypingMetrics({
      typed: committed,
      target: cleanTarget,
      durationSeconds,
      keyCount: keyCountRef.current,
      letterKeys: letterKeysRef.current,
      attemptCount: attemptCountRef.current,
      correctAttemptCount: correctAttemptCountRef.current,
    });
    const rhythmSummary = buildRhythmSummary({
      text: cleanTarget,
      delays: delaysRef.current,
      physicalSamples: physicalRef.current,
    });
    const session: SessionResult = {
      id: createLocalId(),
      type: target.type,
      title: target.title,
      date: new Date().toISOString(),
      durationSeconds,
      ...metrics,
      keyAccuracy: calculateKeyAccuracy({
        keyCount: keyCountRef.current,
        backspaceCount: backspaceCountRef.current,
        correctionCount: correctionCountRef.current,
        codeLength: metrics.codeLength,
      }),
      phraseRate: calculatePhraseRate(phraseCharsRef.current, metrics.correctChars),
      errors: Math.max(
        0,
        attemptCountRef.current - correctAttemptCountRef.current,
      ),
      keyCount: keyCountRef.current,
      backspaceCount: backspaceCountRef.current,
      correctionCount: correctionCountRef.current,
      selectionCount: selectionCountRef.current,
      pauseCount: pauseCountRef.current,
      pauseSeconds: pausedMsRef.current / 1000,
      rhythmSummary,
      scenarioId: target.type === "scenario" ? target.id : undefined,
      assessmentIdentity: target.assessmentIdentity,
      seasonId: target.season?.id,
      seasonDay: target.seasonDay,
    };
    pendingSaveRef.current = session;
    setSaving(true);
    const saved = await onSave(session);
    setSaving(false);
    if (!saved) {
      setSaveFailed(true);
      return;
    }
    pendingSaveRef.current = null;
    onComplete(session);
  };

  const retrySave = async () => {
    const session = pendingSaveRef.current;
    if (!session || retrySaveLockRef.current) return;
    retrySaveLockRef.current = true;
    if (!await onSave(session)) {
      retrySaveLockRef.current = false;
      return;
    }
    pendingSaveRef.current = null;
    retrySaveLockRef.current = false;
    setSaveFailed(false);
    onComplete(session);
  };

  const commitValue = (value: string) => {
    if (!acceptsInput()) return;
    const committed = Array.from(value.replace(/[\r\n\s]/g, ""))
      .slice(0, targetCharacters.length)
      .join("");
    const previous = committedRef.current;
    if (committed === previous) {
      setInputValue(committed);
      return;
    }
    const now = performance.now();
    if (committed && startedAtRef.current === null) {
      startedAtRef.current = now;
      setHasStarted(true);
    }
    const elapsed = activeElapsed(now);
    const transition = lastCommitAtRef.current === null ? elapsed : Math.max(0, elapsed - lastCommitAtRef.current);
    const attempt = countCommittedAttempts(previous, committed, cleanTarget);
    const edit = countCommittedEdit(previous, committed);
    correctionCountRef.current += edit.removed;
    phraseCharsRef.current += edit.phraseChars;
    attemptCountRef.current += attempt.attempts;
    correctAttemptCountRef.current += attempt.correct;
    if (Array.from(committed).length >= Array.from(previous).length) {
      delaysRef.current = applyTypingDelaySample({
        previous,
        next: committed,
        target: cleanTarget,
        delayMs: transition,
        delays: delaysRef.current,
      });
      lastCommitAtRef.current = elapsed;
    }
    committedRef.current = committed;
    setInputValue(committed);
    setTyped(committed);
    if (Array.from(committed).length >= targetCharacters.length) finish(committed);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!acceptsInput()) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const now = performance.now();
    if (
      startedAtRef.current === null &&
      (event.key.length === 1 || event.key === "Process" || event.key === "Unidentified")
    ) {
      startTimer();
    }
    if (!["Shift", "Control", "Alt", "Meta", "CapsLock"].includes(event.key)) {
      keyCountRef.current += 1;
      recordKeyUsage(event.code);
      playKeySound();
    }
    if (event.key === "Backspace") backspaceCountRef.current += 1;
    if (
      (composingRef.current || event.nativeEvent.isComposing) &&
      isImeSelectionKey(event.key)
    ) {
      selectionCountRef.current += 1;
    }
    if (isWubiLetterKey(event.key, event.code)) {
      letterKeysRef.current += 1;
      const hand = classifyWubiHand(event.key, event.code);
      if (hand && physicalRef.current.length < MAX_PHYSICAL_RHYTHM_SAMPLES) {
        physicalRef.current.push({ elapsedMs: activeElapsed(now), hand });
      }
    }
  };

  const togglePause = () => {
    if (startedAtRef.current === null) return;
    const now = performance.now();
    discardComposition();
    if (paused) {
      if (pauseAtRef.current !== null) pausedMsRef.current += Math.max(0, now - pauseAtRef.current);
      pauseAtRef.current = null;
      if (document.visibilityState === "hidden") inactiveAtRef.current = now;
      setPaused(false);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      if (inactiveAtRef.current !== null) {
        inactiveMsRef.current += Math.max(0, now - inactiveAtRef.current);
        inactiveAtRef.current = null;
      }
      pauseAtRef.current = now;
      pauseCountRef.current += 1;
      setPaused(true);
    }
  };

  const typedCharacters = Array.from(typed);
  let displayStart = 0;
  let displayCharacters = targetCharacters;
  let dailyLineNumber = 0;
  if (dailyLines) {
    dailyLineNumber = dailyLines.findIndex((_, index) =>
      typedCharacters.length < dailyLines
        .slice(0, index + 1)
        .reduce((sum, line) => sum + line.length, 0),
    );
    if (dailyLineNumber < 0) dailyLineNumber = dailyLines.length - 1;
    displayStart = dailyLines.slice(0, dailyLineNumber).reduce((sum, line) => sum + line.length, 0);
    displayCharacters = dailyLines[dailyLineNumber] ?? targetCharacters;
  }
  return (
    <section className="advanced-practice" aria-labelledby="advanced-practice-title">
      <div className="panel-title">
        <div>
          <span className="eyebrow">{roundLabel ?? "静流练习"}</span>
          <h2 id="advanced-practice-title">{target.title}</h2>
        </div>
        <span>{dailyLines ? `第 ${dailyLineNumber + 1} / ${dailyLines.length} 句 · ` : ""}{typedCharacters.length} / {targetCharacters.length}</span>
      </div>
      <div className="advanced-practice-text" aria-label="练习正文">
        {displayCharacters.map((character, index) => {
          const absoluteIndex = displayStart + index;
          return (
          <span
            key={absoluteIndex}
            className={
              absoluteIndex < typedCharacters.length
                ? typedCharacters[absoluteIndex] === character ? "correct" : "wrong"
                : absoluteIndex === typedCharacters.length ? "current" : ""
            }
          >
            {character}
          </span>
          );
        })}
      </div>
      <textarea
        ref={inputRef}
        autoFocus
        value={inputValue}
        disabled={paused || saving || saveFailed}
        aria-label="进阶训练输入区"
        placeholder={paused ? "练习已暂停" : "在这里开始输入"}
        onKeyDown={onKeyDown}
        onPaste={(event) => event.preventDefault()}
        onDrop={(event) => event.preventDefault()}
        onBeforeInput={(event) => {
          const inputType = (event.nativeEvent as InputEvent).inputType;
          if (inputType === "insertFromPaste" || inputType === "insertFromDrop") {
            event.preventDefault();
          }
        }}
        onChange={(event) => {
          if (!acceptsInput()) {
            discardComposition();
            return;
          }
          const next = event.target.value;
          const nativeEvent = event.nativeEvent as InputEvent;
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
          if (!acceptsInput()) return;
          discardComposition();
          composingRef.current = true;
          startTimer();
        }}
        onCompositionEnd={(event) => {
          if (!acceptsInput() || !composingRef.current) {
            discardComposition();
            return;
          }
          composingRef.current = false;
          const endedValue = event.currentTarget.value;
          const revision = compositionRevisionRef.current;
          if (compositionCommitTimerRef.current !== null) {
            window.clearTimeout(compositionCommitTimerRef.current);
          }
          compositionCommitTimerRef.current = window.setTimeout(() => {
            compositionCommitTimerRef.current = null;
            if (revision !== compositionRevisionRef.current || !acceptsInput()) return;
            commitValue(inputRef.current?.value ?? endedValue);
          }, 0);
        }}
      />
      {saveFailed && (
        <div className="advanced-save-error" role="alert">
          <p>本次成绩未保存，请检查浏览器存储空间后重试。</p>
          <button className="button danger" onClick={retrySave}>重试保存</button>
        </div>
      )}
      <div className="advanced-practice-actions">
        <button
          className="button secondary"
          disabled={saving || saveFailed}
          onClick={() => {
            if (hasStarted && !finished && !window.confirm("退出会丢失本次输入，确定退出吗？")) return;
            onCancel();
          }}
        >
          退出本次练习
        </button>
        <button
          className="button secondary"
          disabled={!hasStarted || saveFailed}
          aria-pressed={paused}
          onClick={togglePause}
        >
          {paused ? "继续" : "暂停"}
        </button>
      </div>
    </section>
  );
}
