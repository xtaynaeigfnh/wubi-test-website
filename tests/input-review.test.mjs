import assert from "node:assert/strict";
import test from "node:test";

import { selectInputReviewOpportunities } from "../app/input-review.ts";

function opportunity(text, start, savedKeys = 3, overrides = {}) {
  return {
    text,
    start,
    length: Array.from(text).length,
    code: "abcd",
    phraseCodeLength: 4,
    singleCharacterKeys: 4 + savedKeys,
    savedKeys,
    ...overrides,
  };
}

test("复盘选择收益最高的五处并按输入位置展示", () => {
  const words = ["中国", "人民", "日期", "星期", "影响", "依赖"];
  const candidates = words.map((word, index) => opportunity(word, index * 2, index + 1));
  const selected = selectInputReviewOpportunities(words.join(""), candidates);
  assert.deepEqual(selected.map(({ text }) => text), words.slice(1));
  assert.equal(selectInputReviewOpportunities(words.join(""), candidates, 20).length, 5);
  assert.deepEqual(selectInputReviewOpportunities(words.join(""), candidates, 2).map(({ text }) => text), words.slice(-2));
});

test("复盘跳过重叠与重复词文并从剩余候选补选", () => {
  const selected = selectInputReviewOpportunities("中国人民中国日期星期影响", [
    opportunity("中国", 0, 5),
    opportunity("中国人民", 0, 6),
    opportunity("人民", 2, 4),
    opportunity("中国", 4, 3),
    opportunity("中国", 0, 5),
    opportunity("日期", 6, 2),
    opportunity("星期", 8, 1),
    opportunity("影响", 10, 1),
  ]);
  assert.deepEqual(selected.map(({ text }) => text), ["中国人民", "中国", "日期", "星期", "影响"]);
});

test("同收益优先较长词组再比较起点和编码长度", () => {
  const selected = selectInputReviewOpportunities("中国人民日期", [
    opportunity("中国", 0, 3),
    opportunity("国人民", 1, 3),
    opportunity("中国人", 0, 3),
    opportunity("日期", 4, 3, { code: "long", phraseCodeLength: 4 }),
    opportunity("日期", 4, 3, { code: "ab", phraseCodeLength: 2 }),
  ]);
  assert.deepEqual(selected.map(({ text, code }) => [text, code]), [["中国人", "abcd"], ["日期", "ab"]]);
});

test("同一词组在多个位置只标记收益最高的一处", () => {
  const selected = selectInputReviewOpportunities("中国日期中国星期", [
    opportunity("中国", 0, 2),
    opportunity("日期", 2, 1),
    opportunity("中国", 4, 5),
    opportunity("星期", 6, 1),
  ]);
  assert.deepEqual(selected.map(({ start }) => start), [2, 4, 6]);
});

test("实际输入错字不标记且继续补选正确候选", () => {
  const selected = selectInputReviewOpportunities("中固日期", [
    opportunity("中国", 0, 10),
    opportunity("日期", 2, 2),
  ]);
  assert.deepEqual(selected.map(({ text }) => text), ["日期"]);
});

test("复盘索引按 Unicode 字符计数且保留标点与换行的位置", () => {
  const selected = selectInputReviewOpportunities("😀，\n𠮷日日期", [
    opportunity("𠮷日", 3),
    opportunity("日期", 5),
    opportunity("日期", 6, 20),
  ]);
  assert.deepEqual(selected.map(({ start, text }) => [start, text]), [[3, "𠮷日"], [5, "日期"]]);
});

test("非法边界和空候选不产生标记", () => {
  const candidates = [
    opportunity("中国", -1),
    opportunity("中国", 0.5),
    opportunity("中国", Number.NaN),
    opportunity("中国", 2),
    opportunity("中国", 0, 3, { length: 0 }),
    opportunity("中国", 0, 3, { length: 2.5 }),
    opportunity("中国", 0, 3, { length: 5 }),
  ];
  assert.deepEqual(selectInputReviewOpportunities("中国", candidates), []);
  assert.deepEqual(selectInputReviewOpportunities("", []), []);
  for (const limit of [0, -1, 0.5, Number.NaN, Infinity]) {
    assert.deepEqual(selectInputReviewOpportunities("中国", [opportunity("中国", 0)], limit), []);
  }
});

test("候选数组与候选内容保持不变", () => {
  const candidates = Object.freeze([
    Object.freeze(opportunity("日期", 2, 1)),
    Object.freeze(opportunity("中国", 0, 3)),
  ]);
  const before = structuredClone(candidates);
  assert.deepEqual(selectInputReviewOpportunities("中国日期", candidates).map(({ text }) => text), ["中国", "日期"]);
  assert.deepEqual(candidates, before);
});
