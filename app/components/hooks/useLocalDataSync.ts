"use client";

import { useEffect, useRef } from "react";

export interface LocalDataSyncOptions {
  /** 只响应这些 localStorage 键的跨窗口写入；省略则响应全部键。 */
  keys?: readonly string[];
  /** 额外触发刷新的 window 事件，例如 `wubi:practice-saved`。 */
  events?: readonly string[];
  /** 挂载时是否立即执行一次刷新，默认 true。 */
  immediate?: boolean;
  /** 为 false 时不注册监听也不刷新，变为 true 时按 `immediate` 重新开始，默认 true。 */
  enabled?: boolean;
}

/**
 * 让组件持有的本机数据与其它窗口、后台切换保持同步：
 * 其它窗口写入 localStorage、本窗口重新获得焦点或标签页重新可见时都会重新读取。
 * 回调通过 ref 读取最新值，监听器只注册一次，不会随回调身份变化反复解绑。
 */
export function useLocalDataSync(
  refresh: () => void,
  { keys, events, immediate = true, enabled = true }: LocalDataSyncOptions = {},
) {
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  const keySignature = keys ? keys.join("\u0000") : null;
  const eventSignature = events?.length ? events.join("\u0000") : "";

  useEffect(() => {
    if (!enabled) return;
    const watchedKeys = keySignature === null ? null : new Set(keySignature.split("\u0000"));
    const extraEvents = eventSignature ? eventSignature.split("\u0000") : [];
    const run = () => refreshRef.current();
    const onStorage = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage) return;
      if (event.key === null || !watchedKeys || watchedKeys.has(event.key)) run();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };

    if (immediate) run();
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", run);
    document.addEventListener("visibilitychange", onVisible);
    for (const name of extraEvents) window.addEventListener(name, run);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", run);
      document.removeEventListener("visibilitychange", onVisible);
      for (const name of extraEvents) window.removeEventListener(name, run);
    };
  }, [keySignature, eventSignature, immediate, enabled]);
}
