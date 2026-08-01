"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface PwaContextValue {
  promptEvent: InstallPromptEvent | null;
  setPromptEvent: (event: InstallPromptEvent | null) => void;
  status: string;
  setStatus: (status: string) => void;
}

const PwaContext = createContext<PwaContextValue | null>(null);

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [status, setStatus] = useState("正在准备离线缓存…");

  useEffect(() => {
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    if (!("serviceWorker" in navigator)) {
      setStatus("当前浏览器不支持离线安装。");
      return;
    }

    navigator.serviceWorker
      .register(`${basePath}/sw.js`, { scope: `${basePath || ""}/` })
      .then(() => navigator.serviceWorker.ready)
      .then(() => setStatus("离线缓存已启用，断网后仍可打开。"))
      .catch(() => setStatus("离线缓存注册失败，请刷新页面重试。"));

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const value = useMemo(
    () => ({ promptEvent, setPromptEvent, status, setStatus }),
    [promptEvent, status],
  );
  return <PwaContext.Provider value={value}>{children}</PwaContext.Provider>;
}

export function PwaControl() {
  const context = useContext(PwaContext);
  if (!context) throw new Error("PwaControl 必须在 PwaProvider 中使用");
  const { promptEvent, setPromptEvent, status, setStatus } = context;

  const install = async () => {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    setStatus(
      choice.outcome === "accepted"
        ? "网站已加入应用列表。"
        : "已取消安装，随时可以再试。",
    );
    setPromptEvent(null);
  };

  return (
    <section className="management-card pwa-card" aria-labelledby="pwa-title">
      <div>
        <span className="eyebrow">离线安装</span>
        <h2 id="pwa-title">把网站放到桌面</h2>
        <p>{status}</p>
        {!promptEvent && (
          <small>
            如果没有安装按钮，请使用浏览器菜单中的“安装应用”或“添加到主屏幕”。
          </small>
        )}
      </div>
      <button
        className="button primary"
        disabled={!promptEvent}
        onClick={() => void install()}
      >
        安装到这台设备
      </button>
    </section>
  );
}
