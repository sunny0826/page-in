# ADR-009：系统文件关联与窗口拖放

日期：2026-09-18。状态：已实现，用户确认 macOS 手动验收通过；Windows/Omarchy 待实机验证。

## 决策与替代范围

部分扩展 [ADR-002](ADR-002-t1-spike.md) 与 [ADR-005](ADR-005-html-presentation-projects.md) 的导入入口：除选择器外，支持系统打开 `.html` / `.htm` 和拖放单个 HTML 到窗口。两者都使用单文件模式；项目目录仍由项目选择器打开。原始字节、资源边界、静态预览、补丁与导出契约保持有效。

安装包声明 HTML Editor 文件关联，不强制更改系统默认应用。macOS 接收 `RunEvent::Opened`；Windows/Linux 接收启动参数。增加 Tauri 官方 single-instance 插件，将再次启动的参数交给现有窗口。原生拖放在 Rust 捕获。所有外部请求进入原生队列，由已就绪的前端逐个处理，经过现有未导出确认、解析与清单激活流程。

## 替代方案与风险

- 仅前端监听拖放：不能可靠取得原生路径，且可能丢失冷启动事件，不采用。
- 新开窗口/进程：违反单窗口约束，也会绕过当前会话确认，不采用。
- IPC 接受任意路径：扩大读取能力，不采用；前端只传 Rust 签发的请求 ID。
- 原生事件可能早于前端监听，必须先存储再通知；多个请求必须串行，不能覆盖模态确认。每批多文件明确拒绝，队列最多 32 项。
- 文件关联依赖安装与系统默认应用选择；Windows/Linux 的配置与自动测试不能替代目标系统实测。AppImage 的桌面集成需用户环境支持。

## 验收

自动测试覆盖原生请求授权、取消/失败后的队列推进、大小/类型/编码校验及前端串行调度。全库检查、Clippy、构建通过；macOS 包含 HTML 关联声明，并实测冷启动、热启动、拖放、未导出取消和错误文件。Windows/Omarchy 单独记录待验收。

依据：[Tauri 文件打开事件](https://v2.tauri.app/learn/mobile-file-associations/)、[single-instance](https://v2.tauri.app/plugin/single-instance/)。接口见[契约](native-file-open-contract.md)，交付见[计划](native-file-open-plan.md)。

验收进展见[验证记录](native-file-open-verification.md)。
