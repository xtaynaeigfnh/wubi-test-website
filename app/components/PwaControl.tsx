"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
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

    const hadController = Boolean(navigator.serviceWorker.controller);
    let updateAvailable = false;
    let watchedWorker: ServiceWorker | null = null;
    let currentRegistration: ServiceWorkerRegistration | null = null;
    let active = true;
    let readyTimer: number | null = null;
    const showUpdate = () => {
      if (!active) return;
      updateAvailable = true;
      setStatus("新版本已准备好。请完成练习并保存成绩后，关闭本站所有窗口，再重新打开即可更新。");
    };
    const onWorkerStateChange = () => {
      if (watchedWorker?.state === "installed" && navigator.serviceWorker.controller) showUpdate();
    };
    const onUpdateFound = () => {
      watchedWorker?.removeEventListener("statechange", onWorkerStateChange);
      watchedWorker = currentRegistration?.installing ?? null;
      watchedWorker?.addEventListener("statechange", onWorkerStateChange);
      onWorkerStateChange();
    };
    const onControllerChange = () => {
      if (hadController) showUpdate();
    };
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange,
    );

    navigator.serviceWorker
      .register(`${basePath}/sw.js`, {
        scope: `${basePath || ""}/`,
        updateViaCache: "none",
      })
      .then(async (registration) => {
        if (!active) return;
        currentRegistration = registration;
        registration.addEventListener("updatefound", onUpdateFound);
        onUpdateFound();
        if (registration.waiting) showUpdate();
        try {
          await registration.update();
        } catch {
          // 离线时继续使用已激活的缓存，不影响应用启动。
        }
        return new Promise<ServiceWorkerRegistration>((resolve, reject) => {
          readyTimer = window.setTimeout(
            () => reject(new Error("offline-cache-timeout")),
            15_000,
          );
          void navigator.serviceWorker.ready.then((readyRegistration) => {
            if (readyTimer !== null) window.clearTimeout(readyTimer);
            readyTimer = null;
            resolve(readyRegistration);
          });
        });
      })
      .then(() => {
        if (active && !updateAvailable) setStatus("离线缓存已启用，断网后仍可打开。");
      })
      .catch(() => {
        if (active && !updateAvailable) setStatus("离线缓存准备失败，请联网后刷新页面重试。");
      });

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => {
      active = false;
      currentRegistration?.removeEventListener("updatefound", onUpdateFound);
      watchedWorker?.removeEventListener("statechange", onWorkerStateChange);
      if (readyTimer !== null) window.clearTimeout(readyTimer);
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      );
      window.removeEventListener("beforeinstallprompt", onPrompt);
    };
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
  const installLockRef = useRef(false);
  const [installing, setInstalling] = useState(false);

  const install = async () => {
    if (!promptEvent || installLockRef.current) return;
    installLockRef.current = true;
    setInstalling(true);
    const currentPrompt = promptEvent;
    setPromptEvent(null);
    try {
      await currentPrompt.prompt();
      const choice = await currentPrompt.userChoice;
      setStatus(
        choice.outcome === "accepted"
          ? "网站已加入应用列表。"
          : "已取消安装，随时可以再试。",
      );
    } catch {
      setStatus("安装提示未能打开，请使用浏览器菜单重新尝试。");
    } finally {
      installLockRef.current = false;
      setInstalling(false);
    }
  };

  return (
    <section className="management-card pwa-card" id="settings-device" aria-labelledby="pwa-title">
      <span className="settings-section-key" aria-hidden="true">J</span>
      <div>
        <span className="eyebrow">离线安装</span>
        <h2 id="pwa-title">把网站放到桌面</h2>
        <p>{status}</p>
        {!promptEvent && !installing && (
          <small>
            如果没有安装按钮，请使用浏览器菜单中的“安装应用”或“添加到主屏幕”。
          </small>
        )}
      </div>
      <button
        className="button primary"
        disabled={installing || !promptEvent}
        onClick={() => void install()}
      >
        {installing ? "正在打开安装提示…" : "安装到这台设备"}
      </button>
    </section>
  );
}
