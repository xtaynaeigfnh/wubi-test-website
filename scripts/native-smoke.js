/* Native WKWebView smoke test, injected only into debug builds in an isolated profile. */
(async () => {
  const report = { passed: [], failed: null, userAgent: navigator.userAgent, origin: location.href };
  const assert = (value, message) => { if (!value) throw new Error(message); report.passed.push(message); };
  const wait = async (predicate, label) => {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      const result = predicate();
      if (result) return result;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`等待超时：${label}`);
  };
  const button = (name) => [...document.querySelectorAll("button")].find((item) => item.textContent.trim() === name);
  const fill = (input, text) => {
    const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value").set.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const navigate = async (path) => {
    const link = [...document.querySelectorAll("a[href]")].find((item) => new URL(item.href).pathname.replace(/\/$/, "") === path.replace(/\/$/, ""));
    if (!link) throw new Error(`找不到路由链接 ${path}`);
    link.click();
    await wait(() => location.pathname.replace(/\/$/, "") === path.replace(/\/$/, ""), path);
    await new Promise((resolve) => setTimeout(resolve, 600));
  };
  try {
    const text = "五笔输入练习需要稳定节奏。";
    const first = !localStorage.getItem("native-smoke-completed");
    if (first) {
      localStorage.clear();
      localStorage.setItem("wubi-test:onboarding:v1", JSON.stringify({ version: 1, status: "skipped", sessionIds: [] }));
      localStorage.setItem("wubi-test:custom-texts:v1", JSON.stringify([{ id: "custom-native-smoke", title: "原生离线回归", text, length: "short", topic: "自定义", wordCount: Array.from(text).length, kind: "custom", version: 1 }]));
      localStorage.setItem("wubi-test:current-article:v1", JSON.stringify("custom-native-smoke"));
    }
    await wait(() => document.querySelector('textarea[aria-label="跟打输入区"]'), "文章输入区");
    assert(location.protocol === "tauri:", "使用内置 tauri 协议，无本地 HTTP 服务");
    const originalFetch = window.fetch;
    window.fetch = (...args) => {
      const url = new URL(typeof args[0] === "string" ? args[0] : args[0].url, location.href);
      if (["http:", "https:"].includes(url.protocol)) return Promise.reject(new Error("native test offline"));
      return originalFetch(...args);
    };
    if (first) {
      const input = document.querySelector('textarea[aria-label="跟打输入区"]');
      fill(input, "五");
      await new Promise((resolve) => setTimeout(resolve, 350));
      fill(input, text);
      await wait(() => document.body.textContent.includes("本次成绩已存入本机"), "成绩保存");
      assert(JSON.parse(localStorage.getItem("wubi-test:sessions:v1")).length === 1, "原生输入事件完成练习并通过事务保存成绩");
      localStorage.setItem("native-smoke-completed", "true");
    } else {
      assert(JSON.parse(localStorage.getItem("wubi-test:sessions:v1")).length === 1, "重启或替换二进制后成绩保留");
    }
    await navigate("/lookup");
    const lookup = await wait(() => document.querySelector('[aria-label="查询汉字、词组或五笔编码"]:not(:disabled)'), "离线查码");
    fill(lookup, "五");
    await wait(() => document.body.textContent.toLowerCase().includes("gghg"), "五字编码");
    assert(true, "内置完整码表可离线查询");
    for (const path of ["/training", "/advanced", "/history", "/settings"]) {
      await navigate(path);
      await wait(() => document.querySelector("main"), path);
      assert(!document.body.textContent.includes("Application error"), `路由可打开 ${path}`);
    }
    await wait(() => document.body.textContent.includes("文章、码表和内置音乐已随应用安装"), "桌面设备说明");
    assert(!button("安装到这台设备"), "App 隐藏 PWA 安装入口");
    if (navigator.serviceWorker) assert((await navigator.serviceWorker.getRegistrations()).length === 0, "App 未注册 Service Worker");
    const catalog = await (await fetch("/data/music-catalog.json")).json();
    const response = await fetch(catalog.tracks[0].sources[0].src);
    assert(response.ok && (await response.blob()).size > 0, "内置音乐文件可读取");
  } catch (error) {
    report.failed = `${error.message}\n${error.stack ?? ""}`;
  }
  location.href = `tauri://localhost/__native_test_result?report=${encodeURIComponent(JSON.stringify(report))}`;
})();
