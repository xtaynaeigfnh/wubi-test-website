# 五笔测试网站

一个专为 86 版五笔熟练用户设计的本地打字练习网站，包含 200 篇离线文章、
前 1500 常用字分段练习、文章测速、字码挑战、离线查码、本地成绩、练习设置，
以及可跨页面持续播放的离线 Lo-fi 音乐。

常用字练习提供前 100、前 500、中 500、后 500 和前 1500 五个范围。
默认按字频顺序练习，也可以在练习工具栏中点击“乱序”重新排列。

## 使用前须知

- 支持 macOS、Windows 和 Linux。
- 需要安装 Node.js 22.13 或更高版本。
- 第一次安装依赖需要联网；安装并构建完成后，日常练习不需要联网。
- 文章、86 版五笔码表和页面资源均包含在本地文件中。
- 练习成绩、错题和设置只保存在当前浏览器，不会上传。
- 这是源码体验包，不能直接双击 HTML 文件运行，需要通过终端启动本地服务。

## 第一次启动

### 1. 安装 Node.js

如果电脑尚未安装 Node.js，请前往 [Node.js 官方网站](https://nodejs.org/)下载安装。

安装完成后打开终端，检查版本：

```bash
node -v
npm -v
```

`node -v` 显示的版本需要不低于 `v22.13.0`。

### 2. 进入项目目录

先解压收到的 ZIP 文件，再在终端进入解压后的 `wubi-test-website`（五笔测试网站）目录。

macOS 或 Linux 示例：

```bash
cd "/你的路径/wubi-test-website"
```

Windows PowerShell 示例：

```powershell
cd "C:\你的路径\wubi-test-website"
```

路径中有中文或空格时，请保留两侧引号。

### 3. 安装依赖

```bash
npm ci
```

此步骤第一次执行时需要联网，通常只需执行一次。

### 4. 构建网站

```bash
npm run build
```

构建成功后会生成本地运行所需的文件。

### 5. 启动网站

```bash
npm run start
```

终端出现本地地址后，用浏览器打开它。默认通常是：

```text
http://localhost:3000/
```

不要关闭正在运行服务的终端窗口。练习结束后，在终端按 `Ctrl + C` 停止服务。

## 以后再次启动

只要没有删除 `node_modules` 和 `dist` 目录，以后进入项目目录后通常只需执行：

```bash
npm run start
```

网站启动后不需要连接外网。

## 端口被占用

如果默认端口已被其他程序占用，可以换一个端口：

```bash
npm run start -- --port 4173
```

然后打开：

```text
http://localhost:4173/
```

## 数据保存位置

练习成绩、错题、文章进度、自定义文本和主题设置保存在浏览器本地：

- 换浏览器后不会自动带过去。
- 清除浏览器网站数据后，本地记录也会被删除。
- 网站“本地成绩”页面提供清除本地记录的功能。
- 多个人在同一台电脑上使用时，建议分别使用不同的浏览器用户资料。

## 常见问题

### 提示 `node: command not found` 或“无法识别 node”

Node.js 尚未正确安装。重新安装 Node.js 后，关闭并重新打开终端。

### `npm ci` 下载失败

确认电脑可以访问互联网，然后重新执行 `npm ci`。如果使用了代理，也需要确认终端的网络设置正常。

### 修改文件后页面没有变化

先按 `Ctrl + C` 停止服务，再重新构建和启动：

```bash
npm run build
npm run start
```

### 可以直接发送 `dist` 目录吗

不可以。当前项目包含服务端渲染运行文件，只有 `dist` 目录或其中的 HTML、JavaScript 文件不足以独立启动网站。

## 开发模式

需要修改页面并实时查看效果时使用：

```bash
npm run dev
```

浏览器打开终端显示的本地地址。开发模式只用于修改网站，普通体验建议使用前面的构建和启动方式。

## 项目维护与验证

运行完整测试：

```bash
npm test
```

练习文章、常用字表与 86 版五笔码表均已打包在项目中，网站运行时不连接外部服务。
所有练习记录只保存在当前浏览器。

单独检查代码规范和类型：

```bash
npm run lint
npx tsc --noEmit
```

重新生成 200 篇练习文章和 86 版五笔码表：

```bash
npm run data:generate
```

## 新增音乐

播放器从 `public/data/music-catalog.json` 读取版本化曲目目录，不在组件中写死曲目。
新增音乐时：

1. 把音频文件复制到 `public/audio/tracks/`。
2. 在 `public/data/music-catalog.json` 的 `tracks` 数组末尾添加一条记录。
3. 填写稳定且唯一的 `id`、曲名、作者、站内音频路径、MIME 类型、时长、许可和来源页面。
4. 在 `THIRD_PARTY_NOTICES.md` 中补充来源与许可，然后运行 `npm test`。

目录中的 `sources[].src` 只接受 `/audio/tracks/` 下的站内路径，以保证离线运行。
当前支持 `audio/mpeg`、`audio/ogg` 和 `audio/mp4`。目录数组顺序就是播放顺序；
新增曲目后需要重新构建并发布网站，但不需要修改播放器代码。

## 第三方数据

86 版五笔码表来自 [rime/rime-wubi](https://github.com/rime/rime-wubi)。

分发本项目时请保留以下内容：

- `THIRD_PARTY_NOTICES.md`
- `third_party/rime-wubi/LICENSE`
- `third_party/rime-wubi/AUTHORS`
- `third_party/rime-wubi/wubi86.dict.yaml`

常用字排名来自北京语言大学公开的“现代汉语研究语料库”汉字频率表，来源与提取信息位于
`third_party/mrccorpus`。

离线 Lo-fi 曲目来自 HoliznaCC0 的 Public Domain Lofi 专辑，逐曲按
CC0 1.0 Universal 核对；完整曲目清单、来源页面与许可见 `THIRD_PARTY_NOTICES.md`。
