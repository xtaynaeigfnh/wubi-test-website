import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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
  assert.equal(packageJson.scripts.start, "vinext start");
  assert.equal(packageJson.scripts.typecheck, "next typegen && tsc --noEmit");
  assert.ok(
    viteConfig.indexOf("process.env.WRANGLER_LOG_PATH ??=") <
      viteConfig.indexOf('await import("@cloudflare/vite-plugin")'),
  );
  assert.match(nextConfig, /turbopack:\s*\{\s*root: process\.cwd\(\)/);
});
