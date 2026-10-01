import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import longArticles from "./article-corpus/long.mjs";
import mediumArticles from "./article-corpus/medium.mjs";
import shortArticles from "./article-corpus/short.mjs";
import waterArticles from "./article-corpus/water.mjs";

// 文章正文改为人工语料（scripts/article-corpus/），本脚本只负责规范化、校验和写出。
// 之所以不再用模板拼装：模板会在 300 篇之间复用同一批句式，结尾又都是格言式感悟，
// 读起来像同一篇作文洗牌重排。语料的写作规则见 scripts/article-corpus/README.md。
// 自然得出的结论、机制解释和开放结尾都允许；不以收尾类型判断文章是否有空话。
// 整库叙述方式与题材差异由逐篇及横向审读确认，本脚本仅校验明确的数据和重复约束。

const outputDir = path.resolve("public/data");
const ARTICLE_VERSION = 3;

const lengthOrder = ["short", "medium", "long", "water"];
const expectedCounts = { short: 120, medium: 105, long: 45, water: 30 };
const lengthBands = {
  short: [80, 180],
  medium: [300, 600],
  long: [1000, 1800],
  water: [400, 900],
};
const softWordLimit = 2;
const crossArticleLimit = 12;

const knownTopics = new Set([
  "日常生活",
  "职场办公",
  "科技数码",
  "自然旅行",
  "阅读随笔",
  "历史文化",
  "通俗科普",
  "网络聊天",
]);

// 旧模板留下的口水句与格言腔，禁止出现在正文里。
const retiredPhrases = [
  "道理不新鲜",
  "说到底",
  "仅此而已",
  "不敢打包票",
  "如果只能留一句话",
  "眼不见心不烦",
  "没什么惊天动地的结论",
  "才是最重要的",
  "更值得",
  "本身就是一种",
  "这次的经历",
  "这次经历",
  "由此可见",
  "总的来说",
  "在某种程度上",
  "从某种意义上",
  "不可否认",
  "与此同时",
  "值得注意的是",
  "不难发现",
  "可以看出",
  "归根结底",
  "换言之",
  "换句话说",
  "需要指出的是",
  "日子照常",
  "事情不大",
  "眼不见为净",
];

const asciiPattern = /[A-Za-z\u0020\u0021-\u002F\u003A-\u0040\u005B-\u0060\u007B-\u007E]/u;
const digitPattern = /[0-9０-９]/u;
// 年份（包括档案名称中的年份）使用四位半角数字，其余数字继续写汉字。
const yearPattern = /(?<![0-9])[12][0-9]{3}(?![0-9])/gu;
const adjacentPunctuationPattern = /[，。！？；：][，。！？；：]/u;
const reversedPunctuationPattern = /[。！？][，；：]|[，；：][。！？]/u;
const internalMarkerPattern = /【\d+】/u;
const softWordPattern = /其实|真正|反而|值得|往往|毕竟|或许|无疑|某种程度上/gu;
const antithesisPattern = /不是[^。！？]{1,25}而是/gu;
const titleSerialPattern = / · \d+$/u;
const wordRepetitionLimits = { short: 8, medium: 13, long: 18, water: 8 };
const wordSegmenter = new Intl.Segmenter("zh-CN", { granularity: "word" });

const compact = (text) => text.replace(/\s/gu, "");

// 语料写在模板字符串里，行首缩进和折行只是排版，这里统一还原成“段落之间空一行”。
const normalizeArticleText = (text) =>
  text
    .replace(/\r\n?/gu, "\n")
    .split(/\n{2,}/u)
    .map((paragraph) =>
      paragraph
        .split("\n")
        .map((line) => line.trim())
        .join("")
        .trim(),
    )
    .filter(Boolean)
    .join("\n\n");

const splitSentences = (text) =>
  text
    .replace(/\n/gu, "")
    .split(/[。！？]/u)
    .map((sentence) => sentence.trim())
    // 引号等标点碎片不作为整句参与重复检查。
    .filter((sentence) => /\p{Script=Han}/u.test(sentence));

export function assertArticleShape(article) {
  const { id, title, topic, length, text } = article;
  const version = article.version ?? ARTICLE_VERSION;
  const label = String(id);
  if (!Number.isSafeInteger(version) || version < ARTICLE_VERSION || version > 100000) {
    throw new Error(`${label} has an invalid article version: ${version}`);
  }
  if (!/^(short|medium|long|water)-\d{3}$/u.test(label)) {
    throw new Error(`${label} has an invalid id`);
  }
  const prefix = label.slice(0, label.indexOf("-"));
  if (prefix !== length) {
    throw new Error(`${label} declares length ${length}`);
  }
  if (!knownTopics.has(topic)) {
    throw new Error(`${label} declares unknown topic ${topic}`);
  }
  if (!title || asciiPattern.test(title) || digitPattern.test(title)) {
    throw new Error(`${label} has an invalid title: ${title}`);
  }
  if (compact(title).length > 14) {
    throw new Error(`${label} title is longer than 14 characters: ${title}`);
  }
  if (titleSerialPattern.test(title)) {
    throw new Error(`${label} title still carries a template serial: ${title}`);
  }

  const body = compact(text);
  const bodyWithoutYears = body.replace(yearPattern, "");
  const [minLength, maxLength] = lengthBands[length];
  if (body.length < minLength || body.length > maxLength) {
    throw new Error(
      `${label} has ${body.length} characters, outside ${minLength}-${maxLength}`,
    );
  }
  for (const pattern of [asciiPattern, digitPattern, internalMarkerPattern]) {
    const match = (pattern === digitPattern ? bodyWithoutYears : body).match(pattern);
    if (match) {
      throw new Error(`${label} contains forbidden characters: ${match[0]}`);
    }
  }
  const adjacent = body.match(adjacentPunctuationPattern);
  if (adjacent) {
    throw new Error(`${label} contains adjacent punctuation: ${adjacent[0]}`);
  }
  const reversed = body.match(reversedPunctuationPattern);
  if (reversed) {
    throw new Error(`${label} contains punctuation in the wrong order: ${reversed[0]}`);
  }
  if ((body.match(/“/gu) || []).length !== (body.match(/”/gu) || []).length) {
    throw new Error(`${label} contains unbalanced Chinese quotation marks`);
  }
  for (const phrase of retiredPhrases) {
    if (body.includes(phrase)) {
      throw new Error(`${label} contains a retired template phrase: ${phrase}`);
    }
  }
  const softWords = body.match(softWordPattern) ?? [];
  if (softWords.length > softWordLimit) {
    throw new Error(
      `${label} leans on filler words ${softWords.join("、")} (${softWords.length})`,
    );
  }
  const antithesis = body.match(antithesisPattern) ?? [];
  if (antithesis.length > 1) {
    throw new Error(`${label} repeats the 不是……而是…… construction`);
  }

  const sentences = splitSentences(text).map(compact);

  const seenSentences = new Set();
  for (const sentence of sentences) {
    if (sentence.length < 8) continue;
    if (seenSentences.has(sentence)) {
      throw new Error(`${label} repeats the sentence: ${sentence.slice(0, 18)}`);
    }
    seenSentences.add(sentence);
  }
  const phraseCounts = new Map();
  for (let index = 0; index <= body.length - 12; index += 1) {
    const phrase = body.slice(index, index + 12);
    if (/[，。！？；：“”]/u.test(phrase)) continue;
    phraseCounts.set(phrase, (phraseCounts.get(phrase) ?? 0) + 1);
  }
  const repeatedPhrase = [...phraseCounts].find(([, count]) => count >= 3);
  if (repeatedPhrase) {
    throw new Error(`${label} repeats the phrase ${repeatedPhrase[0]}`);
  }

  // 同一个词在一篇里反复出现，是“通篇在说同一句空话”的信号；按长度给不同上限。
  const wordCounts = new Map();
  for (const part of wordSegmenter.segment(text)) {
    const word = part.segment.trim();
    if (!part.isWordLike || word.length < 2 || !/^\p{Script=Han}+$/u.test(word)) {
      continue;
    }
    wordCounts.set(word, (wordCounts.get(word) ?? 0) + 1);
  }
  const repeatedWord = [...wordCounts].sort((left, right) => right[1] - left[1])[0];
  if (repeatedWord && repeatedWord[1] > wordRepetitionLimits[length]) {
    throw new Error(
      `${label} repeats the word ${repeatedWord[0]} ${repeatedWord[1]} times`,
    );
  }

  return { id: label, title, topic, length, text, version };
}

function assertCorpus(articles) {
  const ids = new Set();
  const titles = new Set();
  const bodies = new Set();
  for (const article of articles) {
    if (ids.has(article.id)) throw new Error(`duplicate article id ${article.id}`);
    if (titles.has(article.title)) throw new Error(`duplicate article title ${article.title}`);
    if (bodies.has(article.text)) throw new Error(`duplicate article body ${article.id}`);
    ids.add(article.id);
    titles.add(article.title);
    bodies.add(article.text);
  }

  const sentenceOwners = new Map();
  const phraseOwners = new Map();
  const addOwner = (map, key, id) => {
    const owners = map.get(key) ?? [];
    owners.push(id);
    map.set(key, owners);
  };
  for (const article of articles) {
    const body = compact(article.text);
    const articleSentences = new Set(
      splitSentences(article.text)
        .map(compact)
        .filter((sentence) => sentence.length >= 8),
    );
    for (const sentence of articleSentences) addOwner(sentenceOwners, sentence, article.id);
    const articlePhrases = new Set();
    for (let index = 0; index <= body.length - 10; index += 1) {
      articlePhrases.add(body.slice(index, index + 10));
    }
    for (const phrase of articlePhrases) addOwner(phraseOwners, phrase, article.id);
  }

  const crowdedSentence = [...sentenceOwners].sort(
    (left, right) => right[1].length - left[1].length,
  )[0];
  if (crowdedSentence && crowdedSentence[1].length > crossArticleLimit) {
    throw new Error(
      `sentence appears in ${crowdedSentence[1].length} articles: ${crowdedSentence[0]}`,
    );
  }
  const crowdedPhrase = [...phraseOwners].sort(
    (left, right) => right[1].length - left[1].length,
  )[0];
  if (crowdedPhrase && crowdedPhrase[1].length > crossArticleLimit) {
    throw new Error(
      `10-character phrase appears in ${crowdedPhrase[1].length} articles: ${crowdedPhrase[0]}`,
    );
  }
}

async function generateArticles() {
  const corpus = [];
  for (const length of lengthOrder) {
    const source = {
      short: shortArticles,
      medium: mediumArticles,
      long: longArticles,
      water: waterArticles,
    }[length];
    if (!Array.isArray(source)) throw new Error(`article corpus for ${length} is missing`);
    if (source.length !== expectedCounts[length]) {
      throw new Error(
        `${length} corpus holds ${source.length} articles, expected ${expectedCounts[length]}`,
      );
    }
    const expectedIds = Array.from(
      { length: source.length },
      (_, index) => `${length}-${String(index + 1).padStart(3, "0")}`,
    );
    const actualIds = source.map((article) => String(article.id)).sort();
    if (JSON.stringify(actualIds) !== JSON.stringify([...expectedIds].sort())) {
      throw new Error(`${length} corpus does not cover the expected id range`);
    }
    for (const article of source) {
      corpus.push(
        assertArticleShape({
          ...article,
          length,
          text: normalizeArticleText(String(article.text)),
        }),
      );
    }
  }

  assertCorpus(corpus);

  const rows = corpus.map((article) => ({
    id: article.id,
    title: article.title,
    length: article.length,
    topic: article.topic,
    wordCount: compact(article.text).length,
    version: article.version,
    text: article.text,
  }));

  await mkdir(outputDir, { recursive: true });
  await writeFile(
    path.join(outputDir, "articles-index.json"),
    `${JSON.stringify(
      rows.map(({ id, title, length, topic, wordCount, version }) => ({
        id,
        title,
        length,
        topic,
        wordCount,
        version,
      })),
      null,
      2,
    )}\n`,
  );

  for (const length of lengthOrder) {
    const group = rows.filter((row) => row.length === length);
    await writeFile(
      path.join(outputDir, `articles-${length}.json`),
      `${JSON.stringify(group.map(({ id, text }) => ({ id, text })))}\n`,
    );
  }

  const lengths = rows.map((row) => row.wordCount);
  const summary = lengthOrder
    .map((length) => {
      const group = rows.filter((row) => row.length === length);
      const words = group.map((row) => row.wordCount);
      const average = Math.round(words.reduce((total, value) => total + value, 0) / words.length);
      return `${length} ${group.length} 篇 平均 ${average} 字（${Math.min(...words)}-${Math.max(...words)}）`;
    })
    .join("；");
  console.log(`生成 ${rows.length} 篇文章：${summary}。`);
  console.log(`全篇最短 ${Math.min(...lengths)} 字，最长 ${Math.max(...lengths)} 字。`);
}

// 导入校验函数时不写文件；命令行运行仍生成完整语料。
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await generateArticles();
}
