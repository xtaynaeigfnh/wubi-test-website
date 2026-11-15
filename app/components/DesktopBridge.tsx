"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "./Ui";
import { allowDesktopExit } from "../desktop-exit";
import { isDesktopApp, isExternalUrl, openExternalUrl } from "../platform";

export function DesktopBridge() {
  const [dialog, setDialog] = useState<{ text: string; confirm: boolean } | null>(null);
  const resolveDialog = useRef<((confirmed: boolean) => void) | null>(null);
  const settleDialog = (confirmed: boolean) => {
    const resolve = resolveDialog.current;
    resolveDialog.current = null;
    setDialog(null);
    resolve?.(confirmed);
  };
  useEffect(() => {
    if (!isDesktopApp) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    let deciding = false;
    void (async () => {
      const [{ listen }, { invoke }] = await Promise.all([
        import("@tauri-apps/api/event"), import("@tauri-apps/api/core"),
      ]);
      if (disposed) return;
      unlisten = await listen("desktop-exit-requested", async () => {
        if (deciding || disposed) return;
        deciding = true;
        try {
          if (await allowDesktopExit({
            alert: async (text) => { await new Promise<boolean>((resolve) => {
              resolveDialog.current = resolve;
              setDialog({ text, confirm: false });
            }); },
            confirm: (text) => new Promise<boolean>((resolve) => {
              resolveDialog.current = resolve;
              setDialog({ text, confirm: true });
            }),
          })) await invoke("finish_exit");
        } catch {
          window.alert("退出检查未能完成，请稍后重试。");
        } finally { deciding = false; }
      });
      if (disposed) { unlisten(); return; }
      await invoke("desktop_ready");
    })().catch(() => window.alert("应用退出保护初始化失败，请重新打开应用后再练习。"));
    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || !isExternalUrl(anchor.href, window.location.href)) return;
      event.preventDefault();
      event.stopPropagation();
      void openExternalUrl(anchor.href).catch(() => window.alert("无法打开外部链接，请稍后重试。"));
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("auxclick", onClick, true);
    return () => {
      disposed = true;
      resolveDialog.current?.(false);
      resolveDialog.current = null;
      unlisten?.();
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("auxclick", onClick, true);
    };
  }, []);
  if (!dialog) return null;
  return (
    <Modal title={dialog.confirm ? "退出五笔练习" : "暂时无法退出"} onClose={() => settleDialog(false)}>
      <p>{dialog.text}</p>
      <div className="management-actions">
        <button className="button secondary" onClick={() => settleDialog(false)}>
          {dialog.confirm ? "继续练习" : "返回练习"}
        </button>
        {dialog.confirm && <button className="button danger" onClick={() => settleDialog(true)}>放弃并退出</button>}
      </div>
    </Modal>
  );
}
