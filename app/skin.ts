import type { SkinId, ThemeId } from "./types";

export const skinLabels: Record<SkinId, string> = {
  letterpress: "铅字蓝图",
  focus: "墨白专注",
};

export function normalizeSkin(value: unknown): SkinId {
  return value === "focus" ? "focus" : "letterpress";
}

export const skinThemeSwatches: Record<SkinId, Record<Exclude<ThemeId, "custom">, { canvas: string; accent: string }>> = {
  letterpress: {
    system: { canvas: "#E7EDF0", accent: "#086B66" },
    light: { canvas: "#E7EDF0", accent: "#086B66" },
    dark: { canvas: "#09171A", accent: "#71D0C7" },
    bamboo: { canvas: "#F2EBDD", accent: "#326455" },
    qingdai: { canvas: "#DCE5E8", accent: "#3F6F70" },
  },
  focus: {
    system: { canvas: "#F6F7F3", accent: "#C6ED78" },
    light: { canvas: "#F6F7F3", accent: "#C6ED78" },
    dark: { canvas: "#141A16", accent: "#C6ED78" },
    bamboo: { canvas: "#F2EFE4", accent: "#D6E6A7" },
    qingdai: { canvas: "#EEF3F4", accent: "#B5DCE7" },
  },
};
