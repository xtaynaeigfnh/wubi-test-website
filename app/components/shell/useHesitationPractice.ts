"use client";

import { useCallback, useMemo, useState } from "react";
import {
  buildHesitationObservations,
  buildHesitationPracticeResult,
  buildHesitationSession,
} from "../../hesitation-practice";
import {
  addHesitationQueueItem,
  getSessions,
  readHesitationQueue,
  saveHesitationPracticeOutcome,
  startHesitationQueueItem,
} from "../../practice-transactions";
import { STORAGE } from "../../storage";
import type {
  HesitationPracticeAttempt,
  HesitationPracticeQueue,
  HesitationPracticeTarget,
} from "../../types";
import { useLocalDataSync } from "../hooks/useLocalDataSync";

export type HesitationAttemptTuple = [
  HesitationPracticeAttempt,
  HesitationPracticeAttempt,
  HesitationPracticeAttempt,
];

export interface ActiveHesitationPractice {
  target: HesitationPracticeTarget;
  queueItemId?: string;
}

const hesitationSyncKeys = [STORAGE.sessions, STORAGE.hesitationQueue];

type QueueResult = Awaited<ReturnType<typeof addHesitationQueueItem>>["result"];

const queueResultMessages: Partial<Record<QueueResult, string>> = {
  duplicate: "这一段已在今日加练中。",
  full: "今日最多加入 5 个卡顿片段，请先完成已有加练。",
  invalid: "这个卡顿片段已经损坏，无法加入今日加练。",
  "storage-error": "今日加练未能保存，请检查浏览器存储空间。",
};

/**
 * 卡顿片段三连练的跨页面状态：今日加练队列、已掌握片段、当前打开的练习，
 * 以及把结果写回本机后的版本号（供成绩页与训练页重新读取）。
 */
export function useHesitationPractice() {
  const [hesitationQueue, setHesitationQueue] =
    useState<HesitationPracticeQueue | null>(null);
  const [masteredAtByFingerprint, setMasteredAtByFingerprint] = useState(
    new Map<string, string>(),
  );
  const [activeHesitationPractice, setActiveHesitationPractice] =
    useState<ActiveHesitationPractice | null>(null);
  const [hesitationSaveRevision, setHesitationSaveRevision] = useState(0);

  const refreshHesitationState = useCallback(() => {
    setHesitationQueue(readHesitationQueue());
    const mastered = new Map<string, string>();
    for (const session of getSessions()) {
      const practice = session.hesitationPractice;
      if (!practice || practice.outcome !== "mastered") continue;
      const previous = mastered.get(practice.target.fingerprint);
      if (!previous || previous < practice.completedAt) {
        mastered.set(practice.target.fingerprint, practice.completedAt);
      }
    }
    setMasteredAtByFingerprint(mastered);
  }, []);

  useLocalDataSync(refreshHesitationState, { keys: hesitationSyncKeys });

  const addHesitationToQueue = useCallback(
    async (target: HesitationPracticeTarget) => {
      const result = await addHesitationQueueItem(target);
      setHesitationQueue(result.queue);
      const message = queueResultMessages[result.result];
      if (message) window.alert(message);
    },
    [],
  );

  const startQueuedHesitationPractice = useCallback(
    async (itemId: string, target: HesitationPracticeTarget) => {
      if (!itemId) {
        setActiveHesitationPractice({ target });
        return;
      }
      const queue = await startHesitationQueueItem(itemId);
      if (!queue) {
        window.alert("加练状态未能保存，请检查浏览器存储空间后再试。");
        return;
      }
      setHesitationQueue(queue);
      setActiveHesitationPractice({ target, queueItemId: itemId });
    },
    [],
  );

  const saveHesitationAttempts = useCallback(
    async (attempts: HesitationAttemptTuple) => {
      if (!activeHesitationPractice) {
        return { ok: false, message: "练习目标已经失效，请关闭后重新进入。" };
      }
      const result = buildHesitationPracticeResult(
        activeHesitationPractice.target,
        attempts,
        attempts[2].completedAt,
      );
      const session = buildHesitationSession(result);
      const saved = await saveHesitationPracticeOutcome(
        session,
        buildHesitationObservations(result),
        activeHesitationPractice.queueItemId,
      );
      if (!saved) {
        return {
          ok: false,
          message: "本次结果未能保存，请检查浏览器存储空间后重试。",
        };
      }
      refreshHesitationState();
      setHesitationSaveRevision((value) => value + 1);
      return { ok: true };
    },
    [activeHesitationPractice, refreshHesitationState],
  );

  const queuedFingerprints = useMemo(
    () =>
      new Set(
        hesitationQueue?.items.map((item) => item.target.fingerprint) ?? [],
      ),
    [hesitationQueue],
  );

  return {
    hesitationQueue,
    masteredAtByFingerprint,
    activeHesitationPractice,
    setActiveHesitationPractice,
    hesitationSaveRevision,
    queuedFingerprints,
    addHesitationToQueue,
    startQueuedHesitationPractice,
    saveHesitationAttempts,
  };
}
