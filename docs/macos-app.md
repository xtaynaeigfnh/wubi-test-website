# 五笔练习 macOS App

第一版面向 Apple Silicon（M1 及更新芯片），最低 macOS 13。应用内置网站页面、300 篇文章、码表和音乐，运行时不需要 Node.js、Rust、网络或本地服务器。

## 安装与数据

打开发布的 DMG，将「五笔练习.app」拖入「应用程序」后启动。也可以直接打开交付目录中的 App。本机试用版只有 ad-hoc 签名，未经 Apple Developer ID 签名及公证；通过网络分享后可能受到 Gatekeeper 拦截。确认来源后可按系统提供的“隐私与安全性 → 仍要打开”流程处理；不要关闭 Gatekeeper。正式公开分发前需补齐 Developer ID 签名、公证和其他 Mac 的安装验证。

App 使用独立的 WebKit 本地存储，与 Safari、Chrome 和已安装的 PWA 不共用数据。迁移方法：网站“设置 → 备份与恢复 → 导出完整备份”，再在 App 中选择该文件、检查预览并确认恢复。文件格式和版本保持兼容；导出取消不会重置备份提醒。本地音乐仍为会话导入，不包含在 JSON 备份中。

升级时先退出 App，再替换旧 `.app`，应用标识 `com.xtay.wubi-practice` 保持不变即可沿用存储。不要删除应用数据目录；重要成绩仍建议定期导出备份。首版没有自动更新或云端同步。

关闭窗口、Command-W、Command-Q、菜单退出共用离开保护。进行中的练习需确认放弃；成绩待保存或文件正在保存时阻止正常退出。强制退出和系统终止无法保证拦截。再次启动只聚焦已有主窗口。

## 从源码构建

准备 Node.js 26.13 或更高的 26.x、Xcode Command Line Tools（`xcode-select --install`）、Rust stable 与 Cargo（通过 rustup 安装）。构建脚本也会查找 `~/.cargo/bin`，无需修改全局 shell 配置。

```sh
npm ci
npm run build:app
```

JS 依赖按 `package-lock.json` 安装，Rust 依赖使用 `src-tauri/Cargo.lock` 并以 `--locked` 构建。首次构建需要联网下载依赖。App 构建强制空 base path，静态产物为 `out-app/`，不会改动 Pages 的 `out/` 或 Vinext 的 `dist/`。Turbopack 中文路径根目录设置保留。

产物：`src-tauri/target/aarch64-apple-darwin/release/bundle/macos/五笔练习.app` 与同级 `dmg/五笔练习_版本_aarch64.dmg`。构建产物均被 Git 忽略。DMG 使用系统镜像工具生成，包含应用与 Applications 快捷入口，不依赖 Finder 的窗口布局脚本。图标沿用 `public/icon.svg`；原始第三方资料及许可证一并放入应用 Resources 的 `third_party/`。

## 验证

```sh
npm run lint
npm run typecheck
npm test
npx playwright install chromium firefox webkit
npm run test:browser
npm run test:a11y
NEXT_PUBLIC_BASE_PATH=/wubi-regression npm run build:pages
BROWSER_BASE_PATH=/wubi-regression BROWSER_ENGINES=chromium npm run test:browser -- --pages
npm run test:app:native
```

浏览器和无障碍脚本需依次运行：Vinext 不允许同一 checkout 同时启动两台开发服务器。

原生测试使用真实 WKWebView，独立标识 `com.xtay.wubi-practice.native-test`。首次测试清空该测试标识的数据，第二次验证重启保留，结果写入 `outputs/macos/`。运行前解锁 macOS 桌面并关闭已有的测试 App。锁屏状态下 WKWebView 可能不能完成自动测试。脚本注入和测试结果端点只存在于 debug 编译，release 安装包不包含这两个入口。此自动测试覆盖内置资源、输入事件保存、查码、主要路由和 PWA 隔离；不能代替实体输入法与系统文件面板的人工验证。

原生验收还应覆盖系统保存面板确认/取消、备份恢复、成绩 PNG、音乐导入/播放、中文输入法候选确认和退格、窗口切换计时、退出保护、重复启动、替换应用后数据保留。测试状态以交付目录中的验证记录为准，未验证项不能视作通过。

## 后续平台

顺序：iPhone → Windows → Android。iPhone 先通过 Mac/Xcode 和个人 Apple ID 真机试用，另行验证签名有效期、软键盘、五笔输入法与文件分享。首版不包含这些平台的安装包。
