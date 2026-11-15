process.env.GITHUB_PAGES = "true";
process.env.NEXT_PUBLIC_BASE_PATH = "";
process.env.NEXT_PUBLIC_DESKTOP_APP = "true";
const { readFile } = await import("node:fs/promises");
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
process.env.NEXT_PUBLIC_APP_VERSION = pkg.version;
