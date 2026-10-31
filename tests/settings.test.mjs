import assert from "node:assert/strict";
import test from "node:test";

import { readSettings } from "../app/lib.ts";
import { defaultCustomTheme, defaultSettings, isSettings, normalizeBackupSettings } from "../app/practice-schema.ts";
import { STORAGE } from "../app/storage.ts";
import { mergeSettingsChanges, saveSettingsChanges } from "../app/settings-sync.ts";

test("修改设置只合并本次改变的字段，保留其他窗口的偏好与自定义颜色", () => {
  const previous = { ...defaultSettings, customTheme: { ...defaultCustomTheme } };
  const latest = { ...previous, showCodeHints: true, sound: true, customTheme: { ...previous.customTheme, canvas: "#123456" } };
  const next = { ...previous, theme: "dark", customTheme: { ...previous.customTheme, accent: "#654321" } };
  assert.deepEqual(mergeSettingsChanges(latest, previous, next), {
    ...latest,
    theme: "dark",
    customTheme: { accent: "#654321", canvas: "#123456" },
  });
});

test("设置保存读取最新存储，失败不返回未保存状态或覆盖原数据", () => {
  const previous = { ...defaultSettings };
  let stored = JSON.stringify({ ...previous, showCodeHints: true });
  let blocked = false;
  globalThis.window = { localStorage: {
    getItem: () => stored,
    setItem: (_key, value) => { if (blocked) throw new Error("quota"); stored = value; },
  } };
  try {
    const saved = saveSettingsChanges(previous, { ...previous, theme: "dark" });
    assert.equal(saved.showCodeHints, true);
    assert.equal(saved.theme, "dark");
    const beforeFailure = stored;
    blocked = true;
    assert.equal(saveSettingsChanges(saved, { ...saved, sound: true }), null);
    assert.equal(stored, beforeFailure);
  } finally { delete globalThis.window; }
});

test("设置存储不可读取时不使用默认设置覆盖已有偏好", () => {
  let writes = 0;
  globalThis.window = { localStorage: {
    getItem: () => { throw new Error("denied"); },
    setItem: () => { writes += 1; },
  } };
  try {
    assert.equal(saveSettingsChanges(defaultSettings, { ...defaultSettings, theme: "dark" }), null);
    assert.equal(writes, 0);
  } finally { delete globalThis.window; }
});

test("settings read old and new themes while normalizing custom colors", () => {
  const values = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
    },
  };
  try {
    for (const theme of [
      "system",
      "light",
      "dark",
      "bamboo",
      "qingdai",
    ]) {
      values.set(STORAGE.settings, JSON.stringify({ theme }));
      assert.equal(readSettings().theme, theme);
      assert.deepEqual(readSettings().customTheme, defaultCustomTheme);
    }

    values.set(
      STORAGE.settings,
      JSON.stringify({
        fontSize: 34,
        theme: "custom",
        customTheme: { accent: "#12aBcF", canvas: "not-a-color" },
      }),
    );
    assert.deepEqual(readSettings(), {
      petEnabled: false,
      petSpecies: "cat",
      fontSize: 34,
      preferredLength: "all",
      showCodeHints: false,
      showGhostGap: true,
      sound: false,
      skin: "letterpress",
      theme: "custom",
      customTheme: {
        accent: "#12aBcF",
        canvas: defaultCustomTheme.canvas,
      },
      autoNext: false,
    });

    values.set(
      STORAGE.settings,
      JSON.stringify({ theme: "unknown", customTheme: null }),
    );
    assert.equal(readSettings().theme, "system");
    assert.deepEqual(readSettings().customTheme, defaultCustomTheme);
  } finally {
    delete globalThis.window;
  }
});

test("首次访问默认拆字版，旧设置缺少皮肤时保留原外观", () => {
  let stored = null;
  globalThis.window = { localStorage: { getItem: () => stored } };
  try {
    assert.equal(readSettings().skin, "roots");
    stored = JSON.stringify({ theme: "dark" });
    assert.equal(readSettings().skin, "letterpress");
  } finally { delete globalThis.window; }
});

test("皮肤选择兼容旧设置和无效值，保留独立配色与练习偏好", () => {
  let stored = {};
  globalThis.window = { localStorage: { getItem: () => JSON.stringify(stored) } };
  try {
    for (const skin of [undefined, null, "unknown", {}, "letterpress", "focus", "roots"]) {
      stored = { skin, theme: "dark", fontSize: 34, sound: true };
      const settings = readSettings();
      assert.equal(settings.skin, skin === "focus" || skin === "roots" ? skin : "letterpress");
      assert.equal(settings.theme, "dark");
      assert.equal(settings.fontSize, 34);
      assert.equal(settings.sound, true);
      assert.equal(isSettings(settings), true);
      assert.equal(normalizeBackupSettings(stored).skin, settings.skin);
    }
    assert.equal(isSettings({ ...defaultSettings, skin: "unknown" }), false);
    const legacy = { ...defaultSettings };
    delete legacy.skin;
    assert.equal(isSettings(legacy), true);
    stored = { skin: "focus", theme: "custom", customTheme: { accent: "#123456", canvas: "#EEEEEE" } };
    assert.deepEqual(readSettings().customTheme, stored.customTheme);
  } finally {
    delete globalThis.window;
  }
});

test("pet preferences preserve choices and normalize old or invalid local values", () => {
  let stored = {};
  globalThis.window = { localStorage: { getItem: () => JSON.stringify(stored) } };
  try {
    assert.equal(readSettings().petEnabled, false);
    assert.equal(readSettings().petSpecies, "cat");
    for (const species of ["cat", "dog", "rabbit"]) {
      stored = { petEnabled: false, petSpecies: species };
      assert.equal(readSettings().petEnabled, false);
      assert.equal(readSettings().petSpecies, species);
    }
    stored = { petEnabled: true, petSpecies: "cat" };
    assert.equal(readSettings().petEnabled, true);
    stored = { petEnabled: "false", petSpecies: "dragon" };
    assert.equal(readSettings().petEnabled, false);
    assert.equal(readSettings().petSpecies, "cat");
  } finally {
    delete globalThis.window;
  }
});
