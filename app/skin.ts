import type { SkinId, ThemeId } from "./types";

export const skinLabels: Record<SkinId, string> = {
  letterpress: "曜石工坊",
  focus: "竹韵书斋",
};

export function normalizeSkin(value: unknown): SkinId {
  return value === "focus" ? "focus" : "letterpress";
}

export const skinThemeSwatches: Record<SkinId, Record<Exclude<ThemeId, "custom">, { canvas: string; accent: string }>> = {
  letterpress: {
    system: { canvas: "#F5F4F0", accent: "#165243" },
    light: { canvas: "#F5F4F0", accent: "#165243" },
    dark: { canvas: "#0D0E12", accent: "#5EEAD4" },
    bamboo: { canvas: "#F2ECE1", accent: "#2B5B4C" },
    qingdai: { canvas: "#EBF0F2", accent: "#28586B" },
  },
  focus: {
    system: { canvas: "#F7F6F2", accent: "#D4E8B4" },
    light: { canvas: "#F7F6F2", accent: "#D4E8B4" },
    dark: { canvas: "#111412", accent: "#B8E08D" },
    bamboo: { canvas: "#F2EFE4", accent: "#D6E6A7" },
    qingdai: { canvas: "#EEF3F4", accent: "#B5DCE7" },
  },
};
