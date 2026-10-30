"use client";

import { saveSettingsChanges as saveSettings } from "./settings-sync.ts";
import { toggleFavoriteArticle as toggleFavorite, readFavoriteArticleIds } from "./article-preferences.ts";
import * as store from "./practice-store.ts";
import * as seasons from "./advanced-season-storage.ts";
import * as maintenance from "./maintenance-store.ts";
import { restoreBackupPayload as restoreBackup } from "./backup.ts";
import { withStorageWriteLock } from "./storage-lock.ts";

// Synchronous core functions remain available for deterministic transaction
// tests. Browser callers use these boundaries and wait for persisted outcomes.
export * from "./practice-store.ts";

function lockedBoolean<A extends unknown[]>(operation: (...args: A) => boolean) {
  return (...args: A): Promise<boolean> =>
    withStorageWriteLock(() => operation(...args)).catch(() => false);
}

export const savePracticeOutcome = lockedBoolean(store.savePracticeOutcome);
export const saveHesitationPracticeOutcome = lockedBoolean(store.saveHesitationPracticeOutcome);
export const clearPracticeHistory = lockedBoolean(store.clearPracticeHistory);
export const clearKeyUsage = lockedBoolean(store.clearKeyUsage);
export const saveCurrentAdvancedPracticeOutcome = lockedBoolean(seasons.saveCurrentAdvancedPracticeOutcome);
export const writeAdvancedSeasonArchive = lockedBoolean(seasons.writeAdvancedSeasonArchive);
export const clearAllMaintenanceData = lockedBoolean(maintenance.clearAllMaintenanceData);
export const clearMaintenanceTarget = lockedBoolean(maintenance.clearMaintenanceTarget);
export const restoreBackupPayload = (...args: Parameters<typeof restoreBackup>) =>
  withStorageWriteLock(() => restoreBackup(...args));

export const startHesitationQueueItem = (...args: Parameters<typeof store.startHesitationQueueItem>) =>
  withStorageWriteLock(() => store.startHesitationQueueItem(...args)).catch(() => null);
export const addHesitationQueueItem = (...args: Parameters<typeof store.addHesitationQueueItem>) =>
  withStorageWriteLock(() => store.addHesitationQueueItem(...args)).catch(() => ({
    result: "storage-error" as const, queue: store.readHesitationQueue(),
  }));
export const deferSpacedReviewTarget = (...args: Parameters<typeof store.deferSpacedReviewTarget>) =>
  withStorageWriteLock(() => store.deferSpacedReviewTarget(...args)).catch(() => null);

export const saveSettingsChanges = (...args: Parameters<typeof saveSettings>) =>
  withStorageWriteLock(() => saveSettings(...args)).catch(() => null);
export const toggleFavoriteArticle = (...args: Parameters<typeof toggleFavorite>) =>
  withStorageWriteLock(() => toggleFavorite(...args)).catch(() => ({
    ok: false, ids: readFavoriteArticleIds(), message: "收藏暂时无法安全保存，请重试。",
  }));

export const startTrainingTask = (...args: Parameters<typeof store.startTrainingTask>) =>
  withStorageWriteLock(() => store.startTrainingTask(...args)).catch(() => null);
