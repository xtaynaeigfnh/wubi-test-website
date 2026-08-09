import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentPath = new URL("../app/components/WubiApp.tsx", import.meta.url);
const musicPath = new URL("../app/components/MusicPlayer.tsx", import.meta.url);
const layoutPath = new URL("../app/layout.tsx", import.meta.url);
const stylesPath = new URL("../app/globals.css", import.meta.url);
const keySummaryPath = new URL("../app/components/KeySummary.tsx", import.meta.url);

test("challenge keeps wrong answers visible until the user advances", async () => {
  const [component, styles] = await Promise.all([
    readFile(componentPath, "utf8"),
    readFile(stylesPath, "utf8"),
  ]);

  assert.match(component, /feedback === "wrong"\) advanceQuestion\(\)/);
  assert.doesNotMatch(component, /className="giant-code"/);
  assert.doesNotMatch(styles, /\.giant-code\s*\{/);
  assert.match(styles, /\.challenge-start::before\s*\{[^}]*content:\s*"86"/s);
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
  assert.match(styles, /\.segmented\.small\.history-filter\s*\{[^}]*gap:\s*6px/s);
  assert.match(
    styles,
    /\.segmented\.small\.history-filter\s*\{[^}]*grid-template-columns:\s*repeat\(4,/s,
  );
  assert.match(styles, /\.history-filter button\s*\{[^}]*border:\s*1px solid/s);
  assert.match(component, />\s*清除成绩与错题\s*</);
  assert.match(component, /className="session-practice"/);
  assert.match(component, /className="session-speed"/);
  assert.match(component, /className="session-code-length"/);
  assert.match(component, /className="session-accuracy"/);
  assert.match(component, /className="session-share"/);
  assert.match(component, />\s*操作\s*</);
  assert.match(component, />\s*速度\s*<\/span>\s*<span>码长<\/span>\s*<span>准确率\s*</);
  assert.match(component, /session\.codeLength\.toFixed\(2\)/);
  assert.match(component, /<small>键\/字<\/small>/);
  assert.match(
    styles,
    /\.session-speed,\s*\.session-code-length,\s*\.session-accuracy\s*\{[^}]*white-space:\s*nowrap/s,
  );
  assert.match(
    styles,
    /\.session-speed small,\s*\.session-code-length small,\s*\.session-accuracy small\s*\{[^}]*display:\s*inline/s,
  );
  assert.match(styles, /\.session-share\s*\{[^}]*justify-self:\s*end/s);
  assert.match(
    styles,
    /@media \(max-width: 900px\)[\s\S]*grid-template-areas:\s*"practice practice practice action"\s*"speed code-length accuracy duration"/s,
  );
  assert.match(
    styles,
    /@media \(max-width: 620px\)[\s\S]*grid-template-areas:\s*"practice action"\s*"speed code-length"\s*"accuracy duration"/s,
  );
});

test("typing exposes every filtered article and resets timing on restart", async () => {
  const [component, styles] = await Promise.all([
    readFile(componentPath, "utf8"),
    readFile(stylesPath, "utf8"),
  ]);

  assert.match(component, /共 \{filtered\.length\} 篇符合当前筛选条件/);
  assert.doesNotMatch(component, /filtered\.slice\(0, 60\)/);
  assert.doesNotMatch(component, /本次练习出现过错字，无法提交成绩/);
  assert.match(component, /setStartedAt\(null\);[\s\S]*setElapsed\(0\);/);
  assert.match(component, /autoComplete="off"/);
  assert.match(component, /autoCorrect="off"/);
  assert.match(component, /autoCapitalize="none"/);
  assert.match(component, /isWubiLetterKey\(event\.key, event\.code\)/);
  assert.match(component, /<CodeLengthMetric/);
  assert.doesNotMatch(component, /<Metric\s+label="理论最小码长"/);
  assert.match(component, /theoreticalValue=\{theoreticalCodeLength\}/);
  assert.match(component, /theoreticalValue\.toFixed\(2\)/);
  assert.match(component, />理论下限<\/span>/);
  assert.match(component, /error\s*\?\s*"暂不可用"/);
  assert.match(component, /theoreticalValue === null[\s\S]*\? "—"/);
  assert.match(
    styles,
    /\.metric-strip\s*\{[^}]*grid-template-columns:\s*minmax\(168px, 1\.35fr\) repeat\(5,/s,
  );
  assert.match(
    styles,
    /@media \(max-width: 1120px\)[\s\S]*\.metric-strip\s*\{[^}]*grid-template-columns:\s*repeat\(3, 1fr\)/s,
  );
  assert.match(
    styles,
    /@media \(max-width: 780px\)[\s\S]*\.metric-strip\s*\{[^}]*grid-template-columns:\s*repeat\(2, 1fr\)/s,
  );
  assert.match(
    component,
    /className="completion-value"><strong>\{speed\}<\/strong><i>字\/分<\/i>/,
  );
  assert.match(
    styles,
    /\.completion-value\s*\{[^}]*display:\s*inline-flex;[^}]*white-space:\s*nowrap;/s,
  );
  assert.match(
    component,
    /articlesLoading\s*\|\|\s*\(!article && \(!settingsReady \|\| availableArticles\.length > 0\)\)/,
  );
});

test("mobile navigation scrolls the active route into view", async () => {
  const component = await readFile(componentPath, "utf8");

  assert.match(component, /const mainNavRef = useRef<HTMLElement>\(null\)/);
  assert.match(component, /<nav ref=\{mainNavRef\}/);
  assert.match(component, /querySelector<HTMLElement>\(\s*'\[aria-current="page"\]'/s);
  assert.match(component, /navigation\.scrollWidth <= navigation\.clientWidth/);
  assert.match(component, /navigation\.scrollLeft = Math\.max\(/);
  assert.match(component, /activeItem\.offsetLeft/);
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

test("typing surfaces record physical keys and the summary exposes the reference analyses", async () => {
  const [component, training, summary, styles] = await Promise.all([
    readFile(componentPath, "utf8"),
    readFile(new URL("../app/components/TrainingCenter.tsx", import.meta.url), "utf8"),
    readFile(keySummaryPath, "utf8"),
    readFile(stylesPath, "utf8"),
  ]);

  assert.match(component, /recordKeyUsage\(event\.code\)/);
  assert.match(training, /recordKeyUsage\(event\.code\)/);
  assert.match(component, /href="\/summary">查看按键画像/);
  assert.match(summary, /href="\/history">返回本地成绩/);
  assert.match(summary, /按键使用画像/);
  assert.match(summary, /键盘热力图/);
  assert.match(summary, /左右手均衡/);
  assert.match(summary, /键盘行使用率/);
  assert.match(summary, /五笔五区使用率/);
  assert.match(summary, /手指使用率/);
  assert.match(summary, /aria-label="练习按键次数热力图"/);
  assert.match(summary, /className="keyboard-scroll-region" tabIndex=\{0\}/);
  assert.match(summary, /className="key-analysis-grid" aria-label="按键分布分析"/);
  assert.match(summary, /id="finger-usage-title"[\s\S]*wide/);
  assert.match(styles, /\.keyboard-heatmap\s*\{/);
  assert.match(styles, /\.key-analysis-grid\s*\{/);
  assert.match(
    styles,
    /\.key-summary-actions \.button\s*\{[^}]*display:\s*inline-flex;[^}]*align-items:\s*center;[^}]*justify-content:\s*center;/s,
  );
  assert.match(styles, /\.key-analysis-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,/s);
  assert.match(styles, /\.usage-card-wide \.usage-bars\s*\{[^}]*grid-template-columns:\s*repeat\(2,/s);
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*\.key-summary-metrics/s);
});

test("code hint pairs the current character with a compact toolbar code card", async () => {
  const [component, styles] = await Promise.all([
    readFile(componentPath, "utf8"),
    readFile(stylesPath, "utf8"),
  ]);

  assert.match(component, /className="article-toolbar-actions"/);
  assert.match(component, /className="article-restart"/);
  assert.doesNotMatch(component, /<strong>\{progressPercent\}%<\/strong>/);
  assert.match(component, /className="code-hint-character"/);
  assert.match(component, /当前字 · 编码/);
  assert.match(component, /targetCharacters\[typedCharacters\.length\]/);
  assert.match(component, /aria-live="polite"/);
  assert.match(styles, /\.code-hint-card\s*\{[^}]*grid-template-columns:\s*30px/s);
  assert.match(styles, /\.code-hint-character\s*\{[^}]*font:\s*500 19px\/1/s);
  assert.match(styles, /\.code-hint-copy b\s*\{[^}]*font:\s*760 15px\/1\.05/s);
  assert.match(styles, /\.article-toolbar-actions\s*\{[^}]*gap:\s*28px/s);
  assert.match(
    styles,
    /\.article-restart \.toolbar-actions\s*\{[^}]*gap:\s*12px/s,
  );
  assert.match(
    styles,
    /@media \(max-width: 420px\)[\s\S]*\.article-restart \.toolbar-actions\s*\{[^}]*grid-template-columns:\s*repeat\(2,/s,
  );
  assert.match(component, /role="group"\s+aria-label="当前练习操作"/);
});

test("lookup keyboard visual includes all 25 Wubi root keys", async () => {
  const component = await readFile(componentPath, "utf8");

  assert.match(component, /QWERTYUIOPASDFGHJKLXCVBNM/);
  assert.doesNotMatch(component, /QWERTYUIOPASDFGHJKLZXCVBNM/);
});

test("typing offers ordered common-character ranges with explicit reshuffling", async () => {
  const [component, styles] = await Promise.all([
    readFile(componentPath, "utf8"),
    readFile(stylesPath, "utf8"),
  ]);

  assert.match(component, />\s*常用字练习\s*</);
  assert.match(component, /选择常用字范围/);
  assert.match(component, /commonCharacterPresets\.map/);
  assert.match(component, /分成 10 组，每组 50 字/);
  assert.match(component, /className="theme-switch"/);
  assert.match(component, /点击切换为/);
  assert.match(component, />\s*\{commonLoading \? "载入中…" : "乱序"\}\s*</);
  assert.match(component, /isCommonPracticeArticle\(article\)/);
  assert.match(component, /STORAGE\.currentGenerated/);
  assert.match(styles, /\.common-range-grid\s*\{/);
  assert.match(styles, /\.common-range-grid button:last-child\s*\{/);
  assert.match(styles, /\.toolbar-actions \.shuffle-action\s*\{/);
});

test("common-character practice inherits the article reading rhythm", async () => {
  const styles = await readFile(stylesPath, "utf8");
  const commonTextRule =
    styles.match(/\.article-text\.common-character-text\s*\{([^}]*)\}/)?.[1] ??
    "";

  assert.match(commonTextRule, /white-space:\s*normal/);
  assert.doesNotMatch(commonTextRule, /line-height|letter-spacing|padding/);
  assert.doesNotMatch(styles, /\.common-character-text > \.common-decade-end/);
  assert.doesNotMatch(styles, /\.common-character-text > \.common-section-end/);
  assert.doesNotMatch(styles, /\.common-character-text > span:not/);
});

test("common-character scores stay out of built-in article completion progress", async () => {
  const component = await readFile(componentPath, "utf8");

  assert.match(
    component,
    /article\.kind === "custom" \|\|[\s\S]*article\.kind === "common" \|\|[\s\S]*article\.id\.startsWith\("custom-"\)[\s\S]*\? undefined[\s\S]*: article\.id/,
  );
  assert.match(component, /文章完成度/);
  assert.match(component, /loadArticleMetadata\(\)/);
  assert.match(component, /completedArticleCount \/ articleTotal/);
});

test("one root-level audio player exposes accessible manual controls", async () => {
  const [music, layout, styles] = await Promise.all([
    readFile(musicPath, "utf8"),
    readFile(layoutPath, "utf8"),
    readFile(stylesPath, "utf8"),
  ]);

  assert.match(layout, /<PwaProvider>[\s\S]*<MusicProvider>\{children\}<\/MusicProvider>/);
  assert.equal((music.match(/<audio/g) ?? []).length, 1);
  assert.match(music, /preload="metadata"/);
  assert.doesNotMatch(music, /\bautoPlay\b|\bautoplay\b/);
  assert.match(music, /aria-label="上一首"/);
  assert.match(music, /aria-label="下一首"/);
  assert.match(music, /aria-label="播放进度"/);
  assert.match(music, /aria-label="背景音乐音量"/);
  assert.match(music, /aria-label=\{muted \? "取消背景音乐静音" : "静音背景音乐"\}/);
  assert.doesNotMatch(music, /if \(muted\) setMuted\(false\)/);
  assert.match(music, /aria-expanded=\{expanded\}/);
  assert.match(music, /MUSIC_DOCK_COLLAPSE_DELAY = 5500/);
  assert.match(music, /aria-label="展开专注电台控制栏"/);
  assert.match(music, /aria-label="收起专注电台控制栏"/);
  assert.match(styles, /\.music-dock\s*\{/);
  assert.match(styles, /\.music-dock\.is-collapsed\s*\{/);
  assert.match(styles, /\.music-dock-peek\s*\{/);
  assert.match(music, /className="music-peek-icon"/);
  assert.match(
    styles,
    /\.music-dock-peek\s*\{[^}]*width:\s*56px[^}]*height:\s*56px[^}]*border-radius:\s*50%/s,
  );
  assert.match(styles, /\.music-library-toggle\s*\{/);
  assert.match(styles, /@keyframes music-brush-line/);
  assert.match(styles, /@keyframes music-ink-reveal/);
  assert.match(styles, /@keyframes music-seal-breathe/);
  assert.match(styles, /\.music-ruler\s*\{/);
  assert.match(
    styles,
    /@media \(max-width: 780px\)[\s\S]*\.music-mobile-controls/s,
  );
});
