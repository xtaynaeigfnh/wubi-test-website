# 仓库指南

## 项目结构与模块组织

- `app/` 存放 Next.js 路由、共享 TypeScript 模块和 React 组件。路由入口放在 `app/<route>/page.tsx`，可复用界面组件放在 `app/components/`。
- `app/components/WubiApp.tsx` 负责各路由的应用外壳和主要交互；训练计划、成绩趋势、数据管理、PWA 安装与根级音乐播放器分别拆分在 `TrainingCenter.tsx`、`TrendPanel.tsx`、`DataManagement.tsx`、`PwaControl.tsx` 和 `MusicPlayer.tsx`。
- `app/lib.ts` 集中处理浏览器本地数据、文章与码表加载、练习统计、备份校验/恢复，以及基于单字和词组最优分段的理论最小码长计算；共享类型位于 `app/types.ts`，音乐目录逻辑位于 `app/music.ts`。
- `tests/` 存放 Node 测试套件，测试文件统一命名为 `*.test.mjs`。
- `public/` 存放 PWA 清单、Service Worker、生成的 JSON 数据、图标和离线音频。
- `scripts/` 用于生成 200 篇分级文章、常用字与五笔数据。原始数据和许可证位于 `third_party/`；重新分发时必须保留来源与授权信息。
- `worker/`、`db/`、`drizzle/`、`vite.config.ts`、`build/` 和 `.openai/hosting.json` 支撑 Vinext/Sites/Cloudflare 运行环境；当前 D1 与 R2 均未启用。GitHub Pages 静态导出配置位于 `next.config.ts` 和 `.github/workflows/pages.yml`。

## 构建、测试与开发命令

使用 Node.js 22.13 或更高版本，并通过 `npm ci` 按锁文件精确安装依赖。

- `npm run dev`：启动支持热更新的 Vinext 开发服务器。
- `npm run build`：生成 Vinext 生产构建。
- `npm run build:pages`：生成供 GitHub Pages 使用的 Next.js 静态导出。
- `npm run start`：在本地运行已完成的生产构建。
- `npm run data:generate`：重新生成四组文章文件、文章索引、常用字数据、完整五笔码表及挑战码表。
- `npm test`：运行逻辑与数据测试，构建应用，再验证渲染后的 HTML。
- `npm run lint` 和 `npx tsc --noEmit`：分别执行 ESLint 与严格 TypeScript 检查。
- `npm run db:generate`：仅在可选的 Drizzle/D1 schema 发生变化时生成迁移。

## 编码风格与命名约定

遵循现有 TypeScript/React 风格：使用两个空格缩进、双引号、分号，并在多行结构末尾保留逗号。组件和类型使用 `PascalCase`，函数与变量使用 `camelCase`，路由目录使用含义明确的 kebab-case。能提升可读性时优先使用 `@/*` 路径别名。仅供浏览器运行的模块必须显式声明 `"use client"`。ESLint 已启用 Next.js Core Web Vitals 和 TypeScript 规则；项目未配置独立格式化工具。

## 测试规范

测试使用 `node:test` 和 `node:assert/strict`。测试名称应描述可观察行为，而非内部实现。根据改动范围，将用例加入最相关的套件：`core-logic`、`content-data`、`ui-interaction-contract`、`v02-features` 或 `rendered-html`。码长、Unicode 字符计数和输入法按键识别需覆盖边界情况；修改界面结构、文案或响应式布局时，同步更新界面契约测试；修改本地存储、备份或 PWA 时，覆盖异常输入、失败回滚、部署子路径及离线回退。修改生成逻辑后必须提交全部重新生成的数据文件，并确认文章长度、标点、唯一性及跨文章重复度测试通过。

GitHub Pages 工作流会依次运行 lint、类型检查和完整测试，全部通过后才执行静态导出与部署。`npm test` 本身不包含 lint 和 `tsc`，本地交付前需要分别运行三项检查。

## 提交与拉取请求规范

近期提交采用简洁、动作导向的中文标题，例如 `新增…`、`修复…` 和 `优化…`。每个提交只包含一项逻辑完整的改动。拉取请求应说明用户可见影响、列出验证命令、关联相关议题，并为界面改动附上截图。若涉及生成数据、第三方许可、存储结构、PWA 缓存或部署，必须明确说明。严禁提交密钥或本机专用的 `.env*` 配置。
