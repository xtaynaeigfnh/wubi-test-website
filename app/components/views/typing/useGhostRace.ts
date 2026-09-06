"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSessions } from "../../../lib";
import {
  buildGhostTimeline,
  compareGhostSegments,
  getGhostArticleIdentity,
  getGhostElapsedAtProgress,
  getGhostPositionAtElapsed,
  getGhostSampleStep,
  selectGhostSessions,
  type GhostProgressPoint,
} from "../../../ghost-race";
import type { GhostTimeline, PracticeArticle } from "../../../types";

export type GhostMode = "off" | "best" | "recent";

export interface GhostRaceApi {
  armActiveRace(): void;
  recordProgressSample(characterCount: number, elapsedMs: number): void;
  finalizeTimeline(
    finalCharacterCount: number,
    finalSeconds: number,
  ): GhostTimeline | null;
  refreshSessions(): void;
  resetForArticle(nextGhostMode: GhostMode): void;
}

export function useGhostRace({
  article,
  startedAt,
  startedAtRef,
  seconds,
  targetCharacterCount,
  typedCharacterCount,
  showGhostGapSetting,
  onShowGhostGapChange,
}: {
  article: PracticeArticle | null;
  startedAt: number | null;
  startedAtRef: { current: number | null };
  seconds: number;
  targetCharacterCount: number;
  typedCharacterCount: number;
  showGhostGapSetting: boolean;
  onShowGhostGapChange: (value: boolean) => void;
}) {
  const [ghostMode, setGhostMode] = useState<GhostMode>("off");
  const [showGhostGap, setShowGhostGap] = useState(showGhostGapSetting);
  const [ghostRevision, setGhostRevision] = useState(0);
  const [completedGhostTimeline, setCompletedGhostTimeline] =
    useState<GhostTimeline | null>(null);
  const [activeGhostTimelineState, setActiveGhostTimelineState] =
    useState<GhostTimeline | null>(null);
  const [activeGhostMode, setActiveGhostMode] =
    useState<GhostMode>("off");
  const ghostProgressPointsRef = useRef<GhostProgressPoint[]>([]);
  const selectedGhostTimelineRef = useRef<GhostTimeline | null>(null);

  const ghostIdentity = useMemo(
    () => (article ? getGhostArticleIdentity(article) : null),
    [article],
  );
  const ghostSessions = useMemo(
    () => {
      void ghostRevision;
      return ghostIdentity
        ? selectGhostSessions(getSessions(), ghostIdentity)
        : { best: null, recent: null };
    },
    [ghostIdentity, ghostRevision],
  );
  const selectedGhostSession =
    ghostMode === "best"
      ? ghostSessions.best
      : ghostMode === "recent"
        ? ghostSessions.recent
        : null;
  const selectedGhostTimeline = selectedGhostSession?.ghostTimeline ?? null;
  useEffect(() => {
    if (startedAt === null) {
      selectedGhostTimelineRef.current = selectedGhostTimeline;
    }
  }, [selectedGhostTimeline, startedAt]);
  useEffect(() => {
    if (startedAtRef.current === null) setShowGhostGap(showGhostGapSetting);
  }, [showGhostGapSetting, startedAtRef]);
  const visibleText = article?.text || "";
  const paragraphBoundaries = useMemo(
    () =>
      visibleText
      .split(/[\r\n]+/)
      .filter((paragraph) => paragraph.length > 0)
        .reduce<number[]>((boundaries, paragraph) => {
          const previous = boundaries.at(-1) ?? 0;
          return [...boundaries, previous + Array.from(paragraph).length];
        }, []),
    [visibleText],
  );

  const activeGhostTimeline =
    startedAt !== null
      ? activeGhostTimelineState
      : selectedGhostTimeline;
  const displayGhostMode = startedAt !== null ? activeGhostMode : ghostMode;
  const ghostPosition = activeGhostTimeline
    ? getGhostPositionAtElapsed(activeGhostTimeline, seconds * 1000)
    : 0;
  const ghostProgressPercent = activeGhostTimeline
    ? Math.min(100, (ghostPosition / Math.max(1, targetCharacterCount)) * 100)
    : 0;
  const ghostCharacterGap = activeGhostTimeline
    ? typedCharacterCount - ghostPosition
    : 0;
  const ghostTimeGapMs = activeGhostTimeline
    ? seconds * 1000 -
      getGhostElapsedAtProgress(activeGhostTimeline, typedCharacterCount)
    : 0;
  const ghostGapLabel = activeGhostTimeline
    ? `${ghostCharacterGap >= 0 ? "领先" : "落后"} ${Math.abs(
        ghostCharacterGap,
      ).toFixed(1)} 字 · ${ghostTimeGapMs <= 0 ? "快" : "慢"} ${Math.abs(
        ghostTimeGapMs / 1000,
      ).toFixed(1)} 秒`
    : "普通练习";
  const ghostSegmentComparison = useMemo(
    () =>
      completedGhostTimeline && activeGhostTimelineState
        ? compareGhostSegments(
            completedGhostTimeline,
            activeGhostTimelineState,
            paragraphBoundaries,
          )
        : [],
    [activeGhostTimelineState, completedGhostTimeline, paragraphBoundaries],
  );

  const toggleGhostGap = () => {
    const next = !showGhostGap;
    setShowGhostGap(next);
    onShowGhostGapChange(next);
  };

  const armActiveRace = useCallback(() => {
    setActiveGhostTimelineState(selectedGhostTimelineRef.current);
    setActiveGhostMode(selectedGhostTimelineRef.current ? ghostMode : "off");
  }, [ghostMode]);

  const recordProgressSample = useCallback(
    (characterCount: number, elapsedMs: number) => {
      if (!ghostIdentity) return;
      const previousPoint = ghostProgressPointsRef.current.at(-1);
      const step = getGhostSampleStep(ghostIdentity.characterCount);
      if (
        characterCount === ghostIdentity.characterCount ||
        characterCount >= (previousPoint?.characterCount ?? 0) + step
      ) {
        ghostProgressPointsRef.current.push({ characterCount, elapsedMs });
      }
    },
    [ghostIdentity],
  );

  const finalizeTimeline = useCallback(
    (finalCharacterCount: number, finalSeconds: number): GhostTimeline | null => {
      if (!ghostIdentity) return null;
      ghostProgressPointsRef.current.push({
        characterCount: finalCharacterCount,
        elapsedMs: finalSeconds * 1000,
      });
      const timeline =
        buildGhostTimeline(ghostIdentity, ghostProgressPointsRef.current) ??
        null;
      setCompletedGhostTimeline(timeline);
      return timeline;
    },
    [ghostIdentity],
  );

  const refreshSessions = useCallback(() => {
    setGhostRevision((value) => value + 1);
  }, []);

  const resetForArticle = useCallback((nextGhostMode: GhostMode) => {
    setGhostMode(nextGhostMode);
    setCompletedGhostTimeline(null);
    setActiveGhostTimelineState(null);
    setActiveGhostMode("off");
    ghostProgressPointsRef.current = [];
    selectedGhostTimelineRef.current = null;
  }, []);

  return {
    ghostMode,
    setGhostMode,
    ghostSessions,
    showGhostGap,
    toggleGhostGap,
    activeGhostTimeline,
    displayGhostMode,
    activeGhostMode,
    ghostProgressPercent,
    ghostGapLabel,
    ghostSegmentComparison,
    armActiveRace,
    recordProgressSample,
    finalizeTimeline,
    refreshSessions,
    resetForArticle,
  };
}
