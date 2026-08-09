import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile, stat } from "node:fs/promises";

const readJson = async (name) =>
  JSON.parse(await readFile(new URL(`../public/data/${name}`, import.meta.url), "utf8"));

test("article library has the planned distribution and valid metadata", async () => {
  const index = await readJson("articles-index.json");
  assert.equal(index.length, 300);
  assert.deepEqual(
    Object.fromEntries(
      ["short", "medium", "long", "water"].map((length) => [
        length,
        index.filter((article) => article.length === length).length,
      ]),
    ),
    { short: 120, medium: 105, long: 45, water: 30 },
  );
  assert.equal(new Set(index.map((article) => article.id)).size, 300);
  assert.equal(new Set(index.map((article) => article.title)).size, 300);
  assert.ok(index.every((article) => article.title && article.topic && article.wordCount > 0));

  const addedRanges = {
    short: [81, 120],
    medium: [71, 105],
    long: [31, 45],
    water: [21, 30],
  };
  const added = index.filter((article) => {
    const [length, serial] = article.id.split("-");
    const range = addedRanges[length];
    return range && Number(serial) >= range[0] && Number(serial) <= range[1];
  });
  assert.equal(added.length, 100);
  assert.ok(added.every((article) => !/ · \d+$/u.test(article.title)));
  assert.deepEqual(
    Object.fromEntries(
      ["日常生活", "职场办公", "科技数码", "自然旅行", "阅读随笔", "历史文化", "通俗科普", "网络聊天"].map((topic) => [
        topic,
        added.filter((article) => article.topic === topic).length,
      ]),
    ),
    {
      日常生活: 13,
      职场办公: 13,
      科技数码: 13,
      自然旅行: 13,
      阅读随笔: 13,
      历史文化: 13,
      通俗科普: 12,
      网络聊天: 10,
    },
  );
});

test("article bodies are complete, unique, and inside their length bands", async () => {
  const index = await readJson("articles-index.json");
  const bodies = (
    await Promise.all(
      ["short", "medium", "long", "water"].map((name) => readJson(`articles-${name}.json`)),
    )
  ).flat();
  const bodyMap = new Map(bodies.map((row) => [row.id, row.text]));
  assert.equal(bodyMap.size, 300);
  assert.equal(new Set(bodies.map((row) => row.text)).size, 300);

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

test("article prose keeps punctuation balanced and drops generator artifacts", async () => {
  const articles = (
    await Promise.all(
      ["short", "medium", "long", "water"].map((name) => readJson(`articles-${name}.json`)),
    )
  ).flat();

  for (const { id, text } of articles) {
    assert.equal((text.match(/“/gu) || []).length, (text.match(/”/gu) || []).length, `${id} has unbalanced Chinese quotes`);
    assert.equal(/【\d+】/u.test(text), false, `${id} contains an internal deduplication marker`);
    assert.equal(/[，。！？；：][，。！？；：]/u.test(text), false, `${id} contains adjacent punctuation`);
    assert.equal(/[。！？][，；：]|[，；：][。！？]/u.test(text), false, `${id} contains punctuation in the wrong order`);
    assert.equal(/而是把[^。！？]*依据。[^。！？]*他们没有回避/u.test(text), false, `${id} contains a reordered clause artifact`);
    assert.equal(/不再应当|已经应当|一时难以判断/u.test(text), false, `${id} contains a mechanical rewrite artifact`);
  }
});

test("chat articles advance meaning instead of padding repeated phrases", async () => {
  const articles = await readJson("articles-water.json");
  const knownPadding = [
    "看到这里，看到这里",
    "先先",
    "这场关于",
    "大家平时都是怎么处理的",
    "不能只看表面",
    "第二天再看也不会觉得空洞",
  ];

  for (const { id, text } of articles) {
    for (const phrase of knownPadding) {
      assert.equal(text.includes(phrase), false, `${id} contains template padding: ${phrase}`);
    }

    const sentences = text
      .split(/[。！？]/)
      .map((sentence) => sentence.replace(/\s/g, ""))
      .filter((sentence) => sentence.length >= 8);
    assert.equal(
      new Set(sentences).size,
      sentences.length,
      `${id} contains a repeated sentence`,
    );
    assert.ok(
      text.split(/\n\s*\n/).length >= 3,
      `${id} should have a clear multi-paragraph progression`,
    );
  }
});

test("all articles reject recycled generator phrases and internal repetition", async () => {
  const groups = ["short", "medium", "long", "water"];
  const articles = (
    await Promise.all(groups.map((name) => readJson(`articles-${name}.json`)))
  ).flat();
  const retiredTemplates = [
    "许多人首先想到的是结果，但真正值得留意的是过程",
    "这个不显眼的片段使",
    "有人愿意多观察一步，于是",
    "合适的做法不是急着下结论，而是先确认事实",
    "可以看到习惯如何形成：先从小处开始，再依据反馈调整",
    "后续观察仍然围绕当时的条件展开",
    "这次也把前提一并记下",
    "相关判断暂时只作为线索保留",
    "记录没有把它写成固定答案",
  ];

  for (const { id, text } of articles) {
    for (const phrase of retiredTemplates) {
      assert.equal(text.includes(phrase), false, `${id} contains retired template: ${phrase}`);
    }

    const sentences = text
      .split(/[。！？]/)
      .map((sentence) => sentence.replace(/\s/g, ""))
      .filter((sentence) => sentence.length >= 8);
    assert.equal(
      new Set(sentences).size,
      sentences.length,
      `${id} contains a repeated sentence`,
    );

    const compact = text.replace(/\s/g, "");
    const phraseCounts = new Map();
    for (let index = 0; index <= compact.length - 12; index += 1) {
      const phrase = compact.slice(index, index + 12);
      if (/[，。！？；：“”]/.test(phrase)) continue;
      phraseCounts.set(phrase, (phraseCounts.get(phrase) ?? 0) + 1);
    }
    const repeatedPhrase = [...phraseCounts].find(([, count]) => count >= 3);
    assert.equal(
      repeatedPhrase,
      undefined,
      `${id} repeats phrase ${repeatedPhrase?.[0]}`,
    );
  }
});

test("cross-article prose stays below repetition thresholds", async () => {
  const groups = ["short", "medium", "long", "water"];
  const articles = (
    await Promise.all(groups.map((name) => readJson(`articles-${name}.json`)))
  ).flat();
  const sentenceOwners = new Map();
  const skeletonOwners = new Map();
  const phraseOwners = new Map();
  const wordLimits = { short: 8, medium: 13, long: 18, water: 8 };
  const segmenter = new Intl.Segmenter("zh-CN", { granularity: "word" });

  const addOwner = (map, value, id) => {
    const owners = map.get(value) ?? new Set();
    owners.add(id);
    map.set(value, owners);
  };

  for (const { id, text } of articles) {
    const sentences = text
      .split(/[。！？]/)
      .map((sentence) => sentence.replace(/\s/g, ""))
      .filter((sentence) => sentence.length >= 8);
    for (const sentence of sentences) {
      addOwner(sentenceOwners, sentence, id);
      addOwner(
        skeletonOwners,
        sentence.replace(/“[^”]*”/gu, "“主题”").replace(/[0-9０-９]+/gu, "数字"),
        id,
      );

      const han = sentence.replace(/[^\p{Script=Han}]/gu, "");
      const articlePhrases = new Set();
      for (let index = 0; index <= han.length - 10; index += 1) {
        articlePhrases.add(han.slice(index, index + 10));
      }
      for (const phrase of articlePhrases) addOwner(phraseOwners, phrase, id);
    }

    const wordCounts = new Map();
    for (const part of segmenter.segment(text)) {
      const word = part.segment.trim();
      if (!part.isWordLike || word.length < 2 || !/^\p{Script=Han}+$/u.test(word)) {
        continue;
      }
      wordCounts.set(word, (wordCounts.get(word) ?? 0) + 1);
    }
    const mostRepeatedWord = [...wordCounts].sort((left, right) => right[1] - left[1])[0];
    const length = id.slice(0, id.indexOf("-"));
    assert.ok(
      !mostRepeatedWord || mostRepeatedWord[1] <= wordLimits[length],
      `${id} repeats word ${mostRepeatedWord?.[0]} ${mostRepeatedWord?.[1]} times`,
    );
  }

  const mostRepeatedSentence = [...sentenceOwners].sort(
    (left, right) => right[1].size - left[1].size,
  )[0];
  const mostRepeatedSkeleton = [...skeletonOwners].sort(
    (left, right) => right[1].size - left[1].size,
  )[0];
  const mostRepeatedPhrase = [...phraseOwners].sort(
    (left, right) => right[1].size - left[1].size,
  )[0];

  assert.ok(
    mostRepeatedSentence[1].size <= 18,
    `sentence appears in ${mostRepeatedSentence[1].size} articles: ${mostRepeatedSentence[0]}`,
  );
  assert.ok(
    mostRepeatedSkeleton[1].size <= 18,
    `sentence skeleton appears in ${mostRepeatedSkeleton[1].size} articles: ${mostRepeatedSkeleton[0]}`,
  );
  assert.ok(
    mostRepeatedPhrase[1].size <= 18,
    `10-character phrase appears in ${mostRepeatedPhrase[1].size} articles: ${mostRepeatedPhrase[0]}`,
  );
});

test("Wubi dictionary contains core words and no invalid codes", async () => {
  const rows = await readJson("wubi86.json");
  assert.ok(rows.length > 100000);
  assert.ok(rows.some(([text, code]) => text === "五笔" && code === "ggtt"));
  assert.ok(rows.some(([text, code]) => text === "测试" && code === "imya"));
  assert.ok(rows.every(([, code]) => /^[a-y]{1,4}$/.test(code)));
});

test("challenge dictionary contains simplified Chinese and excludes traditional forms", async () => {
  const rows = await readJson("wubi86-challenge.json");
  const texts = new Set(rows.map(([text]) => text));

  assert.ok(rows.length > 50000);
  assert.ok(texts.has("国"));
  assert.ok(texts.has("后"));
  assert.ok(texts.has("体"));
  assert.equal(texts.has("國"), false);
  assert.equal(texts.has("後"), false);
  assert.equal(texts.has("體"), false);
  assert.equal(texts.has("桜"), false);
  assert.equal(texts.has("沢"), false);
  assert.equal(
    rows.some(([text]) => /[國後體發臺灣漢語桜沢辺]/u.test(text)),
    false,
  );
  assert.ok(rows.every(([, code]) => /^[a-y]{1,4}$/.test(code)));
});

test("common-character data contains the verified first 1500 frequency ranks", async () => {
  const [data, wubiRows] = await Promise.all([
    readJson("common-characters.json"),
    readJson("wubi86.json"),
  ]);
  const characters = Array.from(data.characters);
  const codedCharacters = new Set(
    wubiRows
      .filter(([text]) => Array.from(text).length === 1)
      .map(([text]) => text),
  );

  assert.equal(data.version, 1);
  assert.match(data.source.name, /现代汉语研究语料库/);
  assert.equal(characters.length, 1500);
  assert.equal(new Set(characters).size, 1500);
  assert.equal(characters.slice(0, 20).join(""), "的一了是不我人有在这国大个中他和你来上要");
  assert.equal(characters[99], "制");
  assert.equal(characters[499], "士");
  assert.equal(characters[999], "纷");
  assert.equal(characters[1499], "诊");
  assert.ok(characters.every((character) => /^\p{Script=Han}$/u.test(character)));
  assert.ok(characters.every((character) => codedCharacters.has(character)));
});

test("music catalog maps five licensed entries to bundled audio files", async () => {
  const catalog = await readJson("music-catalog.json");
  assert.equal(catalog.version, 1);
  assert.equal(catalog.tracks.length, 5);
  assert.equal(
    new Set(catalog.tracks.map((track) => track.id)).size,
    catalog.tracks.length,
  );

  for (const track of catalog.tracks) {
    assert.ok(track.id);
    assert.ok(track.title);
    assert.equal(track.artist, "HoliznaCC0");
    assert.equal(track.license, "CC0 1.0 Universal");
    assert.match(track.sourceUrl, /^https:\/\/freemusicarchive\.org\//);
    assert.ok(track.durationSeconds > 0);
    assert.ok(Array.isArray(track.sources) && track.sources.length > 0);

    for (const source of track.sources) {
      assert.match(source.src, /^\/audio\/tracks\/[^/]+$/);
      assert.ok(["audio/mpeg", "audio/ogg", "audio/mp4"].includes(source.type));
      const audioUrl = new URL(`../public${source.src}`, import.meta.url);
      await access(audioUrl);
      assert.ok((await stat(audioUrl)).size > 1_000_000);
    }
  }
});
