import assert from "node:assert/strict";
import { open, output } from "./helpers.mjs";

export async function navigationLens({ page }) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, "/");
  assert.equal(await page.locator(".brand small").innerText(), "86 版五笔");
  assert.equal(await page.locator(".local-badge").innerText(), "数据只存本机");
  await page.locator(".site-header").screenshot({ path: `${output}/header.png` });
  const navigation = page.getByRole("navigation", { name: "主导航" });
  assert.deepEqual(await navigation.locator("a").allTextContents(), [
    "文章测速", "今日训练", "进阶训练", "五笔查码", "成绩统计", "设置",
  ]);
  async function aligned() {
    await page.waitForFunction(() => {
      const active = document.querySelector('.main-nav [aria-current="page"]');
      const lens = document.querySelector(".main-nav .nav-lens");
      if (!active || !lens) return false;
      const a = active.getBoundingClientRect();
      const b = lens.getBoundingClientRect();
      return [a.x - b.x, a.y - b.y, a.width - b.width, a.height - b.height]
        .every((delta) => Math.abs(delta) < 1);
    });
  }
  await aligned();
  await page.evaluate(() => {
    window.__navigationLensMoved = false;
    const inspect = () => {
      if (document.querySelector(".nav-lens")?.getAnimations().length) {
        window.__navigationLensMoved = true;
      }
      window.__navigationLensFrame = requestAnimationFrame(inspect);
    };
    inspect();
  });
  await navigation.getByRole("link", { name: "设置", exact: true }).click();
  await page.waitForURL("**/settings");
  await aligned();
  assert.equal(await page.evaluate(() => {
    cancelAnimationFrame(window.__navigationLensFrame);
    return window.__navigationLensMoved;
  }), true, "切换路由应播放选中底片移动动画");
  await page.setViewportSize({ width: 390, height: 844 });
  await aligned();
  assert.equal(await navigation.locator('[aria-current="page"]').innerText(), "设置");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await navigation.getByRole("link", { name: "今日训练", exact: true }).click();
  await page.waitForURL("**/training");
  await aligned();
  assert.equal(await navigation.locator(".nav-lens").evaluate((lens) => lens.getAnimations().length), 0);
  await navigation.getByRole("link", { name: "五笔查码", exact: true }).focus();
  await page.keyboard.press("Enter");
  await page.waitForURL("**/lookup");
  await aligned();
  assert.equal(await navigation.locator('[aria-current="page"]').innerText(), "五笔查码");
}
