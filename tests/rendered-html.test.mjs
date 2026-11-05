import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { startPreviewServer, assertServerRunning, stopDevServer } from "../scripts/browser-test-server.mjs";

// Exercise the built Worker in its real runtime, including asset bindings.
// Importing a Workers bundle directly into Node cannot resolve cloudflare:workers.
let server;
const base = "http://127.0.0.1:4177";
before(async () => {
  server = startPreviewServer(4177);
  for (let attempt = 0; attempt < 120; attempt += 1) {
    assertServerRunning(server);
    try {
      const response = await fetch(base, { signal: AbortSignal.timeout(3000) });
      await response.arrayBuffer();
      if (response.ok) return;
    } catch { /* The preview process may still be starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("生产预览服务器未启动");
});
after(async () => { await stopDevServer(server); });

async function render(pathname = "/") {
  return fetch(`${base}${pathname}`, {
    headers: { accept: "text/html" },
    signal: AbortSignal.timeout(15000),
  });
}

test("server-renders the finished Chinese product shell", async () => {
  const response = await render("/");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="zh-CN" data-skin="letterpress"/);
  assert.match(html, /<title>五笔测试网站<\/title>/);
  assert.match(html, /文章测速/);
  assert.match(html, /进阶训练/);
  assert.match(html, /五笔查码/);
  assert.match(html, /成绩统计/);
  assert.match(html, /专注电台/);
  assert.match(html, /300 篇练习文章/);
  assert.match(html, /<aside class="first-use-entry" aria-hidden="true" style="visibility:hidden"><button[^>]*disabled[^>]*>首次使用引导<\/button><\/aside>/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("all planned routes render successfully", async () => {
  for (const pathname of ["/training", "/advanced", "/challenge", "/lookup", "/history", "/summary", "/settings"]) {
    const response = await render(pathname);
    assert.equal(response.status, 200, pathname);
    const html = await response.text();
    assert.match(html, /五笔测试网站/, pathname);
  }
});

test("advanced route server-renders the quiet training shell", async () => {
  const response = await render("/advanced");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /静流 · 高手进阶/);
  assert.match(html, /进阶训练/);
  assert.match(html, /进阶训练模块/);
});

test("training route server-renders the spaced review empty state", async () => {
  const response = await render("/training");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /间隔复习/);
  assert.match(html, /每日上限(?:\s|<!-- -->)*12(?:\s|<!-- -->)*项/);
  assert.match(html, /今天没有待处理的到期项/);
});

test("keyboard summary route server-renders its analysis shell", async () => {
  const response = await render("/summary");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /按键使用画像/);
  assert.match(html, /键盘热力图/);
  assert.match(html, /按键使用概览/);
  assert.match(html, /点选键位查看详情/);
  assert.match(html, /左右滑动查看完整键盘/);
  assert.match(html, /按键统计/);
  assert.match(html, /id="history-keys"/);
});

test("history route server-renders the journal and deferred weekly report", async () => {
  const response = await render("/history");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /成绩统计/);
  assert.match(html, /id="history-weekly" hidden/);
  assert.match(html, /你的进步，从第一行字开始/);
  assert.match(html, /正在读取本机数据并生成本周周报/);
  assert.match(html, /按键统计/);
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
