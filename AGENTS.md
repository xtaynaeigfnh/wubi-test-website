# 仓库指南

## 项目结构与模块组织

- `app/` 存放 Next.js 路由、共享 TypeScript 模块和 React 组件。路由入口放在 `app/<route>/page.tsx`，可复用界面组件放在 `app/components/`。
- `app/components/WubiApp.tsx` 负责各路由的应用外壳、主题、共享设置、音效与卡顿加练状态；文章测速、字码挑战、五笔查码、本地成绩和设置页面分别位于 `app/components/views/` 下的 `TypingView.tsx`、`ChallengeView.tsx`、`LookupView.tsx`、`HistoryView.tsx` 和 `SettingsView.tsx`，文章测速的状态与副作用暂时仍整体保留在 `TypingView.tsx` 中；训练中心、进阶训练、成绩趋势、周报、按键画像、卡顿热力图与三连练、数据管理、PWA 安装和根级音乐播放器分别拆分在 `TrainingCenter.tsx`、`AdvancedCenter.tsx`、`TrendPanel.tsx`、`WeeklyReportPanel.tsx`、`KeySummary.tsx`、`HesitationHeatmap.tsx`、`HesitationPracticeModal.tsx`、`DataManagement.tsx`、`PwaControl.tsx` 和 `MusicPlayer.tsx`。共享的成绩待保存与未完成练习离开保护位于 `app/components/Ui.tsx`。
- `app/lib.ts` 集中处理浏览器本地数据、文章与码表加载、练习统计、文章进度规范化和备份校验/恢复；文章进度按 `articleId` 唯一，旧重复记录读取时会按有界规则合并。码长教练、幽灵赛、词组专项、自适应处方、间隔复习、卡顿复练、节奏实验、阶段目标、周报和数据维护的纯逻辑分别位于 `app/code-length-coach.ts`、`app/ghost-race.ts`、`app/phrase-training.ts`、`app/training-plan.ts`、`app/spaced-review.ts`、`app/hesitation-practice.ts`、`app/rhythm-lab.ts`、`app/advanced-training.ts`、`app/weekly-report.ts` 和 `app/data-maintenance.ts`。共享类型、按键统计、音乐目录、分享卡片和 ChatGPT 授权逻辑分别位于 `app/types.ts`、`app/key-usage.ts`、`app/music.ts`、`app/share-card.ts` 和 `app/chatgpt-auth.ts`。
- `tests/` 存放 Node 测试套件，测试文件统一命名为 `*.test.mjs`。核心逻辑、卡顿三连练、词组专项、间隔复习、周报、进阶训练和数据维护分别放在同名的测试套件中；内容数据、界面契约与构建后 HTML 分别由 `content-data.test.mjs`、`ui-interaction-contract.test.mjs` 和 `rendered-html.test.mjs` 覆盖。
- `public/` 存放 PWA 清单、Service Worker、生成的 JSON 数据、图标和离线音频。
- `scripts/` 用于生成 300 篇分级文章（短文 120、中篇 105、长文 45、水文 30）、常用字与五笔数据。原始数据和许可证位于 `third_party/`；重新分发时必须保留来源与授权信息。
- `worker/`、`db/`、`drizzle/`、`vite.config.ts`、`build/sites-vite-plugin.ts` 和 `.openai/hosting.json` 支撑 Vinext/Sites/Cloudflare 运行环境；当前 D1 与 R2 均未启用，`db/schema.ts` 默认为空，`examples/d1/` 仅保留可选 D1 用法示例。GitHub Pages 静态导出配置位于 `next.config.ts` 和 `.github/workflows/pages.yml`。

## 构建、测试与开发命令

使用 Node.js 22.13 或更高版本，并通过 `npm ci` 按锁文件精确安装依赖。

- `npm run dev`：启动支持热更新的 Vinext 开发服务器。
- `npm run build`：生成 Vinext 生产构建，默认输出到 `dist/`。
- `npm run build:pages`：生成供 GitHub Pages 使用的 Next.js 静态导出，产物位于 `out/`。
- `npm run start`：在本地运行已完成的生产构建。
- `npm run data:generate`：重新生成四组文章文件、文章索引、常用字数据、完整五笔码表及挑战码表。
- `npm test`：运行逻辑与数据测试，构建应用，再验证渲染后的 HTML。
- `npm run lint` 和 `npm run typecheck`：分别执行 ESLint，以及刷新 Next.js 路由类型后的严格 TypeScript 检查。
- `npm run db:generate`：仅在可选的 Drizzle/D1 schema 发生变化时生成迁移。

## 编码风格与命名约定

遵循现有 TypeScript/React 风格：使用两个空格缩进、双引号、分号，并在多行结构末尾保留逗号。组件和类型使用 `PascalCase`，函数与变量使用 `camelCase`，路由目录使用含义明确的 kebab-case。能提升可读性时优先使用 `@/*` 路径别名。仅供浏览器运行的模块必须显式声明 `"use client"`。ESLint 已启用 Next.js Core Web Vitals 和 TypeScript 规则；项目未配置独立格式化工具。

## 测试规范

测试使用 `node:test` 和 `node:assert/strict`。测试名称应描述可观察行为，而非内部实现。根据改动范围，将用例加入最相关的套件：通用计算与幽灵赛放入 `core-logic`，词组、复习、卡顿、周报、进阶与数据维护分别放入 `phrase-training`、`spaced-review`、`hesitation-practice`、`weekly-report`、`advanced-training` 和 `data-maintenance`，其他存储与 PWA 行为放入 `v02-features`。码长、Unicode 字符计数和输入法按键识别需覆盖边界情况；修改界面结构、文案或响应式布局时，同步更新 `ui-interaction-contract`；修改本地存储、备份或 PWA 时，覆盖异常输入、失败回滚、部署子路径及离线回退。不要移除 `next.config.ts` 中基于 `process.cwd()` 的 Turbopack 根目录设置，它用于保证中文路径下的静态构建稳定。修改生成逻辑后必须提交全部重新生成的数据文件，并确认文章长度、标点、唯一性、内部重复及跨文章重复度测试通过。

GitHub Pages 工作流会依次运行 lint、类型检查和完整测试，全部通过后才执行静态导出与部署。`npm test` 本身不包含 lint 和类型检查，本地交付前需要分别运行三项检查。

## 提交与拉取请求规范

近期提交采用简洁、动作导向的中文标题，例如 `新增…`、`修复…` 和 `优化…`。每个提交只包含一项逻辑完整的改动。拉取请求应说明用户可见影响、列出验证命令、关联相关议题，并为界面改动附上截图。若涉及生成数据、第三方许可、存储结构、PWA 缓存或部署，必须明确说明。严禁提交密钥或本机专用的 `.env*` 配置。
