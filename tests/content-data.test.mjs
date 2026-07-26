import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const readJson = async (name) =>
  JSON.parse(await readFile(new URL(`../public/data/${name}`, import.meta.url), "utf8"));

test("article library has the planned distribution and valid metadata", async () => {
  const index = await readJson("articles-index.json");
  assert.equal(index.length, 200);
  assert.deepEqual(
    Object.fromEntries(
      ["short", "medium", "long", "water"].map((length) => [
        length,
        index.filter((article) => article.length === length).length,
      ]),
    ),
    { short: 80, medium: 70, long: 30, water: 20 },
  );
  assert.equal(new Set(index.map((article) => article.id)).size, 200);
  assert.ok(index.every((article) => article.title && article.topic && article.wordCount > 0));
});

test("article bodies are complete, unique, and inside their length bands", async () => {
  const index = await readJson("articles-index.json");
  const bodies = (
    await Promise.all(
      ["short", "medium", "long", "water"].map((name) => readJson(`articles-${name}.json`)),
    )
  ).flat();
  const bodyMap = new Map(bodies.map((row) => [row.id, row.text]));
  assert.equal(bodyMap.size, 200);
  assert.equal(new Set(bodies.map((row) => row.text)).size, 200);

  const ranges = {
    short: [80, 180],
    medium: [300, 600],
    long: [1000, 1800],
    water: [400, 900],
  };
  for (const article of index) {
    const text = bodyMap.get(article.id);
    assert.ok(text);
    const count = text.replace(/\s/g, "").length;
    assert.equal(count, article.wordCount);
    assert.ok(count >= ranges[article.length][0] && count <= ranges[article.length][1]);
    assert.equal(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text), false);
  }

  const fingerprints = bodies.map(({ id, text }) => {
    const compact = text.replace(/\s/g, "");
    const grams = new Set();
    for (let index = 0; index < compact.length - 7; index += 4) {
      grams.add(compact.slice(index, index + 8));
    }
    return { id, grams };
  });
  for (let left = 0; left < fingerprints.length; left += 1) {
    for (let right = left + 1; right < fingerprints.length; right += 1) {
      let overlap = 0;
      for (const gram of fingerprints[left].grams) {
        if (fingerprints[right].grams.has(gram)) overlap += 1;
      }
      const union =
        fingerprints[left].grams.size + fingerprints[right].grams.size - overlap;
      assert.ok(
        union === 0 || overlap / union < 0.6,
        `${fingerprints[left].id} and ${fingerprints[right].id} are too similar`,
      );
    }
  }
});

test("chat articles advance meaning instead of padding repeated phrases", async () => {
  const articles = await readJson("articles-water.json");
  const knownPadding = [
    "看到这里，看到这里",
    "先先",
    "这场关于",
    "大家平时都是怎么处理的",
    "不能只看表面",
    "第二天再看也不会觉得空洞",
  ];

  for (const { id, text } of articles) {
    for (const phrase of knownPadding) {
      assert.equal(text.includes(phrase), false, `${id} contains template padding: ${phrase}`);
    }

    const sentences = text
      .split(/[。！？]/)
      .map((sentence) => sentence.replace(/\s/g, ""))
      .filter((sentence) => sentence.length >= 8);
    assert.equal(
      new Set(sentences).size,
      sentences.length,
      `${id} contains a repeated sentence`,
    );
    assert.ok(
      text.split(/\n\s*\n/).length >= 3,
      `${id} should have a clear multi-paragraph progression`,
    );
  }
});

test("all articles reject recycled generator phrases and internal repetition", async () => {
  const groups = ["short", "medium", "long", "water"];
  const articles = (
    await Promise.all(groups.map((name) => readJson(`articles-${name}.json`)))
  ).flat();
  const retiredTemplates = [
    "许多人首先想到的是结果，但真正值得留意的是过程",
    "这个不显眼的片段使",
    "有人愿意多观察一步，于是",
    "合适的做法不是急着下结论，而是先确认事实",
    "可以看到习惯如何形成：先从小处开始，再依据反馈调整",
  ];

  for (const { id, text } of articles) {
    for (const phrase of retiredTemplates) {
      assert.equal(text.includes(phrase), false, `${id} contains retired template: ${phrase}`);
    }

    const sentences = text
      .split(/[。！？]/)
      .map((sentence) => sentence.replace(/\s/g, ""))
      .filter((sentence) => sentence.length >= 8);
    assert.equal(
      new Set(sentences).size,
      sentences.length,
      `${id} contains a repeated sentence`,
    );

    const compact = text.replace(/\s/g, "");
    const phraseCounts = new Map();
    for (let index = 0; index <= compact.length - 12; index += 1) {
      const phrase = compact.slice(index, index + 12);
      if (/[，。！？；：“”]/.test(phrase)) continue;
      phraseCounts.set(phrase, (phraseCounts.get(phrase) ?? 0) + 1);
    }
    const repeatedPhrase = [...phraseCounts].find(([, count]) => count >= 3);
    assert.equal(
      repeatedPhrase,
      undefined,
      `${id} repeats phrase ${repeatedPhrase?.[0]}`,
    );
  }
});

test("Wubi dictionary contains core words and no invalid codes", async () => {
  const rows = await readJson("wubi86.json");
  assert.ok(rows.length > 100000);
  assert.ok(rows.some(([text, code]) => text === "五笔" && code === "ggtt"));
  assert.ok(rows.some(([text, code]) => text === "测试" && code === "imya"));
  assert.ok(rows.every(([, code]) => /^[a-y]{1,4}$/.test(code)));
});
