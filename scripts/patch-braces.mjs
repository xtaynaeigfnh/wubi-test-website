import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Temporary mitigation for GHSA-vfj7-8cjw-p6xm. Upstream 3.0.3 has no patch.
// Pin both the version and original file hashes; dependency changes require review.
const root = fileURLToPath(new URL("../", import.meta.url));
const guard = "if (depth > 64) throw new SyntaxError('Brace nesting exceeds the project limit of 64');";
const patches = [
  ["parse.js", "e572166565f15fa6ad9865ae49d678218e32aabfd1b3720f6d0d43d39800d310", [
    ["      stack.push(block);", "      if (stack.length >= 65) throw new SyntaxError('Brace nesting exceeds the project limit of 64');\n      stack.push(block);"],
  ]],
  ["compile.js", "dc98f22eee3d511785d92a00758d5f0d48efed5f5813bdecc2de430c529b5c9f", [
    ["const walk = (node, parent = {}) => {", `const walk = (node, parent = {}, depth = 0) => {\n    ${guard}`],
    ["walk(child, node)", "walk(child, node, depth + 1)"],
  ]],
  ["expand.js", "41ccc196ebfa7b7781a634e721eb744e4e7bcb54cba427a7e3d6806a1b9e58f7", [
    ["const walk = (node, parent = {}) => {", `const walk = (node, parent = {}, depth = 0) => {\n    ${guard}`],
    ["walk(child, node)", "walk(child, node, depth + 1)"],
  ]],
  ["stringify.js", "379f22d77bfa1478341ccd49c5e4267464aabcbba03558bab332aac23fc6f23a", [
    ["const stringify = (node, parent = {}) => {", `const stringify = (node, parent = {}, depth = 0) => {\n    ${guard}`],
    ["stringify(child)", "stringify(child, undefined, depth + 1)"],
  ]],
];
const digest = (source) => createHash("sha256").update(source).digest("hex");
const lock = JSON.parse(await readFile(resolve(root, "package-lock.json"), "utf8"));
let patched = 0;
for (const location of Object.keys(lock.packages).filter((path) => path.endsWith("node_modules/braces"))) {
  const directory = resolve(root, location);
  const metadata = JSON.parse(await readFile(resolve(directory, "package.json"), "utf8"));
  if (metadata.version !== "3.0.3") throw new Error(`Review braces mitigation for ${location}@${metadata.version}`);
  const writes = [];
  for (const [name, expected, replacements] of patches) {
    const path = resolve(directory, "lib", name);
    const current = await readFile(path, "utf8");
    const original = digest(current) === expected ? current : replacements.reduceRight(
      (text, [before, after]) => text.replaceAll(after, before), current,
    );
    if (digest(original) !== expected) throw new Error(`Unrecognized braces source: ${path}`);
    const updated = replacements.reduce((text, [before, after]) => text.replaceAll(before, after), original);
    if (current !== original && current !== updated) throw new Error(`Partial braces mitigation: ${path}`);
    writes.push([path, updated]);
  }
  for (const [path, updated] of writes) await writeFile(path, updated);
  patched += 1;
}
if (!patched) throw new Error("braces was not installed; review and remove the obsolete mitigation explicitly");
console.log(`Applied braces depth protection to ${patched} installation(s).`);
