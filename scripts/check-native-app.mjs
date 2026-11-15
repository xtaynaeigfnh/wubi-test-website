import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// Run after the debug build with scripts/native-test.conf.json. Never points at
// the release identifier: the first pass clears only this isolated test profile.
const output = resolve("outputs/macos");
await mkdir(output, { recursive: true });
const smoke = await readFile("scripts/native-smoke.js", "utf8");
for (const stage of ["fresh", "restart"]) {
  const script = resolve(output, `native-${stage}.js`);
  const reportPath = resolve(output, `native-${stage}-${Date.now()}.json`);
  await writeFile(script, (stage === "fresh" ? 'localStorage.removeItem("native-smoke-completed");\n' : "") + smoke);
  const child = spawn(resolve("src-tauri/target/aarch64-apple-darwin/debug/bundle/macos/五笔练习测试.app/Contents/MacOS/wubi-practice"), [], {
    stdio: "inherit",
    env: { ...process.env, WUBI_NATIVE_TEST_SCRIPT: script, WUBI_NATIVE_TEST_REPORT: reportPath },
  });
  let launchError;
  child.on("error", (error) => { launchError = error; });
  try {
    const deadline = Date.now() + 90000;
    let report;
    while (Date.now() < deadline) {
      if (launchError) throw launchError;
      if (child.exitCode !== null) throw new Error("测试 App 提前退出，请先关闭已有的测试 App。");
      try { report = JSON.parse(await readFile(reportPath, "utf8")); break; } catch (error) {
        if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
      }
      await new Promise((done) => setTimeout(done, 250));
    }
    if (!report) throw new Error("原生测试超时，请确认 macOS 桌面已解锁且测试 App 可显示");
    if (report.failed) throw new Error(report.failed);
    console.log(`${stage}: ${report.passed.length} native checks passed (${reportPath})`);
  } finally {
    if (!launchError && child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise((done) => child.once("exit", done));
    }
  }
}
