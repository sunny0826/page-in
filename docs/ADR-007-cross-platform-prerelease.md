# ADR-007：0.0.1 跨平台预发布

日期：2026-09-18。

本文件保留历史预发布决策。后续用户授权使用当前源码正式重发 v0.0.1，标签、附件与发布状态约束已由 [ADR-008](ADR-008-v0.0.1-formal-release.md) 部分取代。

## 决策与替代范围

按用户要求，将已公开的 0.0.1 标记为 pre-release，补充 Windows x64 NSIS 安装程序和 Linux x64 AppImage、Debian 包。AppImage 供 Omarchy 试用，Debian 包用于 Debian/Ubuntu。部分取代 [ADR-006](ADR-006-first-release.md) 的「仅 macOS 分发」和「Release 草稿」约束；版本、身份、原文件不可变、静态预览、资源目录约束及 macOS 签名声明继续有效。

新增包使用现有 v0.0.1 标签的源码，不移动标签，也不混入 main 后续界面改动。构建流程从 main 加载，在 Windows / Ubuntu GitHub 托管运行器上通过 mise 使用标签固定的工具版本。现有 macOS 附件保持不变。

## 替代方案与风险

- 本地 macOS 交叉编译：需要额外 Windows SDK、Linux sysroot 与打包环境，优先使用原生 CI。
- 等待各平台实机验收后发布：用户明确要求先提供包，故以预发布交付，用户后续验证。
- 将标签移动到 main：会使已有 macOS 包与标签不一致，故保持原标签。

Windows 未做代码签名；Linux AppImage 未在 Omarchy 的 Wayland/图形驱动环境实测。CI 构建与测试通过不能等同于实际桌面功能验收。

## 验收

门 A：各平台版本检查、TypeScript、前端测试、Rust 测试与 release 打包通过。

门 B：检查包类型、非空产物、SHA-256 与构建来源，确认 GitHub 附件可下载且 Release 为 pre-release。桌面启动、编辑及导出由用户在对应系统后续验证，明确记为待验证。
