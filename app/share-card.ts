"use client";

import type { SessionResult } from "./types";

export function downloadShareCard(session: SessionResult) {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 675;
  const context = canvas.getContext("2d");
  if (!context) return false;

  context.fillStyle = "#eeece6";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#202622";
  context.fillRect(0, 0, canvas.width, 82);
  context.fillStyle = "#aa382c";
  context.fillRect(0, 82, canvas.width, 5);

  context.fillStyle = "#faf9f5";
  context.font = '600 30px "Kaiti SC", "STKaiti", serif';
  context.fillText("五笔测试网站", 72, 52);
  context.textAlign = "right";
  context.font = '20px "PingFang SC", sans-serif';
  context.fillStyle = "rgba(250,249,245,.72)";
  context.fillText("八六版 · 本地练习", 1128, 51);
  context.textAlign = "left";

  context.fillStyle = "#60675f";
  context.font = '18px "PingFang SC", sans-serif';
  context.fillText(
    session.type === "article" ? "文章测速成绩" : "专项训练成绩",
    72,
    150,
  );
  context.fillStyle = "#202622";
  context.font = '600 46px "Kaiti SC", "STKaiti", serif';
  context.fillText(session.title.slice(0, 22), 72, 210);

  const metrics = [
    ["速度", session.speed.toString(), session.type === "article" ? "字/分" : "题/分"],
    ["准确率", session.accuracy.toFixed(1), "%"],
    ["正确", session.correctChars.toString(), "字/题"],
    ["用时", formatCardDuration(session.durationSeconds), ""],
  ];
  metrics.forEach(([label, value, unit], index) => {
    const x = 72 + index * 270;
    context.fillStyle = index === 0 ? "#315f50" : "#202622";
    context.font = '700 62px "SFMono-Regular", monospace';
    context.fillText(value, x, 358);
    context.font = '16px "PingFang SC", sans-serif';
    context.fillStyle = "#60675f";
    context.fillText(`${label}${unit ? ` · ${unit}` : ""}`, x, 398);
  });

  context.strokeStyle = "#d2cec4";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(72, 452);
  context.lineTo(1128, 452);
  context.stroke();
  context.fillStyle = "#60675f";
  context.font = '20px "Songti SC", "STSong", serif';
  context.fillText("慢慢练，手会记住。", 72, 518);
  context.textAlign = "right";
  context.font = '16px "SFMono-Regular", monospace';
  context.fillText(
    new Date(session.date).toLocaleDateString("zh-CN"),
    1128,
    518,
  );
  context.textAlign = "left";

  const link = document.createElement("a");
  link.download = `五笔成绩-${session.date.slice(0, 10)}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
  return true;
}

function formatCardDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
