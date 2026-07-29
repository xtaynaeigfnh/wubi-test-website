import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import OpenCC from "opencc-js";

const source = path.resolve("third_party/rime-wubi/wubi86.dict.yaml");
const destination = path.resolve("public/data/wubi86.json");
const challengeDestination = path.resolve("public/data/wubi86-challenge.json");
const commonCharacterSource = path.resolve(
  "third_party/mrccorpus/common-characters-1500.txt",
);
const commonCharacterDestination = path.resolve(
  "public/data/common-characters.json",
);
const raw = await readFile(source, "utf8");
const body = raw.slice(raw.indexOf("\n...\n") + 5);
const seen = new Set();
const rows = [];
const toSimplified = OpenCC.Converter({ from: "t", to: "cn" });
const japaneseToTraditional = OpenCC.Converter({ from: "jp", to: "t" });

for (const line of body.split(/\r?\n/)) {
  if (!line || line.startsWith("#")) continue;
  const [text, code, weight = "0"] = line.split("\t");
  if (!text || !/^[a-y]{1,4}$/.test(code || "")) continue;
  const key = `${text}\u0000${code}`;
  if (seen.has(key)) continue;
  seen.add(key);
  rows.push([text, code, Number(weight) || 0]);
}

await mkdir(path.dirname(destination), { recursive: true });
await writeFile(destination, JSON.stringify(rows));
const dictionaryTexts = rows.map(([text]) => text).join("\n");
const simplifiedTexts = toSimplified(dictionaryTexts).split("\n");
const normalizedJapaneseTexts = toSimplified(japaneseToTraditional(dictionaryTexts)).split("\n");
const challengeRows = rows.filter(
  ([text], index) =>
    simplifiedTexts[index] === text && normalizedJapaneseTexts[index] === text,
);
await writeFile(challengeDestination, JSON.stringify(challengeRows));

const commonCharacterRaw = (await readFile(commonCharacterSource, "utf8")).trim();
const commonCharacters = Array.from(commonCharacterRaw);
const wubiSingleCharacters = new Set(
  rows
    .filter(([text]) => Array.from(text).length === 1)
    .map(([text]) => text),
);
const invalidCommonCharacters = commonCharacters.filter(
  (character) =>
    !/^\p{Script=Han}$/u.test(character) ||
    toSimplified(character) !== character ||
    !wubiSingleCharacters.has(character),
);

if (commonCharacters.length !== 1500) {
  throw new Error(
    `Common-character source must contain exactly 1500 characters, received ${commonCharacters.length}.`,
  );
}
if (new Set(commonCharacters).size !== commonCharacters.length) {
  throw new Error("Common-character source contains duplicate characters.");
}
if (invalidCommonCharacters.length) {
  throw new Error(
    `Common-character source contains invalid or uncoded characters: ${invalidCommonCharacters.join("")}`,
  );
}

await writeFile(
  commonCharacterDestination,
  JSON.stringify({
    version: 1,
    source: {
      name: "北京语言大学“现代汉语研究语料库”汉字频率表",
      url: "https://faculty.blcu.edu.cn/xinghb/zh_CN/article/167473/content/1016.htm",
      retrievedAt: "2026-07-29",
    },
    characters: commonCharacterRaw,
  }),
);
console.log(`Generated ${rows.length} Wubi 86 dictionary rows.`);
console.log(`Generated ${challengeRows.length} simplified Chinese challenge rows.`);
console.log(`Generated ${commonCharacters.length} ranked common characters.`);
