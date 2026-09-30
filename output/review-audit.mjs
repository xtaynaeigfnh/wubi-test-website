import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const output = "output/review-audit";
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const routes = ["/", "/training", "/advanced", "/lookup", "/history", "/settings"];
const profiles = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 375, height: 812 },
];
for (const profile of profiles) {
  const context = await browser.newContext({ viewport: { width: profile.width, height: profile.height }, serviceWorkers: "block" });
  await context.addInitScript(() => {
    localStorage.setItem("wubi-test:onboarding:v1", JSON.stringify({ version: 1, status: "skipped", sessionIds: [] }));
  });
  const page = await context.newPage();
  for (const route of routes) {
    await page.goto(`http://127.0.0.1:4175${route}`, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(350);
    const name = route === "/" ? "home" : route.slice(1);
    await page.screenshot({ path: `${output}/${profile.name}-${name}.png`, fullPage: true });
    const data = await page.evaluate(() => ({
      title: document.title,
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      viewportWidth: innerWidth,
      headings: [...document.querySelectorAll("h1, h2")].slice(0, 8).map((el) => el.textContent?.trim()),
      mainTop: document.querySelector("main")?.getBoundingClientRect().top,
      inputTop: document.querySelector(".typing-input")?.getBoundingClientRect().top,
      music: document.querySelector(".music-dock-peek")?.getBoundingClientRect().toJSON(),
    }));
    console.log(JSON.stringify({ profile: profile.name, route, ...data }));
  }
  await context.close();
}
await browser.close();
