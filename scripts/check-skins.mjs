import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, firefox, webkit } from "playwright";

const base = process.env.SKIN_BASE_URL ?? "http://127.0.0.1:4175";
const output = "output/playwright/skins";
const engines = { chromium, firefox, webkit };
const results = [];
await mkdir(output, { recursive: true });

for (const engine of (process.env.SKIN_BROWSERS ?? "chromium,firefox,webkit").split(",")) {
  const browser = await engines[engine].launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" });
    await context.addInitScript(() => {
      localStorage.setItem("wubi-test:onboarding:v1", JSON.stringify({ version: 1, status: "skipped", sessionIds: [] }));
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const ready = () => page.locator('.hydration-boundary[aria-busy="false"]').waitFor();
    const waitSkin = (skin) => page.waitForFunction((value) => document.documentElement.dataset.skin === value, skin);
    const chooseSkin = async (skin) => {
      await page.locator(`input[name="skin"][value="${skin}"]`).check();
      await waitSkin(skin);
    };
    await page.goto(`${base}/settings`);
    await ready();
    await waitSkin("letterpress");
    assert(await page.locator('input[name="skin"][value="letterpress"]').isChecked());

    for (const skin of ["letterpress", "focus"]) {
      console.log(`${engine} ${skin}: 检查选择、配色和保存`);
      await chooseSkin(skin);
      for (const theme of ["light", "dark", "bamboo", "qingdai", "custom", "system"]) {
        await page.locator(`[data-theme-option="${theme}"]`).click();
        await page.waitForFunction((value) => document.documentElement.dataset.theme === value, theme);
        assert.equal(await page.locator(".theme-preview").getAttribute("data-preview-skin"), skin);
        if (theme === "custom") {
          await page.locator("#custom-theme-accent").fill("#245B70");
          await page.locator("#custom-theme-canvas").fill("#EEF3F4");
          assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), "rgb(238, 243, 244)");
        }
      }
      // The root player stays mounted while changing the page presentation.
      if (await page.locator(".music-dock").getAttribute("aria-hidden") === "true") {
        await page.getByRole("button", { name: "展开专注电台控制栏" }).click();
      }
      await page.getByRole("button", { name: "播放背景音乐", exact: true }).click();
      await page.locator(".music-dock.is-playing").waitFor({ state: "attached" });
      await chooseSkin(skin === "focus" ? "letterpress" : "focus");
      assert.equal(await page.locator(".music-dock.is-playing").count(), 1);
      assert.equal(await page.locator("html").getAttribute("data-theme"), "system");
      await chooseSkin(skin);
      assert.equal(await page.locator(".music-dock.is-playing").count(), 1);
      if (await page.locator(".music-dock").getAttribute("aria-hidden") === "true") {
        await page.getByRole("button", { name: "展开专注电台控制栏" }).click();
      }
      await page.getByRole("button", { name: "暂停背景音乐", exact: true }).press("Enter");
      await page.getByRole("button", { name: "当前系统主题，点击切换为浅色主题" }).click();
      await page.waitForFunction(() => document.documentElement.dataset.theme === "light");
      assert.equal(await page.locator("html").getAttribute("data-skin"), skin);
      await page.locator('[data-theme-option="system"]').click();
      await page.reload();
      await ready();
      await waitSkin(skin);
      assert(await page.locator(`input[name="skin"][value="${skin}"]`).isChecked());
      const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("wubi-test:settings:v1")));
      assert.equal(stored.skin, skin);
      assert.equal(stored.theme, "system");
      assert.deepEqual(stored.customTheme, { accent: "#245B70", canvas: "#EEF3F4" });

      // A failed save must preserve both the selected radio and applied skin.
      await page.evaluate(() => {
        window.restoreSkinStorage = Storage.prototype.setItem;
        Storage.prototype.setItem = function(key, value) {
          if (key === "wubi-test:settings:v1") throw new DOMException("full", "QuotaExceededError");
          return window.restoreSkinStorage.call(this, key, value);
        };
      });
      await page.locator(`input[name="skin"][value="${skin === "focus" ? "letterpress" : "focus"}"]`).click();
      await page.getByRole("alert").filter({ hasText: "设置未能保存" }).waitFor();
      assert.equal(await page.locator("html").getAttribute("data-skin"), skin);
      assert(await page.locator(`input[name="skin"][value="${skin}"]`).isChecked());
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("wubi-test:settings:v1")).skin), skin);
      await page.evaluate(() => { Storage.prototype.setItem = window.restoreSkinStorage; delete window.restoreSkinStorage; });
      await page.locator('[data-theme-option="light"]').click();
      await page.waitForTimeout(850);
      await page.screenshot({ path: `${output}/${engine}-${skin}-settings.png`, fullPage: true });

      await page.getByRole("navigation", { name: "主导航" }).getByRole("link", { name: "文章测速" }).click();
      await ready();
      await waitSkin(skin);
      const input = page.getByRole("textbox", { name: "跟打输入区" });
      await input.waitFor();
      assert.equal(await page.locator("textarea.typing-input").count(), 1);
      assert.equal(await page.locator('.metric-strip[aria-label="实时成绩"] > div').count(), skin === "focus" ? 3 : 6);
      assert.equal(await page.locator(".side-panel").count(), skin === "focus" ? 0 : 1);
      assert.equal(await page.locator("details.practice-diagnostics").count(), skin === "focus" ? 1 : 0);

      if (skin === "focus") {
        await page.getByRole("button", { name: "选文章", exact: true }).click();
        await page.getByRole("dialog").getByLabel("题材", { exact: true }).selectOption({ index: 1 });
        await page.getByRole("dialog").getByRole("button", { name: "关闭", exact: true }).click();
      } else {
        await page.locator(".side-panel").getByLabel("题材", { exact: true }).selectOption({ index: 1 });
      }

      const text = await page.locator(".article-text").textContent();
      const target = text.replace(/[\r\n]/g, "");
      await input.focus();
      await input.evaluate((element) => {
        element.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(element, "wubi");
        element.dispatchEvent(new InputEvent("input", { bubbles: true, data: "wubi", inputType: "insertCompositionText", isComposing: true }));
      });
      assert.equal(await input.inputValue(), "wubi");
      assert.equal(await page.locator(".article-text span.correct, .article-text span.wrong").count(), 0);
      await input.evaluate((element, character) => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(element, character);
        element.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: character }));
        element.dispatchEvent(new InputEvent("input", { bubbles: true, data: character, inputType: "insertText", isComposing: false }));
      }, target[0]);
      await page.waitForFunction(() => document.querySelectorAll(".article-text span.correct").length === 1);
      await page.getByRole("button", { name: "暂停", exact: true }).click();
      assert(await input.isDisabled());
      await page.getByRole("button", { name: "继续", exact: true }).click();
      assert(await input.isEnabled());
      await input.fill(target);
      await page.getByText("练习完成", { exact: true }).waitFor();
      assert.equal(await page.locator("textarea.typing-input").count(), 0);
      const sessions = await page.evaluate(() => JSON.parse(localStorage.getItem("wubi-test:sessions:v1")));
      assert.equal(sessions[0].accuracy, 100);
      assert.equal(sessions[0].correctChars, Array.from(target).length);
      console.log(`${engine} ${skin}: 跟打和结算通过`);
      results.push({ engine, skin, behavior: "passed" });

      // Check route persistence and capture each target viewport after a fresh load.
      for (const width of [320, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(base);
        await ready();
        await waitSkin(skin);
        await page.locator(".typing-input").waitFor();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${skin} ${width} 横向溢出`);
        await page.waitForTimeout(850);
        await page.screenshot({ path: `${output}/${engine}-${skin}-typing-${width}.png`, fullPage: true });
      }
      await page.goto(`${base}/settings`);
      await ready();
      await waitSkin(skin);
    }
    assert.deepEqual(errors, [], "浏览器不应出现未处理错误");
    await context.close();
  } finally {
    await browser.close();
    await writeFile(`${output}/report.json`, JSON.stringify(results, null, 2));
  }
}
console.log(`两套皮肤在 ${results.length / 2} 个浏览器通过保存、恢复、配色、跟打和响应式验证。`);
