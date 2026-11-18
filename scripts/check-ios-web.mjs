import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { webkit, devices } from "playwright";
import { resolveExportPath } from "./browser-test-server.mjs";

const output = "output/playwright/ios-web";
await mkdir(output, { recursive: true });
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".txt": "text/plain", ".svg": "image/svg+xml", ".mp3": "audio/mpeg", ".woff2": "font/woff2" };
const server = createServer(async (request, response) => {
  try {
    let path = resolveExportPath(resolve("out-app"), decodeURIComponent(new URL(request.url, "http://localhost").pathname));
    if ((await stat(path)).isDirectory()) path = resolve(path, "index.html");
    response.writeHead(200, { "Content-Type": mime[extname(path)] ?? "application/octet-stream" });
    response.end(await readFile(path));
  } catch { response.writeHead(404); response.end(); }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await webkit.launch();
const results = [];
try {
  const context = await browser.newContext({ ...devices["iPhone 13"], serviceWorkers: "allow" });
  await context.addInitScript(() => {
    localStorage.setItem("wubi-test:onboarding:v1", JSON.stringify({ version: 1, status: "skipped", sessionIds: [] }));
    // Only the native transport is stubbed. React, file bytes, backup validation
    // and storage transactions run normally. This is not an iOS native test.
    window.__nativeCalls = [];
    window.__nativeSaveMode = "saved";
    window.__TAURI_INTERNALS__ = { invoke: async (command, args, options) => {
      window.__nativeCalls.push(command);
      if (command === "plugin:dialog|save") return window.__nativeSaveMode === "cancelled" ? null : "file:///test/备份.json";
      if (command === "plugin:fs|write_file") {
        if (window.__nativeSaveMode === "failed") throw new Error("模拟文件写入失败");
        window.__nativeBytes = Array.from(args);
        window.__nativeWriteOptions = options;
        return;
      }
      if (command === "plugin:opener|open_url") return;
      throw new Error(`iPhone 页面调用了非预期原生命令：${command}`);
    } };
  });
  const page = await context.newPage();
  page.on("dialog", (dialog) => dialog.dismiss());
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const route of ["/", "/training/", "/advanced/", "/challenge/", "/lookup/", "/history/", "/summary/", "/settings/"]) {
    await page.goto(base + route, { waitUntil: "networkidle" });
    await page.locator("main").waitFor();
    assert.equal(await page.locator("html").getAttribute("data-app-platform"), "ios");
    assert.match(await page.locator('meta[name="viewport"]').getAttribute("content"), /viewport-fit=cover/);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `横向溢出 ${route}`);
    results.push(`iPhone 竖屏路由 ${route}`);
  }
  assert.equal(await page.getByRole("button", { name: "安装到这台设备" }).count(), 0);
  assert.equal(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length), 0);
  assert.equal(await page.evaluate(() => window.__nativeCalls.includes("desktop_ready")), false);
  const exportButton = page.getByRole("button", { name: "导出完整备份", exact: true });
  const backup = page.getByRole("region", { name: "备份与恢复", exact: true });
  await page.evaluate(() => { window.__nativeSaveMode = "cancelled"; });
  await exportButton.click();
  await backup.getByText("已取消导出，备份提醒保持不变。").waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem("wubi-test:backup-reminder:v1")), null);
  await page.evaluate(() => { window.__nativeSaveMode = "failed"; });
  await exportButton.click();
  await backup.getByText("模拟文件写入失败").waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem("wubi-test:backup-reminder:v1")), null);
  await page.evaluate(() => { window.__nativeSaveMode = "saved"; });
  await exportButton.click();
  await backup.getByText("备份已通过恢复校验，文件已保存。").waitFor();
  const bytes = Buffer.from(await page.evaluate(() => window.__nativeBytes));
  await page.getByLabel("选择 JSON 备份文件").setInputFiles({ name: "备份.json", mimeType: "application/json", buffer: bytes });
  await backup.getByText("恢复前预览", { exact: true }).waitFor();
  await page.getByRole("button", { name: "确认覆盖本机数据" }).click();
  await page.waitForLoadState("networkidle");
  await page.locator("main").waitFor();
  results.push("iPhone 页面文件取消、写入失败、成功保存与备份恢复（原生传输模拟）");
  for (const size of [{ width: 320, height: 740 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size);
    await page.goto(base, { waitUntil: "networkidle" });
    await page.getByRole("textbox", { name: "跟打输入区" }).waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `横向溢出 ${size.width}`);
    await page.screenshot({ path: `${output}/iphone-${size.width}.png`, fullPage: true });
    results.push(`手机 ${size.width}×${size.height} 布局`);
  }
  assert.deepEqual(errors, []);
  await context.close();
  await writeFile(`${output}/report.json`, JSON.stringify({ nativeDeviceTest: false, results }, null, 2));
  console.log(`通过 ${results.length} 项 iPhone 页面检查；原生文件面板与签名仍需真机验证。`);
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
