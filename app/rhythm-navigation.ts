"use client";

import type { useRouter } from "next/navigation";
import { writeSessionValue } from "./lib";
import type { RhythmWeakSegment } from "./types";

const PENDING_RHYTHM_SEGMENT_KEY = "wubi-test:pending-rhythm-segment:v1";

export function openRhythmSegmentPractice(
  router: ReturnType<typeof useRouter>,
  segment: RhythmWeakSegment,
) {
  if (!writeSessionValue(PENDING_RHYTHM_SEGMENT_KEY, JSON.stringify(segment))) {
    window.alert("浏览器不允许临时保存该片段，请关闭隐私限制后再试。");
    return;
  }
  router.push("/advanced");
}
