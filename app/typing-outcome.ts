import {
  buildTypingHeatmap,
  calculateKeyAccuracy,
  calculatePhraseRate,
  calculateTypingMetrics,
  getHesitationLevel,
} from "./typing-metrics.ts";
import { buildRhythmSummary } from "./rhythm-lab.ts";
import type { CodeLengthCoachAnalysis } from "./code-length-coach.ts";
import type { GhostTimeline, PracticeArticle, SessionResult, WeakObservation } from "./types.ts";
import type { TypingOutcome, TypingSessionState } from "./typing-session.ts";

/** Build one immutable result from the completed snapshot, without storage or browser I/O. */
export function buildTypingOutcome({
  state, article, visibleText, targetText, id, wubiCodes,
  theoreticalCodeLength, codeLengthAnalysis, trainingTaskId, ghostTimeline,
}: {
  state: TypingSessionState;
  article: PracticeArticle;
  visibleText: string;
  targetText: string;
  id: string;
  wubiCodes: ReadonlyMap<string, string>;
  theoreticalCodeLength: number | null;
  codeLengthAnalysis: CodeLengthCoachAnalysis | null;
  trainingTaskId?: string;
  ghostTimeline?: GhostTimeline;
}): TypingOutcome {
  if (state.phase.status !== "completed" && state.phase.status !== "save-failed") {
    throw new Error("Only completed typing sessions can be settled");
  }
  const {
    typed, keyCount, letterKeys, attemptCount, correctAttemptCount,
    backspaceCount, correctionCount, enterCount, selectionCount, phraseChars,
    leftHandKeys, rightHandKeys, pauseCount, retryCount,
  } = state;
  const targetCharacters = Array.from(targetText);
  const finalSeconds = state.elapsed;
  const pauseSeconds = state.clock.pausedDurationMs / 1000;
  const errorChars = Array.from(state.errorPositions)
    .map((index) => targetCharacters[index])
    .filter(Boolean);
  const completedAt = new Date(state.phase.completedAt).toISOString();
  const heatmap = buildTypingHeatmap(visibleText, state.typingDelays);
  const rhythmSummary = buildRhythmSummary({
    text: visibleText,
    delays: state.typingDelays,
    physicalSamples: state.physicalRhythmSamples,
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
      code: wubiCodes.get(character),
      kind,
      severity,
      occurredAt: completedAt,
    });
  };
  for (const index of state.errorPositions) {
    addObservation(targetCharacters[index], "coding-error");
  }
  for (const [index, count] of state.correctionPositions) {
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
  const session: SessionResult = {
    id,
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
    errors: state.errorPositions.size,
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
  return { session, observations, phraseOpportunities };
}
