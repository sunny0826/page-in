# macOS 选中文字后无法输入：修复与回归

日期：2026-09-17。

## 原因与修复

本次首先发现旧构建进程仍在运行，双击只产生普通选区。重新构建现有源码后，可信输入层能够出现，但键盘输入仍失败。

`src/main.ts` 将目标元素的全部计算样式复制到输入层，其中包含 `-webkit-user-modify: read-only`。这个内联样式覆盖了 `contenteditable="plaintext-only"` 的编辑状态。修复为复制时排除此属性，让可信输入层的 `contenteditable` 属性决定可编辑性；沙箱、文字映射和导出格式保持现有契约。

[Apple Safari CSS 文档](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariCSSRef/Articles/StandardCSSProperties.html) 说明该属性控制内容是否可修改，并与 `contentEditable` 紧密相关。

原验证报告使用自定义粘贴处理器写入 DOM，不能证明实际键盘输入可用。本次在修复前确认 `x` 按键无效，修复后用同类按键确认替换成功。

## 实机回归步骤及结果

使用当前项目 Release 构建的 PageIn.app，在 macOS 系统 WKWebView 中完成以下操作：

1. 打开内置样本，点击编辑，双击标题；按 `x`，选区被替换为 `x`。
2. 按 Backspace 删除，输入 ASCII 字符，输入框即时更新。
3. 全选并粘贴 `macOS 编辑验证 🌿 & <文字>`，Enter 提交；页面显示新标题并标记未导出。
4. 点击撤销恢复原标题，重做恢复新标题。
5. 再次双击标题，按 `x`，确认临时输入出现；Esc 恢复已提交的新标题。
6. 通过原生保存对话框导出新 HTML；逐字节比对确认仅替换标题，`&`、`<`、`>` 正确转义，其他字节保持原样。
7. 打开本地报告 HTML，双击其标题，按 `x` 后 Enter，确认页面标题变为 `x` 并标记未导出；撤销恢复原文。验证后保留该文件在新版编辑模式中，未覆盖原文件。

导出验证产物位于 `src-tauri/target/verification/macos-keyboard-edited.html`（构建目录，不纳入源码）。

类型检查、10 项解析测试、6 项 Rust 测试及 macOS Release 打包均通过。中文与 emoji 仅验证粘贴；真实中文输入法、Windows 与 Linux 不属于此次验收范围。

## 运行修复版

执行 `mise run build` 后，正常关闭旧进程，再打开 `src-tauri/target/release/bundle/macos/PageIn.app`。正在运行的旧进程不会因磁盘上的源码或应用包更新而自动加载修复。
