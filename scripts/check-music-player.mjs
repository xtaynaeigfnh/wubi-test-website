// Run against a local dev server: MUSIC_TEST_URL=http://localhost:3000 node scripts/check-music-player.mjs
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

const base = process.env.MUSIC_TEST_URL ?? "http://127.0.0.1:3000";
const output = "outputs/music-motion";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
});
const settled = (page) => page.waitForFunction(() => !document.querySelector(".music-dock-morph"));
const sample = (page, progress) => page.evaluate((fraction) => {
  const surface = document.querySelector(".music-dock-morph");
  if (!surface) throw new Error("Expected an active music transition");
  for (const animation of surface.getAnimations({ subtree: true })) {
    animation.pause();
    animation.currentTime = Number(animation.effect.getTiming().duration) * fraction;
  }
}, progress);
const finish = async (page) => {
  await page.evaluate(() => {
    document.querySelector(".music-dock-morph")?.getAnimations({ subtree: true }).forEach((animation) => animation.finish());
  });
  await settled(page);
};

try {
  for (const width of [320, 390, 780, 844, 1024, 1280, 1440, 1920]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: "no-preference" });
    await page.addInitScript(() => {
      localStorage.setItem("wubi-test:onboarding:v1", JSON.stringify({ version: 1, status: "skipped", sessionIds: [] }));
    });
    await page.goto(base);
    const close = page.getByRole("button", { name: "收起专注电台控制栏" });
    await close.waitFor();
    await close.hover();
    await page.waitForFunction(() => document.querySelector(".music-dock-bar")?.querySelectorAll(".music-ruler > span").length > 0);
    const metrics = await page.locator(".music-dock-bar").evaluate((bar) => {
      const children = Array.from(bar.children).filter((child) => getComputedStyle(child).display !== "none");
      const boxes = children.map((child) => {
        const r = child.getBoundingClientRect();
        return { name: child.className, left: r.left, right: r.right };
      });
      const ruler = bar.querySelector(".music-ruler");
      return {
        boxes,
        rulerVisible: getComputedStyle(ruler).display !== "none",
        rulerOverflow: ruler.scrollWidth > ruler.clientWidth + 1 || ruler.scrollHeight > ruler.clientHeight + 1,
        documentOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      };
    });
    assert(!metrics.documentOverflow, `${width}: page overflow`);
    for (const [index, box] of metrics.boxes.entries()) {
      assert(box.left >= -1 && box.right <= width + 1, `${width}: ${box.name} outside viewport`);
      if (index) assert(box.left >= metrics.boxes[index - 1].right - 1, `${width}: overlapping controls`);
    }
    if (metrics.rulerVisible) assert(!metrics.rulerOverflow, `${width}: ruler scrollbars`);

    if (width === 390 || width === 1440) {
      await page.screenshot({ path: `${output}/${width}-expanded.png` });
      const origin = await page.locator(".music-dock-peek").evaluate((el) => {
        const rect = el.getBoundingClientRect();
        return { x: rect.x, y: rect.y };
      });
      await close.click();
      await sample(page, 0.2);
      assert.equal(await page.getByRole("button", { name: "播放背景音乐" }).count(), 0, "snapshot controls must be inaccessible");
      await page.screenshot({ path: `${output}/${width}-closing.png` });
      await finish(page);
      const peek = page.getByRole("button", { name: "展开专注电台控制栏" });
      const target = await peek.boundingBox();
      assert(Math.abs(origin.x - target.x) < 1 && Math.abs(origin.y - target.y) < 1, "origin must stay fixed");
      if (width === 390) assert(target.y > 800, "mobile origin belongs at viewport bottom");
      await peek.focus();
      await page.keyboard.press("Enter");
      await sample(page, 0.55);
      const opacity = await page.locator(".music-morph-controls").evaluate((el) => Number(getComputedStyle(el).opacity));
      assert(opacity > 0 && opacity < 1, "content should blend during expansion");
      await page.screenshot({ path: `${output}/${width}-opening.png` });
      await finish(page);
      assert(await page.locator(".music-dock-bar button:focus").count() === 1, "opening restores keyboard focus");

      await page.getByRole("button", { name: "展开曲目列表", exact: true }).click();
      await page.waitForTimeout(350);
      await close.click();
      await sample(page, 0.1);
      const playlistHeight = await page.locator(".music-dock-morph .music-library-reveal").evaluate((el) => el.getBoundingClientRect().height);
      assert(playlistHeight > 100, "closing retains the visible playlist until it fades");
      await finish(page);

      await page.emulateMedia({ reducedMotion: "reduce" });
      await peek.click();
      await close.waitFor({ state: "visible" });
      assert.equal(await page.locator(".music-dock-morph").count(), 0, "reduced motion skips flight");
      assert(await close.isVisible());
    }
    console.log(`Music player ${width}px: passed`);
    await page.close();
  }
} finally {
  await browser.close();
}
