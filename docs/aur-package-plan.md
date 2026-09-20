# pacman 包与 AUR pagein-git 实施计划

## 依赖与所有权

本次单 Agent 串行交付，全部文件由当前负责人独占；不启动子 Agent。分发形态与来源约定见[契约](aur-package-contract.md)。

| 阶段 | 依赖 | 文件与交付                                                                                          | 验收                                                     |
| ---- | ---- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| T0   | 无   | ADR-011、本契约、本计划、AGENTS.md                                                                  | 范围冻结；相对链接、格式与 whitespace 检查               |
| T1   | T0   | `packaging/aur/PKGBUILD`、`packaging/linux/pagein.desktop`、`packaging/aur/.gitignore` 等打包资产    | PKGBUILD 通过 `bash -n` 与 `makepkg --printsrcinfo`；桌面文件字段完整 |
| T2   | T1   | 系统工具链构建（无源码改动，仅记录版本与耗时）                                                      | 门 A：`npm run check`、fmt、Clippy、`tauri build --no-bundle` |
| T3   | T2   | `makepkg` 出包与包校验                                                                              | 门 B：namcap 无 error；`depends` 与文件清单经实测校准     |
| T4   | T3   | `pacman -U` 安装与 Omarchy 桌面实测                                                                 | 门 C：安装、启动、文件关联、打开、编辑、放映、导出、卸载  |
| T5   | T4   | 干净 chroot 全量构建（`devtools`）                                                                  | 门 D 前半：`makedepends` 完整，无隐式宿主依赖            |
| T6   | T5   | AUR 提交与 `yay -S pagein-git` 复装                                                                 | 门 D 后半：AUR 页面可访问，本机 yay 安装并可启动          |
| T7   | T6   | README Linux 安装说明、AGENTS.md、`docs/aur-package-verification.md`                                | 文档链接与结论一致；未验证事项显式列出                   |

## 决策与风险

包资产放在仓库 `packaging/` 下维护，AUR 仓库由脚本或手工同步 PKGBUILD 并用 `makepkg --printsrcinfo` 生成 `.SRCINFO`，避免两边内容漂移。PKGBUILD 不引用 mise，使用系统 `nodejs` / `npm` / `rust`，并在验证记录中写出实测版本。

主要风险：干净 chroot 构建暴露缺失的 `makedepends`；系统工具链版本与 mise 固定版本不同导致构建差异；Rust 全量构建耗时长；`.desktop` 的文件关联依赖 MIME 与窗口类匹配，需在 Hyprland 实测校准；`-git` 包容易被误认为正式版本，须在 README 与包描述中说明。AUR 提交属对外发布行为，只在门 C 与门 D 前半通过后进行。

## 验证门

门 A：`npm run check`、`cargo fmt --check`、Clippy 与 `tauri build --no-bundle` 用系统工具链通过，不依赖 mise。

门 B：`makepkg` 出包成功；namcap 无 error 级问题，warning 逐条解释；`depends` 与文件清单经 `ldd`、`pacman -Ql` 实测校准；包内不含用户 HTML、`artifacts/` 或构建缓存。

门 C：Omarchy 桌面实测——`pacman -U` 安装、启动器与终端启动、`xdg-mime query default text/html` 指向 `pagein.desktop`、双击 `.html` 与命令行参数打开、单实例复用窗口、编辑与输入法、放映与 Esc、导出逐字节比对、`pacman -Rns` 干净卸载。未通过项如实记录，不用浏览器模拟替代。

门 D：干净 chroot 构建通过；AUR 提交后 `yay -S pagein-git` 在本机安装并可启动。

## 当前结果

T0–T5 完成：ADR-011、契约、计划已落盘；`packaging/aur/` 提供 PKGBUILD 与桌面文件；门 A 通过；干净 chroot 出包成功并通过 namcap；Omarchy 桌面实测覆盖安装、启动、文件关联、窗口类、编辑链路、撤销重做、单文件导出、BOM/CRLF 导出、项目导出与未导出确认。放映态 Esc 无法退出的缺陷已按 [ADR-012](ADR-012-presentation-fullscreen-focus.md) 修复并实机验证，但该修复尚未推送上游，`pagein-git` 从 `main` HEAD 构建，包内暂不含此修复。T6（AUR 提交与 `yay -S pagein-git` 复装）待用户 AUR 账号与密钥，尚未执行。证据与未验证事项见[验收记录](aur-package-verification.md)。
