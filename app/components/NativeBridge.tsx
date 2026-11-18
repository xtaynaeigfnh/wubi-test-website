"use client";

import { useEffect } from "react";
import { isNativeApp, isExternalUrl, openExternalUrl } from "../platform";

/** 原生平台共用外链行为；桌面的退出保护仍由 DesktopBridge 负责。 */
export function NativeBridge() {
  useEffect(() => {
    if (!isNativeApp) return;
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
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("auxclick", onClick, true);
    };
  }, []);
  return null;
}
