"use client";

import {
  defaultSettings,
  normalizeCustomTheme,
  normalizeDailyGoalValue,
} from "./practice-schema.ts";
import { normalizeSkin } from "./skin.ts";
import { STORAGE, readLocal } from "./storage.ts";
import type { DailyGoal, UserSettings } from "./types";

export function readSettings(): UserSettings {
  const value = readLocal<unknown>(STORAGE.settings, null);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return defaultSettings;
  }
  const partial = value as Partial<UserSettings>;
  return {
    petEnabled: typeof partial.petEnabled === "boolean" ? partial.petEnabled : defaultSettings.petEnabled,
    petSpecies: partial.petSpecies && ["cat", "dog", "rabbit"].includes(partial.petSpecies) ? partial.petSpecies : defaultSettings.petSpecies,
    fontSize:
      typeof partial.fontSize === "number" &&
        partial.fontSize >= 22 &&
        partial.fontSize <= 42
        ? partial.fontSize
        : defaultSettings.fontSize,
    preferredLength:
      partial.preferredLength &&
        ["all", "short", "medium", "long", "water"].includes(
          partial.preferredLength,
        )
        ? partial.preferredLength
        : defaultSettings.preferredLength,
    showCodeHints:
      typeof partial.showCodeHints === "boolean"
        ? partial.showCodeHints
        : defaultSettings.showCodeHints,
    showGhostGap:
      typeof partial.showGhostGap === "boolean"
        ? partial.showGhostGap
        : defaultSettings.showGhostGap,
    sound:
      typeof partial.sound === "boolean"
        ? partial.sound
        : defaultSettings.sound,
    skin: normalizeSkin(partial.skin),
    theme:
      partial.theme &&
        ["light", "dark", "system", "bamboo", "qingdai", "custom"].includes(
          partial.theme,
        )
        ? partial.theme
        : defaultSettings.theme,
    customTheme: normalizeCustomTheme(partial.customTheme),
    autoNext:
      typeof partial.autoNext === "boolean"
        ? partial.autoNext
        : defaultSettings.autoNext,
  };
}

export function readDailyGoal(): DailyGoal {
  return normalizeDailyGoalValue(readLocal<unknown>(STORAGE.dailyGoal, {}));
}
