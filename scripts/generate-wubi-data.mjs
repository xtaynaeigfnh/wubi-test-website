import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import OpenCC from "opencc-js";

const source = path.resolve("third_party/rime-wubi/wubi86.dict.yaml");
const destination = path.resolve("public/data/wubi86.json");
const challengeDestination = path.resolve("public/data/wubi86-challenge.json");
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
console.log(`Generated ${rows.length} Wubi 86 dictionary rows.`);
console.log(`Generated ${challengeRows.length} simplified Chinese challenge rows.`);
