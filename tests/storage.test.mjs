import assert from "node:assert/strict";
import test from "node:test";

import * as legacy from "../app/lib.ts";
import {
  STORAGE,
  STORAGE_KEYS,
  commitLocalWrites,
  readLocal,
  readLocalArray,
  takeSessionValue,
  writeLocal,
  writeSessionValue,
} from "../app/storage.ts";

function installWindow(context, value) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value,
  });
  context.after(() => {
    if (original) Object.defineProperty(globalThis, "window", original);
    else delete globalThis.window;
  });
}

function memoryStorage(entries = []) {
  const values = new Map(entries);
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

test("旧入口继续提供相同的存储键和公开读写函数", () => {
  for (const [name, value] of Object.entries({
    STORAGE,
    STORAGE_KEYS,
    readLocal,
    readLocalArray,
    takeSessionValue,
    writeLocal,
    writeSessionValue,
  })) {
    assert.strictEqual(legacy[name], value, name);
  }
  assert.equal(STORAGE.progress, "wubi-test:article-progress:v1");
  assert.deepEqual(STORAGE_KEYS, Object.values(STORAGE));
});

test("没有浏览器环境时读取使用回退值且写入安全失败", (context) => {
  installWindow(context, undefined);
  const fallback = { missing: true };
  assert.strictEqual(readLocal("missing", fallback), fallback);
  assert.deepEqual(readLocalArray("missing"), []);
  assert.equal(writeLocal("value", { ok: true }), false);
  assert.equal(writeSessionValue("pending", "value"), false);
  assert.equal(takeSessionValue("pending"), null);
  assert.equal(commitLocalWrites(new Map([["value", 1]])), false);
});

test("本地读取为缺失、损坏和 null 数据提供回退并保留合法假值", (context) => {
  const storage = memoryStorage([
    ["damaged", "{"],
    ["null", "null"],
    ["empty", ""],
    ["false", "false"],
    ["zero", "0"],
    ["string", '""'],
    ["object", '{"ok":true}'],
  ]);
  installWindow(context, { localStorage: storage });
  const fallback = { missing: true };
  for (const key of ["missing", "damaged", "null", "empty"]) {
    assert.strictEqual(readLocal(key, fallback), fallback);
  }
  assert.equal(readLocal("false", fallback), false);
  assert.equal(readLocal("zero", fallback), 0);
  assert.equal(readLocal("string", fallback), "");
  assert.deepEqual(readLocal("object", fallback), { ok: true });
});

test("数组读取拒绝非数组数据并保留数组内容", (context) => {
  const storage = memoryStorage([
    ["array", '[1,"字",null]'],
    ["object", "{}"],
    ["string", '"字"'],
    ["number", "1"],
    ["null", "null"],
    ["damaged", "["],
  ]);
  installWindow(context, { localStorage: storage });
  for (const key of ["missing", "object", "string", "number", "null", "damaged"]) {
    assert.deepEqual(readLocalArray(key), []);
  }
  assert.deepEqual(readLocalArray("array"), [1, "字", null]);
});

test("浏览器拒绝访问或读写存储时所有基础 API 安全返回", (context) => {
  const blocked = () => {
    throw new DOMException("blocked", "SecurityError");
  };
  const browser = {};
  installWindow(context, browser);
  for (const property of ["localStorage", "sessionStorage"]) {
    Object.defineProperty(browser, property, { configurable: true, get: blocked });
  }
  function assertSafeFailure() {
    assert.equal(readLocal("key", "fallback"), "fallback");
    assert.deepEqual(readLocalArray("key"), []);
    assert.equal(writeLocal("key", 1), false);
    assert.equal(writeSessionValue("key", "value"), false);
    assert.equal(takeSessionValue("key"), null);
    assert.equal(commitLocalWrites(new Map([["key", 1]])), false);
  }
  assertSafeFailure();
  for (const property of ["localStorage", "sessionStorage"]) {
    Object.defineProperty(browser, property, {
      configurable: true,
      value: { getItem: blocked, setItem: blocked, removeItem: blocked },
    });
  }
  assertSafeFailure();
});

test("本地写入持久化 JSON 且序列化失败不会覆盖原值", (context) => {
  const storage = memoryStorage([["value", "original"]]);
  installWindow(context, { localStorage: storage });
  const circular = {};
  circular.self = circular;
  assert.equal(writeLocal("value", circular), false);
  assert.equal(writeLocal("value", 1n), false);
  assert.equal(storage.values.get("value"), "original");
  assert.equal(writeLocal("value", { text: "五笔", count: 2 }), true);
  assert.equal(storage.values.get("value"), '{"text":"五笔","count":2}');
  assert.deepEqual(readLocal("value", null), { text: "五笔", count: 2 });
});

test("临时会话值按原字符串写入并只消费一次", (context) => {
  const storage = memoryStorage();
  installWindow(context, { sessionStorage: storage });
  const value = '{ "text": "五笔" }';
  assert.equal(writeSessionValue("pending", value), true);
  assert.equal(takeSessionValue("pending"), value);
  assert.equal(takeSessionValue("pending"), null);
  assert.equal(writeSessionValue("pending", ""), true);
  assert.equal(takeSessionValue("pending"), "");
  assert.equal(takeSessionValue("pending"), null);
});

test("临时会话值无法删除时返回 null 且保留待消费值", (context) => {
  const storage = memoryStorage([["pending", "value"]]);
  storage.removeItem = () => {
    throw new DOMException("blocked", "SecurityError");
  };
  installWindow(context, { sessionStorage: storage });
  assert.equal(takeSessionValue("pending"), null);
  assert.equal(storage.values.get("pending"), "value");
});

test("事务读取旧值失败时不写入或删除任何键", (context) => {
  const storage = memoryStorage([["first", "old"]]);
  const read = storage.getItem;
  storage.getItem = (key) => {
    if (key === "second") throw new Error("read denied");
    return read(key);
  };
  const mutations = [];
  storage.setItem = (...args) => mutations.push(["set", ...args]);
  storage.removeItem = (...args) => mutations.push(["remove", ...args]);
  installWindow(context, { localStorage: storage });
  assert.equal(commitLocalWrites(new Map([["first", 1], ["second", 2]])), false);
  assert.deepEqual(mutations, []);
  assert.deepEqual([...storage.values], [["first", "old"]]);
});

test("事务成功时写入全部键并保留无关数据", (context) => {
  const storage = memoryStorage([["first", "old"], ["untouched", "keep"]]);
  installWindow(context, { localStorage: storage });
  assert.equal(commitLocalWrites(new Map([["first", { count: 2 }], ["second", [1, 2]]])), true);
  assert.equal(storage.values.get("first"), '{"count":2}');
  assert.equal(storage.values.get("second"), "[1,2]");
  assert.equal(storage.values.get("untouched"), "keep");
  assert.equal(commitLocalWrites(new Map()), true);
});

test("多键事务中途写入失败时恢复原字符串并删除原先缺失的键", (context) => {
  const original = '{ "count": 1 }';
  const storage = memoryStorage([["existing", original], ["failing", "damaged{"]]);
  const write = storage.setItem;
  storage.setItem = (key, value) => {
    if (key === "failing" && value === "3") throw new Error("quota exceeded");
    write(key, value);
  };
  installWindow(context, { localStorage: storage });
  assert.equal(commitLocalWrites(new Map([
    ["existing", { count: 2 }],
    ["new", [1]],
    ["failing", 3],
  ])), false);
  assert.deepEqual([...storage.values], [["existing", original], ["failing", "damaged{"]]);
});

test("事务中途序列化失败同样回滚已写入数据", (context) => {
  const storage = memoryStorage([["existing", "original"]]);
  installWindow(context, { localStorage: storage });
  const circular = {};
  circular.self = circular;
  assert.equal(commitLocalWrites(new Map([
    ["existing", "changed"],
    ["new", 1],
    ["invalid", circular],
  ])), false);
  assert.deepEqual([...storage.values], [["existing", "original"]]);
});

test("事务写入和回滚均失败时返回 false 而不抛出异常", (context) => {
  const storage = memoryStorage([["existing", "original"]]);
  const write = storage.setItem;
  storage.setItem = (key, value) => {
    if (key === "failing" || value === "original") throw new Error("storage unavailable");
    write(key, value);
  };
  installWindow(context, { localStorage: storage });
  assert.equal(commitLocalWrites(new Map([["existing", "changed"], ["failing", 2]])), false);
});
