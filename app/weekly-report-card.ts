import type { AbilityDimension, WeeklyReport } from "./types";

const CARD_WIDTH = 1200;
const CARD_HEIGHT = 1500;
const INK = "#202622";
const MUTED = "#60675f";
const PAPER = "#faf9f5";
const CANVAS = "#eeece6";
const BORDER = "#d2cec4";
const SUBTLE = "#e3dfd6";
const VERMILION = "#9e3328";
const BAMBOO = "#31594d";

function polygonPath(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  radius: number,
  values: number[],
) {
  context.beginPath();
  values.forEach((value, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / values.length;
    const distance = radius * value;
    const x = centerX + Math.cos(angle) * distance;
    const y = centerY + Math.sin(angle) * distance;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.closePath();
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.arcTo(x + width, y, x + width, y + height, safeRadius);
  context.arcTo(x + width, y + height, x, y + height, safeRadius);
  context.arcTo(x, y + height, x, y, safeRadius);
  context.arcTo(x, y, x + width, y, safeRadius);
  context.closePath();
}

function deltaLabel(value: number, suffix = ""): string {
  if (value === 0) return "持平";
  return `${value > 0 ? "+" : ""}${value}${suffix}`;
}

function drawRadar(
  context: CanvasRenderingContext2D,
  abilities: AbilityDimension[],
  centerX: number,
  centerY: number,
  radius: number,
) {
  context.save();
  context.lineWidth = 2;
  for (const ratio of [0.25, 0.5, 0.75, 1]) {
    polygonPath(context, centerX, centerY, radius, abilities.map(() => ratio));
    context.strokeStyle = ratio === 1 ? BORDER : SUBTLE;
    context.stroke();
  }
  abilities.forEach((ability, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / abilities.length;
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;
    context.beginPath();
    context.moveTo(centerX, centerY);
    context.lineTo(x, y);
    context.strokeStyle = SUBTLE;
    context.stroke();

    const labelRadius = radius + 42;
    const labelX = centerX + Math.cos(angle) * labelRadius;
    const labelY = centerY + Math.sin(angle) * labelRadius;
    context.fillStyle = ability.score === null ? MUTED : INK;
    context.font = "600 25px sans-serif";
    context.textAlign = Math.abs(Math.cos(angle)) < 0.2
      ? "center"
      : Math.cos(angle) > 0 ? "left" : "right";
    context.textBaseline = "middle";
    context.fillText(
      `${ability.label} ${ability.score === null ? "—" : ability.score}`,
      labelX,
      labelY,
    );
  });

  if (abilities.every((ability) => ability.score !== null)) {
    polygonPath(
      context,
      centerX,
      centerY,
      radius,
      abilities.map((ability) => (ability.score ?? 0) / 100),
    );
    context.fillStyle = "rgba(49, 89, 77, 0.18)";
    context.fill();
    context.lineWidth = 5;
    context.strokeStyle = BAMBOO;
    context.stroke();
  }

  abilities.forEach((ability, index) => {
    if (ability.score === null) return;
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / abilities.length;
    const distance = radius * ability.score / 100;
    context.beginPath();
    context.arc(
      centerX + Math.cos(angle) * distance,
      centerY + Math.sin(angle) * distance,
      7,
      0,
      Math.PI * 2,
    );
    context.fillStyle = PAPER;
    context.fill();
    context.lineWidth = 4;
    context.strokeStyle = BAMBOO;
    context.stroke();
  });
  context.restore();
}

function drawWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = Number.POSITIVE_INFINITY,
): number {
  const characters = Array.from(text);
  const lines: string[] = [];
  let line = "";
  for (const character of characters) {
    const candidate = line + character;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = character;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  const visibleLines = lines.slice(0, maxLines);
  if (lines.length > maxLines && visibleLines.length) {
    const lastIndex = visibleLines.length - 1;
    let lastLine = visibleLines[lastIndex];
    while (lastLine && context.measureText(`${lastLine}…`).width > maxWidth) {
      lastLine = Array.from(lastLine).slice(0, -1).join("");
    }
    visibleLines[lastIndex] = `${lastLine}…`;
  }
  visibleLines.forEach((visibleLine, index) => {
    context.fillText(visibleLine, x, y + index * lineHeight);
  });
  return y + visibleLines.length * lineHeight;
}

function safeItems(items: string[]): string[] {
  return items.length ? items : ["暂无数据"];
}

export function renderWeeklyReportCard(report: WeeklyReport): HTMLCanvasElement {
  if (typeof document === "undefined") {
    throw new Error("周报图片只能在浏览器中生成。");
  }
  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前浏览器不支持图片导出。");

  context.fillStyle = CANVAS;
  context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  roundedRect(context, 48, 48, CARD_WIDTH - 96, CARD_HEIGHT - 96, 28);
  context.fillStyle = PAPER;
  context.fill();
  context.strokeStyle = BORDER;
  context.lineWidth = 2;
  context.stroke();

  context.fillStyle = VERMILION;
  roundedRect(context, 86, 84, 64, 64, 10);
  context.fill();
  context.fillStyle = "#ffffff";
  context.font = "500 40px serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("周", 118, 118);

  context.textAlign = "left";
  context.fillStyle = INK;
  context.font = "600 52px serif";
  context.fillText("五笔能力周报", 176, 112);
  context.fillStyle = MUTED;
  context.font = "500 24px sans-serif";
  context.fillText(`${report.weekStart} — ${report.weekEnd}`, 178, 150);

  const metricY = 198;
  const metricWidth = 250;
  const metrics: Array<{ label: string; value: string; note: string }> = [
    { label: "练习次数", value: `${report.sessions}`, note: `较上周同期 ${deltaLabel(report.comparison.sessions)}` },
    { label: "完成字数", value: `${report.characters}`, note: `较上周同期 ${deltaLabel(report.comparison.characters, " 字")}` },
    { label: "练习时长", value: `${report.minutes} 分钟`, note: `较上周同期 ${deltaLabel(report.comparison.minutes, " 分钟")}` },
    { label: "活跃 / 最长连续", value: `${report.activeDays} / ${report.streakDays} 天`, note: "本周练习节奏" },
  ];
  metrics.forEach(({ label, value, note }, index) => {
    const x = 86 + index * (metricWidth + 12);
    roundedRect(context, x, metricY, metricWidth, 128, 14);
    context.fillStyle = index === 0 ? "#f3ebe5" : "#f4f2ec";
    context.fill();
    context.fillStyle = MUTED;
    context.font = "500 20px sans-serif";
    context.fillText(label, x + 22, metricY + 32);
    context.fillStyle = INK;
    context.font = "700 34px monospace";
    context.fillText(value, x + 22, metricY + 76);
    context.fillStyle = note.includes("+") ? BAMBOO : note.includes("-") ? VERMILION : MUTED;
    context.font = "500 18px sans-serif";
    context.fillText(note, x + 22, metricY + 108);
  });

  context.fillStyle = INK;
  context.font = "600 30px serif";
  context.fillText("六维能力", 86, 382);
  drawRadar(context, report.abilities, 352, 622, 178);

  report.abilities.forEach((ability, index) => {
    const x = 650;
    const y = 418 + index * 70;
    context.fillStyle = INK;
    context.font = "600 23px sans-serif";
    context.fillText(ability.label, x, y);
    context.fillStyle = MUTED;
    context.font = "500 19px sans-serif";
    context.fillText(ability.rawLabel, x + 92, y);
    const delta = report.comparison.abilities[ability.id];
    context.textAlign = "right";
    context.fillStyle = delta === undefined ? MUTED : delta >= 0 ? BAMBOO : VERMILION;
    context.fillText(delta === undefined ? "无上周基线" : `${deltaLabel(delta)} 分`, 1098, y);
    context.textAlign = "left";
    context.fillStyle = SUBTLE;
    context.fillRect(x, y + 18, 448, 8);
    if (ability.score !== null) {
      context.fillStyle = BAMBOO;
      context.fillRect(x, y + 18, 448 * ability.score / 100, 8);
    }
    context.fillStyle = MUTED;
    context.font = "500 15px sans-serif";
    context.fillText(`归一化：${ability.normalization}`, x, y + 50);
  });

  context.strokeStyle = BORDER;
  context.beginPath();
  context.moveTo(86, 880);
  context.lineTo(1114, 880);
  context.stroke();

  const columns = [
    ["已掌握弱项", safeItems(report.masteredWeaknesses).join("、")],
    ["新增弱项", safeItems(report.newWeaknesses).join("、")],
    ["最需留意", `关联键 ${report.weakestKey ?? "暂无"} · 字根区 ${report.weakestZone ?? "暂无"} · ${report.weakestPhraseType ?? "词组暂无"}`],
  ];
  columns.forEach(([title, value], index) => {
    const x = 86 + index * 350;
    context.fillStyle = index === 1 ? VERMILION : BAMBOO;
    context.font = "600 22px sans-serif";
    context.fillText(title, x, 930);
    context.fillStyle = INK;
    context.font = "500 22px sans-serif";
    drawWrappedText(context, value, x, 970, 310, 35, 3);
  });

  roundedRect(context, 86, 1100, 1028, 262, 18);
  context.fillStyle = "#edf1ed";
  context.fill();
  context.fillStyle = BAMBOO;
  context.font = "600 28px serif";
  context.fillText("下周推荐目标", 118, 1152);
  context.fillStyle = INK;
  context.font = "500 23px sans-serif";
  let recommendationY = 1200;
  safeItems(report.recommendations).slice(0, 3).forEach((item, index) => {
    context.fillStyle = VERMILION;
    context.fillText(`${index + 1}`, 120, recommendationY);
    context.fillStyle = INK;
    recommendationY = drawWrappedText(context, item, 158, recommendationY, 900, 34) + 10;
  });

  context.fillStyle = MUTED;
  context.font = "500 17px sans-serif";
  context.fillText("能力分使用固定区间归一化；缺少的数据不计为 0 分。", 86, 1410);
  context.textAlign = "right";
  context.fillText("五笔训练 · 本地生成", 1114, 1410);
  return canvas;
}

export async function downloadWeeklyReportCard(report: WeeklyReport): Promise<void> {
  const canvas = renderWeeklyReportCard(report);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("图片生成失败，请稍后重试。");
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `五笔周报-${report.weekStart}-${report.weekEnd}.png`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
