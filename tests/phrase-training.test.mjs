import assert from "node:assert/strict";
import test from "node:test";

import { buildPhraseTrainingPool } from "../app/phrase-training.ts";

const entries = [
  ["中国", "kh", 90_000_000],
  ["中国", "khl", 100_000_000],
  ["中国人", "kww", 80_000_000],
  ["人民", "wn", 120_000_000],
  ["人民日报", "wwww", 30_000_000],
  ["练习", "xan", 110_000_000],
  ["输入法", "lty", 60_000_000],
  ["中国人民银行", "khww", 200_000_000],
  ["ABC", "abc", 300_000_000],
];

test("词组专项优先选取明确错过和包含弱项的词组", () => {
  const pool = buildPhraseTrainingPool(entries, {
    missedPhrases: [{
      text: "输入法",
      code: "lty",
      characterCount: 3,
      savedKeys: 2,
      opportunityCount: 2,
      practiceCount: 0,
      correctCount: 0,
      lastSeen: "2026-08-24T08:00:00.000Z",
    }],
    weakItems: [
      {
        text: "中",
        count: 4,
        codingErrors: 4,
        lastSeen: "2026-08-24T08:00:00.000Z",
      },
    ],
    limit: 4,
  });

  assert.equal(pool[0][0], "输入法");
  assert.ok(pool.some(([text]) => text === "中国"));
  assert.ok(pool.some(([text]) => text === "中国人"));
});

test("词组专项一轮去重并选用最短编码", () => {
  const pool = buildPhraseTrainingPool(entries, { limit: 20 });
  const texts = pool.map(([text]) => text);

  assert.equal(new Set(texts).size, texts.length);
  assert.deepEqual(pool.find(([text]) => text === "中国"), ["中国", "kh", 90_000_000]);
  assert.equal(pool.some(([text]) => Array.from(text).length > 4), false);
  assert.equal(pool.some(([text]) => !/^\p{Script=Han}+$/u.test(text)), false);
});

test("词组专项没有历史信号时稳定退化为高频词", () => {
  const first = buildPhraseTrainingPool(entries, { limit: 3 });
  const second = buildPhraseTrainingPool([...entries].reverse(), { limit: 3 });

  assert.deepEqual(first, second);
  assert.equal(first.length, 3);
  assert.equal(first[0][0], "人民");
});

test("结算页推荐可以作为最小向后兼容接口提权", () => {
  const pool = buildPhraseTrainingPool(entries, {
    suggestedEntries: [["输入法", "lty", 60_000_000]],
    limit: 2,
  });

  assert.equal(pool[0][0], "输入法");
});
