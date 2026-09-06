"use client";

import {
  isBoundedString,
  isDateString,
  isPracticeArticle,
  isHesitationPracticeQueue,
  isCustomPracticeArticle,
  isErrorStat,
  isPhraseOpportunityStat,
  isDailyTrainingPlan,
  isValidArticleProgressCollection,
  validateArray,
  isSettings,
  normalizeBackupSettings,
  isDailyGoal,
  normalizeBackupDailyGoal,
  isMusicPreferences,
  isBoundedSpacedReviewState,
  utf8ByteLength,
  normalizeDailyGoalValue,
} from "./practice-schema.ts";
import { STORAGE, STORAGE_KEYS } from "./storage.ts";
import type {
  AdvancedSeasonArchive,
  BackupPayload,
  PracticeArticle,
  PhraseOpportunityStat,
} from "./types.ts";
import { MAX_CUSTOM_ARTICLES } from "./practice-constraints.ts";
import { isAdvancedSeasonArchive } from "./advanced-training.ts";
import { isMaintenanceLog } from "./data-maintenance.ts";
import { isValidKeyUsage, normalizeKeyUsage } from "./key-usage.ts";
import { flushPendingKeyUsage, isValidSessionCollection } from "./practice-store.ts";

export function readLocalForBackup(key: string): unknown | null {
  if (typeof window === "undefined") {
    throw new Error("只能在浏览器中导出备份");
  }
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    throw new Error("浏览器拒绝读取本机数据，备份未导出");
  }
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (key === STORAGE.keyUsage) return normalizeKeyUsage(parsed);
    if (key === STORAGE.dailyGoal) return normalizeDailyGoalValue(parsed);
    return parsed;
  } catch {
    throw new Error(`本机数据已损坏，备份未导出：${key}`);
  }
}
export function createBackupPayload(
  data: Record<string, unknown>,
  now = new Date(),
): BackupPayload {
  const selected = Object.fromEntries(
    STORAGE_KEYS.filter((key) => key in data).map((key) => [key, data[key]]),
  );
  return {
    format: "wubi-test-backup",
    version: 2,
    exportedAt: now.toISOString(),
    data: selected,
  };
}

export const MAX_BACKUP_BYTES = 2 * 1024 * 1024;
function isValidBackupValue(key: string, value: unknown): boolean {
  if (value === null) return true;
  switch (key) {
    case STORAGE.settings:
      return isSettings(value);
    case STORAGE.sessions:
      return isValidSessionCollection(value);
    case STORAGE.errors:
      return validateArray(value, 300, isErrorStat);
    case STORAGE.progress:
      return isValidArticleProgressCollection(value);
    case STORAGE.customTexts:
      return (
        validateArray(value, MAX_CUSTOM_ARTICLES, isCustomPracticeArticle) &&
        new Set((value as PracticeArticle[]).map((article) => article.id)).size ===
          (value as PracticeArticle[]).length
      );
    case STORAGE.recent:
      return validateArray(
        value,
        100,
        (item) => isBoundedString(item, 160) && item.length > 0,
      );
    case STORAGE.current:
      return isBoundedString(value, 160);
    case STORAGE.dailyGoal:
      return isDailyGoal(value);
    case STORAGE.currentGenerated:
      return isPracticeArticle(value);
    case STORAGE.music:
      return isMusicPreferences(value);
    case STORAGE.keyUsage:
      return isValidKeyUsage(value);
    case STORAGE.trainingPlan:
      return isDailyTrainingPlan(value);
    case STORAGE.hesitationQueue:
      return isHesitationPracticeQueue(value);
    case STORAGE.phraseOpportunities:
      return (
        validateArray(value, 120, isPhraseOpportunityStat) &&
        new Set((value as PhraseOpportunityStat[]).map((item) => item.text))
          .size === (value as PhraseOpportunityStat[]).length
      );
    case STORAGE.advancedSeason:
      return isAdvancedSeasonArchive(value as AdvancedSeasonArchive);
    case STORAGE.reviewState:
      return isBoundedSpacedReviewState(value);
    case STORAGE.maintenance:
      return isMaintenanceLog(value);
    default:
      return false;
  }
}
export function parseBackupPayload(value: unknown): BackupPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("备份文件格式不正确");
  }
  const payload = value as Partial<BackupPayload>;
  if (
    payload.format !== "wubi-test-backup" ||
    payload.version !== 2 ||
    !payload.data ||
    typeof payload.data !== "object" ||
    Array.isArray(payload.data)
  ) {
    throw new Error("这不是受支持的五笔测试网站备份");
  }
  const unknownKeys = Object.keys(payload.data).filter(
    (key) => !STORAGE_KEYS.includes(key as (typeof STORAGE_KEYS)[number]),
  );
  if (unknownKeys.length) {
    throw new Error("备份包含无法识别的数据项");
  }
  if (!isDateString(payload.exportedAt)) {
    throw new Error("备份导出时间无效");
  }
  const normalizedData = { ...payload.data };
  if (STORAGE.settings in normalizedData && normalizedData[STORAGE.settings] !== null) {
    const settings = normalizeBackupSettings(normalizedData[STORAGE.settings]);
    if (!settings) {
      throw new Error(`备份中的数据项格式不正确：${STORAGE.settings}`);
    }
    normalizedData[STORAGE.settings] = settings;
  }
  if (STORAGE.dailyGoal in normalizedData && normalizedData[STORAGE.dailyGoal] !== null) {
    const dailyGoal = normalizeBackupDailyGoal(normalizedData[STORAGE.dailyGoal]);
    if (!dailyGoal) {
      throw new Error(`备份中的数据项格式不正确：${STORAGE.dailyGoal}`);
    }
    normalizedData[STORAGE.dailyGoal] = dailyGoal;
  }
  if (utf8ByteLength(JSON.stringify({ ...payload, data: normalizedData })) > MAX_BACKUP_BYTES) {
    throw new Error("备份文件过大，无法安全恢复");
  }
  const invalidKey = Object.entries(normalizedData).find(
    ([key, item]) => !isValidBackupValue(key, item),
  )?.[0];
  if (invalidKey) {
    throw new Error(`备份中的数据项格式不正确：${invalidKey}`);
  }
  return { ...payload, data: normalizedData } as BackupPayload;
}

export function restoreBackupPayload(payload: BackupPayload): void {
  if (typeof window === "undefined") {
    throw new Error("只能在浏览器中恢复备份");
  }
  const validated = parseBackupPayload(payload);
  flushPendingKeyUsage();
  const previous = new Map(
    STORAGE_KEYS.map((key) => [key, window.localStorage.getItem(key)]),
  );
  try {
    for (const key of STORAGE_KEYS) {
      if (key in validated.data) {
        window.localStorage.setItem(key, JSON.stringify(validated.data[key]));
      } else {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    try {
      for (const key of STORAGE_KEYS) {
        window.localStorage.removeItem(key);
      }
      for (const [key, oldValue] of previous) {
        if (oldValue !== null) window.localStorage.setItem(key, oldValue);
      }
    } catch {
      throw new Error("恢复失败，且未能完整回滚；请立即刷新页面并重新导入备份");
    }
    throw new Error("本机存储空间不足，恢复未生效");
  }
}
