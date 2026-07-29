# 五笔测试网站

一个专为 86 版五笔熟练用户设计的本地打字练习网站，包含 200 篇离线文章、
前 1500 常用字分段练习、文章测速、字码挑战、离线查码、本地成绩、练习设置，
以及可跨页面持续播放的离线 Lo-fi 音乐。

常用字练习提供前 100、前 500、中 500、后 500 和前 1500 五个范围。
默认按字频顺序练习，也可以在练习工具栏中点击“乱序”重新排列。

## 本地运行

需要 Node.js 22.13 或更高版本。

```bash
npm install
npm run dev
```

浏览器打开 `http://localhost:3000/`。

## 验证

```bash
npm test
```

练习文章、常用字表与 86 版五笔码表均已打包在项目中，网站运行时不连接外部服务。
所有练习记录只保存在当前浏览器。

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

86 版五笔码表来自 [rime/rime-wubi](https://github.com/rime/rime-wubi)，完整许可证、作者信息和原始码表位于 `third_party/rime-wubi`。

常用字排名来自北京语言大学公开的“现代汉语研究语料库”汉字频率表，来源与提取信息位于
`third_party/mrccorpus`。

离线 Lo-fi 曲目来自 HoliznaCC0 的 Public Domain Lofi 专辑，逐曲按
CC0 1.0 Universal 核对；完整曲目清单、来源页面与许可见 `THIRD_PARTY_NOTICES.md`。
