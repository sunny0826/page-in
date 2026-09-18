# ADR-003：WKWebView 使用可信输入层

日期：2026-09-17。状态：macOS 原型已实现并验证，其他平台待验收。

部分取代 ADR-001 / ADR-002 中“在禁脚本 iframe 内接收事件并设置 contenteditable”的实现。系统 WebView、一个窗口、原始字节补丁、IPC、导出、沙箱禁脚本及 T1 功能范围保持不变。

## 证据与决策

本机 WKWebView 样本映射 10/10，实际双击只选中文字，父层注册到 iframe Document 的事件处理器未执行。这与 [WebKit 缺陷 218086](https://bugs.webkit.org/show_bug.cgi?id=218086) 一致。

保留 `sandbox="allow-same-origin"`，不增加 allow-scripts。编辑模式使用可信父页面的透明命中层，通过 iframe 的 elementFromPoint 定位文字；双击时在同一位置创建可信 contenteditable 输入元素，复制目标计算样式，并暂时隐藏目标。输入同步到目标以维持排版，结束后恢复目标属性并移除输入元素。预览时移除命中层，只留下原页面和右上角编辑按钮。

复制计算样式时必须排除 `-webkit-user-modify`。普通文字在 WKWebView 中的计算值为 `read-only`，将其写入输入层的内联样式会覆盖 `contenteditable` 的用户代理样式，导致可聚焦、可选中但不能键盘输入。自定义粘贴处理器直接操作 DOM，可能掩盖这个问题；验收必须包含真实按键替换选区和退格删除。见 [键盘输入回归记录](macOS-keyboard-regression.md)。

## 边界与风险

输入、粘贴、键盘和撤销事务只发生在可信父页面；不可信页面仍不能执行脚本。源文件和导出不会包含输入层或临时属性。编辑模式滚轮由命中层转发至原页面，输入时先提交再滚动。

T1 先覆盖普通水平、无变换的纯文本叶元素。旋转、缩放、复杂伪元素、自定义字体及嵌套滚动的原位外观需要后续专项验收；发现无法可靠定位的变换元素保持只读。不因这一适配宣称三个平台门槛通过。

## 替代方案

- 增加 allow-scripts 并只依赖 CSP：不采用，降低现有隔离的纵深。
- 多 WebView 或原生文本控件：需要新的平台边界和性能测试，保留为后续备选。
- 在禁脚本 iframe 内轮询输入：无法可靠处理提交、Esc 和输入法，拒绝。

## 验收

单一实施者修改 main.ts / index.html / style.css。依赖顺序为输入层 → macOS 双击/Enter/Esc/撤销/重做 → 原生导出 → 逐字节验证；TS 与 Rust 检查为门 A，实际 WKWebView 操作为门 B。Windows / Omarchy、真实 IME 另列待测。
