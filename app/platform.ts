"use client";

import { registerExitGuard } from "./desktop-exit.ts";

export const isIOSApp = process.env.NEXT_PUBLIC_APP_PLATFORM === "ios";
export const isDesktopApp = process.env.NEXT_PUBLIC_DESKTOP_APP === "true" && !isIOSApp;
export const isNativeApp = isDesktopApp || isIOSApp;
export type SaveResult = "saved" | "cancelled" | "download-started";
export type NativeFileWriter = {
  choosePath: (filename: string) => Promise<string | null>;
  write: (path: string, bytes: Uint8Array) => Promise<void>;
};

// Separate orchestration keeps cancellation and write failures testable without a WebView.
export async function saveNativeFile(filename: string, blob: Blob, writer: NativeFileWriter): Promise<SaveResult> {
  const path = await writer.choosePath(filename);
  if (!path) return "cancelled";
  await writer.write(path, new Uint8Array(await blob.arrayBuffer()));
  return "saved";
}

export async function saveFile(filename: string, blob: Blob): Promise<SaveResult> {
  const release = registerExitGuard({ kind: "pending", message: "文件正在保存，请完成或取消保存后再退出。" });
  try {
    if (isNativeApp) {
      const [{ save }, { writeFile }] = await Promise.all([
        import("@tauri-apps/plugin-dialog"), import("@tauri-apps/plugin-fs"),
      ]);
      return await saveNativeFile(filename, blob, {
        choosePath: (defaultPath) => save({ defaultPath }),
        write: writeFile,
      });
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = filename;
    link.href = url;
    document.body.appendChild(link);
    try { link.click(); }
    finally {
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    return "download-started";
  } finally {
    release();
  }
}

export function isExternalUrl(href: string, currentHref: string): boolean {
  const url = new URL(href, currentHref);
  return url.protocol === "mailto:" || (["http:", "https:"].includes(url.protocol) && url.origin !== new URL(currentHref).origin);
}

export async function openExternalUrl(href: string): Promise<void> {
  const url = new URL(href);
  if (!["http:", "https:", "mailto:"].includes(url.protocol)) throw new Error("不支持此链接类型。");
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  await openUrl(url.href);
}
