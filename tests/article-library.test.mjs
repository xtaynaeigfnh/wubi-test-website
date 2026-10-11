import assert from "node:assert/strict";
import test from "node:test";
import { isFavoriteArticleIds, normalizeFavoriteArticleIds, selectLibraryArticles } from "../app/article-library.ts";
import { readFavoriteArticleIds, toggleFavoriteArticle } from "../app/article-preferences.ts";
import { createBackupPayload, parseBackupPayload, restoreBackupPayload } from "../app/backup.ts";
import { STORAGE } from "../app/storage.ts";

const articles = [
  { id: "short-1", title: "白板上的空位", length: "short", topic: "办公" },
  { id: "short-2", title: "白板与会议", length: "short", topic: "办公" },
  { id: "custom-1", title: "我的白板练习", length: "medium", topic: "自定义", kind: "custom" },
  { id: "short-3", title: "雨后散步", length: "short", topic: "日常" },
];
const progressMap = new Map([
  ["short-1", { lastPracticed: "2026-10-01T12:00:00.000Z" }],
  ["short-2", { lastPracticed: "2026-10-10T12:00:00.000Z" }],
]);
const select = (overrides = {}) => selectLibraryArticles({
  articles,
  filter: { length: "all", topic: "all", status: "all" },
  progressMap,
  query: "",
  favoriteIds: new Set(["short-1", "custom-1"]),
  favoritesOnly: false,
  sort: "default",
  ...overrides,
}).map((article) => article.id);

test("标题搜索、篇幅、题材、练习状态和收藏条件共同筛选文章", () => {
  assert.deepEqual(select({ query: " 白板 " }), ["short-1", "short-2", "custom-1"]);
  assert.deepEqual(select({ query: "白板", favoritesOnly: true }), ["short-1", "custom-1"]);
  assert.deepEqual(select({ query: "白板", favoritesOnly: true, filter: { length: "short", topic: "办公", status: "practiced" } }), ["short-1"]);
  assert.deepEqual(select({ query: "白板", filter: { length: "all", topic: "all", status: "new" } }), ["custom-1"]);
  assert.deepEqual(select({ favoritesOnly: true, favoriteIds: new Set() }), []);
});

test("最近练习排序按实际练习日期排列，未练习文章保留默认顺序", () => {
  assert.deepEqual(select({ sort: "recent" }), ["short-2", "short-1", "custom-1", "short-3"]);
  assert.deepEqual(select(), articles.map((article) => article.id));
  const invalid = new Map([["short-1", { lastPracticed: "broken" }]]);
  assert.deepEqual(select({ sort: "recent", progressMap: invalid }), articles.map((article) => article.id));
});

test("收藏编号校验限制数量、唯一性与编号长度，本地读取丢弃异常项", () => {
  assert(isFavoriteArticleIds([]));
  assert(!isFavoriteArticleIds(["a", "a"]));
  assert(!isFavoriteArticleIds([""]));
  assert(!isFavoriteArticleIds(["a".repeat(161)]));
  assert(!isFavoriteArticleIds(Array.from({ length: 501 }, (_, i) => `article-${i}`)));
  assert.deepEqual(normalizeFavoriteArticleIds([null, "a", "a", "", 1, "b"]), ["a", "b"]);
});

function withStorage(run) {
  const values = new Map();
  let fail = false;
  globalThis.window = { localStorage: {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      if (fail) throw new DOMException("full", "QuotaExceededError");
      values.set(key, String(value));
    },
    removeItem: (key) => values.delete(key),
  } };
  try { run(values, () => { fail = true; }); }
  finally { delete globalThis.window; }
}

test("旧自定义文章收藏迁移且后续取消收藏不会被旧favorite字段恢复", () => {
  withStorage((values) => {
    values.set(STORAGE.customTexts, JSON.stringify([{ id: "custom-1", favorite: true }, { id: "custom-2" }]));
    assert.deepEqual(readFavoriteArticleIds(), ["custom-1"]);
    assert.equal(toggleFavoriteArticle("short-1").ok, true);
    assert.deepEqual(readFavoriteArticleIds(), ["custom-1", "short-1"]);
    assert.equal(toggleFavoriteArticle("custom-1").ok, true);
    assert.deepEqual(readFavoriteArticleIds(), ["short-1"]);
  });
});

test("收藏从最新存储合并，写入失败时保留之前的收藏与返回状态", () => {
  withStorage((values, fail) => {
    toggleFavoriteArticle("short-1");
    values.set(STORAGE.favoriteArticles, JSON.stringify(["short-1", "short-2"]));
    assert.deepEqual(toggleFavoriteArticle("custom-1").ids, ["short-1", "short-2", "custom-1"]);
    fail();
    const result = toggleFavoriteArticle("short-1");
    assert.equal(result.ok, false);
    assert.match(result.message, /未能保存/);
    assert.deepEqual(result.ids, ["short-1", "short-2", "custom-1"]);
    assert.deepEqual(readFavoriteArticleIds(), result.ids);
  });
});

test("收藏随完整备份恢复，旧备份缺少收藏项仍兼容，异常收藏拒绝恢复", () => {
  withStorage((values) => {
    const payload = createBackupPayload({ [STORAGE.favoriteArticles]: ["short-1", "custom-1"] });
    restoreBackupPayload(payload);
    assert.deepEqual(readFavoriteArticleIds(), ["short-1", "custom-1"]);
    assert.throws(() => parseBackupPayload(createBackupPayload({ [STORAGE.favoriteArticles]: ["a", "a"] })), /格式不正确/);
    restoreBackupPayload(createBackupPayload({}));
    assert.equal(values.has(STORAGE.favoriteArticles), false);
    assert.deepEqual(readFavoriteArticleIds(), []);
  });
});

test("收藏读取被拒绝时不能用空状态覆盖已有收藏", () => {
  withStorage((values) => {
    values.set(STORAGE.favoriteArticles, JSON.stringify(["short-1"]));
    const original = values.get(STORAGE.favoriteArticles);
    window.localStorage.getItem = () => { throw new DOMException("blocked", "SecurityError"); };
    const result = toggleFavoriteArticle("short-2");
    assert.equal(result.ok, false);
    assert.match(result.message, /无法读取/);
    assert.equal(values.get(STORAGE.favoriteArticles), original);
  });
});
