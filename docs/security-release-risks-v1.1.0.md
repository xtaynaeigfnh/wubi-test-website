# V1.1.0 安全与发布风险记录

更新时间：2026-09-14

检查范围：当前工作区、生产依赖、Vinext 构建、GitHub Pages 静态导出与 PWA 代码。

## 结论

代码修复已落实：Next.js / eslint-config-next 已升级到 16.3.5，生产依赖审计为 0 漏洞；PWA 不再强制接管或刷新现有窗口，更新等待所有本站窗口关闭；Pages 使用 configure-pages 返回的 origin 和 base_path 构建元数据，支持自定义域名；package.json 与锁文件版本统一为 1.1.0。缓存版本更新为 v20，不涉及本地成绩结构迁移。

真实系统输入法、手机真机、浏览器升级接管和在线分享抓取尚未完成验收，不能仅凭代码修复声称这些测试已通过。以下漏洞表和问题描述保留为 9 月 12 日发现记录。

## 已确认的依赖漏洞

9 月 12 日 `npm audit --omit=dev` 报告 3 个受影响包（其中 Next.js 对应两条公告）；9 月 14 日复查已清零：

| 依赖 | 严重性 | 影响版本 | 修复版本或处理方式 | 适用条件 |
|---|---|---|---|---|
| `next` | Critical | `16.0.0` 至 `16.3.2` | `16.3.3` 或更高 | 未启用 Cache Components、且应用运行在 Windows 文件系统上的服务端部署，可能受到未认证远程代码执行影响 |
| `next` | Critical | `16.0.0` 至 `16.3.2` | `16.3.3` 或更高 | 使用 Next.js Image Optimization API 处理 AVIF 时存在远程代码执行风险 |
| `sharp`（Next.js 间接依赖） | High | `<0.35.4` | `0.35.4` 或更高 | 依赖中的 libheif 漏洞；是否可利用取决于服务端是否处理相关图像输入 |
| `baseline-browser-mapping`（间接依赖） | Moderate | `>=2.0.0 <2.11.0` | 使用 npm audit 提供的修复升级 | 特制无效输入可能导致进程终止，主要影响使用该包处理外部输入的场景 |

依据：

- [GHSA-p293-qw3h-jr36：Next.js Windows 服务端远程代码执行](https://github.com/advisories/GHSA-p293-qw3h-jr36)
- [GHSA-2xp9-vwfh-vxw4：Next.js AVIF Image Optimization 远程代码执行](https://github.com/advisories/GHSA-2xp9-vwfh-vxw4)
- [GHSA-rgj7-g3m4-5g8c：sharp/libheif 漏洞](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c)

处理要求：

1. 将 `next` 升级到至少 `16.3.3`，并同步更新 `eslint-config-next`（建议使用同一版本线）。
2. 重新生成并提交 `package-lock.json`。
3. 运行 `npm audit --omit=dev`，确认 Critical/High 清零或形成明确的风险接受记录。
4. 重新运行 `npm run lint`、`npm run typecheck`、`npm test`、`npm run build` 和 `npm run build:pages`。

## 已确认的发布风险（非依赖漏洞）

### PWA 更新可能打断进行中的练习

`app/components/PwaControl.tsx` 在 Service Worker 控制器变化时直接执行 `window.location.reload()`。Service Worker 使用 `skipWaiting()` 和 `clients.claim()`，因此新版本接管页面时可能在练习进行中刷新页面。现有离开保护可以覆盖部分导航场景，但更新流程没有统一检查“练习进行中”或“成绩待保存”状态。

已修复：移除 skipWaiting 和控制器变更后的自动刷新；监听 waiting / installed 状态并提示完成练习、保存成绩后关闭全部本站窗口再打开。暂停不视作允许刷新，因为暂停中的输入仍只保存在内存中。

### GitHub Pages 的 Open Graph 图片地址不匹配

`app/layout.tsx` 的默认 `metadataBase` 是 Sites 域名，而 Pages 工作流只设置了 `NEXT_PUBLIC_BASE_PATH`，没有设置 `NEXT_PUBLIC_SITE_URL`。本次静态导出的 `og:image` 指向 Sites 域名下的 `/wubi/og.png`，发布到 GitHub Pages 后可能无法得到正确的分享预览。

已修复：Pages 工作流由 configure-pages 输出设置 NEXT_PUBLIC_SITE_URL 和 NEXT_PUBLIC_BASE_PATH，避免硬编码域名或假设所有站点都具有仓库子路径。

## 验证记录

2026-09-14 按锁文件执行 npm ci 后重新验证：

- ESLint：通过。
- TypeScript 类型检查：通过。
- `npm test`：全部通过；原文的“58 个”只对应当时内容数据及界面契约阶段，不是完整套件总数。
- Vinext 生产构建：通过。
- GitHub Pages `/wubi-test-website` 子路径静态导出：通过。测试配置使用 https://xtaynaeigfnh.github.io；8 个业务路由导出的图片 URL 均为该域名下的 /wubi-test-website/og.png，且产物中的图片存在。这是本地导出验证，不是线上部署验收。
- 新增 PWA 处理函数回归：已有 waiting 更新、安装状态变化和 controllerchange 均不刷新页面，卸载时清理监听器；Service Worker 安装用例禁止调用 skipWaiting。
- npm ci 审计结果：0 漏洞；生产依赖单独审计同样为 0 漏洞。
- `git diff --check`：通过。

自动化测试没有覆盖真实操作系统输入法、浏览器 Service Worker 升级期间的进行中练习，以及实际 GitHub Pages 域名下的分享抓取；正式发布前应补做这三类验收。

## 放行标准

满足以下条件后，才建议将版本标记为 V1.1.0 正式版：

- 依赖漏洞完成升级、复审并重新审计。
- PWA 更新不再无条件打断进行中的练习。
- Pages 的 `og:image` 和站点元数据指向实际部署域名。
- `package.json` 和锁文件版本已更新为 `1.1.0`；本次提交包含两份检查文档。
- 完成一次真实浏览器验收：中文输入法上屏、断网启动、升级接管、待保存成绩恢复。
