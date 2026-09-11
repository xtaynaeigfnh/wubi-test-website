import assert from "node:assert/strict";
import test from "node:test";

import { readSettings } from "../app/lib.ts";
import { defaultCustomTheme } from "../app/practice-schema.ts";
import { STORAGE } from "../app/storage.ts";

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
