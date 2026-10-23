# 关键交互回归

`npm run test:browser` 启动真实应用，默认逐项运行 Chromium 和 WebKit。入口负责服务启动、独立浏览器上下文、超时、截图与 trace；场景位于 `scripts/browser/`。CI 的 Browser interaction regression 步骤运行同一套用例。

## 行为与覆盖位置

- 输入法提交：`typing-ime-commit-before-end`、`typing-ime-end-before-commit` 验证两种组合事件顺序、预编辑不计分、连续重复提交只生成一条成绩；`typing-recovery` 还覆盖文章末尾的长预编辑缓冲。
- 暂停与恢复：`typing-session-lifecycle` 验证输入区禁用、恢复时保留正文、重来后清空、暂停与后台时间不进入最终成绩。精确时间边界继续由 `typing-session.test.mjs` 覆盖。
- Unicode 与回改：`typing-unicode-correction` 在实际页面创建包含扩展汉字与段落的文章，验证正确/错误/当前位置、回删、回改、最终字符数和复盘数据。`typing-paste-drop` 验证真实 DOM 粘贴/拖入事件被阻止。
- 文章选择：`article-selection-generated/recent/quota/read` 逐一模拟多键写入、容量及读取失败，检查原正文、弹窗、原始存储（含不存在的键）和成功重试后的刷新恢复；`article-restart-failure` 检查失败时不能清空正在输入的内容。
- 文章库：`article-library` 操作真实搜索、排序和收藏控件，并验证收藏写入失败的提示；`common-article-restore` 检查常用字保存、最近文章列表保留、刷新恢复和首次引导改选短文；`custom-article-rollback` 检查新建自定义文章后的选择失败与回滚。
- 成绩保存：`typing-recovery` 验证写入失败时无成功提示、下一轮不可用、重来和离开被阻止、再次失败后仍可重试，成功后只保存一次并更新另一个历史页面。
- 备份恢复：`backup-roundtrip` 从实际完成的练习导出备份，再通过文件选择、预览、确认和重新加载验证成绩、错字、自定义文章和设置。预览本身不能修改数据。
- 备份异常：`backup-unreadable-damaged/blocked` 验证旧数据损坏/拒读仍可预览；`backup-rollback` 验证部分写入后失败恢复所有原始键并可重试；`backup-invalid-stale-file` 验证无效文件撤销旧预览、较早的慢文件不能覆盖最新选择。
- 播放器自适应：`music-shortcuts` 保留新版曲目列表，在两套皮肤及 320、375、1440px 视口逐首通过键盘切歌，检查列表与浮层不横向溢出、每行点击区域至少 44px，并验证 Escape 关闭与焦点恢复。

## 本轮迁移的旧测试

以下测试原先抽取组件/Effect 源码或模拟 Hook 状态槽，现在由上述浏览器用例替代：

- `ui-interaction-contract.test.mjs` 中的备份预览 `useState` 顺序模拟、常用字恢复 Effect 抽取、ArticlePicker 组件抽取、字符渲染 `useMemo` 片段抽取。
- `practice-store.test.mjs` 中四种文章选择失败和常用字选择测试，以及只供这些测试使用的 `helpers/article-library-harness.mjs`。
- 与文章保存、切换事务、备份文件检查并发和下载有关的源码实现断言。

保留纯计算、存储事务、数据校验单元测试，以及界面布局、语义、无障碍和其他功能的结构契约。不要再用 Hook 调用次序、局部变量名或源码函数体来替代这些关键流程的交互测试。

## 定向运行与诊断

```sh
BROWSER_ENGINES=chromium BROWSER_SCENARIOS=typing-recovery,backup-rollback npm run test:browser
```

`BROWSER_SCENARIOS` 接受逗号分隔的完整场景名，拼错会失败；未设置时运行全部场景。`--pages` 仍专用于生产子路径离线更新回归。`BROWSER_OUTPUT` 可指定独立报告目录，避免定向调试覆盖全量报告。

测试只在独立上下文中准备本机数据，或替换平台边界（Storage、File.text、时钟和 visibility 事件）制造可重复故障；不调用产品内部处理函数、不替换 React Hook。操作优先通过可访问名称、角色和标签定位；正确/错误字符的样式状态是有限的视觉检查例外。恢复成功等待真实页面加载，避免“先点击再订阅加载事件”的竞态。

每个浏览器操作都有超时；失败会返回非零退出码，并保存对应截图和 trace。业务断言同时检查界面与存储，不能只因为控件存在就算通过。

## 系统输入法人工验收

自动化派发的 CompositionEvent 不能替代操作系统五笔候选窗。发布输入适配改动时，在 macOS Safari 和 Chromium 中各用实际五笔输入法检查：

1. 连续输入词组、选第二候选并回删，确认正文、字数和错误统计符合操作。
2. 在文章最后一个字处输入长编码缓冲，候选尚未上屏时不应结算；确认候选后只结算一次。
3. 中途暂停恢复、切后台再返回，确认已输入内容保留；重来后旧候选不能写入新一轮。

记录浏览器、系统输入法及版本和结果。浏览器自动化全绿只证明事件适配和页面流程，不声称已完成人工系统输入法验收。

### 模块拆分后的连接处

`training-plan-reviews` 从持久化到期数据进入真实训练界面，验证暂缓失败保留队列、重试成功、到期单字和词组完成后返回计划，以及处方字根分区锁定与刷新恢复。`typing-recovery` 同时验证结算保留原文、焦点进入复盘区且不再挂载输入框。以上场景在 Chromium 和 WebKit 执行，避免用父组件的源码位置推断这些行为。
