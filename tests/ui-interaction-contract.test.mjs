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

test("key sound is shared by typing, challenge, and the settings preview", async () => {
  const component = await readFile(componentPath, "utf8");

  assert.match(component, /function useKeySound\(enabled: boolean\)/);
  assert.match(component, /context\.state === "suspended"/);
  assert.match(component, /context\.resume\(\)\.then\(emit/);
  assert.match(component, /<TypingView[\s\S]*playKeySound=\{playKeySound\}/);
  assert.match(component, /<ChallengeView playKeySound=\{playKeySound\}/);
  assert.match(component, /if \(value\) playKeySound\(\{ force: true \}\)/);
  assert.match(
    component,
    /文章测速和字码挑战输入时播放轻提示音/,
  );
});

test("code hint pairs the current character with a compact toolbar code card", async () => {
  const [component, styles] = await Promise.all([
    readFile(componentPath, "utf8"),
    readFile(stylesPath, "utf8"),
  ]);

  assert.match(component, /className="article-toolbar-actions"/);
  assert.match(component, /className="code-hint-character"/);
  assert.match(component, /当前字 · 编码/);
  assert.match(component, /codeHints\.get\(targetText\[typed\.length\]/);
  assert.match(component, /aria-live="polite"/);
  assert.match(styles, /\.code-hint-card\s*\{[^}]*grid-template-columns:\s*30px/s);
  assert.match(styles, /\.code-hint-character\s*\{[^}]*font:\s*500 19px\/1/s);
  assert.match(styles, /\.code-hint-copy b\s*\{[^}]*font:\s*760 15px\/1\.05/s);
});
