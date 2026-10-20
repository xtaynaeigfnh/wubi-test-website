"use client";

// 兼容既有调用方；新增代码直接引用对应职责模块。
export {
  defaultCustomTheme,
  isValidHexColor,
  normalizeCustomTheme,
  defaultSettings,
  defaultDailyGoal,
  normalizeCustomText,
  buildCustomArticle,
  MAX_SPACED_REVIEW_STATE_BYTES,
  utf8ByteLength,
} from "./practice-schema.ts";
export {
  STORAGE,
  STORAGE_KEYS,
  readLocal,
  readLocalArray,
  writeLocal,
  writeSessionValue,
  takeSessionValue,
} from "./storage.ts";
export {
  MAX_CUSTOM_ARTICLES,
  MAX_CUSTOM_TEXT_LENGTH,
} from "./practice-constraints.ts";
export * from "./typing-metrics.ts";
export * from "./content-loader.ts";
export * from "./practice-store.ts";
export * from "./backup.ts";
export * from "./settings-store.ts";
export * from "./article-practice.ts";
export * from "./training-pools.ts";
export * from "./maintenance-store.ts";
export * from "./practice-statistics.ts";
export * from "./format.ts";
