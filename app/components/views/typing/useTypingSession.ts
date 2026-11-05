"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type KeyboardEvent,
  type RefObject,
} from "react";
import {
  createLocalId,
  recordKeyUsage,
  readTrainingPlan,
  savePracticeOutcome,
} from "../../../practice-transactions";
import {
  canAcceptTyping,
  createTypingSession,
  isTypingComplete,
  typingSessionReducer,
  type TypingOutcome,
  type TypingSessionEvent,
} from "../../../typing-session";
import { buildTypingOutcome } from "../../../typing-outcome";
import type { CodeLengthCoachAnalysis } from "../../../code-length-coach";
import type { KeySoundPlayer, PracticeArticle } from "../../../types";
import type { GhostRaceApi } from "./useGhostRace";

export function useTypingSession({
  article,
  visibleText,
  targetText,
  playKeySound,
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
  ghostApiRef: RefObject<GhostRaceApi | null>;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  wubiCodesRef: RefObject<Map<string, string>>;
  theoreticalCodeLength: number | null;
  codeLengthAnalysis: CodeLengthCoachAnalysis | null;
}) {
  const [state, dispatch] = useReducer(typingSessionReducer, undefined, createTypingSession);
  // IME events can arrive in one React batch. Apply the same pure reducer to a
  // synchronous snapshot so handlers and effects never consume a stale render.
  const current = useRef(state);
  const startedAtRef = useRef<number | null>(null);
  const send = useCallback((event: TypingSessionEvent) => {
    current.current = typingSessionReducer(current.current, event);
    startedAtRef.current = current.current.clock.startedAt;
    dispatch(event);
    return current.current;
  }, []);
  const composing = useRef(false);
  const compositionCommitTimer = useRef<number | null>(null);
  const resumeFocusTimer = useRef<number | null>(null);
  const targetCharacters = useMemo(() => Array.from(targetText), [targetText]);
  const typedCharacters = useMemo(() => Array.from(state.typed), [state.typed]);
  const completed = isTypingComplete(state);
  const startedAt = state.clock.startedAt;

  const clearInputTimers = useCallback(() => {
    if (compositionCommitTimer.current !== null) {
      window.clearTimeout(compositionCommitTimer.current);
      compositionCommitTimer.current = null;
    }
    if (resumeFocusTimer.current !== null) {
      window.clearTimeout(resumeFocusTimer.current);
      resumeFocusTimer.current = null;
    }
  }, []);
  useEffect(() => clearInputTimers, [clearInputTimers]);

  useEffect(() => {
    if (state.phase.status !== "running") return;
    const timer = window.setInterval(() => send({ type: "tick", now: Date.now() }), 250);
    return () => window.clearInterval(timer);
  }, [send, state.phase.status]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      send({ type: "visibility", hidden: document.hidden, now: Date.now() });
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    handleVisibilityChange();
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [send]);

  const armIfStarted = (previousStartedAt: number | null) => {
    if (previousStartedAt === null && current.current.clock.startedAt !== null) {
      ghostApiRef.current?.armActiveRace();
    }
  };
  // A rejected edit leaves the reducer state untouched, so React can bail out
  // of the controlled re-render and keep the rejected text in the textarea.
  // Restore the committed value imperatively to enforce the block deterministically.
  const revertRejectedInput = () => {
    const committedValue = current.current.inputValue;
    if (inputRef.current && inputRef.current.value !== committedValue) {
      inputRef.current.value = committedValue;
    }
  };
  const startTimer = () => {
    if (!article) return;
    const previousStartedAt = current.current.clock.startedAt;
    send({ type: "start", now: Date.now() });
    armIfStarted(previousStartedAt);
  };

  const saveOutcome = useCallback(async (outcome: TypingOutcome) => {
    const saved = await savePracticeOutcome(outcome.session, outcome.observations, outcome.phraseOpportunities);
    send({ type: "save-result", sessionId: outcome.session.id, saved });
    if (saved) ghostApiRef.current?.refreshSessions();
    return saved;
  }, [ghostApiRef, send]);

  useEffect(() => {
    const snapshot = current.current;
    // settle installs the outcome synchronously before saving. Effect replay,
    // diagnostic refreshes and duplicate composition events cannot settle twice.
    if (!article || snapshot.phase.status !== "completed" || snapshot.phase.outcome) return;
    const articleId = article.kind === "custom" || article.kind === "common" || article.id.startsWith("custom-")
      ? undefined : article.id;
    const outcome = buildTypingOutcome({
      state: snapshot, article, visibleText, targetText,
      id: createLocalId(),
      wubiCodes: wubiCodesRef.current,
      theoreticalCodeLength, codeLengthAnalysis,
      trainingTaskId: readTrainingPlan()?.tasks.find((task) =>
        task.type === "article" && task.status === "in-progress" && task.articleId === articleId,
      )?.id,
      ghostTimeline: ghostApiRef.current?.finalizeTimeline(targetCharacters.length, snapshot.elapsed) ?? undefined,
    });
    send({ type: "settle", outcome });
    void saveOutcome(outcome).then((saved) => {
      if (!saved) window.alert("本次成绩未能保存，请检查浏览器存储空间后再试。");
    });
  }, [article, state.phase, visibleText, targetText, targetCharacters.length,
    wubiCodesRef, theoreticalCodeLength, codeLengthAnalysis, ghostApiRef, send, saveOutcome]);

  const commitTypedValue = (value: string) => {
    if (!article) return;
    const previous = current.current;
    const next = send({ type: "commit", value, target: targetText, now: Date.now() });
    armIfStarted(previous.clock.startedAt);
    if (next === previous) {
      revertRejectedInput();
      return;
    }
    if (Array.from(next.typed).length > Array.from(previous.typed).length) {
      ghostApiRef.current?.recordProgressSample(Array.from(next.typed).length, next.elapsed * 1000);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") event.preventDefault();
    if (!article || event.ctrlKey || event.metaKey || event.altKey || !canAcceptTyping(current.current)) return;
    const previousStartedAt = current.current.clock.startedAt;
    send({
      type: "key", key: event.key, code: event.code,
      composing: composing.current || event.nativeEvent.isComposing, now: Date.now(),
    });
    armIfStarted(previousStartedAt);
    if (!["Shift", "Control", "Alt", "Meta", "CapsLock"].includes(event.key)) {
      recordKeyUsage(event.code);
      playKeySound();
    }
  };

  const togglePause = () => {
    const status = current.current.phase.status;
    if (status !== "running" && status !== "paused") return;
    clearInputTimers();
    composing.current = false;
    send({ type: status === "paused" ? "resume" : "pause", now: Date.now() });
    if (status === "paused") {
      resumeFocusTimer.current = window.setTimeout(() => {
        resumeFocusTimer.current = null;
        inputRef.current?.focus();
      }, 0);
    }
  };

  const retrySave = useCallback(async () => {
    const phase = current.current.phase;
    if (phase.status !== "save-failed") return false;
    if (!await saveOutcome(phase.outcome)) {
      window.alert("仍未能保存，请清理部分本机数据后再试。");
      return false;
    }
    return true;
  }, [saveOutcome]);

  const resetForArticle = useCallback((retryCount: number) => {
    const previous = current.current;
    if (send({ type: "reset", retryCount }) === previous) return;
    send({ type: "visibility", hidden: document.hidden, now: Date.now() });
    clearInputTimers();
    composing.current = false;
  }, [clearInputTimers, send]);

  const hasPendingSave = useCallback(() => {
    const phase = current.current.phase;
    return phase.status === "save-failed" || (phase.status === "completed" && !phase.saved);
  }, []);

  return {
    ...state,
    status: state.phase.status,
    startedAt,
    startedAtRef,
    pausedAt: state.clock.pausedAt,
    pausedDurationMs: state.clock.pausedDurationMs,
    errorCount: state.errorPositions.size,
    completed,
    lastSession: state.phase.status === "completed" || state.phase.status === "save-failed"
      ? state.phase.outcome?.session ?? null : null,
    sessionSaveFailed: state.phase.status === "save-failed",
    sessionSaved: state.phase.status === "completed" && state.phase.saved,
    targetCharacters,
    typedCharacters,
    setInputValue: (value: string) => {
      const previous = current.current;
      if (send({ type: "preedit", value }) !== previous) return;
      revertRejectedInput();
    },
    startTimer,
    commitTypedValue,
    onKeyDown,
    togglePause,
    retrySave,
    hasPendingSave,
    resetForArticle,
    composing,
    compositionCommitTimer,
  };
}
