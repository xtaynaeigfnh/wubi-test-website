"use client";

import { useEffect, useState } from "react";
import { localDateKey } from "../../practice-transactions";

/** 午夜后留出的缓冲，避免定时器略早触发时仍读到前一天。 */
const MIDNIGHT_GRACE_MS = 50;

export function msUntilNextLocalMidnight(now: Date) {
  const nextMidnight = new Date(now);
  nextMidnight.setDate(nextMidnight.getDate() + 1);
  nextMidnight.setHours(0, 0, 0, MIDNIGHT_GRACE_MS);
  return Math.max(1_000, nextMidnight.getTime() - now.getTime());
}

/**
 * 返回本地日期键（如 `2026-10-30`）。服务端与首帧为空字符串，挂载后立即填充，
 * 跨过本地午夜时自动更新；标签页重新可见时也重新校对，弥补后台定时器被节流的误差。
 */
export function useLocalDateKey() {
  const [today, setToday] = useState("");

  useEffect(() => {
    let timer: number | null = null;
    const sync = () => {
      const now = new Date();
      setToday(localDateKey(now));
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(sync, msUntilNextLocalMidnight(now));
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") sync();
    };
    sync();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return today;
}
