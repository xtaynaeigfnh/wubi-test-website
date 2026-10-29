import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { open, output } from "./helpers.mjs";

export async function localMusic({ page }) {
  const catalog = JSON.parse(await readFile("public/data/music-catalog.json", "utf8"));
  const buffer = await readFile(`public${catalog.tracks[0].sources[0].src}`);
  await open(page, "/");
  // Start from the settled collapsed state. On cold WebKit runs, click's
  // actionability check can outlast auto-collapse after an isVisible snapshot.
  const reveal = page.getByRole("button", { name: "展开专注电台控制栏" });
  await reveal.waitFor({ state: "visible" });
  await reveal.click();
  await page.getByRole("complementary", { name: "背景音乐播放器" }).waitFor();
  await page.getByRole("button", { name: "展开曲目列表" }).click();
  const input = page.getByLabel("选择本地歌曲");
  const songs = Array.from({ length: 5 }, (_, index) => ({ name: `本地歌曲${index + 1}.mp3`, mimeType: "audio/mpeg", buffer }));
  await input.setInputFiles([...songs, { name: "损坏.mp3", mimeType: "audio/mpeg", buffer: Buffer.from("broken") }]);
  await page.getByRole("status").filter({ hasText: "已导入 5 首" }).waitFor();
  assert.match(await page.locator(".music-local-import").textContent(), /1 个文件无法读取/);
  assert.equal(await page.locator(".music-track-row").count(), 5);
  assert(await page.locator("audio").evaluate((audio) => audio.paused));
  await page.getByRole("button", { name: "播放背景音乐", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector("audio").paused && document.querySelector("audio").currentTime > 0);
  await page.getByRole("button", { name: "下一首", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".music-track-copy strong").textContent === "本地歌曲2" && !document.querySelector("audio").paused);
  await page.locator(".music-track-row").last().click();
  await page.waitForFunction(() => document.querySelector(".music-track-copy strong").textContent === "本地歌曲5" && !document.querySelector("audio").paused);
  await page.locator("audio").evaluate((audio) => { audio.currentTime = audio.duration - 0.2; });
  await page.waitForFunction(() => document.querySelector(".music-track-copy strong").textContent === "本地歌曲1" && !document.querySelector("audio").paused);
  assert.equal(await page.evaluate(() => JSON.stringify(localStorage).includes("blob:")), false);
  const playingUrl = await page.locator("audio").evaluate((audio) => audio.currentSrc);
  await page.locator('a[href$="/lookup"], a[href$="/lookup/"]').first().click();
  await page.waitForURL(/\/lookup\/?$/);
  assert.equal(await page.locator("audio").evaluate((audio) => audio.currentSrc), playingUrl);
  assert.equal(await page.locator("audio").evaluate((audio) => audio.paused), false);

  await input.setInputFiles([{ name: "错误.txt", mimeType: "text/plain", buffer: Buffer.from("text") }]);
  await page.getByRole("status").filter({ hasText: "原歌单未改变" }).waitFor();
  assert.equal(await page.locator(".music-track-row").count(), 5);

  const require = createRequire(import.meta.url);
  await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const violations = await page.evaluate(async () => (await window.axe.run("#music-player", { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } })).violations);
    assert.deepEqual(violations.map((item) => item.id), [], `播放器无障碍 ${width}px`);
    assert(await page.locator(".music-library").evaluate((node) => node.scrollWidth <= node.clientWidth + 1));
  }
  await page.locator(".music-library").evaluate((node) => { node.scrollTop = 0; });
  await page.screenshot({ path: `${output}/local-music-${page.context().browser().browserType().name()}.png` });
  const oldUrl = await page.locator("audio").evaluate((audio) => audio.currentSrc);
  await page.getByRole("button", { name: "返回内置歌单" }).click();
  assert.equal(await page.locator(".music-track-row").count(), catalog.tracks.length);
  assert(await page.evaluate(async (url) => { try { await fetch(url); return false; } catch { return true; } }, oldUrl), "退出应释放音频 URL");

  await input.setInputFiles([songs[0]]);
  await page.getByRole("status").filter({ hasText: "已导入 1 首" }).waitFor();
  await page.getByRole("button", { name: "播放背景音乐", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector("audio").paused);
  await page.locator("audio").evaluate((audio) => { audio.currentTime = audio.duration - 0.2; });
  await page.waitForFunction(() => document.querySelector("audio").currentTime < 5 && !document.querySelector("audio").paused);
  await page.reload();
  await page.waitForFunction(() => document.querySelector("audio")?.currentSrc.includes("/audio/tracks/"));
}
