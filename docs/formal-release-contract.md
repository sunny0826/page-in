# v0.0.1 正式重发契约

依据 [ADR-008](ADR-008-v0.0.1-formal-release.md)，替代旧跨平台预发布契约的本次分发与来源规则。

| 项目    | 冻结约定                                                                                                   |
| ------- | ---------------------------------------------------------------------------------------------------------- |
| 版本    | npm、npm 根锁、Cargo、Cargo 锁与 Tauri 均为 0.0.1；身份 io.pagein.desktop                                  |
| 来源    | 提交全部本次发布改动后冻结完整 40 位 SHA；三平台 manifest 的 sourceCommit 必须一致                         |
| CI 输入 | workflow_dispatch.source_commit 是精确 SHA；只构建 v0.0.1；脚本校验环境 EXPECTED_SOURCE_COMMIT 与实际 HEAD |
| macOS   | 本地 mise 环境，arm64，DMG / ZIP，ad-hoc 签名，无 Developer ID / 公证                                      |
| Windows | windows-2022 x64，NSIS exe，无代码签名；检出保留 LF                                                        |
| Linux   | ubuntu-22.04 x64，AppImage / deb；Omarchy 使用 AppImage                                                    |
| 产物    | 安装说明、第三方声明、manifest、SHA-256 和安装包；不含用户 HTML / artifacts                                |
| 上传    | CI 仅构建并上传 workflow artifact，无 Release 写权限；主 Agent 校验完整集合后统一发布                      |
| 标签    | 仅本次获准替换 v0.0.1；远端租约必须匹配备份 tag 对象，禁止覆盖未知并发变更                                 |
| 验证    | 自动测试、包验证与桌面实测分别记录；Windows / Omarchy 实测仍待完成                                         |

不修改 IPC、React / Rust 职责、文档事务、资源读取、会话修订或脚本沙箱接口。

风险与取舍：精确 SHA 输入代替永久硬编码旧提交，使构建来源可核查且无需自引用提交；保留固定版本门槛，未来版本须重新决策。替换标签有缓存与使用者同步成本，遵循 ADR 中的备份和完整集合切换要求。
