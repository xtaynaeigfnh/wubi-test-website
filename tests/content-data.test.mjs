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

test("Wubi dictionary contains core words and no invalid codes", async () => {
  const rows = await readJson("wubi86.json");
  assert.ok(rows.length > 100000);
  assert.ok(rows.some(([text, code]) => text === "五笔" && code === "ggtt"));
  assert.ok(rows.some(([text, code]) => text === "测试" && code === "imya"));
  assert.ok(rows.every(([, code]) => /^[a-y]{1,4}$/.test(code)));
});
