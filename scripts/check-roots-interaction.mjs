import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const evidence = "output/design/visual-round-01/verified";
await mkdir(evidence, { recursive: true });
import { chromium, webkit } from "playwright";
const base = process.env.SKIN_BASE_URL ?? "http://127.0.0.1:5173";
for (const [engine, launcher] of Object.entries({ chromium, webkit })) {
  const browser = await launcher.launch();
  try {
    const context = await browser.newContext({ serviceWorkers: "block" });
    await context.addInitScript(() => {
      if (localStorage.getItem("roots-test-seeded")) return;
      localStorage.setItem("roots-test-seeded", "true");
      localStorage.setItem("wubi-test:onboarding:v1", JSON.stringify({ version: 1, status: "skipped", sessionIds: [] }));
      localStorage.setItem("wubi-test:settings:v1", JSON.stringify({ skin: "roots", theme: "light", showCodeHints: false }));
      localStorage.setItem("wubi-test:custom-texts:v1", JSON.stringify([{ id: "custom-roots-test", title: "拆字版输入验证", text: "五笔五笔五笔五笔五笔", length: "short", topic: "自定义", wordCount: 10, kind: "custom", version: 1 }]));
      localStorage.setItem("wubi-test:current-article:v1", JSON.stringify("custom-roots-test"));
    });
    const page = await context.newPage();
    await page.goto(base);
    await page.locator(".roots-keys div").first().waitFor();
    await page.locator('.music-dock[aria-hidden="true"]').waitFor({ state: "attached" });
    if (engine === "chromium") {
      for (const [width, height] of [[1280, 900], [390, 844]]) {
        await page.setViewportSize({ width, height });
        await page.waitForTimeout(700);
        await page.screenshot({ path: `${evidence}/roots-${width}.png`, fullPage: true });
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      }
    }
    const input = page.getByRole("textbox", { name: "跟打输入区" });
    for (const [index, character] of [..."五笔五笔五笔五笔五笔"].entries()) {
      await page.waitForFunction((char) => document.querySelector(".roots-glyph")?.textContent === char, character);
      const code = (await page.locator(".roots-code").textContent()).toLowerCase();
      assert.match(code, /^[a-z]+$/);
      await input.evaluate((el, value) => {
        el.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(el, value);
        el.dispatchEvent(new InputEvent("input", { bubbles: true, isComposing: true, inputType: "insertCompositionText" }));
      }, "五笔五笔五笔五笔五笔".slice(0, index) + code);
      await page.waitForFunction(() => [...document.querySelectorAll(".roots-keys > div")].every(el => el.classList.contains("is-stamped")));
      assert.equal(await page.locator(".article-text .correct").count(), index);
      await input.evaluate((el, value) => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(el, value);
        el.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: value }));
        el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
      }, "五笔五笔五笔五笔五笔".slice(0, index + 1));
    }
    await page.getByText("本次成绩已存入本机 · 可在成绩统计查看").waitFor();
    assert.equal(await page.locator(".article-text .correct").count(), 10);
    assert.equal(await page.locator(".roots-progress").getAttribute("value"), "100");
    console.log(`PASS ${engine}: 关闭提示仍显示键位，连续十个字组合输入盖章及结算通过`);
  } finally { await browser.close(); }
}
