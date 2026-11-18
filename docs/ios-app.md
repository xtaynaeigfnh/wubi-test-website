# iPhone 真机版

当前已接入 Tauri 移动入口、iOS 配置、独立静态资源构建、原生文件保存与安全区域样式。macOS 和网站继续使用原有入口。最低 iOS 15，应用标识仍为 `com.xtay.wubi-practice`；各设备独立存储，使用 JSON 备份迁移成绩，不增加账号或云同步。

## 当前进度

- Rust 入口已拆为共享 `lib.rs` 与桌面模块，iOS 不编译桌面菜单、单实例和退出保护。
- 原生共用离线资源、文件保存及外链处理。iOS 文件 URI 原样传给官方文件系统插件；取消保存及写入失败不记录成功备份。
- iOS 页面不注册 Service Worker，不调用桌面退出命令；通过构建标识选择原生行为，不依赖 User-Agent 猜测。
- 已生成 iOS 图标，安装 `aarch64-apple-ios` 和 `aarch64-apple-ios-sim` Rust 目标，并补齐 CocoaPods 1.17.0、XcodeGen 2.46.0。
- 手机 WebKit 页面回归已通过 11 项：主要路由、320px 与横屏布局、PWA 隔离、模拟原生传输下的备份保存/取消/失败/恢复。此检查不能替代 iOS 真机。
- lint、TypeScript、全部 330 项逻辑测试、86 项内容/界面测试、7 项构建后 HTML 检查及 macOS Rust 编译检查通过。
- 已安装并初始化 Xcode 27.2（27B52），iPhoneOS 27.2 SDK 可用，Xcode 工程与 iPhone ARM64 原生编译通过。
- 2026-11-17 已确认 1.1.1 测试版安装在 iPhone 15 Pro Max；Personal Team 签名校验通过，配置文件包含测试设备，当前有效期至 2026-11-23。首次信任后真机出现启动闪退，日志定位到 WebKit 版本查询的系统调用。修复版已改用 ASCII 内部文件名并重新签名、覆盖安装；用户完成开发者验证后，已在 iPhone 15 Pro Max 上确认修复版可启动并正常显示首页。软键盘跟打、成绩保存及系统文件导出仍待真机验收。签名安装包保存在 `outputs/ios/WubiPractice.ipa`。

- Next.js 与 eslint-config-next 已更新至 16.4.6；升级后全量测试通过，npm 依赖审计为 0 项漏洞。

## iOS 27 启动兼容

真机日志曾在 `wry::platform_webview_version → NSBundle bundleWithIdentifier → CFRelease(NULL)` 处触发 SIGTRAP。iOS 配置的内部 `productName` 使用 ASCII 的 `WubiPractice`，通过 `Info.ios.plist` 的 `CFBundleDisplayName` 保持手机显示“五笔练习”；不要把内部产物名改回中文。改变产物名后需重新生成 Xcode 工程，旧 `project.yml` 可能保留原来的 `PRODUCT_NAME`。

## 准备环境

1. 从 Apple App Store 安装完整 Xcode，打开并完成其首次组件安装。只有 Command Line Tools 不够。使用者自行在 Xcode 中登录 Apple ID，不在仓库中存放账号或证书。
2. 在 Xcode Settings → Platforms 中安装 iOS 支持。安装官方 Tauri iOS 前置工具 XcodeGen / CocoaPods（按当前 Tauri 文档要求）。
3. USB 连接 iPhone，在设备上信任这台 Mac。按 Xcode 提示开启设备的 Developer Mode。
4. 检查：

```sh
npm ci
npm run ios:check
```

脚本优先使用 `/Applications/Xcode.app/Contents/Developer`，或你指定的 `DEVELOPER_DIR`，不会修改全局 `xcode-select`。非标准安装位置可先设置 `DEVELOPER_DIR`。本机已准备 Rust iOS 目标；新机器需执行 `rustup target add aarch64-apple-ios aarch64-apple-ios-sim`。

## 初始化与真机运行

```sh
npm run ios:init
npm run ios:open
```

`ios:init` 通过官方 CLI 生成 `src-tauri/gen/apple/`（生成内容不提交）。`ios:open` 构建并内嵌静态页面后打开 Xcode，日常使用不依赖开发服务器。若 CLI 要求 Team，可在命令环境设置 `APPLE_DEVELOPMENT_TEAM`；也可在 Xcode 的 Signing & Capabilities 中选自己的 Personal Team，并按 CLI 提示重新打开。不要提交个人 Team ID、描述文件或签名材料。

在 Xcode 选择连接的 iPhone 作为运行目标，启用自动签名并运行。若首次启动提示开发者不受信任，在手机“设置 → 通用 → VPN 与设备管理”中确认对应的开发者签名，并按系统提示操作。个人 Apple ID 的安装受 Apple 免费开发签名限制，不作为长期分享渠道；签名失效时需重新运行。不要为续签直接卸载应用，先导出重要数据备份。

初始化完成后也可以运行：

```sh
npm run ios:dev -- "你的 iPhone 名称"
npm run build:ios:simulator
npm run build:ios -- --export-method debugging
```

模拟器使用 Apple Silicon 的 `aarch64-sim` 目标；未签名模拟器构建不等于可安装到真机的 IPA。真机包能否导出由当前 Apple 账号与签名配置决定。

## 独立验证

```sh
npm run build:ios:web
npm run test:ios:web
npm run lint
npm run typecheck
npm test
```

iOS 与 macOS 静态构建都使用 `out-app/`，按需覆盖，不要同时执行两个原生构建。该目录始终由构建入口重建，网站的 `dist/`、Pages 的 `out/` 保持独立。

真机验收：首次断网启动、五笔候选/软键盘/退格、旋转与安全区域、输入区在键盘上方可见、切后台后计时恢复、文章与专项训练、文件 App 中 JSON 保存与恢复、成绩图片、本地音频选择、重启与升级后的数据保留。iCloud 与“我的 iPhone”保存位置均需实际测试。手机由系统管理应用生命周期，不显示桌面“退出应用”按钮；强制终止时未完成练习不承诺恢复。

## 参考

- [Tauri iOS 前置环境](https://v2.tauri.app/start/prerequisites/)
- [Tauri 移动开发](https://v2.tauri.app/develop/)
- [原生文件对话框与 iOS URI](https://v2.tauri.app/plugin/dialog/)
