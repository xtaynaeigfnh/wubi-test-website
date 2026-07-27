import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentPath = new URL("../app/components/WubiApp.tsx", import.meta.url);
const stylesPath = new URL("../app/globals.css", import.meta.url);

test("challenge keeps wrong answers visible until the user advances", async () => {
  const component = await readFile(componentPath, "utf8");

  assert.match(component, /feedback === "wrong"\) advanceQuestion\(\)/);
  assert.match(component, /你的输入/);
  assert.match(component, /正确编码/);
  assert.match(component, /下一题（回车）/);
  assert.match(component, /role="alert"/);
});

test("history filters are visually separate and expose pressed state", async () => {
  const [component, styles] = await Promise.all([
    readFile(componentPath, "utf8"),
    readFile(stylesPath, "utf8"),
  ]);

  assert.match(component, /className="segmented small history-filter"/);
  assert.match(component, /aria-pressed=\{type === value\}/);
  assert.match(styles, /\.history-filter\s*\{[^}]*gap:\s*6px/s);
  assert.match(styles, /\.history-filter button\s*\{[^}]*border:\s*1px solid/s);
});

test("typing omits the filtered article count and resets timing on restart", async () => {
  const component = await readFile(componentPath, "utf8");

  assert.doesNotMatch(component, /篇符合条件/);
  assert.doesNotMatch(component, /本次练习出现过错字，无法提交成绩/);
  assert.match(component, /setStartedAt\(null\);[\s\S]*setElapsed\(0\);/);
});
