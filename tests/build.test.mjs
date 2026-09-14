import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { generateOfflineAssets } from "../scripts/generate-offline-assets.mjs";

test("offline builds include lazy chunks and route payloads before their first visit", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "wubi-offline-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const worker = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
  const files = {
    "sw.js": worker,
    "_next/static/chunks/lazy.js": "export const challenge = true;",
    "_next/static/chunks/lazy.js.map": "source map",
    "assets/lazy-vinext.js": "export const modal = true;",
    "advanced/index.txt": "static route payload",
    "audio/track.mp3": "optional music",
  };
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(root, path, ".."), { recursive: true });
    await writeFile(join(root, path), content);
  }
  const assets = await generateOfflineAssets(root);
  assert.deepEqual(assets, ["/_next/static/chunks/lazy.js", "/advanced/index.txt", "/assets/lazy-vinext.js"]);
  const generated = await readFile(join(root, "sw.js"), "utf8");
  await generateOfflineAssets(root);
  assert.equal(await readFile(join(root, "sw.js"), "utf8"), generated);
  await writeFile(join(root, "advanced/index.txt"), "updated route payload");
  await generateOfflineAssets(root);
  assert.notEqual(await readFile(join(root, "sw.js"), "utf8"), generated);

  for (const base of ["", "/wubi"]) {
    const listeners = new Map();
    const entries = new Map();
    const cache = {
      addAll: async (paths) => { for (const path of paths) entries.set(path, new Response(path)); },
      match: async (request, options) => {
        const url = new URL(typeof request === "string" ? request : request.url, "https://example.com");
        return entries.get(url.pathname + (options?.ignoreSearch ? "" : url.search))?.clone();
      },
    };
    runInNewContext(generated, {
      URL, Request, Response,
      caches: { open: async () => cache, match: cache.match },
      fetch: async () => { throw new Error("offline"); },
      self: {
        registration: { scope: `https://example.com${base}/` },
        location: { origin: "https://example.com" },
        addEventListener: (name, handler) => listeners.set(name, handler),
      },
    });
    let installation;
    listeners.get("install")({ waitUntil: (promise) => { installation = promise; } });
    await installation;
    for (const path of ["/_next/static/chunks/lazy.js", "/advanced/index.txt?_rsc=first-visit"]) {
      let response;
      let background;
      listeners.get("fetch")({
        request: new Request(`https://example.com${base}${path}`),
        respondWith: (promise) => { response = promise; },
        waitUntil: (promise) => { background = promise; },
      });
      assert.equal(await (await response).text(), `${base}${path.split("?")[0]}`);
      await background;
    }
  }
});

test("Pages metadata uses the configured deployment origin and base path", async () => {
  const workflow = await readFile(new URL("../.github/workflows/pages.yml", import.meta.url), "utf8");
  assert.match(workflow, /id: pages\s+uses: actions\/configure-pages@v5/);
  assert.match(workflow, /NEXT_PUBLIC_SITE_URL: \$\{\{ steps\.pages\.outputs\.origin \}\}/);
  assert.match(workflow, /NEXT_PUBLIC_BASE_PATH: \$\{\{ steps\.pages\.outputs\.base_path \}\}/);
});

test("build lifecycle stays cross-platform and project-rooted", async () => {
  const [packageText, viteConfig, nextConfig] = await Promise.all([
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../vite.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../next.config.ts", import.meta.url), "utf8"),
  ]);
  const packageJson = JSON.parse(packageText);

  assert.equal(packageJson.scripts.dev, "vinext dev");
  assert.equal(packageJson.scripts.build, "vinext build");
  assert.equal(packageJson.scripts.postbuild, "node scripts/generate-offline-assets.mjs dist/client");
  assert.equal(packageJson.scripts["postbuild:pages"], "node scripts/generate-offline-assets.mjs out");
  assert.equal(packageJson.scripts.start, "vinext start");
  assert.equal(packageJson.scripts.typecheck, "next typegen && tsc --noEmit");
  assert.ok(
    viteConfig.indexOf("process.env.WRANGLER_LOG_PATH ??=") <
      viteConfig.indexOf('await import("@cloudflare/vite-plugin")'),
  );
  assert.match(nextConfig, /turbopack:\s*\{\s*root: process\.cwd\(\)/);
});
