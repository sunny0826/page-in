# Base UI 界面验收

日期：2026-09-17。对应 [ADR-004](ADR-004-base-ui-shell.md)。

## 实现

- 精确依赖：Base UI 1.8.0、React/React DOM 19.3.0。
- Base UI Button、Menu、Dialog、Tooltip、Separator 实际接入，按组件子路径导入。
- 暖白与鼠尾草绿视觉系统：欢迎页、示意卡片、三步说明、带文件名/修改状态的悬浮工具栏、菜单、弹窗、可关闭提示。
- iframe 与输入层保留独立 DOM 所有权；保留 `-webkit-user-modify` 排除规则，不影响 HTML 源码字节与沙箱。
- `vite.config.ts` 仅过滤 Base UI 的 `use client` 模块边界提示；本项目为纯客户端桌面 SPA，其余构建警告照常显示。

## 已执行验收

| 验证                | 结果                                                 |
| ------------------- | ---------------------------------------------------- |
| TypeScript 全库检查 | 通过，含 TSX、测试及 Vite 配置                       |
| 单元测试            | 13 项 TS/状态测试 + 6 项 Rust 测试通过               |
| Release 打包        | macOS arm64 app 构建成功                             |
| 欢迎页              | 原生截图检查排版、打开入口和三步说明                 |
| 示例/编辑模式       | 进入预览，再切换至新工具栏，原页面样式保留           |
| 键盘输入 → 点击预览 | 真实输入 `Base UI edit` 后点击预览，文字提交并保留   |
| 撤销/重做           | 原标题与修改内容之间正确切换                         |
| 菜单键盘操作        | Down 选择诊断项、Enter 打开对话框，AX 确认内容       |
| 弹窗 Esc            | 关闭诊断，对话框内容从活动状态移除                   |
| 未导出退出提醒      | 关闭窗口触发提醒，取消后修改仍在                     |
| 导出                | 原生保存对话框成功生成 `base-ui-edited.html`         |
| 导出保真            | 逐字节等于原样本仅将标题替换为 `Base UI edit` 的结果 |

新增状态测试覆盖弹窗取消只完成一次、替换弹窗时取消旧决策、动作关闭不误触发取消，以及 UI 快照更新不丢失文档状态。

## 包体与限制

前端合计 553,789 bytes，逐文件 gzip（level 9）合计 170,438 bytes。PageIn.app 文件合计 4,634,057 bytes，约 4.42 MiB；不包含 Node 或浏览器内核。

实现了 800/650px 断点、窄工具栏、可滚动弹窗及 reduced-motion 样式。此次原生自动化坐标拖拽返回 `noWindowsAvailable`，未能完成窗口缩放实测；不将静态 CSS 检查等同于窄窗口验收。菜单到弹窗的截图捕获出现旧帧，弹窗交互结果以原生 AX 与实际关闭/取消操作为证。Windows、Linux、真实中文 IME 沿用此前未验收状态。

测试导出位于 `src-tauri/target/verification/base-ui-edited.html`。最终运行入口为 `src-tauri/target/release/bundle/macos/PageIn.app`。
