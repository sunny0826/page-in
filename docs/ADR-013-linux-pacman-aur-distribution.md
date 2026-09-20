# ADR-013：Linux 分发改为 pacman 包与 AUR pagein-git

日期：2026-09-20。状态：已决策，待实施。

## 决策与替代范围

用户决定 Linux 分发形态由 AppImage / deb 改为 Arch 原生方式：本机用 `makepkg` 产出 pacman 包并在 Omarchy 桌面完成实机验收，验收通过后把 `pagein-git` 提交到 AUR，用户通过 `yay -S pagein-git` 或 Omarchy 菜单 Install > Package 安装。

本 ADR 部分替代 [ADR-007](ADR-007-cross-platform-prerelease.md)、[ADR-008](ADR-008-v0.0.1-formal-release.md) 与[正式发布契约](formal-release-contract.md)、[跨平台预发布契约](cross-platform-release-contract.md) 中的 Linux 产物与分发条款（Linux 只提供 AppImage / deb、Omarchy 使用 AppImage）。以下继续有效：原始字节不变、静态沙箱、导出契约、版本一致性、产品身份 `io.pagein.desktop`、签名与实机验收边界、不将 CI 或包校验当作实机验收。v0.0.1 已发布的 AppImage 与 deb 附件保持不动，本 ADR 不追溯修改已发布内容，也不授权移动已发布标签。

包名 `pagein-git`，`provides` / `conflicts` 为 `pagein`，架构 `x86_64`。来源为 `git+https://github.com/sunny0826/page-in.git`，跟随上游 `main` HEAD，`pkgver` 由 git 派生；AUR 仓库只包含 PKGBUILD 与 `.SRCINFO`，不包含二进制。应用链接系统 `webkit2gtk-4.1`，包内不打包 WebKit 或 GTK。仓库不提升版本号：`-git` 包的 `pkgver` 已表达“晚于 0.0.1”，应用内版本仍显示 0.0.1。

本次不发布 GitHub Release、不打标签、不做 macOS / Windows 包，也不申请 Omarchy 官方仓库 `pkgs.omarchy.org`。

## 替代方案与风险

- 继续 AppImage：体积约 80 MB，需要 FUSE 或 `--appimage-extract-and-run`，且 linuxdeploy 的 GTK 打包在 Arch + Hyprland 上有已知空白窗口与 `EGL_BAD_PARAMETER` 问题，同时没有包管理器集成。不采用。
- `pagein-bin`：安装预编译二进制，但需要 GitHub Release 产物，与本次不发版冲突。保留为将来选项，不作为当前形态。
- 只做本地包、不提交 AUR：分发价值有限，用户已明确选择提交 AUR。
- 进入 Omarchy 官方仓库：由 Omarchy 维护者控制，非自助流程。不采用。
- 风险：分发范围收窄到 Arch / Omarchy；AUR 用户在本地构建，Rust 全量编译耗时较长；PKGBUILD 在干净 chroot 中不能依赖 mise 固定的 node / rust 版本，须用系统 `nodejs` / `npm` / `rust` 并记录实际版本；`-git` 包跟随 HEAD，不代表任何正式版本，须在 README 与包描述中说明；`.desktop` 的文件关联依赖 MIME 与窗口类匹配，必须在 Hyprland 实测校准；包体积、`depends` 与耗时在实施前均未实测。

## 验收

见[契约](aur-package-contract.md)与[计划](aur-package-plan.md)。门 A：`npm run check`、fmt、Clippy 与 `tauri build --no-bundle` 用系统工具链通过。门 B：`makepkg` 出包成功，namcap 无 error 级问题，文件清单与 `depends` 经实测校准。门 C：Omarchy 桌面实测安装、启动、文件关联、编辑、放映与导出，未通过项如实记录。门 D：干净 chroot 构建通过，且 AUR 提交后 `yay -S pagein-git` 在本机安装并可启动。

依据：[Tauri 分发说明](https://v2.tauri.app/distribute/)（`--no-bundle`）、[AUR 提交规范](https://wiki.archlinux.org/title/AUR_submission_guidelines)、[Arch PKGBUILD 规范](https://wiki.archlinux.org/title/PKGBUILD)。
