"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type KeyboardEvent,
  type RefObject,
  type SetStateAction,
} from "react";
import {
  createLocalId,
  recordKeyUsage,
  readTrainingPlan,
  savePracticeOutcome,
  type PhraseOpportunityInput,
} from "../../../lib";
import {
  applyTypingDelaySample,
  buildTypingHeatmap,
  calculateActiveDurationSeconds,
  calculateKeyAccuracy,
  calculatePhraseRate,
  calculateTypingMetrics,
  calculateTypingTransitionMs,
  canCompleteTyping,
  classifyWubiHand,
  countCommittedEdit,
  countCommittedAttempts,
  getCommittedEditRange,
  getHesitationLevel,
  isImeSelectionKey,
  isWubiLetterKey,
} from "../../../typing-metrics";
import {
  MAX_PHYSICAL_RHYTHM_SAMPLES,
  buildRhythmSummary,
  type PhysicalRhythmSample,
} from "../../../rhythm-lab";
import type { CodeLengthCoachAnalysis } from "../../../code-length-coach";
import type { PracticeArticle, SessionResult, WeakObservation } from "../../../types";
import type { GhostRaceApi } from "./useGhostRace";

export type KeySoundPlayer = (options?: { force?: boolean }) => void;

export function useTypingSession({
  article,
  visibleText,
  targetText,
  playKeySound,
  setClockRevision,
  ghostApiRef,
  inputRef,
  wubiCodesRef,
  theoreticalCodeLength,
  codeLengthAnalysis,
}: {
  article: PracticeArticle | null;
  visibleText: string;
  targetText: string;
  playKeySound: KeySoundPlayer;
  setClockRevision: Dispatch<SetStateAction<number>>;
  ghostApiRef: RefObject<GhostRaceApi | null>;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  wubiCodesRef: RefObject<Map<string, string>>;
  theoreticalCodeLength: number | null;
  codeLengthAnalysis: CodeLengthCoachAnalysis | null;
}) {
  const [inputValue, setInputValue] = useState("");
  const [typed, setTyped] = useState("");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [keyCount, setKeyCount] = useState(0);
  const [letterKeys, setLetterKeys] = useState(0);
  const [backspaceCount, setBackspaceCount] = useState(0);
  const [correctionCount, setCorrectionCount] = useState(0);
  const [enterCount, setEnterCount] = useState(0);
  const [selectionCount, setSelectionCount] = useState(0);
  const [phraseChars, setPhraseChars] = useState(0);
  const [leftHandKeys, setLeftHandKeys] = useState(0);
  const [rightHandKeys, setRightHandKeys] = useState(0);
  const [pauseCount, setPauseCount] = useState(0);
  const [pausedDurationMs, setPausedDurationMs] = useState(0);
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [attemptCount, setAttemptCount] = useState(0);
  const [correctAttemptCount, setCorrectAttemptCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [lastSession, setLastSession] = useState<SessionResult | null>(null);
  const [sessionSaveFailed, setSessionSaveFailed] = useState(false);
  const composing = useRef(false);
  const recorded = useRef(false);
  const pendingPracticeSave = useRef<{
    session: SessionResult;
    observations: WeakObservation[];
    phraseOpportunities: PhraseOpportunityInput[];
  } | null>(null);
  const committedValue = useRef("");
  const startedAtRef = useRef<number | null>(null);
  const lastTimingAtRef = useRef<number | null>(null);
  const pendingTimingMsRef = useRef(0);
  const typingDelaysRef = useRef<number[]>([]);
  const physicalRhythmSamplesRef = useRef<PhysicalRhythmSample[]>([]);
  const correctionPositionsRef = useRef(new Map<number, number>());
  const compositionCommitTimer = useRef<number | null>(null);
  const errorPositions = useRef(new Set<number>());
  const completionElapsedRef = useRef<number | null>(null);
  const inactiveAtRef = useRef<number | null>(null);
  const inactiveDurationMsRef = useRef(0);
  const targetCharacters = useMemo(() => Array.from(targetText), [targetText]);
  const typedCharacters = useMemo(() => Array.from(typed), [typed]);
  const pauseSeconds = pausedDurationMs / 1000;

  useEffect(
    () => () => {
      if (compositionCommitTimer.current !== null) {
        window.clearTimeout(compositionCommitTimer.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!startedAt || completed) return;
    const updateElapsed = () =>
      setElapsed(
        calculateActiveDurationSeconds({
          startedAt,
          now: Date.now(),
          pausedDurationMs,
          pausedAt,
          inactiveDurationMs: inactiveDurationMsRef.current,
          inactiveAt: inactiveAtRef.current,
        }),
      );
    updateElapsed();
    const timer = window.setInterval(updateElapsed, 250);
    return () => window.clearInterval(timer);
  }, [completed, pausedAt, pausedDurationMs, startedAt]);

  useEffect(() => {
    if (!startedAt || completed) return;
    const handleVisibilityChange = () => {
      const now = Date.now();
      if (document.hidden) {
        if (pausedAt !== null || inactiveAtRef.current !== null) return;
        pendingTimingMsRef.current = calculateTypingTransitionMs({
          lastActiveAt: lastTimingAtRef.current,
          now,
          pendingMs: pendingTimingMsRef.current,
        });
        lastTimingAtRef.current = null;
        inactiveAtRef.current = now;
        setClockRevision((value) => value + 1);
        return;
      }
      if (inactiveAtRef.current === null) return;
      inactiveDurationMsRef.current += Math.max(
        0,
        now - inactiveAtRef.current,
      );
      inactiveAtRef.current = null;
      lastTimingAtRef.current = now;
      setClockRevision((value) => value + 1);
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [completed, pausedAt, setClockRevision, startedAt]);

  const startTimer = useCallback(() => {
    if (startedAtRef.current !== null) return;
    const now = Date.now();
    startedAtRef.current = now;
    lastTimingAtRef.current = now;
    ghostApiRef.current?.armActiveRace();
    setStartedAt(now);
  }, [ghostApiRef]);

  useEffect(() => {
    if (!article || !typed) return;
    let changed = false;
    for (let index = 0; index < typedCharacters.length; index += 1) {
      if (
        typedCharacters[index] !== targetCharacters[index] &&
        !errorPositions.current.has(index)
      ) {
        errorPositions.current.add(index);
        changed = true;
      }
    }
    if (changed) setErrorCount(errorPositions.current.size);
  }, [article, targetCharacters, typed, typedCharacters]);

  useEffect(() => {
    if (!article || completed || !canCompleteTyping(typed, targetText)) return;
    const finalSeconds = calculateActiveDurationSeconds({
      startedAt,
      now: Date.now(),
      pausedDurationMs,
      pausedAt,
      inactiveDurationMs: inactiveDurationMsRef.current,
      inactiveAt: inactiveAtRef.current,
    });
    completionElapsedRef.current = finalSeconds;
    setElapsed(finalSeconds);
    setCompleted(true);
  }, [
    article,
    completed,
    pausedAt,
    pausedDurationMs,
    startedAt,
    targetText,
    typed,
  ]);

  useEffect(() => {
    if (
      !article ||
      !completed ||
      recorded.current
    ) {
      return;
    }
    const finalSeconds = completionElapsedRef.current ?? elapsed;
    recorded.current = true;
    const errorChars = Array.from(errorPositions.current)
      .map((index) => targetCharacters[index])
      .filter(Boolean);
    const completedAt = new Date().toISOString();
    const heatmap = buildTypingHeatmap(visibleText, typingDelaysRef.current);
    const rhythmSummary = buildRhythmSummary({
      text: visibleText,
      delays: typingDelaysRef.current,
      physicalSamples: physicalRhythmSamplesRef.current,
    });
    const observations: WeakObservation[] = [];
    const addObservation = (
      character: string | undefined,
      kind: WeakObservation["kind"],
      severity?: 1 | 2 | 3,
    ) => {
      if (!character || !/\p{Script=Han}/u.test(character)) return;
      observations.push({
        text: character,
        code: wubiCodesRef.current.get(character),
        kind,
        severity,
        occurredAt: completedAt,
      });
    };
    for (const index of errorPositions.current) {
      addObservation(targetCharacters[index], "coding-error");
    }
    for (const [index, count] of correctionPositionsRef.current) {
      for (let occurrence = 0; occurrence < Math.min(count, 3); occurrence += 1) {
        addObservation(targetCharacters[index], "correction");
      }
    }
    for (const segment of heatmap.segments) {
      const severity = getHesitationLevel(segment.delayMs, heatmap.thresholdMs);
      if (severity === 0) continue;
      for (let offset = 0; offset < segment.length; offset += 1) {
        addObservation(
          targetCharacters[segment.start + offset],
          "hesitation",
          severity,
        );
      }
    }
    for (const character of new Set(targetCharacters)) {
      addObservation(character, "correct");
    }
    const finalMetrics = calculateTypingMetrics({
      typed,
      target: targetText,
      durationSeconds: finalSeconds,
      keyCount,
      letterKeys,
      attemptCount,
      correctAttemptCount,
    });
    const articleId =
      article.kind === "custom" ||
      article.kind === "common" ||
      article.id.startsWith("custom-")
        ? undefined
        : article.id;
    const trainingTaskId = readTrainingPlan()?.tasks.find(
      (task) =>
        task.type === "article" &&
        task.status === "in-progress" &&
        task.articleId === articleId,
    )?.id;
    const ghostTimeline =
      ghostApiRef.current?.finalizeTimeline(
        targetCharacters.length,
        finalSeconds,
      ) ?? undefined;
    const session: SessionResult = {
      id: createLocalId(),
      type: "article",
      articleId,
      title: article.title,
      date: completedAt,
      durationSeconds: finalSeconds,
      ...finalMetrics,
      theoreticalCodeLength,
      keyAccuracy: calculateKeyAccuracy({
        keyCount,
        backspaceCount,
        correctionCount,
        codeLength: finalMetrics.codeLength,
      }),
      errors: errorPositions.current.size,
      errorChars,
      keyCount,
      backspaceCount,
      correctionCount,
      enterCount,
      selectionCount,
      phraseRate: calculatePhraseRate(phraseChars, finalMetrics.correctChars),
      leftHandKeys,
      rightHandKeys,
      pauseCount,
      pauseSeconds,
      retryCount,
      heatmap,
      rhythmSummary,
      ghostTimeline,
      trainingTaskId,
    };
    const phraseOpportunities =
      codeLengthAnalysis?.highestValueOpportunities
        .filter((opportunity) => opportunity.savedKeys > 0)
        .map((opportunity) => ({
          text: opportunity.text,
          code: opportunity.code,
          characterCount: opportunity.length,
          savedKeys: opportunity.savedKeys,
        })) ?? [];
    const saved = savePracticeOutcome(
      session,
      observations,
      phraseOpportunities,
    );
    if (!saved) {
      pendingPracticeSave.current = {
        session,
        observations,
        phraseOpportunities,
      };
      setSessionSaveFailed(true);
      window.alert("本次成绩未能保存，请检查浏览器存储空间后再试。");
    } else {
      pendingPracticeSave.current = null;
      setSessionSaveFailed(false);
      ghostApiRef.current?.refreshSessions();
    }
    setLastSession(session);
  }, [
    article,
    attemptCount,
    backspaceCount,
    codeLengthAnalysis,
    completed,
    correctionCount,
    correctAttemptCount,
    elapsed,
    enterCount,
    keyCount,
    leftHandKeys,
    letterKeys,
    pauseCount,
    pauseSeconds,
    pausedAt,
    pausedDurationMs,
    phraseChars,
    retryCount,
    rightHandKeys,
    selectionCount,
    startedAt,
    targetText,
    targetCharacters,
    theoreticalCodeLength,
    typed,
    typedCharacters,
    visibleText,
    wubiCodesRef,
    ghostApiRef,
  ]);

  const commitTypedValue = (nextValue: string) => {
    const committed = Array.from(nextValue.replace(/[\r\n]/g, ""))
      .slice(0, targetCharacters.length)
      .join("");
    const previous = committedValue.current;
    if (committed === previous) {
      setInputValue(committed);
      return;
    }
    if (committed) startTimer();
    const now = Date.now();
    const previousCharacterCount = Array.from(previous).length;
    const committedCharacterCount = Array.from(committed).length;
    if (committedCharacterCount > previousCharacterCount) {
      ghostApiRef.current?.recordProgressSample(
        committedCharacterCount,
        calculateActiveDurationSeconds({
          startedAt: startedAtRef.current,
          now,
          pausedDurationMs,
          pausedAt,
          inactiveDurationMs: inactiveDurationMsRef.current,
          inactiveAt: inactiveAtRef.current,
        }) * 1000,
      );
    }
    const transitionMs = calculateTypingTransitionMs({
      lastActiveAt: lastTimingAtRef.current,
      now,
      pendingMs: pendingTimingMsRef.current,
    });
    typingDelaysRef.current = applyTypingDelaySample({
      previous,
      next: committed,
      target: targetText,
      delayMs: transitionMs,
      delays: typingDelaysRef.current,
    });
    pendingTimingMsRef.current = 0;
    lastTimingAtRef.current = now;
    committedValue.current = committed;
    const edit = countCommittedEdit(previous, committed);
    if (edit.removed > 0) {
      setCorrectionCount((value) => value + edit.removed);
      const range = getCommittedEditRange(previous, committed);
      for (let offset = 0; offset < range.removed; offset += 1) {
        const index = range.start + offset;
        correctionPositionsRef.current.set(
          index,
          (correctionPositionsRef.current.get(index) ?? 0) + 1,
        );
      }
    }
    if (edit.phraseChars > 0) {
      setPhraseChars((value) => value + edit.phraseChars);
    }
    const attempt = countCommittedAttempts(previous, committed, targetText);
    if (attempt.attempts > 0) {
      setAttemptCount((value) => value + attempt.attempts);
      setCorrectAttemptCount((value) => value + attempt.correct);
    }
    setInputValue(committed);
    setTyped(committed);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (completed) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") {
      event.preventDefault();
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (
      event.key.length === 1 ||
      event.key === "Process" ||
      event.key === "Unidentified" ||
      event.nativeEvent.isComposing
    ) {
      startTimer();
    }
    if (!["Shift", "Control", "Alt", "Meta", "CapsLock"].includes(event.key)) {
      setKeyCount((value) => value + 1);
      recordKeyUsage(event.code);
      playKeySound();
    }
    if (event.key === "Backspace") {
      setBackspaceCount((value) => value + 1);
    }
    if (event.key === "Enter") {
      setEnterCount((value) => value + 1);
    }
    if (
      (composing.current || event.nativeEvent.isComposing) &&
      isImeSelectionKey(event.key)
    ) {
      setSelectionCount((value) => value + 1);
    }
    if (isWubiLetterKey(event.key, event.code)) {
      setLetterKeys((value) => value + 1);
      const hand = classifyWubiHand(event.key, event.code);
      if (
        hand &&
        physicalRhythmSamplesRef.current.length < MAX_PHYSICAL_RHYTHM_SAMPLES
      ) {
        physicalRhythmSamplesRef.current.push({
          elapsedMs: calculateActiveDurationSeconds({
            startedAt: startedAtRef.current,
            now: Date.now(),
            pausedDurationMs,
            pausedAt,
            inactiveDurationMs: inactiveDurationMsRef.current,
            inactiveAt: inactiveAtRef.current,
          }) * 1000,
          hand,
        });
      }
      if (hand === "left") setLeftHandKeys((value) => value + 1);
      if (hand === "right") setRightHandKeys((value) => value + 1);
    }
  };

  const togglePause = () => {
    if (startedAtRef.current === null || completed) return;
    const now = Date.now();
    if (pausedAt !== null) {
      setPausedDurationMs((value) => value + Math.max(0, now - pausedAt));
      setPausedAt(null);
      lastTimingAtRef.current = now;
      window.setTimeout(() => inputRef.current?.focus(), 0);
      return;
    }
    pendingTimingMsRef.current = calculateTypingTransitionMs({
      lastActiveAt: lastTimingAtRef.current,
      now,
      pendingMs: pendingTimingMsRef.current,
    });
    lastTimingAtRef.current = null;
    setPausedAt(now);
    setPauseCount((value) => value + 1);
  };

  const retrySave = useCallback(() => {
    const pending = pendingPracticeSave.current;
    if (!pending) return false;
    const saved = savePracticeOutcome(
      pending.session,
      pending.observations,
      pending.phraseOpportunities,
    );
    if (!saved) {
      window.alert("仍未能保存，请清理部分本机数据后再试。");
      return false;
    }
    pendingPracticeSave.current = null;
    setSessionSaveFailed(false);
    return true;
  }, []);

  const resetForArticle = useCallback((nextRetryCount: number) => {
    if (compositionCommitTimer.current !== null) {
      window.clearTimeout(compositionCommitTimer.current);
      compositionCommitTimer.current = null;
    }
    setInputValue("");
    setTyped("");
    setStartedAt(null);
    setElapsed(0);
    setKeyCount(0);
    setLetterKeys(0);
    setBackspaceCount(0);
    setCorrectionCount(0);
    setEnterCount(0);
    setSelectionCount(0);
    setPhraseChars(0);
    setLeftHandKeys(0);
    setRightHandKeys(0);
    setPauseCount(0);
    setPausedDurationMs(0);
    setPausedAt(null);
    setRetryCount(nextRetryCount);
    setAttemptCount(0);
    setCorrectAttemptCount(0);
    setErrorCount(0);
    setCompleted(false);
    setLastSession(null);
    setSessionSaveFailed(false);
    pendingPracticeSave.current = null;
    composing.current = false;
    recorded.current = false;
    committedValue.current = "";
    startedAtRef.current = null;
    lastTimingAtRef.current = null;
    pendingTimingMsRef.current = 0;
    typingDelaysRef.current = [];
    physicalRhythmSamplesRef.current = [];
    correctionPositionsRef.current = new Map();
    errorPositions.current = new Set();
    completionElapsedRef.current = null;
    inactiveAtRef.current = null;
    inactiveDurationMsRef.current = 0;
  }, []);

  return {
    inputValue,
    setInputValue,
    typed,
    typedCharacters,
    targetCharacters,
    startedAt,
    startedAtRef,
    elapsed,
    keyCount,
    letterKeys,
    backspaceCount,
    correctionCount,
    enterCount,
    selectionCount,
    phraseChars,
    leftHandKeys,
    rightHandKeys,
    pauseCount,
    pausedDurationMs,
    pausedAt,
    retryCount,
    attemptCount,
    correctAttemptCount,
    errorCount,
    completed,
    lastSession,
    sessionSaveFailed,
    startTimer,
    commitTypedValue,
    onKeyDown,
    togglePause,
    retrySave,
    pendingPracticeSave,
    resetForArticle,
    composing,
    compositionCommitTimer,
  };
}
