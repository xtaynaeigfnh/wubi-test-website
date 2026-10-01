import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assertArticleShape } from "../scripts/generate-articles.mjs";

// 这组用例锁定正文的“人工写作”契约，规则说明见 scripts/article-corpus/README.md。
// 自动检查阻止复用和空话；内容是否推进、节奏是否自然由逐篇审读确认，不能用形式配额代替。

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
    // 句末标点切下来的引号碎片不算重复句子。
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
test("article library ships the rewritten corpus", async () => {
  const index = await readJson("articles-index.json");
  assert.equal(index.length, 300);
  assert.ok(
    index.every((article) => Number.isSafeInteger(article.version) && article.version >= 3),
    "文章正文版本应保留整体重写后的版本，并允许逐篇递增",
  );
  assert.equal(
    index.filter((article) => / · \d+$/u.test(article.title)).length,
    0,
    "标题不应再带模板序号",
  );
});

test("generated article bodies and versions match their individual corpus sources", async () => {
  const corpus = await loadCorpus();
  const sources = (
    await Promise.all(
      groups.map(async (name) =>
        (await import(`../scripts/article-corpus/${name}.mjs`)).default,
      ),
    )
  ).flat();
  const byId = new Map(corpus.map((article) => [article.id, article]));
  const normalize = (text) =>
    text.replace(/\r\n?/gu, "\n")
      .split(/\n{2,}/u)
      .map((paragraph) =>
        paragraph.split("\n").map((line) => line.trim()).join("").trim(),
      )
      .filter(Boolean).join("\n\n");
  for (const source of sources) {
    const generated = byId.get(source.id);
    assert.ok(generated, `${source.id} 缺少生成正文`);
    assert.equal(generated.version, source.version ?? 3, `${source.id} 正文版本未同步`);
    assert.equal(generated.text, normalize(source.text), `${source.id} 正文未同步`);
  }
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

test("natural prose needs no quotation, quantity or rhythm quota", () => {
  const article = {
    id: "short-001",
    title: "院子里的风",
    topic: "日常生活",
    length: "short",
    version: 4,
    text: "院子起风时，晾衣绳轻轻撞着墙边的树枝。母亲把夹子往里面挪开，湿衣服便不再贴着树叶。她试着松开手，看衣角能否避开横过来的枝条。\n\n风停下来后，枝头留下衣料擦过的水痕。母亲走到墙边收回落下的夹子，把靠外的衣服移进棚里。天色渐暗，她沿着晾衣绳检查有没有松开的地方。",
  };
  assert.deepEqual(assertArticleShape(article), article);
});

test("grounded reflections and explanations may conclude an article", () => {
  const examples = [
    {
      topic: "阅读随笔",
      text: "诗集第三十页后空着两页，我以为漏印，和同桌翻来翻去，还担心少了几首。\n\n译者来图书馆时，我拿给他看。他说分辑特意留的，让我对照目录。回去再翻，第二十九页那首只有三行，过了第三十页才是空白，再后面换了题目。\n\n我原先急着找掉在哪里的字，这次把那三行又读了一遍。读完不往下赶，也有一小会儿可让它留在心里。",
    },
    {
      topic: "通俗科普",
      text: "出炉面包按一下还能弹回来，第二天只留浅坑，掰开又掉细渣。阿文把袋口扎得紧，半只面包还是硬了。\n\n何师傅说，水分会散失、迁移，淀粉在存放中也会重新排列，这类老化会改变面包的结构和口感。袋子挡住一部分水分流失，挡不住内部所有变化。\n\n阿文以为软硬只看袋口关没关，原来封好的面包里面也不是静止不变的。",
    },
  ];
  for (const example of examples) {
    const article = { id: "short-001", title: "有依据的结尾", length: "short", ...example };
    assert.doesNotThrow(() => assertArticleShape(article));
    assert.throws(
      () => assertArticleShape({ ...article, text: article.text + "才是最重要的。" }),
      /retired template phrase/,
    );
  }
});

test("editorial rule changes retain required shape and repetition guards", () => {
  const article = {
    id: "short-001",
    title: "门边的纸条",
    topic: "日常生活",
    length: "short",
    text: "母亲把要买的东西写在门边，出门时却忘了带纸条。回家后她逐项核对，把缺的圈起来，再把纸放进随身的袋子。隔天走到菜摊，她拿出清单，发现圈过的字已经被水洇开。摊主问她是不是要买菜，她看了看篮子，先挑了今晚能用的，没把看不清的字随便补上。",
  };
  assert.equal(assertArticleShape(article).version, 3);
  assert.doesNotThrow(() => assertArticleShape({
    ...article,
    text: article.text + "她搬开门口箱子，让被堵的抽屉重新拉得开。",
  }));
  for (const [patch, message] of [
    [{ text: "太短。" }, /outside/],
    [{ text: article.text + "abc" }, /forbidden characters/],
    [{ text: article.text + "1" }, /forbidden characters/],
    [{ text: article.text + "“" }, /unbalanced/],
    [{ id: "wrong-001" }, /invalid id/],
    [{ topic: "未知主题" }, /unknown topic/],
    [{ version: 0 }, /invalid article version/],
    [{ text: article.text + "母亲把要买的东西写在门边，出门时却忘了带纸条。" }, /repeats the sentence/],
  ]) {
    assert.throws(() => assertArticleShape({ ...article, ...patch }), message);
  }
});


test("prose accepts Arabic years and retains other character restrictions", async () => {
  const article = {
    id: "short-001",
    title: "杯外的水珠",
    topic: "通俗科普",
    length: "short",
    text: "水珠出现在杯壁外侧，并不表示杯子漏了。空气中的水汽接触冷表面，可能凝结成水。窗内侧的潮湿也有相似原因，先看表面温度，再看室内湿度。厨房煮水会增加水汽，不能只凭水珠判断窗框漏雨。",
  };
  for (const year of ["1973年", "2025年", "“客户往来2025”", "年份从2019排到2023"]) {
    assert.doesNotThrow(() => assertArticleShape({ ...article, text: article.text + year }));
  }
  for (const value of ["1", "25年", "12025年", "20250年", "２０２５年", "2025A", "2025,", "【2025】"]) {
    assert.throws(() => assertArticleShape({ ...article, text: article.text + value }));
  }
  assert.throws(() => assertArticleShape({ ...article, title: "记录2025年" }));
});

test("published calendar years use Arabic digits", async () => {
  for (const { id, text } of await loadCorpus()) {
    assert.doesNotMatch(text, /[一二][〇零一二三四五六七八九]{3}/u, `${id} 年份应使用阿拉伯数字`);
  }
});
