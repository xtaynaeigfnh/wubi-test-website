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
  assert.match(html, /进阶训练/);
  assert.match(html, /五笔查码/);
  assert.match(html, /本地成绩/);
  assert.match(html, /专注电台/);
  assert.match(html, /300 篇练习文章/);
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
  assert.match(html, /不催促，只看见节奏/);
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
});

test("history route server-renders the journal and deferred weekly report", async () => {
  const response = await render("/history");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /每一次练习，都算数/);
  assert.match(html, /id="history-weekly" hidden/);
  assert.match(html, /你的进步，从第一行字开始/);
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
