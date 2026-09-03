import type { ThemeId } from "./types";

export const themeLabels: Record<ThemeId, string> = {
  system: "系统",
  light: "浅色",
  dark: "深色",
  bamboo: "竹纸",
  qingdai: "青黛",
  custom: "自定义",
};

function hexToRgb(hex: string): [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

function rgbToHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue]
    .map((channel) => Math.round(channel).toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();
}

export function mixHex(from: string, to: string, amount: number): string {
  const start = hexToRgb(from);
  const end = hexToRgb(to);
  return rgbToHex(
    start[0] + (end[0] - start[0]) * amount,
    start[1] + (end[1] - start[1]) * amount,
    start[2] + (end[2] - start[2]) * amount,
  );
}

function getRelativeLuminance(hex: string): number {
  const channels = hexToRgb(hex).map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

export function getContrastRatio(first: string, second: string): number {
  const lighter = Math.max(
    getRelativeLuminance(first),
    getRelativeLuminance(second),
  );
  const darker = Math.min(
    getRelativeLuminance(first),
    getRelativeLuminance(second),
  );
  return (lighter + 0.05) / (darker + 0.05);
}

export function chooseContrastText(
  background: string,
): "#000000" | "#FFFFFF" {
  return getContrastRatio(background, "#000000") >=
    getContrastRatio(background, "#FFFFFF")
    ? "#000000"
    : "#FFFFFF";
}

function buildSecondaryText(canvas: string, text: string): string {
  let low = 0;
  let high = 1;
  for (let index = 0; index < 12; index += 1) {
    const middle = (low + high) / 2;
    if (getContrastRatio(canvas, mixHex(canvas, text, middle)) >= 4.5) {
      high = middle;
    } else {
      low = middle;
    }
  }
  return mixHex(canvas, text, Math.min(1, high + 0.04));
}

export function buildCustomThemeVariables(accent: string, canvas: string) {
  const text = chooseContrastText(canvas);
  const darkCanvas = getRelativeLuminance(canvas) < 0.3;
  const surfaceTarget = text === "#FFFFFF" ? "#000000" : "#FFFFFF";
  const paper = mixHex(canvas, surfaceTarget, darkCanvas ? 0.06 : 0.58);
  const raised = mixHex(canvas, surfaceTarget, darkCanvas ? 0.1 : 0.055);
  const key = mixHex(canvas, surfaceTarget, darkCanvas ? 0.16 : 0.1);
  return {
    "--custom-accent": accent,
    "--custom-canvas": canvas,
    "--custom-text": text,
    "--custom-text-secondary": buildSecondaryText(canvas, text),
    "--custom-paper": paper,
    "--custom-raised": raised,
    "--custom-key": key,
    "--custom-border": mixHex(canvas, text, darkCanvas ? 0.25 : 0.2),
    "--custom-border-strong": mixHex(canvas, text, darkCanvas ? 0.42 : 0.34),
    "--custom-accent-text": chooseContrastText(accent),
    "--custom-color-scheme": darkCanvas ? "dark" : "light",
  } as const;
}
