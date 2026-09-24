import { chromium, firefox, webkit } from "playwright";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const output = "output/playwright/accessibility";
const base = (process.env.A11Y_BASE_URL ?? "http://127.0.0.1:4175").replace(/\/$/, "");
const engines = { chromium, firefox, webkit };
const routes = ["/", "/training", "/training?tab=review", "/training?tab=phrase", "/training?tab=roots", "/advanced", "/advanced?tab=scenario", "/advanced?tab=season", "/advanced?tab=challenge", "/lookup", "/history", "/summary", "/settings"];
const profiles = [
  { name: "phone-light", width: 320, height: 740, theme: "light", scan: true },
  { name: "phone-dark", width: 360, height: 800, theme: "dark", scan: true },
  { name: "phone-reduced", width: 375, height: 812, theme: "light", reduced: true, scan: true },
  { name: "landscape", width: 844, height: 390, theme: "light" },
  { name: "tablet", width: 768, height: 1024, theme: "light" },
  { name: "four-three", width: 1024, height: 768, theme: "dark" },
  { name: "desktop-light", width: 1440, height: 900, theme: "light", scan: true },
  { name: "desktop-dark", width: 1440, height: 900, theme: "dark", scan: true },
  { name: "ultrawide", width: 2560, height: 1080, theme: "light" },
];
const results = [];

async function checkKeyboard(page, route) {
  if (route.startsWith("/training") || route.startsWith("/advanced")) {
    const lists = page.getByRole("tablist");
    for (let index = 0; index < await lists.count(); index++) {
      // Filter the tabs themselves, not their descendants.
      const active = lists.nth(index).locator('[role="tab"][aria-selected="true"]');
      await active.focus();
      const initial = await active.textContent();
      await page.keyboard.press("ArrowRight");
      await page.waitForFunction(() => document.activeElement?.getAttribute("aria-selected") === "true");
      assert.notEqual(await page.locator(":focus").textContent(), initial, "方向键应切换标签及焦点");
      assert.equal(await lists.nth(index).locator('[role="tab"][tabindex="0"]').count(), 1, "标签组只能有一个 Tab 入口");
      await page.keyboard.press("ArrowLeft");
      assert.equal(await page.locator(":focus").textContent(), initial, "反向导航应返回原标签");
      const ring = await page.locator(":focus").evaluate((el) => {
        const style = getComputedStyle(el);
        return el.matches(":focus-visible") && (style.boxShadow !== "none" || style.outlineStyle !== "none");
      });
      assert(ring, "键盘焦点应有可见标记");
      await page.keyboard.press("Tab");
      assert(!await page.locator(":focus").evaluate((el) => el.matches('[role="tab"][tabindex="-1"]')), "Tab 不应停在未选中的标签");
    }
  }
  if (route === "/") {
    const entry = page.getByRole("button", { name: /^首次使用引导/ });
    await entry.focus();
    await page.keyboard.press("Enter");
    const modal = page.getByRole("dialog");
    await modal.waitFor();
    const controls = modal.locator('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])');
    await controls.first().focus();
    await page.keyboard.press("Shift+Tab");
    assert(await controls.last().evaluate((el) => el === document.activeElement), "弹窗反向 Tab 应循环到末尾");
    await page.keyboard.press("Tab");
    assert(await controls.first().evaluate((el) => el === document.activeElement), "弹窗 Tab 应循环到开头");
    await page.keyboard.press("Escape");
    await modal.waitFor({ state: "hidden" });
    assert(await entry.evaluate((el) => el === document.activeElement), "关闭弹窗应恢复入口焦点");
    const article = page.getByRole("region", { name: "练习文章，可使用方向键滚动" });
    await article.focus();
    await page.keyboard.press("ArrowDown");
    assert(await article.evaluate((el) => el === document.activeElement), "文章滚动区应可键盘操作");
  }
}

let server;
await mkdir(output, { recursive: true });
try {
  if (!process.env.A11Y_BASE_URL) {
    server = spawn("npm", ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", "4175"], { stdio: "ignore", detached: true });
    let ready = false;
    for (let i = 0; i < 120; i++) {
      try { if ((await fetch(base)).ok) { ready = true; break; } } catch {}
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    assert(ready, "本地测试服务器未启动");
  }
  for (const engine of (process.env.A11Y_BROWSERS ?? "chromium,firefox,webkit").split(",")) {
    const browser = await engines[engine].launch();
    try {
      for (const profile of profiles.filter((item) => !process.env.A11Y_PROFILES || process.env.A11Y_PROFILES.split(",").includes(item.name))) {
        const context = await browser.newContext({ viewport: { width: profile.width, height: profile.height }, colorScheme: profile.theme, reducedMotion: profile.reduced ? "reduce" : "no-preference", serviceWorkers: "block" });
        await context.addInitScript(({ theme }) => {
          localStorage.setItem("wubi-test:settings:v1", JSON.stringify({ theme }));
          localStorage.setItem("wubi-test:onboarding:v1", JSON.stringify({ version: 1, status: "skipped", sessionIds: [] }));
        }, profile);
        const page = await context.newPage();
        for (const route of routes.filter((item) => !process.env.A11Y_ROUTES || process.env.A11Y_ROUTES.split(",").includes(item))) {
          const row = { engine, profile: profile.name, route, failures: [] };
          const id = `${engine}-${profile.name}-${route.replace(/[^a-z0-9]/gi, "_")}`;
          await context.tracing.start({ screenshots: true, snapshots: true });
          try {
            await page.goto(`${base}${route}`, { waitUntil: "networkidle" });
            await page.waitForFunction((theme) => document.documentElement.dataset.theme === theme, profile.theme);
            await page.locator("main").waitFor();
            await page.evaluate(() => document.fonts.ready);
            const geometry = await page.evaluate(() => {
              const shown = (el) => el.getClientRects().length && getComputedStyle(el).visibility !== "hidden";
              const controls = [...document.querySelectorAll("button, a[href], input:not([type=hidden]):not([type=file]), select, textarea, [role=tab]")].filter(shown);
              return {
                overflow: document.documentElement.scrollWidth > innerWidth + 1,
                smallTargets: controls.filter((el) => !el.disabled && !el.closest("p") && (() => { const target = el.matches("input[type=checkbox], input[type=radio]") ? el.labels?.[0] ?? el : el; const r = target.getBoundingClientRect(); return r.width < 43.5 || r.height < 43.5; })()).map((el) => ({ text: (el.getAttribute("aria-label") || el.textContent || el.id).trim().slice(0, 65), tag: el.tagName, class: el.className, width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height })),
                motion: matchMedia("(prefers-reduced-motion: reduce)").matches ? [...document.getAnimations()].filter((a) => a.playState === "running" && (a.effect?.getComputedTiming().duration > 1 || a.effect?.getComputedTiming().iterations === Infinity)).map((a) => a.animationName) : [],
              };
            });
            row.geometry = geometry;
            if (profile.scan) {
              await checkKeyboard(page, route);
              row.keyboard = "passed";
              await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
            }
            if (geometry.overflow) row.failures.push("页面横向溢出");
            if (geometry.smallTargets.length) row.failures.push("交互目标不足 44px");
            if (geometry.motion.length) row.failures.push("减少动画模式仍有持续动画");
            if (profile.scan) {
              await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
              const audit = await page.evaluate(async () => {
                const data = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] } });
                return { violations: data.violations, incomplete: data.incomplete };
              });
              row.axe = audit;
              if (audit.violations.length) row.failures.push(...audit.violations.map((v) => `axe: ${v.id}`));
            }
          } catch (error) { row.failures.push(error.message); }
          if (row.failures.length) {
            await page.screenshot({ path: `${output}/${id}.png`, fullPage: true }).catch(() => {});
            await writeFile(`${output}/${id}.html`, await page.content());
            await context.tracing.stop({ path: `${output}/${id}.zip` });
          } else { await context.tracing.stop(); }
          results.push(row);
          console.log(`${row.failures.length ? "FAIL" : "PASS"} ${id} ${row.failures.join(", ")}`);
          await writeFile(`${output}/report.json`, JSON.stringify({ base, generatedAt: new Date().toISOString(), results }, null, 2));
        }
        await context.close();
      }
    } finally { await browser.close(); }
  }
} finally {
  if (server?.pid) { try { process.kill(-server.pid, "SIGTERM"); } catch {} }
}
console.log(`完成 ${results.length} 项，失败 ${results.filter((r) => r.failures.length).length} 项；报告：${output}/report.json`);
if (results.some((row) => row.failures.length)) process.exitCode = 1;
