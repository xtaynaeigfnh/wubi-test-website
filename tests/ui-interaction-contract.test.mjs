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

test("typing progress fills the five correct Wubi root zones continuously", async () => {
  const [component, styles] = await Promise.all([
    readFile(componentPath, "utf8"),
    readFile(stylesPath, "utf8"),
  ]);

  assert.match(component, /\["QWERT", "撇区"\]/);
  assert.match(component, /\["YUIOP", "捺区"\]/);
  assert.match(component, /\["ASDFG", "横区"\]/);
  assert.match(component, /\["HJKLM", "竖区"\]/);
  assert.match(component, /\["XCVBN", "折区"\]/);
  assert.match(component, /progressRatio \* 5 - index/);
  assert.match(component, /"--segment-progress": `\$\{segmentProgress \* 100\}%`/);
  assert.match(component, /role="progressbar"/);
  assert.doesNotMatch(component, /className="progress-track"/);
  assert.match(styles, /transition:\s*width 120ms linear/);
});

test("typing offers ordered common-character ranges with explicit reshuffling", async () => {
  const [component, styles] = await Promise.all([
    readFile(componentPath, "utf8"),
    readFile(stylesPath, "utf8"),
  ]);

  assert.match(component, />\s*常用字练习\s*</);
  assert.match(component, /选择常用字范围/);
  assert.match(component, /commonCharacterPresets\.map/);
  assert.match(component, />\s*\{commonLoading \? "载入中…" : "乱序"\}\s*</);
  assert.match(component, /isCommonPracticeArticle\(article\)/);
  assert.match(component, /STORAGE\.currentGenerated/);
  assert.match(styles, /\.common-range-grid\s*\{/);
  assert.match(styles, /\.common-range-grid button:last-child\s*\{/);
  assert.match(styles, /\.toolbar-actions \.shuffle-action\s*\{/);
});

test("common-character scores stay out of the 200-article completion progress", async () => {
  const component = await readFile(componentPath, "utf8");

  assert.match(
    component,
    /article\.kind \|\| article\.id\.startsWith\("custom-"\)[\s\S]*\? undefined[\s\S]*: article\.id/,
  );
  assert.match(component, /文章完成度/);
  assert.match(component, /\/ 200/);
});
