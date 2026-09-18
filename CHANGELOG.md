# 更新记录

## 0.0.1 Pre-release — 2026-09-18

首个可分发版本，支持 macOS 上的本地 HTML 文字编辑和 HTML 演示项目。

- 原位编辑文字、逐行编辑换行标题、撤销与重做。
- 单 HTML 导出，以及保留资源目录结构的完整项目导出。
- 平级 HTML 幻灯片分页展示，支持按钮、方向键和滚轮。
- 无独立顶栏的 macOS 窗口、紧凑图标浮栏、自适应配色滚动条。
- 中文和英文界面，设置中可查看版本与诊断信息。
- 修复 WebKit 输入被设为只读，以及脚本移除导致源位置映射偏移的问题。

提供 macOS 13+ / Apple Silicon、Windows x64 和 Linux x64 构建，Omarchy 使用 AppImage。Windows / Linux 包已进入预发布流程，桌面运行验证由用户后续执行。macOS 使用 ad-hoc 签名，尚未进行 Developer ID 签名与 Apple 公证；Windows 包未做代码签名。预览不运行原页面脚本；导出保留原代码。详见 [发布说明](docs/releases/0.0.1.md)。
