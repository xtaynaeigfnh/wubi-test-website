import test from "node:test";
import assert from "node:assert/strict";
import {
  appendMaintenanceEvent,
  buildStorageUsageReport,
  createLightweightStatisticsSummary,
  isMaintenanceLog,
  MAX_HEATMAPS,
  previewAllCleanup,
  previewCleanup,
  stripSessionLargeObjects,
} from "../app/data-maintenance.ts";

function session(overrides = {}) {
  return {
    id: "session-1",
    type: "article",
    articleId: "article-1",
    title: "测试文章",
    date: "2026-08-31T08:00:00.000Z",
    durationSeconds: 60,
    correctChars: 100,
    attemptedChars: 105,
    speed: 100,
    kps: 2,
    codeLength: 2.5,
    accuracy: 95,
    errors: 5,
    ...overrides,
  };
}

function snapshot(sessions) {
  return {
    sessions,
    phraseOpportunities: [],
    reviewState: { version: 1, items: [] },
    allValues: [sessions, [], { version: 1, items: [] }],
  };
}

test("分项用量同时显示数量、体积、上限和自动淘汰顺序", () => {
  const sessions = Array.from({ length: MAX_HEATMAPS }, (_, index) =>
    session({
      id: `session-${index}`,
      heatmap: {
        version: 1,
        text: "练习正文",
        baselineMs: 100,
        thresholdMs: 200,
        segments: [],
      },
    }),
  );
  const report = buildStorageUsageReport(snapshot(sessions));
  const heatmaps = report.items.find((item) => item.id === "heatmaps");
  assert.equal(heatmaps.count, MAX_HEATMAPS);
  assert.ok(heatmaps.bytes > 0);
  assert.equal(heatmaps.countLimit, MAX_HEATMAPS);
  assert.match(heatmaps.retention, /成绩摘要保留/);
  assert.match(report.warning, /卡顿热力图/);
});

test("清理大对象保留成绩、趋势和周报依赖的汇总字段", () => {
  const original = session({
    heatmap: {
      version: 1,
      text: "不应继续保留的练习正文",
      baselineMs: 100,
      thresholdMs: 200,
      segments: [{ start: 1, length: 2, delayMs: 500 }],
    },
    ghostTimeline: {
      version: 1,
      articleKey: "builtin:article-1",
      articleVersion: 1,
      contentFingerprint: "100-test",
      characterCount: 100,
      step: 5,
      samples: [[100, 60000]],
    },
  });
  const cleaned = stripSessionLargeObjects([original], "heatmaps")[0];
  assert.equal(cleaned.heatmap, undefined);
  assert.deepEqual(
    {
      speed: cleaned.speed,
      accuracy: cleaned.accuracy,
      correctChars: cleaned.correctChars,
      durationSeconds: cleaned.durationSeconds,
      ghostTimeline: cleaned.ghostTimeline,
    },
    {
      speed: original.speed,
      accuracy: original.accuracy,
      correctChars: original.correctChars,
      durationSeconds: original.durationSeconds,
      ghostTimeline: original.ghostTimeline,
    },
  );
});

test("节奏清理只统计可移除数据并处理仅有弱片段的汇总", () => {
  const summaryFields = {
    version: 1,
    characterCount: 20,
    startupMs: 300,
    medianIntervalMs: 200,
    p90IntervalMs: 400,
    fastestTenCpm: 180,
    variationPercent: 12,
    recoveryMs: 500,
    firstHalfMedianMs: 190,
    secondHalfMedianMs: 210,
    sameHandMedianMs: 220,
    crossHandMedianMs: 180,
  };
  const weakSegment = { start: 2, text: "甲乙丙丁戊己庚辛", delayMs: 1200 };
  const sessions = [
    session({
      id: "summary-only",
      rhythmSummary: { ...summaryFields, curve: [], weakSegments: [] },
    }),
    session({
      id: "weak-only",
      rhythmSummary: {
        ...summaryFields,
        curve: [],
        weakSegments: [weakSegment],
      },
    }),
  ];

  const rhythm = buildStorageUsageReport(snapshot(sessions)).items.find(
    (item) => item.id === "rhythm",
  );
  assert.equal(rhythm.count, 1);
  assert.equal(
    rhythm.bytes,
    new TextEncoder().encode(JSON.stringify({
      curve: [],
      weakSegments: [weakSegment],
    })).byteLength,
  );

  const cleaned = stripSessionLargeObjects(sessions, "rhythm");
  assert.equal(cleaned[0], sessions[0]);
  assert.deepEqual(cleaned[1].rhythmSummary, {
    ...summaryFields,
    curve: [],
    weakSegments: [],
  });
});

test("清理预览明确数量、预计体积和后果", () => {
  const preview = previewCleanup("ghosts", snapshot([
    session({ ghostTimeline: { version: 1, samples: [[1, 10]] } }),
  ]));
  assert.equal(preview.count, 1);
  assert.ok(preview.bytes > 0);
  assert.match(preview.consequence, /成绩/);
});

test("全部清理预览合并所有可清理分类并明确保留成绩摘要", () => {
  const data = snapshot([
    session({
      heatmap: {
        version: 1,
        text: "练习正文",
        baselineMs: 100,
        thresholdMs: 200,
        segments: [],
      },
      ghostTimeline: { version: 1, samples: [[1, 10]] },
    }),
  ]);
  data.phraseOpportunities = [{ text: "测试", count: 1 }];
  const preview = previewAllCleanup(data);
  assert.equal(preview.count, 3);
  assert.deepEqual(preview.labels, ["卡顿热力图", "幽灵时间线", "词组机会"]);
  assert.ok(preview.bytes > 0);
  assert.match(preview.consequence, /成绩摘要.*保留/);
});

test("轻量摘要只导出汇总统计而不包含正文和时间线", () => {
  const summary = createLightweightStatisticsSummary(
    [session({
      heatmap: {
        version: 1,
        text: "敏感练习正文",
        baselineMs: 100,
        thresholdMs: 200,
        segments: [],
      },
    })],
    [{ text: "错", count: 1, lastSeen: "2026-08-31T08:00:00.000Z" }],
    [],
    { version: 1, items: [] },
    new Date("2026-09-01T00:00:00.000Z"),
  );
  const exported = JSON.stringify(summary);
  assert.equal(summary.totals.sessions, 1);
  assert.equal(summary.totals.characters, 100);
  assert.doesNotMatch(exported, /敏感练习正文|heatmap|timeline/i);
});

test("维护记录版本化、限量且拒绝异常事件", () => {
  let log = null;
  for (let index = 0; index < 100; index += 1) {
    log = appendMaintenanceEvent(log, {
      id: `event-${index}`,
      date: new Date(2026, 7, 1, 0, index).toISOString(),
      kind: "eviction",
      summary: `淘汰记录 ${index}`,
    });
  }
  assert.equal(log.version, 1);
  assert.equal(log.events.length, 80);
  assert.equal(isMaintenanceLog(log), true);
  assert.equal(isMaintenanceLog({ ...log, events: [{ kind: "unknown" }] }), false);
});
