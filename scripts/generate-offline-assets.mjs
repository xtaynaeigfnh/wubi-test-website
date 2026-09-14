import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export async function generateOfflineAssets(directory) {
  const root = resolve(directory);
  const assets = [];
  async function visit(relative = "") {
    for (const entry of await readdir(resolve(root, relative), { withFileTypes: true })) {
      const path = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile() && (
        path.startsWith("_next/static/") || path.startsWith("assets/") || path.endsWith(".txt")
      ) && !path.endsWith(".map")) {
        assets.push(`/${path}`);
      }
    }
  }
  await visit();
  assets.sort();
  if (!assets.some((path) => path.endsWith(".js"))) {
    throw new Error(`No built JavaScript assets found in ${root}`);
  }
  const workerPath = resolve(root, "sw.js");
  const source = await readFile(workerPath, "utf8");
  if (!/const BUILD_ASSETS = \[[\s\S]*?\];/.test(source) ||
      !/const CACHE_NAME = "wubi-test-v21(?:-[a-f0-9]+)?";/.test(source)) {
    throw new Error("Missing offline build placeholders");
  }
  const hash = createHash("sha256").update(JSON.stringify(assets));
  for (const asset of assets) hash.update(await readFile(resolve(root, asset.slice(1))));
  const worker = source
    .replace(/const CACHE_NAME = "wubi-test-v21(?:-[a-f0-9]+)?";/, `const CACHE_NAME = "wubi-test-v21-${hash.digest("hex").slice(0, 16)}";`)
    .replace(/const BUILD_ASSETS = \[[\s\S]*?\];/, `const BUILD_ASSETS = ${JSON.stringify(assets)};`);
  await writeFile(workerPath, worker);
  return assets;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.argv[2]) throw new Error("Usage: generate-offline-assets.mjs <build-directory>");
  const assets = await generateOfflineAssets(process.argv[2]);
  console.log(`Prepared ${assets.length} offline build assets.`);
}
