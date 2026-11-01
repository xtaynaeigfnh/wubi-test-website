# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

86 版五笔打字练习网站，支持离线使用。提供文章测速、个人最佳幽灵赛、码长教练、今日训练与自适应处方、词组专项、间隔复习、错题与卡顿片段复练、节奏实验室、中文实战场、七日/十四日阶段目标、周报与能力雷达、数据维护与完整备份，以及离线查码、成绩卡和音乐播放。内置文章库包含 120 篇短文、105 篇中篇、45 篇长文和 30 篇网络聊天“水文”（共 300 篇）；文章测速会对比实际码长与当前码表下的理论下限。

## Key Commands

- `npm run dev` — 启动 Vinext 开发服务器（热更新）
- `npm run build` — 生成生产构建
- `npm run build:pages` — 生成 GitHub Pages 静态导出（Next.js）
- `npm run start` — 运行生产构建
- `npm test` — 完整测试：单元测试 → 构建 → 渲染验证
- `npm run lint` — ESLint 检查
- `npm run typecheck` — 刷新 Next.js 路由类型后执行 TypeScript 类型检查
- `npm run test:a11y` — Playwright 跨浏览器键盘、响应式与无障碍检查（需先安装浏览器）
- `npm run test:browser` — Chromium、WebKit 关键交互回归；`-- --pages` 验证已构建静态站点的子路径离线更新，命令见 README
- `npm run data:generate` — 重新生成文章、常用字、完整码表和挑战码表数据
- `npm run db:generate` — 可选 D1/Drizzle schema 变更后生成迁移

## Architecture

**框架**: Next.js 16 + Vinext（Vite-based Next.js 运行时）。`.openai/hosting.json`、`vite.config.ts`、`build/sites-vite-plugin.ts` 和 `worker/index.ts` 用于 Sites/Cloudflare Worker 构建与部署；`next.config.ts` 与 `.github/workflows/pages.yml` 用于 GitHub Pages 静态导出。当前 hosting 配置不使用 D1 或 R2。`next.config.ts` 中基于 `process.cwd()` 的 Turbopack 根目录设置用于保证中文路径下的静态构建稳定，不要移除。

**路由结构** (`app/`):
全局样式以 `app/globals.css` 为唯一入口，按功能物理拆分到 `app/styles/` 下的各文件中，入口仅保留按原级联顺序排列的 `@import` 清单。
- `page.tsx` → 首页文章测速（WubiApp view="typing"）
- `training/page.tsx` → 今日训练中心：自适应处方、错题复练、五码根专项、卡顿片段加练
- `advanced/page.tsx` → 进阶训练：节奏实验室、中文实战场、阶段目标与字码挑战；`?tab=challenge` 直达挑战
- `challenge/page.tsx` → 兼容旧入口，展示进阶训练的字码挑战标签
- `lookup/page.tsx` → 离线查码
- `history/page.tsx` → 本地成绩、卡顿热力图与文章完成度
- `summary/page.tsx` → 击键统计（左右手、指法、键区）
- `settings/page.tsx` → 设置、自定义文章与数据管理

**核心逻辑**:
- `app/storage.ts` — 存储键、基础 localStorage/sessionStorage 读写和多键写入失败回滚，无业务模块依赖。读取修复使用带旧值比较的 `repairLocalValue`，不能在读取路径无锁覆盖整份数据。
- `app/storage-lock.ts` — 复合读改写用 `withStorageWriteLock` 包裹完整操作；回调必须同步，不在锁内等待网络或其它异步任务。同步存储核心仅供锁内组合和单元测试使用。
- `app/practice-transactions.ts` — 浏览器练习持久化的异步入口。等待保存结果后再更新成功状态。
- `app/content-loader.ts` / `app/typing-metrics.ts` — 内容加载与打字指标纯计算。
- `app/practice-schema.ts` — 业务读取与备份共用的纯校验、文章进度与目标规范化，以及配套默认值和自定义文章构造；不执行存储 I/O。
- `app/lib.ts` — 只保留旧公开 API 的兼容导出，新代码直接引用职责模块。设置读取、文章构造与初选、训练题池、成绩聚合、数据清理 I/O 和时长格式化分别位于 `settings-store.ts`、`article-practice.ts`、`training-pools.ts`、`practice-statistics.ts`、`maintenance-store.ts` 和 `format.ts`。主要练习数据读写与成绩管理位于 `app/practice-store.ts`，版本化备份校验和恢复位于 `app/backup.ts`。文章进度按 `articleId` 与 `articleVersion` 联合唯一，身份键在 `app/article-progress.ts`；同版本旧重复记录读取时按有界规则合并，未记录版本的旧进度保留，但不计入当前正文的完成度与训练推荐。恢复失败按逆序还原已修改项，不能删除未修改项来腾空间，回滚失败需明确报错。
- `app/typing-session.ts` / `app/typing-outcome.ts` — 纯事件状态转换与完成快照结算。完成后冻结统计，保存失败保留结果供重试；重置清空统计但保留后台状态，Hook 在初始化和重置时同步实际可见性。
- `app/onboarding.ts` / `app/onboarding-baseline.ts` — 首次引导进度、三段短测的初步建议和状态校验。
- `app/training-plan.ts` — 弱项评分（`scoreWeakItem`）、自适应每日训练处方（`generateDailyTrainingPlan`）与错字观察累积（`applyWeakObservations`）
- `app/code-length-coach.ts` / `app/phrase-training.ts` — 理论码长机会与词组专项选题
- `app/ghost-race.ts` — 幽灵时间线、可比较记录与赛后分段复盘
- `app/spaced-review.ts` — 单字、词组与卡顿片段的间隔复习队列
- `app/rhythm-lab.ts` / `app/advanced-training.ts` — 节奏分析、中文实战和阶段目标评测
- `app/weekly-report.ts` / `app/weekly-report-card.ts` — 周报、能力雷达与本地 PNG 导出
- `app/data-maintenance.ts` — 本机数据用量、清理预览、保留规则和轻量摘要
- `app/key-usage.ts` — 键盘键位定义与击键统计（左右手、指法、键区）
- `app/hesitation-practice.ts` — 从卡顿热力图中提取片段、三连练结果判定与观察项生成
- `app/share-card.ts` — 本地成绩卡 PNG 生成
- `app/types.ts` — 全部 TypeScript 类型定义（文章、成绩、设置、音乐、卡顿复练等）
- `app/music.ts` — 音乐目录解析、偏好校验、曲目索引和路径辅助逻辑；实际音频播放由 `MusicPlayer.tsx` 管理
- `app/components/WubiApp.tsx` — 应用外壳，用 `next/dynamic` 按当前路由按需加载页面视图，管理共享设置、主题、音效与卡顿加练状态
- `app/components/FirstUseGuide.tsx` — 可跳过的首次引导、短测建议、七日目标与推荐复练入口
- `app/components/lookup/` — 查码搜索、结果、按键顺序提示及工作区样式
- `app/components/views/` — `TypingView`、`ChallengeView`、`LookupView`、`HistoryView`、`SettingsView` 页面组件；文章测速的文章库、练习会话、幽灵赛与码长诊断 Hook 位于 `typing/` 下的 `useArticleLibrary.ts`、`useTypingSession.ts`、`useGhostRace.ts` 和 `useTypingDiagnostics.ts`。`TypingInput.tsx` 适配输入法事件，`TypingPracticeArea.tsx` 与 `TypingResult.tsx` 分别展示练习区和结算区；`TypingView.tsx` 保留页面组装、实时指标计算与会话协调
- `app/components/TrainingCenter.tsx` — 今日训练中心页面组装：自适应处方、错题复练、五码根专项、卡顿片段加练与未完成练习切换保护。计划与到期复习操作在 `training/useTrainingPlan.ts`、`training/useDueReviews.ts`；计划、到期队列、每日目标和卡顿队列在同目录的 `DailyTrainingPlanCard.tsx`、`DueReviewQueue.tsx`、`DailyGoalCard.tsx`、`HesitationQueueCard.tsx`；错题、词组和字根专项在 `ReviewPractice.tsx`、`PhrasePractice.tsx`、`RootPractice.tsx`，共享编码专项会话在 `training/CodeDrill.tsx`
- `app/components/AdvancedCenter.tsx` — 节奏、实战、阶段目标与字码挑战的进阶训练页。练习会话与节奏展示在 `advanced/AdvancedPractice.tsx`、`advanced/RhythmSummaryView.tsx`
- `app/components/WeeklyReportPanel.tsx` — 周报、能力雷达、改善解释与下一步建议
- `app/components/HesitationHeatmap.tsx` — 卡顿热力图与片段识别
- `app/components/HesitationPracticeModal.tsx` — 卡顿片段三连练弹窗
- `app/components/KeySummary.tsx` — 击键统计（左右手、指法、键区）
- `app/components/DataManagement.tsx` — 数据用量与清理、轻量摘要、完整备份、自定义文章和 TXT 批量导入
- `app/components/TrendPanel.tsx` — 成绩趋势序列
- `app/components/PwaControl.tsx` — Service Worker 状态和安装提示
- `app/components/MusicPlayer.tsx` — 跨路由保持状态、兼顾指针悬停和键盘焦点的根级离线播放器
- `app/components/Ui.tsx` — 打字练习核心 UI 组件，以及成绩待保存和未完成练习的共享离开保护

**数据**:
- `public/data/` — 静态 JSON：文章索引及 short/medium/long/water 四组正文、完整五笔码表、挑战码表、常用字表和音乐目录
- `scripts/` — 数据生成与语料校验脚本（generate-articles.mjs, generate-wubi-data.mjs）
- `scripts/article-corpus/` — 300 篇分级文章的正文语料（short/medium/long/water 四个模块），写作规则见该目录 `README.md`；正文是人工写作，不要用模板或脚本重新生成
- `third_party/` — 原始数据源（rime-wubi 码表、mrccorpus 字频）
- 用户数据全部存在浏览器 localStorage，不上传服务器

**PWA**: `public/sw.js` + `public/manifest.webmanifest` 提供离线缓存支持。Service Worker 必须兼容 GitHub Pages 的部署子路径，预缓存所有页面和文章目录，并在网络失败时回退到已缓存页面/数据。

**数据库** (可选): `db/index.ts` 提供 Drizzle/D1 连接入口，`db/schema.ts` 默认不定义任何表；如需启用 D1，参考 `examples/d1/` 并同步更新 `.openai/hosting.json`、schema 与迁移。不要在未启用绑定时假设 `env.DB` 可用。

## Coding Conventions

- 2 空格缩进、双引号、分号、多行末尾逗号
- 组件/类型用 PascalCase，函数/变量用 camelCase，路由目录用 kebab-case
- 浏览器端模块必须声明 `"use client"`
- 能提升可读性时优先使用 `@/*` 路径别名
- 测试文件统一命名 `*.test.mjs`，使用 `node:test` + `node:assert/strict`
- 测试名称描述可观察行为，不描述实现细节
- 统计、Unicode 字符计数、输入法按键和音乐逻辑优先补充 `tests/core-logic.test.mjs`
- 卡顿片段复练逻辑补充 `tests/hesitation-practice.test.mjs`
- 词组专项、间隔复习、周报、进阶训练和数据维护分别补充 `tests/phrase-training.test.mjs`、`tests/spaced-review.test.mjs`、`tests/weekly-report.test.mjs`、`tests/advanced-training.test.mjs` 和 `tests/data-maintenance.test.mjs`
- 界面结构、文案或响应式布局改动同步更新 `tests/ui-interaction-contract.test.mjs`
- 本地存储、备份恢复、练习状态、设置、PWA 和输入复盘改动分别补充 `tests/storage.test.mjs`、`tests/backup.test.mjs`、`tests/practice-store.test.mjs`、`tests/settings.test.mjs`、`tests/pwa.test.mjs` 和 `tests/input-review.test.mjs`
- 跨浏览器键盘、响应式和无障碍检查可运行 `npm run test:a11y`；脚本默认启动开发服务器，结果写入 `output/playwright/accessibility/`，不包含在 `npm test` 中
- 练习会话事件序列使用 `tests/typing-session.test.mjs`；输入法、存储失败恢复、切歌等关键行为使用 `npm run test:browser`，覆盖范围见 `tests/browser-coverage.md`。浏览器与无障碍脚本共用 `scripts/browser-test-server.mjs`；Windows 上先停止开发服务器再构建，避免文件监听冲突
- 文章正文改动必须保持 120 篇短文、105 篇中篇、45 篇长文和 30 篇水文的分布，通过 `tests/content-data.test.mjs` 的长度、标点、唯一性、内部重复和跨文章重复度检查，以及 `tests/article-style.test.mjs` 的具体场景、直接引语、句段节奏和禁用模板句检查，并提交全部重新生成的 JSON；正文写在 `scripts/article-corpus/` 下的人工语料里，`scripts/generate-articles.mjs` 只做规范化与校验
- 构建产物与渲染结果在 `tests/rendered-html.test.mjs` 校验（`npm test` 的最后一步）
- `npm test` 不包含 lint、类型检查和浏览器回归；交付前同时运行 `npm run lint`、`npm run typecheck` 和 `npm test`。GitHub Pages 部署还要求生产依赖审计、双引擎操作回归、手机与桌面无障碍检查及生产子路径离线回归通过；只有 main 推送或 main 手动运行会部署

## Commit Style

简洁中文标题：`新增…`、`修复…`、`优化…`。每个提交只包含一项逻辑完整的改动。涉及生成数据时必须同时提交重新生成的文件。

## Third-Party Notices

分发时必须保留 `THIRD_PARTY_NOTICES.md`、`third_party/rime-wubi/` 和 `third_party/mrccorpus/`。
