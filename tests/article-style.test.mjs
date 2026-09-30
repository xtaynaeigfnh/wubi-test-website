import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// 这组用例锁定正文的“人工写作”契约，规则说明见 scripts/article-corpus/README.md。
// 旧版正文由模板槽位拼装，会出现整句跨篇复用、格言式收尾、段落等长、通篇没有具体信息
// 等问题，因此这些特征在这里被显式禁止。

const readJson = async (name) =>
  JSON.parse(await readFile(new URL(`../public/data/${name}`, import.meta.url), "utf8"));

const groups = ["short", "medium", "long", "water"];

const loadCorpus = async () => {
  const index = await readJson("articles-index.json");
  const bodies = (
    await Promise.all(groups.map((name) => readJson(`articles-${name}.json`)))
  ).flat();
  const bodyMap = new Map(bodies.map((row) => [row.id, row.text]));
  return index.map((article) => ({ ...article, text: bodyMap.get(article.id) }));
};

const compact = (text) => text.replace(/\s/gu, "");

const sentences = (text) =>
  text
    .replace(/\n/gu, "")
    .split(/[。！？]/u)
    .map((sentence) => sentence.trim())
    // 只保留含汉字的句子：句末标点切下来的引号碎片不算一句，否则节奏要求会被孤立引号满足。
    .filter((sentence) => /\p{Script=Han}/u.test(sentence));

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

const softWordPattern = /其实|真正|反而|值得|往往|毕竟|或许|无疑|某种程度上/gu;
const quantityPattern =
  /[〇零一二三四五六七八九十百千万两]+(元|块|次|分钟|秒|小时|天|周|月|日|年|岁|米|厘米|毫米|公里|公斤|斤|克|度|页|份|张|行|本|支|条|件|台|间|位|个人|个|只|把|瓶|箱|袋|盒|层|楼|号|点|倍|成|级|步|声|下|圈|回|颗|句|道|座|辆)/u;

test("article library ships the rewritten corpus", async () => {
  const index = await readJson("articles-index.json");
  assert.equal(index.length, 300);
  assert.ok(
    index.every((article) => article.version === 3),
    "文章正文整体重写后，索引版本号应为 3",
  );
  assert.equal(
    index.filter((article) => / · \d+$/u.test(article.title)).length,
    0,
    "标题不应再带模板序号",
  );
});

test("article prose drops retired template phrases and filler words", async () => {
  const corpus = await loadCorpus();

  for (const { id, text } of corpus) {
    for (const phrase of retiredPhrases) {
      assert.equal(text.includes(phrase), false, `${id} 仍包含模板口水句：${phrase}`);
    }
    const softWords = text.match(softWordPattern) ?? [];
    assert.ok(
      softWords.length <= 2,
      `${id} 空转副词过多（${softWords.join("、")}），共 ${softWords.length} 处`,
    );
    assert.equal(
      /让[^。！？，；：]{0,12}(变得|重新|成为)|使[^。！？，；：]{0,12}成为/u.test(text),
      false,
      `${id} 仍在使用抽象升华句式`,
    );
  }
});

test("article prose keeps a concrete scene instead of generic commentary", async () => {
  const corpus = await loadCorpus();

  for (const { id, length, text } of corpus) {
    const spoken = text.match(/“[^”]{1,80}”/gu) ?? [];
    const required = length === "water" ? 2 : 1;
    assert.ok(
      spoken.length >= required,
      `${id} 只有 ${spoken.length} 处直接引语，至少需要 ${required} 处`,
    );
    assert.match(text, quantityPattern, `${id} 缺少可以核对的具体数量`);
  }
});

test("article prose varies sentence and paragraph rhythm", async () => {
  const corpus = await loadCorpus();

  for (const { id, length, text } of corpus) {
    const lengths = sentences(text).map((sentence) => compact(sentence).length);
    assert.ok(
      lengths.some((value) => value <= 8),
      `${id} 没有短句，句子长度缺少落差`,
    );
    const longMinimum = length === "long" ? 2 : 1;
    assert.ok(
      lengths.filter((value) => value >= 35).length >= longMinimum,
      `${id} 的长句少于 ${longMinimum} 句`,
    );

    if (length === "short") continue;
    const paragraphLengths = text.split("\n\n").filter(Boolean).map(compact);
    assert.ok(
      Math.max(...paragraphLengths.map((item) => item.length)) >=
        Math.min(...paragraphLengths.map((item) => item.length)) * 2,
      `${id} 的段落长度过于均匀`,
    );
  }
});

test("article prose never repeats itself internally", async () => {
  const corpus = await loadCorpus();

  for (const { id, text } of corpus) {
    const seen = new Set();
    for (const sentence of sentences(text)) {
      const value = compact(sentence);
      if (value.length < 8) continue;
      assert.equal(seen.has(value), false, `${id} 内部重复了整句：${value.slice(0, 18)}`);
      seen.add(value);
    }

    const body = compact(text);
    const counts = new Map();
    for (let index = 0; index <= body.length - 12; index += 1) {
      const phrase = body.slice(index, index + 12);
      if (/[，。！？；：“”]/u.test(phrase)) continue;
      counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
    }
    const repeated = [...counts].find(([, count]) => count >= 3);
    assert.equal(repeated, undefined, `${id} 重复了长片段：${repeated?.[0]}`);
  }
});
