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

test("typing progress keeps the five correct Wubi root zones", async () => {
  const component = await readFile(componentPath, "utf8");

  assert.match(component, /\["QWERT", "撇区"\]/);
  assert.match(component, /\["YUIOP", "捺区"\]/);
  assert.match(component, /\["ASDFG", "横区"\]/);
  assert.match(component, /\["HJKLM", "竖区"\]/);
  assert.match(component, /\["XCVBN", "折区"\]/);
  assert.match(component, /Math\.floor\(progressRatio \* 5\)/);
});
