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
  for (const pathname of ["/training", "/challenge", "/lookup", "/history", "/summary", "/settings"]) {
    const response = await render(pathname);
    assert.equal(response.status, 200, pathname);
    const html = await response.text();
    assert.match(html, /五笔测试网站/, pathname);
  }
});

test("keyboard summary route server-renders its analysis shell", async () => {
  const response = await render("/summary");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /按键使用画像/);
  assert.match(html, /键盘热力图/);
  assert.match(html, /左右手均衡/);
  assert.match(html, /不同位置按键使用率/);
  assert.match(html, /手指使用率（分区）/);
  assert.match(html, /窄屏可左右滑动查看完整键盘/);
});

test("history route server-renders the weekly report shell", async () => {
  const response = await render("/history");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /能力周报 · V0\.6/);
  assert.match(html, /正在读取本机数据并生成本周周报/);
});

test("settings route server-renders every theme preset", async () => {
  const response = await render("/settings");
  assert.equal(response.status, 200);
  const html = await response.text();

  assert.match(html, /主题预设/);
  for (const [value, label] of [
    ["system", "系统"],
    ["light", "浅色"],
    ["dark", "深色"],
    ["bamboo", "竹纸"],
    ["qingdai", "青黛"],
    ["custom", "自定义"],
  ]) {
    assert.match(html, new RegExp(`data-theme-option="${value}"`));
    assert.match(html, new RegExp(`>${label}<`));
  }
  assert.match(html, /即时预览/);
  assert.match(html, /普通文字/);
  assert.match(html, /练习区域/);
});
