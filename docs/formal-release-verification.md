# v0.0.1 正式重发验收

日期：2026-09-18。依据 [ADR-008](ADR-008-v0.0.1-formal-release.md) 和[正式发布契约](formal-release-contract.md)。

## 发布结果

[PageIn 0.0.1](https://github.com/sunny0826/page-in/releases/tag/v0.0.1) 已于 2026-09-18 06:54:35 UTC（北京时间 14:54:35）公开，非草稿、非预发布，为 GitHub Latest。全部 18 个附件上传完成，远端文件大小及 SHA-256 与本地逐项一致。公开 Linux manifest 下载成功且与本地逐字节一致。

当前 annotated tag v0.0.1 指向源码提交 0f565869fd064423e470ac9a6c1b73e024a5e8aa。macOS、Windows、Linux 三个平台 manifest 的 sourceCommit 均为此值；本验收文档为发布后记录，不移动该标签。

## 自动检查与构建

- 本地 macOS：版本、类型、40 项前端测试、9 项 Rust 测试、Rust fmt 和 Clippy 通过；Vite 及 Tauri release 构建完成。
- [Windows / Linux 原生 CI](https://github.com/sunny0826/page-in/actions/runs/35315358324) 两项成功，均执行 40 项前端测试；Linux 9 项 Rust 测试，Windows 7 项 Rust 测试。Windows 不适用两个 Unix 符号链接测试。
- macOS DMG 完整性与 ZIP 解压校验通过，解压应用 ad-hoc 签名验证通过，包内 ICNS 与新图标源文件一致。Linux deb 中的 PNG 与图标源文件一致；AppImage / deb / Windows EXE 格式检查通过。
- 所有 manifest、文件大小、SHA-256 清单校验通过。Linux 下载的 CI artifact 压缩包摘要也与 GitHub artifact digest 一致。
- 首次 CI 调度误填源码参数，已在构建完成前取消（run 35315326247）；最终采用上述成功 run，无错误来源产物进入发行。

## macOS 发布包实测

从实际 ZIP 解压后的 PageIn.app 启动，使用内置 sample.html：

- 报告进入原生全屏，顶部栏隐藏；Esc 退出后恢复窗口与顶部栏，文档保持未修改。
- 双击可见 slowly. 激活父页面输入层，原生键盘逐键输入 pagex、退格为 page、Enter 提交；输入 x 后 Esc 取消仍保留 page。
- 撤销恢复 slowly. 和未修改状态；重做恢复 page 和未导出状态。
- 原生保存对话框导出到 artifacts/formal-release-macos-check/sample-edited.html，应用确认已导出。
- 导出文件逐字节等于可见 span 的 slowly. → page 单处替换；title 中相同文字与其他所有字节保持原样。没有用户项目进入发行包。

这属于示例冒烟测试。中文输入法组合输入、完整演示项目的 Tauri 原生全屏与输入链路未在本次全面重验；既有系统 WKWebView 翻页验证见[演示验收](presentation-verification.md)。Windows / Omarchy 的安装、启动、编辑、放映与导出仍待用户实机验证。macOS 未做 Developer ID 签名或 Apple 公证，Windows 未代码签名。

## 安装包摘要

| 文件                               | 字节数   | SHA-256                                                          |
| ---------------------------------- | -------- | ---------------------------------------------------------------- |
| PageIn_0.0.1_linux-x64.AppImage    | 79866360 | 0d060349eb6c06c5459ed4eaeeddd0bcf8e64d527a1f3a8d35b5303a150caad2 |
| PageIn_0.0.1_linux-x64.deb         | 2128380  | 7864ab9d6906e2d66c30bbb3a0293cd0369b47329f71326b1c9e7ef9a803ed90 |
| PageIn_0.0.1_macos-arm64.dmg       | 3581142  | d6e4e411042513fe221c0644fbec1562f23ba9b8a152f95d57b3e388d1c11ac2 |
| PageIn_0.0.1_macos-arm64.zip       | 3184958  | 215e67180b081430cf6e0f819a3a5a0e9bfc20f2b9598e8a05bca8794db9c05f |
| PageIn_0.0.1_windows-x64-setup.exe | 1809249  | 6cc8121337d04d9e06f8454c10553e88331cd7cc5d1617994d367de618b4a111 |

另附三平台安装说明、第三方声明、manifest、SHA256SUMS 及统一 RELEASE-NOTES.md。

## 替换记录与备份

用户明确授权替换同版本预发布。旧 tag 对象 7f9725d929689f5bfffc1749cbdaec8f0b699f20 指向旧源码 de217e61e9f3aeae3d2c7b874fa0c0ec5727855a。旧 Release 元数据及全部 19 个附件已下载到忽略目录 artifacts/release-backup-v0.0.1，逐项与 GitHub 摘要核对；本地 refs/backups/v0.0.1-prerelease 保留旧 annotated tag 对象。

切换时先将 Release 转为草稿，以旧 tag 对象为 force-with-lease 前提更新远端标签，删除已备份的旧附件并上传完整新集合，核验后正式公开。原 RELEASE-NOTES-cross-platform.md 属于旧预发布，已由当前统一说明替代。用户须重新下载旧缓存的安装包，旧 SHA256SUMS 不适用于本发行。
