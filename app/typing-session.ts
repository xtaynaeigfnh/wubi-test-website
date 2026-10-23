import {
  applyTypingDelaySample,
  calculateActiveDurationSeconds,
  calculateTypingTransitionMs,
  canCompleteTyping,
  classifyWubiHand,
  countCommittedAttempts,
  countCommittedEdit,
  getCommittedEditRange,
  isImeSelectionKey,
  isWubiLetterKey,
} from "./typing-metrics.ts";
import { MAX_PHYSICAL_RHYTHM_SAMPLES, type PhysicalRhythmSample } from "./rhythm-lab.ts";
import type { PhraseOpportunityInput } from "./practice-store.ts";
import type { SessionResult, WeakObservation } from "./types.ts";

export interface TypingOutcome {
  session: SessionResult;
  observations: WeakObservation[];
  phraseOpportunities: PhraseOpportunityInput[];
}

type TypingPhase =
  | { status: "idle" | "running" | "paused" }
  | { status: "completed"; completedAt: number; outcome: TypingOutcome | null; saved: boolean }
  | { status: "save-failed"; completedAt: number; outcome: TypingOutcome };

interface TypingClock {
  startedAt: number | null;
  pausedAt: number | null;
  pausedDurationMs: number;
  inactiveAt: number | null;
  inactiveDurationMs: number;
  hidden: boolean;
  lastTimingAt: number | null;
  pendingTimingMs: number;
}

export interface TypingSessionState {
  phase: TypingPhase;
  clock: TypingClock;
  inputValue: string;
  typed: string;
  elapsed: number;
  keyCount: number;
  letterKeys: number;
  backspaceCount: number;
  correctionCount: number;
  enterCount: number;
  selectionCount: number;
  phraseChars: number;
  leftHandKeys: number;
  rightHandKeys: number;
  pauseCount: number;
  retryCount: number;
  attemptCount: number;
  correctAttemptCount: number;
  errorPositions: Set<number>;
  correctionPositions: Map<number, number>;
  typingDelays: number[];
  physicalRhythmSamples: PhysicalRhythmSample[];
}

export type TypingSessionEvent =
  | { type: "start"; now: number }
  | { type: "preedit"; value: string }
  | { type: "commit"; value: string; target: string; now: number }
  | { type: "key"; key: string; code: string; composing: boolean; now: number }
  | { type: "tick"; now: number }
  | { type: "pause" | "resume"; now: number }
  | { type: "visibility"; hidden: boolean; now: number }
  | { type: "settle"; outcome: TypingOutcome }
  | { type: "save-result"; sessionId: string; saved: boolean }
  | { type: "reset"; retryCount: number };

export function createTypingSession(retryCount = 0): TypingSessionState {
  return {
    phase: { status: "idle" },
    clock: {
      startedAt: null, pausedAt: null, pausedDurationMs: 0,
      inactiveAt: null, inactiveDurationMs: 0, hidden: false,
      lastTimingAt: null, pendingTimingMs: 0,
    },
    inputValue: "", typed: "", elapsed: 0,
    keyCount: 0, letterKeys: 0, backspaceCount: 0, correctionCount: 0,
    enterCount: 0, selectionCount: 0, phraseChars: 0,
    leftHandKeys: 0, rightHandKeys: 0, pauseCount: 0, retryCount,
    attemptCount: 0, correctAttemptCount: 0,
    errorPositions: new Set(), correctionPositions: new Map(),
    typingDelays: [], physicalRhythmSamples: [],
  };
}

export function isTypingComplete(state: TypingSessionState): boolean {
  return state.phase.status === "completed" || state.phase.status === "save-failed";
}

export function canAcceptTyping(state: TypingSessionState): boolean {
  return !state.clock.hidden && (state.phase.status === "idle" || state.phase.status === "running");
}

export function typingElapsed(state: TypingSessionState, now: number): number {
  return isTypingComplete(state)
    ? state.elapsed
    : calculateActiveDurationSeconds({ ...state.clock, now });
}

function startSession(state: TypingSessionState, now: number): TypingSessionState {
  if (state.phase.status !== "idle" || state.clock.hidden) return state;
  return {
    ...state,
    phase: { status: "running" },
    clock: { ...state.clock, startedAt: now, lastTimingAt: now },
  };
}

function suspendTiming(clock: TypingClock, now: number): TypingClock {
  return {
    ...clock,
    pendingTimingMs: calculateTypingTransitionMs({
      lastActiveAt: clock.lastTimingAt, pendingMs: clock.pendingTimingMs, now,
    }),
    lastTimingAt: null,
  };
}

function commitInput(state: TypingSessionState, event: Extract<TypingSessionEvent, { type: "commit" }>): TypingSessionState {
  if (!canAcceptTyping(state)) return state;
  const targetCharacters = Array.from(event.target);
  const committed = Array.from(event.value.replace(/[\r\n]/g, ""))
    .slice(0, targetCharacters.length).join("");
  if (committed === state.typed) return { ...state, inputValue: committed };
  const current = committed ? startSession(state, event.now) : state;
  const edit = countCommittedEdit(current.typed, committed);
  const attempt = countCommittedAttempts(current.typed, committed, event.target);
  const correctionPositions = new Map(current.correctionPositions);
  const range = getCommittedEditRange(current.typed, committed);
  for (let offset = 0; offset < range.removed; offset += 1) {
    const index = range.start + offset;
    correctionPositions.set(index, (correctionPositions.get(index) ?? 0) + 1);
  }
  const errorPositions = new Set(current.errorPositions);
  Array.from(committed).forEach((character, index) => {
    if (character !== targetCharacters[index]) errorPositions.add(index);
  });
  const elapsed = typingElapsed(current, event.now);
  return {
    ...current,
    phase: canCompleteTyping(committed, event.target)
      ? { status: "completed", completedAt: event.now, outcome: null, saved: false }
      : current.phase,
    clock: { ...current.clock, pendingTimingMs: 0, lastTimingAt: event.now },
    inputValue: committed,
    typed: committed,
    elapsed,
    correctionCount: current.correctionCount + edit.removed,
    phraseChars: current.phraseChars + edit.phraseChars,
    attemptCount: current.attemptCount + attempt.attempts,
    correctAttemptCount: current.correctAttemptCount + attempt.correct,
    errorPositions,
    correctionPositions,
    typingDelays: applyTypingDelaySample({
      previous: current.typed, next: committed, target: event.target,
      delayMs: calculateTypingTransitionMs({
        lastActiveAt: current.clock.lastTimingAt,
        pendingMs: current.clock.pendingTimingMs, now: event.now,
      }),
      delays: current.typingDelays,
    }),
  };
}

/** Pure event transitions: completion freezes metrics; only reset starts a new session. */
export function typingSessionReducer(state: TypingSessionState, event: TypingSessionEvent): TypingSessionState {
  switch (event.type) {
    case "reset": {
      // Failed/unfinished persistence must be retried before discarding the result.
      if (state.phase.status === "save-failed" ||
        (state.phase.status === "completed" && !state.phase.saved)) return state;
      const next = createTypingSession(event.retryCount);
      return { ...next, clock: { ...next.clock, hidden: state.clock.hidden } };
    }
    case "start":
      return startSession(state, event.now);
    case "preedit":
      return canAcceptTyping(state) ? { ...state, inputValue: event.value } : state;
    case "commit":
      return commitInput(state, event);
    case "key": {
      if (!canAcceptTyping(state)) return state;
      const current = event.key.length === 1 || event.key === "Process" ||
        event.key === "Unidentified" || event.composing ? startSession(state, event.now) : state;
      const letter = isWubiLetterKey(event.key, event.code);
      const hand = letter ? classifyWubiHand(event.key, event.code) : null;
      const countKey = !["Shift", "Control", "Alt", "Meta", "CapsLock"].includes(event.key);
      return {
        ...current,
        keyCount: current.keyCount + Number(countKey),
        letterKeys: current.letterKeys + Number(letter),
        backspaceCount: current.backspaceCount + Number(event.key === "Backspace"),
        enterCount: current.enterCount + Number(event.key === "Enter"),
        selectionCount: current.selectionCount + Number(event.composing && isImeSelectionKey(event.key)),
        leftHandKeys: current.leftHandKeys + Number(hand === "left"),
        rightHandKeys: current.rightHandKeys + Number(hand === "right"),
        physicalRhythmSamples: hand && current.physicalRhythmSamples.length < MAX_PHYSICAL_RHYTHM_SAMPLES
          ? [...current.physicalRhythmSamples, { elapsedMs: typingElapsed(current, event.now) * 1000, hand }]
          : current.physicalRhythmSamples,
      };
    }
    case "tick":
      return state.phase.status === "running"
        ? { ...state, elapsed: typingElapsed(state, event.now) } : state;
    case "pause": {
      if (state.phase.status !== "running") return state;
      const clock = suspendTiming(state.clock, event.now);
      return {
        ...state,
        phase: { status: "paused" },
        inputValue: state.typed,
        elapsed: typingElapsed(state, event.now),
        pauseCount: state.pauseCount + 1,
        // Close background time before opening manual pause: never subtract twice.
        clock: {
          ...clock, pausedAt: event.now, inactiveAt: null,
          inactiveDurationMs: clock.inactiveDurationMs +
            (clock.inactiveAt === null ? 0 : Math.max(0, event.now - clock.inactiveAt)),
        },
      };
    }
    case "resume":
      if (state.phase.status !== "paused") return state;
      return {
        ...state,
        phase: { status: "running" },
        clock: {
          ...state.clock,
          pausedDurationMs: state.clock.pausedDurationMs + Math.max(0, event.now - state.clock.pausedAt!),
          pausedAt: null,
          inactiveAt: state.clock.hidden ? event.now : null,
          lastTimingAt: state.clock.hidden ? null : event.now,
        },
      };
    case "visibility": {
      if (isTypingComplete(state) || state.clock.hidden === event.hidden) return state;
      let clock = { ...state.clock, hidden: event.hidden };
      if (state.phase.status === "running") {
        clock = event.hidden
          ? { ...suspendTiming(clock, event.now), inactiveAt: event.now }
          : {
            ...clock, inactiveAt: null, lastTimingAt: event.now,
            inactiveDurationMs: clock.inactiveDurationMs +
              (clock.inactiveAt === null ? 0 : Math.max(0, event.now - clock.inactiveAt)),
          };
      }
      return { ...state, clock, elapsed: typingElapsed(state, event.now) };
    }
    case "settle":
      if (state.phase.status !== "completed" || state.phase.outcome) return state;
      return { ...state, phase: { ...state.phase, outcome: event.outcome } };
    case "save-result": {
      const phase = state.phase;
      if ((phase.status !== "completed" && phase.status !== "save-failed") ||
        !phase.outcome || phase.outcome.session.id !== event.sessionId ||
        (phase.status === "completed" && phase.saved)) return state;
      return {
        ...state,
        phase: event.saved
          ? { ...phase, status: "completed", saved: true }
          : { status: "save-failed", completedAt: phase.completedAt, outcome: phase.outcome },
      };
    }
  }
}
