# 仓库指南

## 项目结构与模块组织

- `app/` 存放 Next.js 路由、共享 TypeScript 模块和 React 组件。路由入口放在 `app/<route>/page.tsx`，可复用界面组件放在 `app/components/`。
- `app/components/WubiApp.tsx` 负责文章测速、字码挑战、查码、成绩和设置界面；`app/components/TrainingCenter.tsx` 负责常用字、错题和字根训练。
- `app/lib.ts` 集中处理浏览器本地数据、练习统计、备份恢复与理论最小码长计算；共享类型位于 `app/types.ts`。
- `tests/` 存放 Node 测试套件，测试文件统一命名为 `*.test.mjs`。
- `public/` 存放 PWA 清单、Service Worker、生成的 JSON 数据、图标和离线音频。
- `scripts/` 用于生成文章及五笔数据。原始数据和许可证位于 `third_party/`；重新分发时必须保留来源与授权信息。
- `worker/`、`db/`、`drizzle/`、`vite.config.ts` 和 `build/` 支撑 Vinext/Cloudflare 运行环境。GitHub Pages 导出配置位于 `next.config.ts` 和 `.github/workflows/`。

## 构建、测试与开发命令

使用 Node.js 22.13 或更高版本，并通过 `npm ci` 按锁文件精确安装依赖。

- `npm run dev`：启动支持热更新的 Vinext 开发服务器。
- `npm run build`：生成 Vinext 生产构建。
- `npm run build:pages`：生成供 GitHub Pages 使用的 Next.js 静态导出。
- `npm run start`：在本地运行已完成的生产构建。
- `npm run data:generate`：重新生成文章、常用字数据及 `public/data/wubi86.json`。
- `npm test`：运行逻辑与数据测试，构建应用，再验证渲染后的 HTML。
- `npm run lint` 和 `npx tsc --noEmit`：分别执行 ESLint 与严格 TypeScript 检查。

## 编码风格与命名约定

遵循现有 TypeScript/React 风格：使用两个空格缩进、双引号、分号，并在多行结构末尾保留逗号。组件和类型使用 `PascalCase`，函数与变量使用 `camelCase`，路由目录使用含义明确的 kebab-case。能提升可读性时优先使用 `@/*` 路径别名。仅供浏览器运行的模块必须显式声明 `"use client"`。ESLint 已启用 Next.js Core Web Vitals 和 TypeScript 规则；项目未配置独立格式化工具。

## 测试规范

测试使用 `node:test` 和 `node:assert/strict`。测试名称应描述可观察行为，而非内部实现。根据改动范围，将用例加入最相关的套件：`core-logic`、`content-data`、`ui-interaction-contract`、`v02-features` 或 `rendered-html`。码长等统计逻辑需覆盖边界情况；修改界面结构或响应式布局时，同步更新界面契约测试。修改生成数据时，必须同时提交重新生成的文件，并通过完整的 `npm test` 流程。

## 提交与拉取请求规范

近期提交采用简洁、动作导向的中文标题，例如 `新增…`、`修复…` 和 `优化…`。每个提交只包含一项逻辑完整的改动。拉取请求应说明用户可见影响、列出验证命令、关联相关议题，并为界面改动附上截图。若涉及生成数据、第三方许可、存储结构、PWA 缓存或部署，必须明确说明。严禁提交密钥或本机专用的 `.env*` 配置。
