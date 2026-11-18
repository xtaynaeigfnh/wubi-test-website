import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Reviewed npm sources. A new version must be reviewed before accepting it.
const hashes = {
  "2.3.2": "3a91656f440069aa8f8e15c9d695b9f6b2209df1eab2be8127c72cbcca45ff5f",
  "4.0.4": "ce57c04e04994b83e2ca566170fa192e6fe19d710bea6da00ce2f76d01c0dea4",
  "4.0.7": "4e1e05447668aa1e94366c5516a2bcd8f5fff800cc92b1d0cd7d77703b8618c4",
};
const marker = "  const extglobOpen = (type, value) => {";
const patched = marker + "\n    if (type === 'star' || type === 'plus') throw new SyntaxError('Repeated extglobs disabled: GHSA-fc5q-39xc-vjpf');";

export function checkParsers({ install = false } = {}) {
  const { packages } = JSON.parse(readFileSync("package-lock.json", "utf8"));
  const paths = Object.keys(packages).filter((p) => p.endsWith("/node_modules/picomatch") || p === "node_modules/picomatch");
  if (!paths.length) throw new Error("Review obsolete picomatch mitigation");
  for (const path of paths) {
    const file = resolve(path, "lib/parse.js");
    const source = readFileSync(file, "utf8");
    const original = source.replace(patched, marker);
    if (createHash("sha256").update(original).digest("hex") !== hashes[packages[path].version] ||
        original.split(marker).length !== 2) throw new Error("Unrecognized picomatch parser: " + path);
    const expected = original.replace(marker, patched);
    if (source !== expected) {
      if (!install || source !== original) throw new Error("Missing picomatch mitigation: " + path);
      writeFileSync(file, expected);
    }
  }
  return paths;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) checkParsers({ install: true });
