import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, readFileSync, renameSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} 失败：${result.status ?? result.signal}`);
}

const extraArgs = process.argv.slice(2);
const windows = process.platform === "win32";
const packageDmg = !windows && extraArgs.length === 0;
run(process.execPath, [
  "node_modules/@tauri-apps/cli/tauri.js", "build",
  ...(windows ? [] : ["--target", "aarch64-apple-darwin"]),
  ...(packageDmg ? ["--bundles", "app"] : extraArgs), "--", "--locked",
], {
  env: {
    ...process.env,
    WUBI_APP_PLATFORM: windows ? "windows" : "macos",
    PATH: `${join(homedir(), ".cargo", "bin")}${delimiter}${process.env.PATH ?? ""}`,
  },
});

if (packageDmg) {
  // Use a plain drag-to-Applications disk image. Finder layout AppleScript can
  // fail on unattended/locked desktops; disk image creation needs no GUI access.
  const { version } = JSON.parse(readFileSync("package.json", "utf8"));
  const bundle = resolve("src-tauri/target/aarch64-apple-darwin/release/bundle");
  const temporary = mkdtempSync(join(tmpdir(), "wubi-dmg-"));
  try {
    const staging = join(temporary, "stage");
    mkdirSync(staging);
    run("ditto", [join(bundle, "macos/五笔练习.app"), join(staging, "五笔练习.app")]);
    symlinkSync("/Applications", join(staging, "Applications"));
    const image = join(temporary, "五笔练习.dmg");
    run("hdiutil", ["create", "-volname", "五笔练习", "-srcfolder", staging, "-format", "UDZO", image]);
    const destination = join(bundle, "dmg", `五笔练习_${version}_aarch64.dmg`);
    mkdirSync(join(bundle, "dmg"), { recursive: true });
    // Copy into the destination filesystem before atomic replacement.
    run("ditto", [image, `${destination}.tmp`]);
    renameSync(`${destination}.tmp`, destination);
    console.log(`安装镜像：${destination}`);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}
