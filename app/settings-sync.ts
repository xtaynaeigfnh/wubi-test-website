"use client";

import { defaultCustomTheme } from "./practice-schema.ts";
import { readSettings } from "./settings-store.ts";
import { STORAGE, writeLocal } from "./storage.ts";
import type { UserSettings } from "./types.ts";

// Forms receive a complete settings object. Only the fields changed by this
// interaction belong to the write; other fields may have changed in another tab.
export function mergeSettingsChanges(
  latest: UserSettings,
  previous: UserSettings,
  next: UserSettings,
): UserSettings {
  const merged = { ...latest };
  for (const key of Object.keys(next) as Array<keyof UserSettings>) {
    if (key === "customTheme") continue;
    if (next[key] !== previous[key]) {
      Object.assign(merged, { [key]: next[key] });
    }
  }
  const previousColors = previous.customTheme ?? defaultCustomTheme;
  const nextColors = next.customTheme ?? defaultCustomTheme;
  const colors = { ...(latest.customTheme ?? defaultCustomTheme) };
  for (const key of ["accent", "canvas"] as const) {
    if (previousColors[key] !== nextColors[key]) colors[key] = nextColors[key];
  }
  merged.customTheme = colors;
  return merged;
}

export function saveSettingsChanges(
  previous: UserSettings,
  next: UserSettings,
): UserSettings | null {
  // readSettings deliberately falls back to defaults for rendering. A write
  // must not treat an inaccessible stored value as a successfully read default.
  if (typeof window === "undefined") return null;
  try {
    window.localStorage.getItem(STORAGE.settings);
  } catch {
    return null;
  }
  const merged = mergeSettingsChanges(readSettings(), previous, next);
  return writeLocal(STORAGE.settings, merged) ? merged : null;
}
