"use client";

import { formatDuration } from "./lib";
import type { SessionResult } from "./types";

export function downloadShareCard(session: SessionResult) {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 675;
  const context = canvas.getContext("2d");
  if (!context) return false;

  context.fillStyle = "#e7edf0";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#09171a";
  context.fillRect(0, 0, canvas.width, 82);
  context.fillStyle = "#ff765c";
  context.fillRect(0, 82, canvas.width, 5);

  context.fillStyle = "#f8faf9";
  context.font = '700 30px "Songti SC", "STSong", serif';
  context.fillText("五笔测试网站", 72, 52);
  context.textAlign = "right";
  context.font = '20px "PingFang SC", sans-serif';
  context.fillStyle = "rgba(248,250,249,.76)";
  context.fillText("WUBI 86 / LOCAL PRACTICE", 1128, 51);
  context.textAlign = "left";

  context.fillStyle = "#53696f";
  context.font = '18px "PingFang SC", sans-serif';
  context.fillText(
    session.type === "article" ? "文章测速成绩" : "专项训练成绩",
    72,
    150,
  );
  context.fillStyle = "#14292e";
  context.font = '700 46px "Songti SC", "STSong", serif';
  context.fillText(session.title.slice(0, 22), 72, 210);

  const metrics = [
    ["速度", session.speed.toString(), session.type === "article" ? "字/分" : "题/分"],
    ["准确率", session.accuracy.toFixed(1), "%"],
    ["正确", session.correctChars.toString(), "字/题"],
    ["用时", formatDuration(session.durationSeconds), ""],
  ];
  metrics.forEach(([label, value, unit], index) => {
    const x = 72 + index * 270;
    context.fillStyle = index === 0 ? "#086b66" : "#14292e";
    context.font = '700 62px "SFMono-Regular", monospace';
    context.fillText(value, x, 358);
    context.font = '16px "PingFang SC", sans-serif';
    context.fillStyle = "#53696f";
    context.fillText(`${label}${unit ? ` · ${unit}` : ""}`, x, 398);
  });

  context.strokeStyle = "#b9c9cd";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(72, 452);
  context.lineTo(1128, 452);
  context.stroke();
  context.fillStyle = "#53696f";
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
