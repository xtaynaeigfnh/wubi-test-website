import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentPath = new URL("../app/components/WubiApp.tsx", import.meta.url);
const musicPath = new URL("../app/components/MusicPlayer.tsx", import.meta.url);
const layoutPath = new URL("../app/layout.tsx", import.meta.url);
const stylesPath = new URL("../app/globals.css", import.meta.url);
const keySummaryPath = new URL("../app/components/KeySummary.tsx", import.meta.url);
const hesitationHeatmapPath = new URL("../app/components/HesitationHeatmap.tsx", import.meta.url);
const hesitationPracticePath = new URL("../app/components/HesitationPracticeModal.tsx", import.meta.url);
const trainingCenterPath = new URL("../app/components/TrainingCenter.tsx", import.meta.url);
const trendPanelPath = new URL("../app/components/TrendPanel.tsx", import.meta.url);

test("recorded data renders without replay animations", async () => {
  const [component, trendPanel, styles] = await Promise.all([
    readFile(componentPath, "utf8"),
    readFile(trendPanelPath, "utf8"),
    readFile(stylesPath, "utf8"),
  ]);

  assert.doesNotMatch(component, /className="metric-value"/);
  assert.doesNotMatch(trendPanel, /pathLength=|<svg\s+key=\{range\}/);
  assert.doesNotMatch(
    styles,
    /metric-tick|goal-ring-fill|usage-bar-fill|chart-line-draw/,
  );
});

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
  const clearResults = component.match(
    /const clearResults = \(\) => \{[\s\S]*?\n  \};/,
  )?.[0];
  assert.ok(clearResults);
  assert.doesNotMatch(clearResults, /clearKeyUsage/);
  assert.match(component, /className="session-practice"/);
  assert.match(component, /className="session-speed"/);
  assert.match(component, /className="session-kps"/);
  assert.match(component, /className="session-code-length"/);
  assert.match(component, /className="session-accuracy"/);
  assert.match(component, /className="session-diagnostics"/);
  assert.match(component, /className="session-share"/);
  assert.match(component, />\s*操作\s*</);
  assert.match(component, />\s*速度\s*<\/span>\s*<span>击键<\/span>\s*<span>码长<\/span>\s*<span>字准\s*</);
  assert.match(component, /session\.codeLength\.toFixed\(2\)/);
  assert.match(component, /<small>键\/字<\/small>/);
  assert.match(
    styles,
    /\.session-speed,\s*\.session-kps,\s*\.session-code-length,\s*\.session-accuracy\s*\{[^}]*white-space:\s*nowrap/s,
  );
  assert.match(
    styles,
    /\.session-speed small,\s*\.session-kps small,\s*\.session-code-length small,\s*\.session-accuracy small\s*\{[^}]*display:\s*inline/s,
  );
  assert.match(styles, /\.session-share\s*\{[^}]*justify-self:\s*end/s);
  assert.match(
    styles,
    /@media \(max-width: 900px\)[\s\S]*grid-template-areas:\s*"practice practice practice practice action"\s*"speed kps code-length accuracy duration"\s*"diagnostics diagnostics diagnostics diagnostics diagnostics"/s,
  );
  assert.match(
    styles,
    /@media \(max-width: 620px\)[\s\S]*grid-template-areas:\s*"practice action"\s*"speed kps"\s*"code-length accuracy"\s*"duration duration"\s*"diagnostics diagnostics"/s,
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
  assert.match(component, /className="typing-diagnostics"/);
  assert.match(component, /label="键准"/);
  assert.match(component, /label="打词"/);
  assert.match(component, /label="左右手"/);
  assert.match(component, /aria-pressed=\{pausedAt !== null\}/);
  assert.match(component, /chooseArticle\(article, true, retryCount \+ 1\)/);
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
    styles,
    /@media \(max-width: 780px\)[\s\S]*\.typing-diagnostics\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s,
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

test("personal ghost races expose selection, live distance, replay, and responsive review", async () => {
  const [component, styles, ghostLogic] = await Promise.all([
    readFile(new URL("../app/components/WubiApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/ghost-race.ts", import.meta.url), "utf8"),
  ]);
  assert.match(component, /name="ghost-mode"/);
  assert.match(component, /个人最佳/);
  assert.match(component, /最近一次/);
  assert.match(component, /disabled=\{!ghostSessions\.best\}/);
  assert.match(component, /aria-pressed=\{showGhostGap\}/);
  assert.match(component, /className="ghost-progress-marker"/);
  assert.match(component, /幽灵赛复盘/);
  assert.match(component, /再次挑战个人最佳/);
  assert.match(component, /\[selectedGhostTimeline, startedAt\]/);
  assert.match(component, /settings\.autoNext && activeGhostMode !== "off"/);
  assert.match(component, /showGhostGap \? `，\$\{ghostGapLabel\}` : ""/);
  assert.match(component, /onShowGhostGapChange\(next\)/);
  assert.match(component, /split\(\/\[\\r\\n\]\+\//);
  assert.match(component, /paragraphBoundaries/);
  assert.doesNotMatch(component, /ghostGapLabel\}[\s\S]{0,80}aria-live=/);
  assert.match(component, /document\.addEventListener\("visibilitychange"/);
  assert.match(component, /inactiveDurationMsRef/);
  assert.match(component, /completionElapsedRef\.current/);
  assert.match(ghostLogic, /MAX_GHOST_TIMELINES = 90/);
  assert.match(ghostLogic, /articleVersion === identity\.articleVersion/);
  assert.match(styles, /\.ghost-progress-marker\s*\{/);
  assert.match(styles, /\.ghost-review\s*\{/);
  assert.match(
    styles,
    /@media \(max-width: 780px\)[\s\S]*\.ghost-review ol\s*\{[^}]*grid-template-columns:\s*repeat\(2,/s,
  );
  assert.match(
    styles,
    /@media \(max-width: 780px\)[\s\S]*\.practice-actions\s*\{[^}]*grid-template-columns:\s*repeat\(2,/s,
  );
  assert.match(
    styles,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*transition-duration:\s*0\.01ms !important/s,
  );
});

test("typing completion and history expose an accessible hesitation heatmap", async () => {
  const [component, heatmap, practice, training, styles] = await Promise.all([
    readFile(componentPath, "utf8"),
    readFile(hesitationHeatmapPath, "utf8"),
    readFile(hesitationPracticePath, "utf8"),
    readFile(trainingCenterPath, "utf8"),
    readFile(stylesPath, "utf8"),
  ]);

  assert.match(component, /buildTypingHeatmap\(visibleText, typingDelaysRef\.current\)/);
  assert.match(
    component,
    /<\/article>[\s\S]*\{completed && lastSession\?\.heatmap && \([\s\S]*className="post-practice-review"[\s\S]*<HesitationHeatmap[\s\S]*heatmap=\{lastSession\.heatmap\}[\s\S]*source=\{lastSession\}[\s\S]*<aside className="side-panel">/,
  );
  assert.match(component, /className="session-heatmap-trigger"/);
  assert.equal(component.match(/<HesitationHeatmap\b/g)?.length, 2);
  assert.match(
    component,
    /<HesitationHeatmap[\s\S]*heatmap=\{session\.heatmap\}[\s\S]*compact[\s\S]*source=\{session\}/,
  );
  assert.match(component, /aria-expanded=\{expandedHeatmapId === session\.id\}/);
  assert.match(component, /aria-controls=\{`session-heatmap-\$\{session\.id\}`\}/);
  assert.match(heatmap, /卡顿位置热力图/);
  assert.match(heatmap, /aria-label="热力等级图例"/);
  assert.match(heatmap, /最明显的五处卡顿/);
  assert.match(heatmap, /这轮节奏很稳/);
  assert.match(heatmap, /className=\{`heatmap-segment-button/);
  assert.match(heatmap, /加入今日加练/);
  assert.match(practice, /第 \{currentRound\} \/ 3 轮/);
  assert.match(practice, /shouldDeferInputCommit/);
  assert.match(practice, /onPaste=\{\(event\) =>/);
  assert.match(practice, /重试保存/);
  assert.match(training, /className="hesitation-queue-card"/);
  assert.match(training, /加练独立于上方三项处方/);
  assert.match(styles, /--heat-mild:/);
  assert.match(
    styles,
    /\.post-practice-review\s*\{[^}]*grid-column:\s*1;[^}]*grid-row:\s*2;[^}]*border-top:\s*3px solid var\(--accent-vermilion\)/s,
  );
  assert.match(
    styles,
    /\.workspace-grid > \.side-panel\s*\{[^}]*grid-column:\s*2;[^}]*grid-row:\s*1;/s,
  );
  assert.match(
    styles,
    /@media \(max-width: 900px\)[\s\S]*\.post-practice-review,[\s\S]*\.workspace-grid > \.side-panel\s*\{[^}]*grid-column:\s*1;[^}]*grid-row:\s*auto;/s,
  );
  assert.match(styles, /\.heatmap-passage\s*\{[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(styles, /@media \(max-width: 620px\)[\s\S]*\.hesitation-ranking\s*\{[^}]*grid-template-columns:\s*1fr/s);
});

test("planned articles, custom text counts, and local writes keep UI state consistent", async () => {
  const [component, training, management] = await Promise.all([
    readFile(componentPath, "utf8"),
    readFile(new URL("../app/components/TrainingCenter.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/DataManagement.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(component, /trainingPlan\?\.date === localDateKey\(new Date\(\)\)/);
  assert.match(component, /const currentId = trainingArticleId \?\? storedCurrentId/);
  assert.match(component, /Boolean\(trainingArticleId\)/);
  assert.match(component, /Array\.from\(customText\.trim\(\)\)\.length/);
  assert.match(component, /if \(!writeLocal\(STORAGE\.customTexts, nextCustomTexts\)\)/);
  assert.match(training, /Math\.round\(value \|\| minimum\)/);
  assert.match(management, /if \(!writeLocal\(STORAGE\.customTexts, limited\)\)/);
  assert.match(management, /if \(!saved\) return;/);
});

test("code length coach exposes recommendations and phrase practice on desktop and narrow screens", async () => {
  const [component, training, styles] = await Promise.all([
    readFile(componentPath, "utf8"),
    readFile(new URL("../app/components/TrainingCenter.tsx", import.meta.url), "utf8"),
    readFile(stylesPath, "utf8"),
  ]);

  assert.match(component, /analyzeCodeLengthCoach\(targetText/);
  assert.match(component, /<h3 id="code-coach-title">码长诊断<\/h3>/);
  assert.match(component, /label="单字输入基准"/);
  assert.match(component, /值得留意的推荐机会/);
  assert.match(component, /无法可靠识别你本次实际采用的分段/);
  assert.match(component, />\s*练习这些词组\s*<\/button>/);
  assert.match(component, /router\.push\("\/training\?tab=phrase"\)/);
  assert.match(component, /sessionSaveFailed[\s\S]*"本次成绩尚未保存"/);
  assert.match(component, />\s*重试保存\s*<\/button>/);
  assert.match(training, /\["phrase", "词组专项"\]/);
  assert.match(training, /getPhraseOpportunities\(\)/);
  assert.match(training, /trackPhrasePractice/);
  assert.match(training, /phrasePracticeAnswers\.current\.push/);
  assert.match(training, /key="phrase-training"/);
  assert.match(training, /get\("tab"\) === "phrase"/);
  assert.match(styles, /\.code-coach\s*\{[^}]*grid-template-columns:/s);
  assert.match(
    styles,
    /@media \(max-width: 780px\)[\s\S]*\.code-coach-list\s*\{[^}]*grid-template-columns:\s*1fr/s,
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
  assert.match(component, /view: "summary", href: "\/summary", label: "统计"/);
  assert.doesNotMatch(component, /查看按键画像/);
  assert.doesNotMatch(component, /key-profile-entry/);
  assert.match(styles, /\.button\s*\{[^}]*display:\s*inline-flex/s);
  assert.doesNotMatch(styles, /key-profile-entry/);
  assert.doesNotMatch(summary, /返回本地成绩/);
  assert.match(summary, /按键使用画像/);
  assert.match(summary, /键盘热力图/);
  assert.match(summary, /左右手均衡情况/);
  assert.match(summary, /className="hand-pie"/);
  assert.match(summary, /aria-label=\{`左右手按键使用热力分布/);
  assert.match(summary, /不同位置按键使用率/);
  assert.match(summary, /title="手指使用率"/);
  assert.match(summary, /手指使用率（分区）/);
  assert.match(summary, /aria-label="练习按键次数热力图"/);
  assert.match(summary, /className="keyboard-scroll-region" tabIndex=\{0\}/);
  assert.match(summary, /className="key-analysis-grid" aria-label="按键分布分析"/);
  assert.match(summary, /id="finger-usage-title"[\s\S]*className="vertical-chart"/);
  assert.match(summary, /className="axis-bars" role="list"/);
  assert.match(summary, /className="vertical-chart" role="list"/);
  assert.match(summary, /className="vertical-bar"[\s\S]*role="listitem"/);
  assert.match(styles, /\.keyboard-heatmap\s*\{/);
  assert.match(styles, /\.key-analysis-grid\s*\{/);
  assert.match(styles, /\.hand-pie\s*\{[^}]*border-radius:\s*50%/s);
  assert.match(styles, /\.axis-grid\s*\{/);
  assert.match(styles, /\.vertical-bars\s*\{[^}]*grid-template-columns:\s*repeat\(9,/s);
  assert.match(styles, /@keyframes heat-key-rise/);
  assert.match(styles, /@keyframes pie-sweep-in/);
  assert.match(styles, /@keyframes bar-grow-in/);
  assert.match(styles, /@keyframes vertical-bar-grow-in/);
  assert.match(
    styles,
    /\.key-summary-actions \.button\s*\{[^}]*display:\s*inline-flex;[^}]*align-items:\s*center;[^}]*justify-content:\s*center;/s,
  );
  assert.match(styles, /\.key-analysis-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,/s);
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*\.vertical-chart/s);
  assert.match(
    styles,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.key-summary-page \*[\s\S]*animation-delay:\s*0\.01ms !important/s,
  );
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

test("theme settings expose six presets and accessible custom color controls", async () => {
  const component = await readFile(componentPath, "utf8");

  for (const [value, label] of [
    ["system", "系统"],
    ["light", "浅色"],
    ["dark", "深色"],
    ["bamboo", "竹纸"],
    ["qingdai", "青黛"],
    ["custom", "自定义"],
  ]) {
    assert.match(component, new RegExp(`${value}: "${label}"`));
  }
  assert.match(component, /主题预设/);
  assert.match(component, /<fieldset className="theme-preset-fieldset">/);
  assert.match(component, /<legend>主题预设<\/legend>/);
  assert.match(component, /className=\{`theme-preset-option/);
  assert.match(component, /type="radio"/);
  assert.match(component, /name="theme"/);
  assert.match(component, /data-theme-option=/);
  assert.match(component, /settings\.theme === "custom"\s*&&/);
  assert.match(
    component,
    /<label className="color-control"[^>]*>[\s\S]*?强调色[\s\S]*?<input[^>]*type="color"/,
  );
  assert.match(
    component,
    /<label className="color-control"[^>]*>[\s\S]*?页面背景色[\s\S]*?<input[^>]*type="color"/,
  );
  assert.equal(component.match(/type="color"/g)?.length, 2);
  assert.match(component, /恢复当前主题默认配色/);
});

test("custom theme preview reports contrast and keeps semantic colors stable", async () => {
  const [component, styles] = await Promise.all([
    readFile(componentPath, "utf8"),
    readFile(stylesPath, "utf8"),
  ]);

  assert.match(component, /function getContrastRatio\s*\(/);
  assert.match(component, /function chooseContrastText\s*\(/);
  assert.match(component, /4\.5/);
  assert.match(component, /"--custom-accent":\s*accent/);
  assert.match(component, /"--custom-canvas":\s*canvas/);
  assert.match(component, /"--custom-text":\s*text/);
  assert.match(component, /"--custom-accent-text":\s*chooseContrastText\(accent\)/);
  assert.match(component, /Object\.entries\(customVariables\)/);
  assert.match(component, /root\.style\.setProperty\(property, value\)/);
  assert.match(component, /className="theme-preview/);
  assert.match(component, /即时预览/);
  assert.match(component, /className="theme-preview-button"/);
  assert.match(component, /className="theme-preview-card"/);
  assert.match(component, /className="theme-preview-practice"/);
  assert.match(component, /颜色对比度不足[\s\S]*按钮已自动使用高对比度文字/);
  assert.match(component, /达到 WCAG AA/);

  assert.match(styles, /:root\[data-theme="bamboo"\]\s*\{/);
  assert.match(styles, /:root\[data-theme="qingdai"\]\s*\{/);
  const customThemeRule = styles.match(
    /:root\[data-theme="custom"\]\s*\{([^}]*)\}/,
  )?.[1];
  assert.ok(customThemeRule);
  assert.match(customThemeRule, /--bg-canvas:\s*var\(--custom-canvas,/);
  assert.match(customThemeRule, /--accent-vermilion:\s*var\(--custom-accent,/);
  assert.match(customThemeRule, /--text-primary:\s*var\(--custom-text,/);
  assert.match(customThemeRule, /--text-on-accent:\s*var\(--custom-accent-text,/);
  assert.doesNotMatch(customThemeRule, /--state-(?:success|error)|--heat-/);
});

test("header theme shortcut cycles basic themes and leaves presets for system", async () => {
  const component = await readFile(componentPath, "utf8");

  assert.match(component, /system:\s*"light"/);
  assert.match(component, /light:\s*"dark"/);
  assert.match(component, /dark:\s*"system"/);
  assert.match(
    component,
    /function getNextQuickTheme[\s\S]*theme === "system" \|\| theme === "light" \|\| theme === "dark"[\s\S]*\? basicThemeCycle\[theme\][\s\S]*: "system";/,
  );
  assert.match(component, /aria-label=\{`当前\$\{currentThemeName\}主题，点击切换为\$\{themeLabels\[quickTheme\]\}主题`\}/);
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
