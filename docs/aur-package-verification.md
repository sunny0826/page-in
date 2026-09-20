# pacman 包与 AUR pagein-git 验收

日期：2026-09-20。依据 [ADR-013](ADR-013-linux-pacman-aur-distribution.md)、[契约](aur-package-contract.md)与[计划](aur-package-plan.md)。

## 环境

Omarchy（Arch，x86_64），Hyprland 0.56.2，Wayland 会话，glibc 2.44+r24；系统 webkit2gtk-4.1 2.52.6-1、gtk3 1:3.24.52-1、libayatana-appindicator、librsvg、xdg-desktop-portal-hyprland 均已安装。

## 自动检查与构建

- 本机 mise 工具链（node 24.12.0 / rust 1.92.0）：`version:check`、`tsc --noEmit`、69 项前端测试、17 项 Rust 测试、`cargo fmt --check`、`cargo clippy --all-targets -D warnings` 全部通过；`tauri build --no-bundle` release 构建 2m10s，二进制 5,857,776 字节，`ldd` 无缺失库。
- 干净 chroot 构建：`makechrootpkg -r /var/lib/archbuild/extra-x86_64 -n -c -d /var/cache/pacman/pkg`，由 devtools 1.5.1 创建并维护 chroot。chroot 内实际工具链为 nodejs 26.8.1-2、npm 12.0.2-1、rust 1:1.98.1-1，与 mise 固定版本不同（AUR 构建不使用 mise，符合契约）。`npm ci` 安装 42 个包用时 30s；chroot 内 Rust release 编译 4m08s。
- namcap：PKGBUILD 检查报 `webkit2gtk-4.1` 同时出现在 makedepends 与 depends，已从 makedepends 移除；包检查仅报 hicolor-icon-theme、dbus、cairo、libsoup3、libgcc、glib2、glibc、gdk-pixbuf2 为“implicitly satisfied”，均由 `gtk3` 与 `webkit2gtk-4.1` 传递满足，未再加显式依赖。

## 产物

| 文件                                          | 字节数    | 说明                          |
| --------------------------------------------- | --------- | ----------------------------- |
| pagein-git-0.0.1.r12.gfc20d01b-1-x86_64.pkg.tar.zst | 2,230,870 | 压缩 2.13 MiB，安装后 5.71 MiB；含 live report 与 Esc 修复 |
| pagein-git-debug-…-x86_64.pkg.tar.zst         | 13,354,665 | makepkg 默认生成的调试包，不对外分发 |

早先的 `0.0.1.r5.g742f45f3-1` 包（2,185,272 字节）为修复前构建，已被上表版本取代并删除。

`pacman -Qip`：`Depends On: gtk3 webkit2gtk-4.1`，`Provides: pagein`，`Conflicts With: pagein`，`Licenses: MIT`。`pacman -Ql` 仅包含 `/usr/bin/pagein`、`/usr/share/applications/pagein.desktop`、5 档 hicolor 图标与 `/usr/share/licenses/pagein-git/LICENSE`。

体积对比：v0.0.1 的 Linux AppImage 为 79,866,360 字节，本包为 2,230,870 字节。

## Omarchy 桌面实测

实测方式：`pacman -U` 安装后启动应用，用 uinput 虚拟输入设备（ydotool 1.0.4-2，经 `/dev/uinput` ACL 授权）驱动真实指针与键盘事件，逐步截图核对；导出结果逐字节比对。

通过项：

- 安装：`pacman -U` 成功；`pacman -Qi` / `-Ql` 与设计一致。
- 启动与渲染：从命令行与启动器启动正常，stderr 无 EGL 或空白窗口错误，前端约 300ms 就绪；Wayland 下中文、Emoji 与实体 `&amp;`、`&#169;`、`&lt;tag&gt;` 显示正确。AppImage 的空白窗口 / `EGL_BAD_PARAMETER` 问题在使用系统库的包中未复现。
- 窗口类：`hyprctl clients` 显示 `class: pagein`，与 `.desktop` 的 `StartupWMClass=pagein` 一致。
- 文件关联：`gio mime text/html` 中 `pagein.desktop` 出现在 Registered 与 Recommended 列表；默认应用仍为 `google-chrome.desktop`，未抢占系统默认。
- 命令行参数：`pagein <file.html>` 直接打开该文件。
- 编辑链路：进入编辑模式后双击文字命中输入层；逐键输入、退格、Enter 提交、Ctrl+Z 撤销、Ctrl+Shift+Z 重做均正确，未导出标记随状态变化。
- 单文件导出：`slowly.` → `page` 的导出文件与“原文件仅替换该处”的期望逐字节一致；标题中相同的 `slowly.` 与其他全部字节保持不变。
- BOM + CRLF：导出后 BOM 保留、`\r\n` 数量不变、未引入孤立 `\n`，且改动区间之外逐字节一致。
- 项目导出：`index.html` 与“仅目标文字替换”的期望逐字节一致，`assets/` 内文件与源逐字节相同，空目录 `empty/` 保留，源项目校验和不变。
- 未导出确认：带未导出修改时点击窗口关闭按钮，弹出“保留这次修改吗？”，含取消 / 丢弃 / 导出三个按钮，丢弃沿用危险色；取消后应用保持打开。
- 放映进入：F5 进入原生全屏，应用顶部栏隐藏。

未通过 / 已修复：

- **放映态下 Esc 未退出**（已修复）：全屏放映后页面完全收不到键盘事件（窗口级键盘与指针正常），Esc 无法退出且只能重启恢复。按 [ADR-012](ADR-012-presentation-fullscreen-focus.md) 采用 Linux 专用原生菜单项「退出放映」绑定 Esc、仅在全屏时启用，Rust 发 `exit-presentation` 事件、前端只在放映态退出。修复后实测：F5 进入全屏后 Esc 退出并恢复窗口与进入前的编辑状态，窗口模式下 Esc 取消编辑未回归。修复随本 PR 进入 `main`；此前由 `main` HEAD 构建的本地包不含该修复，需在合并后重建。

## Rebase 复验

分支 rebase 到含 ADR-011（isolated live reports）的最新 `main` 后重新构建并复验：`version:check`、类型检查、74 项前端测试（原 69 项，新增 live report 用例）、17 项 Rust 测试、`fmt`、Clippy 与 `tauri build --no-bundle` 全部通过；Omarchy 上重跑编辑与导出（`slowly.` → `page`，导出 383 字节与期望逐字节一致、`<title>` 中同名文字保持不变）以及 F5 进入全屏后 Esc 退出，均通过。chroot 包校验与其余桌面用例未在 rebase 后重跑，结论仍基于 rebase 前的构建。

## 打包版本复验

PR #3 合并后用合并后的 `main`（`fc20d01`）重跑干净 chroot 构建，得到 `pagein-git-0.0.1.r12.gfc20d01b-1`，namcap 仅报传递满足提示。`pacman -U` 安装后实测：F5 进入原生全屏（`fullscreen: 2`）后 Esc 退出并恢复窗口（`fullscreen: 0`、749×400）；编辑链路（双击命中、Ctrl+A、逐键输入、Enter 提交）正常；导出 `slowly.` → `page` 的文件 383 字节，与期望逐字节一致且 `<title>` 内同名文字未变。此前的 69 项前端测试在 rebase 后为 74 项，其余自动检查结论不变。

## 未验证事项

- 物理键盘与鼠标的同等操作未执行，本次为 uinput 虚拟设备注入。
- 中文输入法组合期（IME）未测试，本次仅输入 ASCII。
- 放映态下的翻页（演示项目多页）与滚轮行为未测试；本次用例均为单页报告。
- `pacman -Rns pagein-git` 干净卸载未执行。
- AUR 提交与 `yay -S pagein-git` 复装未执行，见下节。

## AUR 状态

尚未提交：AUR 当前关闭注册，用户决定等开放注册后再进行发布。仓库内 `packaging/aur/` 保存 PKGBUILD、`pagein.desktop` 与 `.gitignore`；`.SRCINFO` 需在提交前用 `makepkg --printsrcinfo` 生成。本机 `~/.ssh` 无 AUR 密钥，注册开放后需要添加公钥才能推送。AUR 提交是对外发布行为，按契约在本地安装与桌面验收、干净 chroot 构建通过后进行；本页记录的是提交前的本地验收状态。

## 与 AppImage 分发的差异

v0.0.1 已发布的 AppImage 与 deb 附件保持不动。Linux 分发形态自本日起为 pacman 包与 AUR `pagein-git`；包体积、依赖解析、文件关联与卸载均交由 pacman，代价是仅支持 Arch / Omarchy。`pagein-git` 跟随上游 `main` HEAD，`pkgver` 由 git 派生，不代表任何正式版本。
