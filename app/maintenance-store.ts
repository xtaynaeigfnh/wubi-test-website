"use client";

import { readLocalForBackup } from "./backup.ts";
import {
  createLightweightStatisticsSummary,
  previewAllCleanup,
  previewCleanup,
  stripSessionLargeObjects,
  type AllCleanupPreview,
  type CleanupPreview,
  type CleanupTarget,
  type StorageDataSnapshot,
} from "./data-maintenance.ts";
import {
  isBoundedSpacedReviewState,
  isPhraseOpportunityStat,
  validateArray,
} from "./practice-schema.ts";
import {
  getErrors,
  getPhraseOpportunities,
  getSessions,
  isValidSessionCollection,
  nextMaintenanceLog,
  readSpacedReviewState,
} from "./practice-store.ts";
import { createEmptySpacedReviewState, type SpacedReviewState } from "./spaced-review.ts";
import { STORAGE, STORAGE_KEYS, commitLocalWrites } from "./storage.ts";
import type { PhraseOpportunityStat } from "./types";

export function readStorageDataSnapshot(): StorageDataSnapshot {
  const allValues = STORAGE_KEYS.map((key) => readLocalForBackup(key));
  const values = new Map(STORAGE_KEYS.map((key, index) => [key, allValues[index]]));
  const sessions = values.get(STORAGE.sessions) ?? [];
  const phraseOpportunities = values.get(STORAGE.phraseOpportunities) ?? [];
  const reviewState = values.get(STORAGE.reviewState) ?? createEmptySpacedReviewState();
  if (!isValidSessionCollection(sessions) ||
    !validateArray(phraseOpportunities, 120, isPhraseOpportunityStat) ||
    !isBoundedSpacedReviewState(reviewState)) {
    throw new Error("本机练习数据格式异常，无法安全预览或清理。请先从有效备份恢复。");
  }
  return {
    sessions,
    phraseOpportunities: phraseOpportunities as PhraseOpportunityStat[],
    reviewState: reviewState as SpacedReviewState,
    allValues,
  };
}

export function inspectCleanup(target: CleanupTarget): CleanupPreview {
  return previewCleanup(target, readStorageDataSnapshot());
}

export function inspectAllCleanup(): AllCleanupPreview {
  return previewAllCleanup(readStorageDataSnapshot());
}

export function clearAllMaintenanceData(now = new Date()): boolean {
  const snapshot = readStorageDataSnapshot();
  const preview = previewAllCleanup(snapshot);
  let sessions = stripSessionLargeObjects(snapshot.sessions, "heatmaps");
  sessions = stripSessionLargeObjects(sessions, "ghosts");
  sessions = stripSessionLargeObjects(sessions, "rhythm");
  return commitLocalWrites(
    new Map<string, unknown>([
      [STORAGE.sessions, sessions],
      [STORAGE.phraseOpportunities, []],
      [STORAGE.reviewState, createEmptySpacedReviewState()],
      [STORAGE.trainingPlan, null],
      [
        STORAGE.maintenance,
        nextMaintenanceLog(
          "cleanup",
          `已全部清理 ${preview.count} 项附加数据，约释放 ${preview.bytes} 字节。`,
          now,
        ),
      ],
    ]),
  );
}

export function clearMaintenanceTarget(
  target: CleanupTarget,
  now = new Date(),
): boolean {
  const snapshot = readStorageDataSnapshot();
  const preview = previewCleanup(target, snapshot);
  const writes = new Map<string, unknown>();
  if (target === "phrases") {
    writes.set(STORAGE.phraseOpportunities, []);
  } else if (target === "reviews") {
    writes.set(STORAGE.reviewState, createEmptySpacedReviewState());
    writes.set(STORAGE.trainingPlan, null);
  } else {
    writes.set(STORAGE.sessions, stripSessionLargeObjects(snapshot.sessions, target));
  }
  writes.set(
    STORAGE.maintenance,
    nextMaintenanceLog(
      "cleanup",
      `已清理 ${preview.count} 项${preview.label}，约释放 ${preview.bytes} 字节。`,
      now,
    ),
  );
  return commitLocalWrites(writes);
}

export function buildLightweightStatisticsSummary(now = new Date()) {
  return createLightweightStatisticsSummary(
    getSessions(),
    getErrors(),
    getPhraseOpportunities(),
    readSpacedReviewState(),
    now,
  );
}
