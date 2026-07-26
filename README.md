# 五笔测试网站

一个专为 86 版五笔熟练用户设计的本地打字练习网站，包含 200 篇离线文章、文章测速、字码挑战、离线查码、本地成绩和练习设置。

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

练习文章与 86 版五笔码表均已打包在项目中，网站运行时不连接外部服务。所有练习记录只保存在当前浏览器。

## 第三方数据

86 版五笔码表来自 [rime/rime-wubi](https://github.com/rime/rime-wubi)，完整许可证、作者信息和原始码表位于 `third_party/rime-wubi`。
