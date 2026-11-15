import assert from "node:assert/strict";
import test from "node:test";
import { saveNativeFile, isExternalUrl } from "../app/platform.ts";
import { allowDesktopExit, registerExitGuard } from "../app/desktop-exit.ts";

const unexpected = async () => { throw new Error("unexpected dialog"); };

test("native file cancellation never writes or claims a saved file", async () => {
  assert.equal(await saveNativeFile("备份.json", new Blob(["{}"]), {
    choosePath: async () => null, write: unexpected,
  }), "cancelled");
});

test("native file save preserves Unicode bytes and waits for disk success", async () => {
  let written = false;
  assert.equal(await saveNativeFile("备份.json", new Blob(["五笔"]), {
    choosePath: async (name) => { assert.equal(name, "备份.json"); return "/tmp/备份.json"; },
    write: async (path, bytes) => {
      assert.equal(path, "/tmp/备份.json");
      assert.equal(new TextDecoder().decode(bytes), "五笔");
      await Promise.resolve();
      written = true;
    },
  }), "saved");
  assert.equal(written, true);
});

test("native save failure propagates instead of recording successful backup", async () => {
  await assert.rejects(saveNativeFile("备份.json", new Blob(["{}"]), {
    choosePath: async () => "/readonly/备份.json",
    write: async () => { throw new Error("permission denied"); },
  }), /permission denied/);
});

test("pending result takes precedence over abandoning a practice", async () => {
  const a = registerExitGuard({ kind: "practice", message: "放弃？", onDiscard: () => assert.fail("discarded") });
  const b = registerExitGuard({ kind: "pending", message: "先保存" });
  try {
    assert.equal(await allowDesktopExit({ alert: async (text) => assert.equal(text, "先保存"), confirm: unexpected }), false);
  } finally { a(); b(); }
});

test("cancelled exit retains practice; confirmed exit discards and permits closing", async () => {
  let discarded = 0;
  const release = registerExitGuard({ kind: "practice", message: "放弃？", onDiscard: () => discarded++ });
  try {
    assert.equal(await allowDesktopExit({ alert: unexpected, confirm: async () => false }), false);
    assert.equal(discarded, 0);
    assert.equal(await allowDesktopExit({ alert: unexpected, confirm: async () => true }), true);
    assert.equal(discarded, 1);
  } finally { release(); }
  assert.equal(await allowDesktopExit({ alert: unexpected, confirm: unexpected }), true);
});

test("saving that starts during the quit dialog still prevents exit", async () => {
  const release = registerExitGuard({ kind: "practice", message: "放弃？", onDiscard: () => assert.fail("discarded") });
  let releasePending;
  try {
    assert.equal(await allowDesktopExit({ alert: async (text) => assert.equal(text, "保存中"), confirm: async () => {
      releasePending = registerExitGuard({ kind: "pending", message: "保存中" });
      return true;
    } }), false);
  } finally { release(); releasePending?.(); }
});

test("external link classification keeps app routes local", () => {
  assert.equal(isExternalUrl("/settings/", "tauri://localhost/"), false);
  assert.equal(isExternalUrl("https://example.com", "tauri://localhost/"), true);
  assert.equal(isExternalUrl("mailto:hello@example.com", "tauri://localhost/"), true);
  assert.equal(isExternalUrl("javascript:alert(1)", "tauri://localhost/"), false);
});

test("queued storage writes block native exit until success or failure settles", async () => {
  const { withStorageWriteLock } = await import("../app/storage-lock.ts");
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  try {
    for (const fail of [false, true]) {
      let finish;
      Object.defineProperty(globalThis, "navigator", { configurable: true, value: { locks: {
        request: (_, operation) => new Promise((resolve, reject) => {
          finish = () => fail ? reject(new Error("write failed")) : resolve(operation());
        }),
      } } });
      const write = withStorageWriteLock(() => 42);
      let alerts = 0;
      assert.equal(await allowDesktopExit({ alert: async () => { alerts++; }, confirm: unexpected }), false);
      assert.equal(alerts, 1);
      finish();
      if (fail) await assert.rejects(write, /write failed/);
      else assert.equal(await write, 42);
      assert.equal(await allowDesktopExit({ alert: unexpected, confirm: unexpected }), true);
    }
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "navigator", descriptor);
    else delete globalThis.navigator;
  }
});
