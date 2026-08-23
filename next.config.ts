import type { NextConfig } from "next";

const pagesBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
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
        trailingSlash: true,
        basePath: pagesBasePath,
      }
    : {}),
};

export default nextConfig;
