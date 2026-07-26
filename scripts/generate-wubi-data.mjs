import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const source = path.resolve("third_party/rime-wubi/wubi86.dict.yaml");
const destination = path.resolve("public/data/wubi86.json");
const raw = await readFile(source, "utf8");
const body = raw.slice(raw.indexOf("\n...\n") + 5);
const seen = new Set();
const rows = [];

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
console.log(`Generated ${rows.length} Wubi 86 dictionary rows.`);
