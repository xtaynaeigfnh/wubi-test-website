import type { NextConfig } from "next";

const pagesBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const isDesktopBuild = process.env.NEXT_PUBLIC_DESKTOP_APP === "true";
const isPagesBuild = process.env.GITHUB_PAGES === "true";

const nextConfig: NextConfig = {
  // Next can otherwise infer a parent directory as the workspace root when it
  // finds another lockfile there. Keeping Turbopack rooted here also prevents
  // non-ASCII parent paths from leaking into generated chunk identifiers.
  turbopack: {
    root: process.cwd(),
  },
  ...(isPagesBuild
    ? {
        output: "export" as const,
        ...(isDesktopBuild ? { distDir: "out-app" } : {}),
        trailingSlash: true,
        basePath: pagesBasePath,
      }
    : {}),
};

export default nextConfig;
