import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { saveNativeFile } from "../app/platform.ts";

function flags(platform) {
  return JSON.parse(execFileSync(process.execPath, ["--import", "./scripts/app-build-env.mjs", "--input-type=module", "-e", 'const p = await import("./app/platform.ts"); console.log(JSON.stringify({ ios: p.isIOSApp, desktop: p.isDesktopApp, native: p.isNativeApp, base: process.env.NEXT_PUBLIC_BASE_PATH }));'], {
    encoding: "utf8", env: { ...process.env, WUBI_APP_PLATFORM: platform, NEXT_PUBLIC_BASE_PATH: "/old-deploy" },
  }));
}

test("iPhone build uses native file IO without desktop commands or deployment prefixes", () => {
  assert.deepEqual(flags("ios"), { ios: true, desktop: false, native: true, base: "" });
  assert.deepEqual(flags("macos"), { ios: false, desktop: true, native: true, base: "" });
  assert.deepEqual(flags("windows"), { ios: false, desktop: true, native: true, base: "" });
});

test("iOS file URIs pass through unchanged and only successful writes report saved", async () => {
  const uri = "file:///private/var/mobile/备份.json";
  assert.equal(await saveNativeFile("备份.json", new Blob(["五笔"]), {
    choosePath: async () => uri,
    write: async (path, bytes) => {
      assert.equal(path, uri);
      assert.equal(new TextDecoder().decode(bytes), "五笔");
    },
  }), "saved");
});

test("iOS config removes desktop minimum window size and builds iPhone assets explicitly", async () => {
  const config = JSON.parse(await readFile(new URL("../src-tauri/tauri.ios.conf.json", import.meta.url), "utf8"));
  assert.equal(config.build.beforeBuildCommand, "npm run build:ios:web");
  assert.equal(config.build.beforeDevCommand, "npm run build:ios:web");
  assert.equal(config.productName, "WubiPractice");
  const plist = await readFile(new URL("../src-tauri/Info.ios.plist", import.meta.url), "utf8");
  assert.match(plist, /CFBundleDisplayName<\/key>\s*<string>五笔练习<\/string>/);
  assert.equal(config.app.windows[0].minWidth, undefined);
  assert.equal(config.app.windows[0].create, false);
  assert.equal(config.bundle.iOS.minimumSystemVersion, "15.0");
});
