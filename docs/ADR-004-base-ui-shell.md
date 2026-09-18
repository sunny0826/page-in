# ADR-004：Base UI 应用外壳

日期：2026-09-17。状态：已实现，macOS 核心链路已验证；窄窗口及其他平台实机验收待补。用户要求使用 [Base UI](https://base-ui.com/) 优化界面。详见 [验收记录](base-ui-verification.md)。

## 决策、替代方案与风险

应用外壳采用 React、React DOM 和 Base UI，精确锁定依赖。使用 Base UI 的 Button、Menu、Dialog、Tooltip 与 Separator，并通过本地 CSS 定义暖白、墨色和鼠尾草绿的视觉系统。替代方案是只模仿文档样式，但不能满足实际使用组件库的要求；全量重写编辑引擎则会扩大本次变更范围。

部分取代 ADR-001/ADR-002 中可信前端采用纯 TypeScript DOM UI 的实现选择。系统 WebView、单窗口、受限 iframe、解析 Worker、Rust 文字补丁与原生文件对话框保持不变。ADR-003 的可信输入层及 WebKit 只读样式修复继续有效。

React 仅渲染工具外壳，不接管文档 iframe、命中层或 contenteditable 节点。引擎推送不可变 UI 快照，界面通过明确动作回调请求引擎操作。风险是新增前端体积以及菜单/弹窗的焦点切换影响文字提交；通过按需导入、包体测量与实际 WKWebView 回归检查。

## 验收

门 A：全项目 TypeScript、解析与 Rust 测试、Release 构建。门 B：macOS 打开样本、真实键盘改字、Enter/Esc、撤销/重做、菜单键盘操作、模态弹窗、未导出提醒及导出保真。检查窄窗口布局和 reduced-motion 支持。Windows/Linux 不由本次 macOS 验收替代。

## 实施依赖与所有权

| 阶段     | 依赖     | 交付与所有权                                                                 |
| -------- | -------- | ---------------------------------------------------------------------------- |
| T0       | 无       | 本 ADR、架构契约补充、实施计划；主 Agent                                     |
| UI 接入  | T0       | package/锁文件、tsconfig、shell 状态与 React 组件、index.html、CSS；主 Agent |
| 引擎连接 | UI 接入  | main.ts 动作与状态桥接；主 Agent                                             |
| 双门验收 | 引擎连接 | 原生验证、包体和文档更新；主 Agent                                           |

本轮单一实施者，不启动并行 Agent，不改 Rust/解析/IPC 契约。
