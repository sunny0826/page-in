# 0.0.1 跨平台预发布验收

日期：2026-09-18。依据 [ADR-007](ADR-007-cross-platform-prerelease.md) 和[发布契约](cross-platform-release-contract.md)。

本文件记录旧预发布产物，其摘要仅适用于旧包。当前源码正式重发依据 [ADR-008](ADR-008-v0.0.1-formal-release.md)，结果见[正式发布验收](formal-release-verification.md)，不得将下列旧包摘要当作重发包校验值。

## 结果

[GitHub Actions 构建及发布](https://github.com/sunny0826/page-in/actions/runs/35302962107) 的 Linux、Windows、publish 三个任务全部成功。产物已追加到 [PageIn 0.0.1 Pre-release](https://github.com/sunny0826/page-in/releases/tag/v0.0.1)，Release 为公开、非草稿、pre-release。

- Linux：Ubuntu 22.04 x64，19 项前端测试和 9 项 Rust 测试通过，AppImage 与 deb 打包成功。
- Windows：Windows Server 2022 x64，19 项前端测试和 7 项 Rust 测试通过，NSIS 安装程序打包成功。两个 Unix 专属符号链接测试不适用于此目标。
- 两个平台均完成版本一致检查、TypeScript 检查与 release 构建。
- 各平台 manifest 的版本、源码 SHA、文件大小及所有 SHA-256 均与 GitHub Release 附件摘要一致；校验清单和 manifest 自身摘要也已核对。
- 保留现有 macOS 附件和 v0.0.1 标签。新增包来自 `de217e61e9f3aeae3d2c7b874fa0c0ec5727855a`，CI 流程提交为 `0d8201f`。
- 新增跨平台说明附件；原始 macOS 说明及其校验清单保持不变。

## 安装包

| 文件                               |   字节数 | SHA-256                                                          |
| ---------------------------------- | -------: | ---------------------------------------------------------------- |
| PageIn_0.0.1_windows-x64-setup.exe |  1741727 | 94e13216b7deafa8c69df92f2456abfd130873900d59aed2e550cf801acae13b |
| PageIn_0.0.1_linux-x64.AppImage    | 79792632 | 4f6cbd3f23a4e7fb366d951d01ab6130d51efca80aa031c0c20de20d507fef5d |
| PageIn_0.0.1_linux-x64.deb         |  2053624 | 1417a360edd879d98b9f44b689c496fff8c1eb6592479dc4b8dc0f958d5c417d |

另附平台专属安装说明、组件声明、manifest 和 SHA256SUMS。

## 构建修复与验证边界

首次 Windows 检查因 Git 自动转换 CRLF 使原版本脚本的 LF 匹配失败。CI 在检出发布源码前关闭 autocrlf，保留原始源码行尾后通过，不修改原标签或应用源码。

本次门 B 验证覆盖产物与发布完整性。按用户要求，Windows / Omarchy 的安装、启动、编辑、分页与导出留待用户在对应系统验证，不将 CI 成功视为实机验收通过。Omarchy 使用 AppImage；deb 仅用于 Debian/Ubuntu。Windows 未做代码签名，macOS 未做 Developer ID 签名或 Apple 公证。
