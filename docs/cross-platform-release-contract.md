# 跨平台预发布契约

依据 [ADR-007](ADR-007-cross-platform-prerelease.md)。

本文件为历史预发布契约；本次正式重发遵循 [正式发布契约](formal-release-contract.md)。

| 项目    | 约定                                                             |
| ------- | ---------------------------------------------------------------- |
| 源码    | 只构建现有 v0.0.1 标签，记录解析后的完整提交 SHA                 |
| 工具    | 从源码的 mise.toml 安装 Node、Rust，npm 使用 Node 随附的锁定版本 |
| Windows | windows-2022，x64，NSIS .exe，无代码签名                         |
| Linux   | ubuntu-22.04，x64，AppImage 和 .deb；Omarchy 使用 AppImage       |
| 输出    | 平台包、平台专属 manifest、SHA256SUMS、安装说明和组件声明        |
| 发布    | 只向现有 pre-release 追加同平台附件；已有附件不覆盖              |
| 接口    | 不修改 IPC、文档事务、资源路由、权限或应用源代码                 |
| 验证    | CI 测试与包完整性检查；各系统桌面运行验收后续由用户执行          |

使用平台专属元数据文件，避免覆盖已有 macOS manifest 和校验文件。分离只读构建任务与具有 contents:write 的上传任务；只有两个平台构建均通过后才上传。保留 workflow artifact 便于失败排查。未通过门 A 时不上传不完整产物。

风险：AppImage 依赖目标系统的内核、图形栈及可能需要的 FUSE 支持；.deb 不适用于 Omarchy。选择 AppImage 可减少 Linux 发行版包管理差异，但不能证明 Omarchy 兼容。
