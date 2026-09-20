# ADR-012：Linux 原生全屏下放映无法用 Esc 退出

日期：2026-09-20。状态：已实施，Omarchy 实机验证通过。

## 决策与替代范围

修复 Omarchy / Linux 上"进入原生全屏放映后按 Esc 无法退出"的问题：在 PageIn 原生菜单中增加一项「退出放映」并绑定 Esc 加速键，**仅在窗口处于原生全屏时启用**；Rust 收到菜单事件后向前端发送 `exit-presentation`，前端只在放映态调用 `controls.exit()`。

[放映契约](presentation-contract.md) 不变：F5 从当前页进入原生全屏、顶部栏隐藏、Esc 退出并恢复之前的编辑/预览与全屏状态、放映期间快捷键不触发编辑历史。沙箱、IPC 权限、资源读取与导出行为不受影响；macOS / Windows 路径不增加该菜单项（`#[cfg(target_os = "linux")]`）。

## 现象与实测证据

环境：Omarchy（Arch）、Hyprland 0.56.2、Wayland；同一结论在 `GDK_BACKEND=x11`（XWayland）下复现，故非 Wayland 专属。

| 观测                                          | 结果                                       |
| --------------------------------------------- | ------------------------------------------ |
| 窗口模式下页面 keydown（临时诊断打印每次按键） | 正常收到（`key:q`、`key:F5`）               |
| F5 进入原生全屏                                | 成功，顶部栏隐藏                            |
| 全屏下页面 keydown                             | **完全收不到**（无任何按键记录）            |
| 全屏下指针事件                                 | 正常（双击可在文档中放置光标）              |
| 全屏下窗口级键盘：F10 打开原生菜单栏            | 正常                                        |
| 全屏下原生菜单加速键：Ctrl+Q 退出应用           | 正常                                        |
| 合成器层面退出全屏（Super+F）                   | 应用仍停留在放映界面，需重启恢复            |
| 对照：foot 终端全屏后键盘                       | 正常，非平台问题                            |

结论：WebKitGTK 在窗口进入原生全屏后不再向页面投递键盘事件；窗口级键盘与指针路径正常，问题局限在 WebView 的键盘投递。应用已有的 DOM 层 `surface.focus()` / `frame.contentWindow.focus()` 无法弥补。

尝试过且**无效**的修复（均在进入全屏后执行，调用返回成功但结果不变）：`Webview::set_focus()`（wry → GTK `grab_focus`）、`WebviewWindow::set_focus()`（GTK present）、循环重复抓取、`hide_menu()`、`Webview::hide()` + `show()` 后重新聚焦、点击文档后按键。

## 采用方案与风险

采用原生加速键兜底，因为它是全屏下**实测可用**的键盘通路。菜单项默认禁用，窗口事件里按全屏状态切换启用：禁用项不参与 GTK 加速键分发，因此窗口模式下 Escape 仍由页面处理（编辑取消、模态关闭等行为不回归）；进入全屏后才接管 Escape。

未采用：改为无边框最大化会改变"原生全屏"语义并与 macOS 分叉；继续深挖 GTK / WebKitGTK 内部收益不确定。

风险：全屏下 Esc 由原生菜单项处理，页面不再收到该键（该状态下页面本来也收不到）；菜单项在 PageIn 菜单可见（中文标签，与既有「退出 PageIn」一致）；窗口模式下若页面未消费 Escape，加速键不会触发（项被禁用），行为与修复前一致。

## 验收

2026-09-20 在 Omarchy 实测：F5 进入全屏（`fullscreen: 2`）后按 Esc 退出并恢复窗口（`fullscreen: 0`、749×400）与进入前的编辑状态；窗口模式下 Esc 取消编辑未回归；`npm run check`（69 项前端 + 17 项 Rust 测试）、`cargo fmt --check`、Clippy 与 `tauri build --no-bundle` 通过。证据见 [pacman 与 AUR 验收](aur-package-verification.md)。

未验证：物理键盘复测（本次为 uinput 虚拟设备注入，但同一路径此前已能复现该缺陷）；Windows 行为未验证（该菜单项不参与 Windows 构建）；macOS 路径未改动。

依据：本页表格为 2026-09-20 在本机实测结果；诊断用临时代码已移除，未进入提交。
