import assert from "node:assert/strict";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${pathname}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the finished Chinese product shell", async () => {
  const response = await render("/");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="zh-CN"/);
  assert.match(html, /<title>五笔测试网站<\/title>/);
  assert.match(html, /文章测速/);
  assert.match(html, /字码挑战/);
  assert.match(html, /五笔查码/);
  assert.match(html, /本地成绩/);
  assert.match(html, /专注电台/);
  assert.match(html, /300 篇练习文章/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("all planned routes render successfully", async () => {
  for (const pathname of ["/training", "/challenge", "/lookup", "/history", "/settings"]) {
    const response = await render(pathname);
    assert.equal(response.status, 200, pathname);
    const html = await response.text();
    assert.match(html, /五笔测试网站/, pathname);
  }
});
