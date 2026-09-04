import assert from "node:assert/strict";
import test from "node:test";

function jsonResponse(value, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => value,
  };
}

const articleMetadata = {
  id: "short-001",
  title: "测试文章",
  length: "short",
  topic: "测试",
  wordCount: 4,
  version: 1,
};

test("内容加载成功后复用同一份缓存", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    return jsonResponse([articleMetadata]);
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
      : jsonResponse([articleMetadata]);
  };

  const { loadArticleMetadata } = await import(
    `../app/content-loader.ts?retry=${Date.now()}`
  );
  await assert.rejects(loadArticleMetadata(), /文章索引加载失败（HTTP 503）/);
  const metadata = await loadArticleMetadata();

  assert.equal(requests, 2);
  assert.deepEqual(metadata, [articleMetadata]);
});

test("HTTP 200 的错误结构会清除缓存并允许重试", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    return jsonResponse(
      requests === 1 ? { unexpected: true } : [["测", "im", 100]],
    );
  };

  const { loadWubi } = await import(
    `../app/content-loader.ts?invalid-structure=${Date.now()}`
  );
  await assert.rejects(loadWubi(), /五笔码表内容损坏，无法解析/);
  const entries = await loadWubi();

  assert.equal(requests, 2);
  assert.deepEqual(entries, [["测", "im", 100]]);
});

test("所有非文章加载入口都拒绝错误结构", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async () => jsonResponse({ unexpected: true });
  const loader = await import(
    `../app/content-loader.ts?all-invalid=${Date.now()}`
  );

  await assert.rejects(loader.loadArticleMetadata(), /文章索引内容损坏/);
  await assert.rejects(loader.loadCommonCharacters(), /常用字表内容损坏/);
  await assert.rejects(loader.loadWubiChallenge(), /挑战题库内容损坏/);
});

test("文章索引缺少对应正文时拒绝加载并可重试", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  let round = 0;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("articles-index.json")) {
      return jsonResponse([articleMetadata]);
    }
    if (String(url).endsWith("articles-short.json")) {
      round += 1;
      return jsonResponse(
        round === 1 ? [] : [{ id: "short-001", text: "用于测试" }],
      );
    }
    return jsonResponse([]);
  };

  const { loadArticles } = await import(
    `../app/content-loader.ts?missing-body=${Date.now()}`
  );
  await assert.rejects(loadArticles(), /文章索引与正文数据不一致/);
  const articles = await loadArticles();

  assert.equal(round, 2);
  assert.deepEqual(articles, [{ ...articleMetadata, text: "用于测试" }]);
});
