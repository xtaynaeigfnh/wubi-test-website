# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

86 版五笔打字练习网站，支持离线使用。提供文章测速、常用字练习、错题复练、五码根专项、字码挑战、离线查码和离线 Lo-fi 音乐播放。内置文章库包含 80 篇短文、70 篇中篇、30 篇长文和 20 篇网络聊天“水文”；文章测速会对比实际码长与当前码表下的理论下限。

## Key Commands

- `npm run dev` — 启动 Vinext 开发服务器（热更新）
- `npm run build` — 生成生产构建
- `npm run build:pages` — 生成 GitHub Pages 静态导出（Next.js）
- `npm run start` — 运行生产构建
- `npm test` — 完整测试：单元测试 → 构建 → 渲染验证
- `npm run lint` — ESLint 检查
- `npx tsc --noEmit` — TypeScript 类型检查
- `npm run data:generate` — 重新生成文章、常用字、完整码表和挑战码表数据
- `npm run db:generate` — 可选 D1/Drizzle schema 变更后生成迁移

## Architecture

**框架**: Next.js 16 + Vinext（Vite-based Next.js 运行时）。`.openai/hosting.json`、`vite.config.ts` 和 `worker/index.ts` 用于 Sites/Cloudflare Worker 部署；`next.config.ts` 与 `.github/workflows/pages.yml` 用于 GitHub Pages 静态导出。当前 hosting 配置不使用 D1 或 R2。

**路由结构** (`app/`):
- `page.tsx` → 首页文章测速（WubiApp view="typing"）
- `training/page.tsx` → 常用字练习与智能推荐
- `challenge/page.tsx` → 字码挑战
- `lookup/page.tsx` → 离线查码
- `history/page.tsx` → 成绩趋势
- `settings/page.tsx` → 设置与数据管理

**核心逻辑**:
- `app/lib.ts` — 客户端共享逻辑：localStorage 读写、文章与码表加载、成绩统计、错题管理、版本化备份校验/恢复，以及基于单字和词组最优分段的理论最小码长计算。持久化状态通过 `STORAGE` 常量定义的 key 存储在浏览器 localStorage；恢复失败时必须保留原数据。
- `app/types.ts` — 全部 TypeScript 类型定义（文章、成绩、设置、音乐等）
- `app/music.ts` — 音乐目录解析与播放逻辑
- `app/components/WubiApp.tsx` — 主应用组件，根据 `view` prop 渲染不同页面
- `app/components/TrainingCenter.tsx` — 今日训练、智能推荐、错题复练和字根专项
- `app/components/DataManagement.tsx` — 完整备份、自定义文章和 TXT 批量导入
- `app/components/TrendPanel.tsx` — 成绩趋势序列
- `app/components/PwaControl.tsx` — Service Worker 状态和安装提示
- `app/components/MusicPlayer.tsx` — 跨路由保持状态的根级离线播放器
- `app/components/Ui.tsx` — 打字练习核心 UI 组件
- `app/share-card.ts` — 本地成绩卡 PNG 生成

**数据**:
- `public/data/` — 静态 JSON：文章索引及 short/medium/long/water 四组正文、完整五笔码表、挑战码表、常用字表和音乐目录
- `scripts/` — 数据生成脚本（generate-articles.mjs, generate-wubi-data.mjs）
- `third_party/` — 原始数据源（rime-wubi 码表、mrccorpus 字频）
- 用户数据全部存在浏览器 localStorage，不上传服务器

**PWA**: `public/sw.js` + `public/manifest.webmanifest` 提供离线缓存支持。Service Worker 必须兼容 GitHub Pages 的部署子路径，预缓存所有页面和文章目录，并在网络失败时回退到已缓存页面/数据。

**数据库** (可选): `db/schema.ts` + Drizzle ORM + SQLite，用于 Cloudflare D1 部署场景。

## Coding Conventions

- 2 空格缩进、双引号、分号、多行末尾逗号
- 组件/类型用 PascalCase，函数/变量用 camelCase，路由目录用 kebab-case
- 浏览器端模块必须声明 `"use client"`
- 使用 `@/*` 路径别名
- 测试文件统一命名 `*.test.mjs`，使用 `node:test` + `node:assert/strict`
- 测试名称描述可观察行为，不描述实现细节
- 统计、Unicode 字符计数、输入法按键和音乐逻辑优先补充 `tests/core-logic.test.mjs`
- 界面结构、文案或响应式布局改动同步更新 `tests/ui-interaction-contract.test.mjs`
- 本地存储、备份恢复、PWA 和离线回退改动补充 `tests/v02-features.test.mjs`
- 文章生成改动必须通过 `tests/content-data.test.mjs` 的长度、标点、唯一性、内部重复和跨文章重复度检查，并提交全部重新生成的 JSON
- `npm test` 不包含 lint 与类型检查；交付前同时运行 `npm run lint`、`npx tsc --noEmit` 和 `npm test`。GitHub Pages 工作流也以这三项为部署门禁

## Commit Style

简洁中文标题：`新增…`、`修复…`、`优化…`。每个提交只包含一项逻辑完整的改动。涉及生成数据时必须同时提交重新生成的文件。

## Third-Party Notices

分发时必须保留 `THIRD_PARTY_NOTICES.md`、`third_party/rime-wubi/` 和 `third_party/mrccorpus/`。
