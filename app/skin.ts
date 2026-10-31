import type { SkinId, ThemeId } from "./types";

export const skinLabels: Record<SkinId, string> = {
  letterpress: "曜石工坊",
  focus: "竹韵书斋",
  neon: "霓虹夜行",
  roots: "拆字版",
};

export function normalizeSkin(value: unknown): SkinId {
  return value === "focus" || value === "neon" || value === "roots" ? value : "letterpress";
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
  neon: {
    system: { canvas: "#0A0F1E", accent: "#22D3EE" },
    light: { canvas: "#0A0F1E", accent: "#22D3EE" },
    dark: { canvas: "#07060E", accent: "#E879F9" },
    bamboo: { canvas: "#07140F", accent: "#6EE7B8" },
    qingdai: { canvas: "#0A1424", accent: "#93C5FD" },
  },
  roots: {
    system: { canvas: "#EFE8D8", accent: "#F5D90A" },
    light: { canvas: "#EFE8D8", accent: "#F5D90A" },
    dark: { canvas: "#1A1712", accent: "#F5D90A" },
    bamboo: { canvas: "#E7F0E4", accent: "#1F7A4D" },
    qingdai: { canvas: "#E4EBF2", accent: "#1D4E89" },
  },
};
