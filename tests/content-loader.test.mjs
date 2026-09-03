import assert from "node:assert/strict";
import test from "node:test";

function jsonResponse(value, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => value,
  };
}

test("内容加载成功后复用同一份缓存", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    return jsonResponse([{ id: "short-001", title: "测试文章" }]);
  };

  const { loadArticleMetadata } = await import(
    `../app/content-loader.ts?cache=${Date.now()}`
  );
  const [first, second] = await Promise.all([
    loadArticleMetadata(),
    loadArticleMetadata(),
  ]);

  assert.equal(requests, 1);
  assert.strictEqual(first, second);
});

test("内容加载失败后清除缓存并允许重试", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    return requests === 1
      ? jsonResponse(null, 503)
      : jsonResponse([{ id: "short-001", title: "测试文章" }]);
  };

  const { loadArticleMetadata } = await import(
    `../app/content-loader.ts?retry=${Date.now()}`
  );
  await assert.rejects(loadArticleMetadata(), /文章索引加载失败（HTTP 503）/);
  const metadata = await loadArticleMetadata();

  assert.equal(requests, 2);
  assert.deepEqual(metadata, [{ id: "short-001", title: "测试文章" }]);
});
