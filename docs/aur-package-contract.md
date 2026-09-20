# pacman 与 AUR 分发契约

依据 [ADR-013](ADR-013-linux-pacman-aur-distribution.md)，替代 [正式发布契约](formal-release-contract.md) 中 Linux 产物条款。

## 冻结约定

| 项目     | 约定                                                                                                                    |
| -------- | ----------------------------------------------------------------------------------------------------------------------- |
| 包名     | `pagein-git`，`provides=('pagein')`，`conflicts=('pagein')`，`arch=('x86_64')`                                            |
| 来源     | `git+https://github.com/sunny0826/page-in.git`，跟随上游 `main` HEAD；`pkgver` 由 `git describe` 派生，不由仓库版本号决定 |
| 构建工具 | 系统 `nodejs` / `npm` / `rust` 与系统 `webkit2gtk-4.1` 头文件；PKGBUILD 不得调用 mise                                     |
| 构建命令 | `npm ci` 后 `npm run tauri -- build --no-bundle`，产物为 `src-tauri/target/release/pagein`                               |
| 运行依赖 | 以 `ldd` 与 namcap 实测校准，预期 `gtk3`、`webkit2gtk-4.1`；不打包 WebKit / GTK                                          |
| 安装内容 | `/usr/bin/pagein`、`/usr/share/applications/pagein.desktop`、`/usr/share/icons/hicolor/{32x32,64x64,128x128,256x256,512x512}/apps/pagein.png`、`/usr/share/licenses/pagein/LICENSE` |
| 桌面文件 | `Exec=pagein %U`、`MimeType=text/html;`、`Icon=pagein`、`Categories=Utility;TextEditor;`，`StartupWMClass` 由实机校准    |
| AUR 内容 | 只提交 PKGBUILD 与 `.SRCINFO`；不提交二进制、构建缓存、用户 HTML 或 `artifacts/`                                          |
| 发布顺序 | 本机 `makepkg` 安装并完成实机验收 → 干净 chroot 复核 → AUR 提交 → `yay -S pagein-git` 复装验证                            |
| 版本表述 | 仓库版本保持 0.0.1；`-git` 包不代表正式版本，README 与包描述须说明其跟随 `main` HEAD                                      |

## 不变的部分

原始字节不可变、静态沙箱、导出契约、单实例与请求队列、资源授权边界、产品身份 `io.pagein.desktop`、IPC 权限与 capability 均不修改。本次只增加打包资产与分发文档，不改变运行时行为。

## 边界与风险

- 仅支持 Arch 与 Omarchy；不再提供跨发行版 Linux 产物，`.deb` 与 AppImage 不作为后续 Linux 分发形态。v0.0.1 已发布附件保持不动。
- 不发布 GitHub Release、不打标签、不做 macOS / Windows 包；`pagein-bin` 需要 Release 产物，本契约不覆盖。
- AUR 用户在本地完成 Rust 全量构建，耗时与磁盘占用由用户承担；构建依赖版本来自用户系统，不保证与 mise 固定版本一致，须在验证记录中写出实测版本。
- 包校验与 chroot 构建通过不等于实机验收；桌面实测必须在 Omarchy 上单独记录。
